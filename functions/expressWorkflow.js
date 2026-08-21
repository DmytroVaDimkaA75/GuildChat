"use strict";

const MIN_USERS = 6;
const MINUTE = 60 * 1000;

const PUSH = Object.freeze({
  recruit: "За 15 хвилин заплановані експреси, але не знайдено необхідної кількості бажаючих. Якщо маєте бажання приєднатися, підтвердіть своє бажання",
  insufficientOwner: "Нажаль не вдалося знайти необхідну кількість бажаючих взяти участь в експрес-прокачці вашої ВС. Зайдіть в Центр ВС і скорегуйте деталі експресу",
  ownerConfirm: "За 10 хвилин починається запланований вами експрес. Підтвердіть свої наміри протягом 5 хвилин у Центрі ВС. В противному випадку ваша запланована прокачка буде видалена.",
  participantConfirm: "За 10 хвилин починається експрес, у якому ви виявили бажання взяти участь. Підтвердіть своє бажання протягом 5 хвилин у Центрі ВС.",
  reserveConfirm: "За 5 хвилин починається експрес, у якому ви виявили бажання взяти участь. Підтвердіть своє бажання протягом 3 хвилин у Центрі ВС.",
  ownerFailed: "Нажаль ви не змогли підтвердити свій намір. Експрес прокачку вашої ВС відмінено.",
  participantFailed: "Нажаль ви не змогли підтвердити свіє бажання взяти участь в експресі. Ви знімаєтесь з участі в даному експресі",
  ownerMissing: "Нажаль власник ВС не підтвердив наміру прокачки своєї ВС. Експрес знятий",
  ownerCancel: "Нажаль власник відмінив свій експрес",
  cancelledOwner: "Нажаль для прокачки вашої ВС не зібралося достатньої кількості учасників. Експрес прокачка скасовується",
  cancelledParticipant: "Нажаль для експрес прокачки не зібралося достатньої кількості учасників. Експрес прокачка скасовується",
  postponed: "Заплановану експрес-прокачку було відтерміновано. Якщо бажаєте взяти участь у новий час, підтвердіть своє бажання повторно.",
});

const values = (object) => Object.values(object || {}).filter(Boolean);
const entries = (object) => Object.entries(object || {}).filter(([, value]) => Boolean(value));
const numeric = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const ownersOf = (group) => new Set(values(group.gbs).map((gb) => String(gb.user || "")).filter(Boolean));
const byPriority = (a, b) => numeric(b[1].contributionMultiplier) - numeric(a[1].contributionMultiplier)
  || numeric(a[1].rank, Number.MAX_SAFE_INTEGER) - numeric(b[1].rank, Number.MAX_SAFE_INTEGER)
  || a[0].localeCompare(b[0]);
const byFinalOrder = (a, b) => numeric(b[1].contributionMultiplier) - numeric(a[1].contributionMultiplier)
  || numeric(a[1].confirmationTime, Number.MAX_SAFE_INTEGER) - numeric(b[1].confirmationTime, Number.MAX_SAFE_INTEGER)
  || numeric(a[1].rank, Number.MAX_SAFE_INTEGER) - numeric(b[1].rank, Number.MAX_SAFE_INTEGER)
  || a[0].localeCompare(b[0]);

const uniqueAvailableIds = (group) => {
  const result = ownersOf(group);
  entries(group.interested).forEach(([uid]) => result.add(String(uid)));
  return result;
};

const makeNotice = (event, userId, body) => ({ event, userId: String(userId), body });

function selectInitial(group, multiplierFor) {
  const owners = ownersOf(group);
  const candidates = entries(group.interested)
    .filter(([uid]) => !owners.has(String(uid)))
    .map(([uid, record]) => [String(uid), { ...record, rank: group.ranks?.[uid], contributionMultiplier: multiplierFor(uid, record) }])
    .sort(byPriority);
  const selected = {};
  [...owners].forEach((uid) => {
    const record = group.interested?.[uid] || {};
    selected[uid] = { ...record, owner: true, contributionMultiplier: multiplierFor(uid, record) };
    delete selected[uid].confirmationTime;
  });
  const needed = Math.max(0, MIN_USERS - owners.size);
  candidates.slice(0, needed).forEach(([uid, record]) => {
    selected[uid] = { owner: false, contributionMultiplier: record.contributionMultiplier };
    delete selected[uid].confirmationTime;
  });
  return {
    selected,
    reserve: Object.fromEntries(candidates.slice(needed)),
    order: entries(selected).sort(byPriority).map(([uid]) => uid),
  };
}

