const GUARANTEE_STATUSES = Object.freeze({
  READY: "ready",
  ALL_PROTECTED: "all_protected",
  API_ERROR: "api_error",
  INVALID_DATA: "invalid_data",
});

class ApiValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ApiValidationError";
  }
}

const asFiniteNumber = (value, field, { min = 0 } = {}) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min) {
    throw new Error(`Invalid ${field}`);
  }
  return number;
};

const normalizeRuleList = (value) => {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.values(value);
  return [value];
};

const isUnrestrictedOrIncludes = (value, expected) => {
  const list = normalizeRuleList(value);
  return list.length === 0 || list.map(String).includes(String(expected));
};

const branchMatches = ({ branch, ownerUserId, buildingId, currentLevel, placeNumber }) => {
  const rules = branch?.rules || {};
  const threshold = rules.levelThreshold == null
    ? 0
    : asFiniteNumber(rules.levelThreshold, "levelThreshold");
  return currentLevel >= threshold &&
    isUnrestrictedOrIncludes(rules.allowedGBs, buildingId) &&
    isUnrestrictedOrIncludes(rules.placeLimit, placeNumber) &&
    isUnrestrictedOrIncludes(rules.selectedMembers, ownerUserId);
};

const selectBranch = (branches, input) => {
  const matches = [];
  Object.entries(branches || {}).forEach(([branchId, branch]) => {
    if (!branchMatches({ branch, ...input })) return;
    const multiplier = asFiniteNumber(
      branch?.rules?.contributionMultiplier,
      "contributionMultiplier"
    );
    matches.push({
      branchId,
      branchName: String(branch?.name || "").trim() || undefined,
      contributionMultiplier: multiplier,
      requiredArcLevel: asFiniteNumber(branch?.rules?.ArcLevel ?? 0, "ArcLevel"),
    });
  });
  if (matches.length === 0) return null;
  const highestMultiplier = Math.max(...matches.map((item) => item.contributionMultiplier));
  const highestMatches = matches.filter(
    (item) => item.contributionMultiplier === highestMultiplier
  );
  if (highestMatches.length === 1) return highestMatches[0];

  // Equal multipliers have identical calculation semantics. There is no unique
  // chat destination, so omit branch identity. The lowest Arc requirement keeps
  // the result visible to everyone eligible through at least one tied branch.
  return {
    contributionMultiplier: highestMultiplier,
    requiredArcLevel: Math.min(...highestMatches.map((item) => item.requiredArcLevel)),
  };
};

const validateApiPayload = (payload, targetLevel) => {
  if (!payload || payload.status !== 200 || !payload.response) {
    throw new ApiValidationError("API status/response is invalid");
  }
  const response = payload.response;
  const totalFp = response.total_fp;
  if (typeof totalFp !== "number" || !Number.isFinite(totalFp) || totalFp < 0) {
    throw new ApiValidationError("Invalid total_fp");
  }
  if (response.level !== targetLevel) throw new ApiValidationError("API level mismatch");
  if (!Array.isArray(response.patron_bonus)) throw new ApiValidationError("Invalid patron_bonus");

  const nominalByRank = new Map();
  response.patron_bonus.forEach((bonus) => {
    const rank = bonus?.rank;
    if (!Number.isInteger(rank) || rank < 1 || rank > 5 || nominalByRank.has(rank)) {
      throw new ApiValidationError("Invalid or duplicated patron_bonus rank");
    }
    if (
      typeof bonus.forgepoints !== "number" ||
      !Number.isFinite(bonus.forgepoints) ||
      bonus.forgepoints < 0
    ) {
      throw new ApiValidationError("Invalid forgepoints");
    }
    nominalByRank.set(rank, bonus.forgepoints);
  });
  return {
    totalFp,
    places: Array.from({ length: 5 }, (_, index) => ({
      placeNumber: index + 1,
      nominalCost: nominalByRank.get(index + 1) || 0,
    })),
  };
};

const sortContributors = (contributors) => [...contributors].sort((a, b) => {
  if (b.forgePoints !== a.forgePoints) return b.forgePoints - a.forgePoints;
  return a.rank - b.rank;
});

const normalizeContributors = ({ contributors, ownerUserId, guildUsers }) => {
  if (contributors != null && typeof contributors !== "object") {
    throw new Error("Invalid contributors");
  }
  const normalized = Object.entries(contributors || {}).map(([contributorId, contributor]) => ({
    contributorId,
    playerName: String(contributor?.playerName || "").trim() || contributorId,
    forgePoints: asFiniteNumber(contributor?.forgePoints, "contributor forgePoints"),
    rank: asFiniteNumber(contributor?.rank, "contributor rank"),
    memberType: Object.prototype.hasOwnProperty.call(guildUsers || {}, contributorId)
      ? "guild_member"
      : "outsider",
  }));
  return {
    owner: normalized.find((item) => item.contributorId === ownerUserId) || {
      contributorId: ownerUserId,
      forgePoints: 0,
    },
    candidates: sortContributors(normalized.filter((item) => item.contributorId !== ownerUserId)),
  };
};