/** Pure deterministic stage reducer. Server adapter supplies Arc multipliers. */
function advanceExpress(group, now, multiplierFor = (_uid, record) => numeric(record?.contributionMultiplier, 1)) {
  if (!group || !group.gbs || !Number.isFinite(Number(group.scheduleTime))) return { group, notices: [], deleteGroup: false };
  const next = JSON.parse(JSON.stringify(group));
  next.workflow = next.workflow || {};
  const notices = [];
  const t = Number(next.scheduleTime);
  const owners = ownersOf(next);
  const stage = next.workflow.stage || "open";

  if (stage === "deleting") return { group: null, notices, deleteGroup: true };

  if (now >= t && next.workflow.failed) return { group: null, notices, deleteGroup: true };

  if (now >= t - 15 * MINUTE && !next.workflow.recruitmentCheckedAt) {
    next.workflow.recruitmentCheckedAt = now;
    if (uniqueAvailableIds(next).size < MIN_USERS) next.workflow.recruitmentNeeded = true;
  }

  if (now >= t - 10 * MINUTE && ["open"].includes(stage)) {
    next.workflow.selectionCheckedAt = now;
    if (uniqueAvailableIds(next).size < MIN_USERS) {
      next.workflow.stage = "postponement";
      next.workflow.failed = true;
      owners.forEach((uid) => notices.push(makeNotice("insufficient", uid, PUSH.insufficientOwner)));
      return { group: next, notices, deleteGroup: false };
    }
    const selection = selectInitial(next, multiplierFor);
    next.interested = selection.selected;
    next.reserve = selection.reserve;
    next.selectedOrder = selection.order;
    next.workflow.stage = "initial_confirmation";
    entries(next.interested).forEach(([uid, record]) => notices.push(makeNotice("initial", uid, record.owner ? PUSH.ownerConfirm : PUSH.participantConfirm)));
  }

  if (now >= t - 5 * MINUTE && next.workflow.stage === "initial_confirmation") {
    const selected = entries(next.interested);
    const ownerRows = selected.filter(([, record]) => record.owner);
    const confirmedOwners = ownerRows.filter(([, record]) => numeric(record.confirmationTime) > 0);
    if (!confirmedOwners.length) {
      selected.filter(([, record]) => !record.owner).forEach(([uid]) => notices.push(makeNotice("owner_missing", uid, PUSH.ownerMissing)));
      ownerRows.filter(([, record]) => !numeric(record.confirmationTime)).forEach(([uid]) => notices.push(makeNotice("owner_failed", uid, PUSH.ownerFailed)));
      return { group: null, notices, deleteGroup: true };
    }
    const failed = new Set();
    ownerRows.filter(([, record]) => !numeric(record.confirmationTime)).forEach(([uid]) => {
      failed.add(uid); notices.push(makeNotice("owner_failed", uid, PUSH.ownerFailed));
      entries(next.gbs).forEach(([gbId, gb]) => { if (String(gb.user) === uid) delete next.gbs[gbId]; });
    });
    selected.filter(([, record]) => !record.owner && !numeric(record.confirmationTime)).forEach(([uid]) => {
      failed.add(uid); notices.push(makeNotice("participant_failed", uid, PUSH.participantFailed));
    });
    failed.forEach((uid) => delete next.interested[uid]);
    const confirmedCount = entries(next.interested).filter(([, record]) => numeric(record.confirmationTime) > 0).length;
    const shortage = Math.max(0, MIN_USERS - confirmedCount);
    const reserve = entries(next.reserve).filter(([uid]) => !failed.has(uid) && !next.interested[uid]);
    reserve.slice(0, shortage).forEach(([uid, record]) => {
      next.interested[uid] = { owner: false, contributionMultiplier: multiplierFor(uid, record) };
      next.reserveSelected = { ...(next.reserveSelected || {}), [uid]: true };
      notices.push(makeNotice("reserve", uid, PUSH.reserveConfirm));
    });
    next.workflow.stage = "reserve_confirmation";
    next.workflow.reserveSelectedAt = now;
    if (confirmedCount + Math.min(shortage, reserve.length) < MIN_USERS) {
      entries(next.interested).forEach(([uid, record]) => notices.push(makeNotice("cancelled", uid, record.owner ? PUSH.cancelledOwner : PUSH.cancelledParticipant)));
      return { group: null, notices, deleteGroup: true };
    }
  }

  if (now >= t - 2 * MINUTE && next.workflow.stage === "reserve_confirmation") {
    const confirmed = entries(next.interested).filter(([, record]) => numeric(record.confirmationTime) > 0);
    if (confirmed.length < MIN_USERS) {
      entries(next.interested).forEach(([uid, record]) => notices.push(makeNotice("cancelled", uid, record.owner ? PUSH.cancelledOwner : PUSH.cancelledParticipant)));
      return { group: null, notices, deleteGroup: true };
    }
    const finalCandidates = confirmed.map(([uid, record]) => {
      const ownerRank = Math.min(...values(next.gbs).filter((gb) => String(gb.user) === uid).map((gb) => numeric(gb.rank, numeric(gb.timestamp, Number.MAX_SAFE_INTEGER))));
      return [uid, { ...record, rank: record.owner ? ownerRank : next.ranks?.[uid] }];
    });
    next.finalOrder = Object.fromEntries(finalCandidates.sort(byFinalOrder).map(([uid, record], index) => [index + 1, { userId: uid, owner: Boolean(record.owner), contributionMultiplier: numeric(record.contributionMultiplier), confirmationTime: numeric(record.confirmationTime) }]));
    next.workflow.stage = "final";
    next.workflow.finalizedAt = now;
  }
  return { group: next, notices, deleteGroup: false };
}

module.exports = { MIN_USERS, MINUTE, PUSH, advanceExpress, byFinalOrder, byPriority, ownersOf, selectInitial, uniqueAvailableIds };