const canOvertake = (challengerContribution, availableFp, currentContribution) =>
  challengerContribution + availableFp > currentContribution;

const findFirstUnprotectedPlace = ({ candidates, remainingFp }) => {
  for (let index = 0; index < 5; index += 1) {
    const occupant = candidates[index];
    if (!occupant) return { placeNumber: index + 1, occupant: null, index };
    const challenger = candidates[index + 1];
    if (canOvertake(challenger?.forgePoints || 0, remainingFp, occupant.forgePoints)) {
      return { placeNumber: index + 1, occupant, index };
    }
  }
  return null;
};

const calculateAction = ({ target, candidates, remainingFp, fixedCost }) => {
  const occupant = target.occupant;
  if (!occupant) {
    const outsider = candidates.slice(target.index)
      .find((item) => item.memberType === "outsider");
    const amount = Math.max(0, remainingFp + (outsider?.forgePoints || 0) - 2 * fixedCost);
    return amount > 0
      ? { type: "owner_deposit", amount }
      : { type: "take_place", amount: fixedCost, targetContribution: fixedCost };
  }
  if (occupant.memberType === "guild_member") {
    const outsider = candidates.slice(target.index + 1)
      .find((item) => item.memberType === "outsider");
    const amount = Math.max(
      0,
      remainingFp + (outsider?.forgePoints || 0) - occupant.forgePoints
    );
    return amount > 0 ? { type: "owner_deposit", amount } : { type: "none" };
  }

  const guildMember = candidates.slice(target.index + 1)
    .find((item) => item.memberType === "guild_member");
  if (guildMember) {
    const amount = Math.max(
      0,
      occupant.forgePoints + 1 - guildMember.forgePoints,
      Math.ceil((remainingFp + occupant.forgePoints - guildMember.forgePoints) / 2)
    );
    return {
      type: "guild_member_top_up",
      amount,
      targetContribution: guildMember.forgePoints + amount,
      contributorId: guildMember.contributorId,
      playerName: guildMember.playerName,
    };
  }
  const amount = Math.max(
    occupant.forgePoints + 1,
    Math.ceil((remainingFp + occupant.forgePoints) / 2)
  );
  return { type: "new_guild_member_deposit", amount, targetContribution: amount };
};

const calculateGuarantee = ({
  ownerUserId, buildingId, building, guildUsers, branches, apiPayload, calculatedAt,
}) => {
  const currentLevel = asFiniteNumber(building?.level, "building level");
  const { totalFp, places } = validateApiPayload(apiPayload, currentLevel + 1);
  const { owner, candidates } = normalizeContributors({
    contributors: building?.contributors, ownerUserId, guildUsers,
  });
  const investedFp = owner.forgePoints + candidates.reduce((sum, item) => sum + item.forgePoints, 0);
  const remainingFp = totalFp - investedFp;
  if (remainingFp < 0) throw new Error("Contributions exceed total_fp");
  const target = findFirstUnprotectedPlace({ candidates, remainingFp });
  const base = { calculatedAt, totalFp, remainingFp };
  if (!target) return { ...base, status: GUARANTEE_STATUSES.ALL_PROTECTED };

  const nominal = places[target.placeNumber - 1];
  const branch = selectBranch(branches, {
    ownerUserId, buildingId, currentLevel, placeNumber: target.placeNumber,
  });
  const multiplier = branch?.contributionMultiplier ?? 1;
  const fixedCost = Math.max(1, Math.round(nominal.nominalCost * multiplier));
  const place = {
    placeNumber: target.placeNumber,
    state: target.occupant?.memberType || "empty",
    nominalCost: nominal.nominalCost,
    fixedCost,
    ...(branch || {
      contributionMultiplier: 1,
      requiredArcLevel: 0,
    }),
  };
  const action = calculateAction({ target, candidates, remainingFp, fixedCost });
  return {
    ...base,
    status: GUARANTEE_STATUSES.READY,
    place,
    ...(target.occupant ? {
      occupant: {
        contributorId: target.occupant.contributorId,
        playerName: target.occupant.playerName,
        forgePoints: target.occupant.forgePoints,
        memberType: target.occupant.memberType,
      },
    } : {}),
    action,
  };
};

const writeIfCurrent = async ({ updateAtRef, guarantRef, triggeringUpdateAt, result }) => {
  const current = (await updateAtRef.once("value")).val();
  if (current !== triggeringUpdateAt) return false;
  await guarantRef.set(result);
  return true;
};

module.exports = {
  ApiValidationError,
  GUARANTEE_STATUSES,
  branchMatches,
  calculateAction,
  calculateGuarantee,
  canOvertake,
  findFirstUnprotectedPlace,
  normalizeContributors,
  selectBranch,
  sortContributors,
  validateApiPayload,
  writeIfCurrent,
};
