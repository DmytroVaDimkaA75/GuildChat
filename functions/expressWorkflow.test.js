const test = require('node:test');
const assert = require('node:assert/strict');
const { advanceExpress, selectInitial, uniqueAvailableIds } = require('./expressWorkflow');

const gb = (user) => ({ user, allowedGB: `gb-${user}` });
const interested = (rank, contributionMultiplier = 1.9, confirmationTime) => ({ rank, contributionMultiplier, ...(confirmationTime ? { confirmationTime } : {}) });

test('availability deduplicates an owner who is also interested', () => {
  assert.equal(uniqueAvailableIds({ gbs: { a: gb('u1'), b: gb('u2') }, interested: { u1: interested(1), u3: interested(2) } }).size, 3);
});

test('initial selection keeps every owner and orders reserve once', () => {
  const group = { gbs: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`g${i}`, gb(`o${i}`)])), interested: { a: interested(2, 2), b: interested(1, 1.9) } };
  const selected = selectInitial(group, (_uid, row) => row.contributionMultiplier || 1.8);
  assert.equal(Object.keys(selected.selected).length, 6);
  assert.deepEqual(Object.keys(selected.reserve), ['a', 'b']);
});

test('T-5 fills only confirmed shortage from established reserve', () => {
  const t = 2_000_000;
  const group = {
    scheduleTime: t,
    gbs: { a: gb('owner') },
    workflow: { stage: 'initial_confirmation' },
    interested: {
      owner: { owner: true, contributionMultiplier: 1.9, confirmationTime: 10 },
      p1: { owner: false, contributionMultiplier: 2, confirmationTime: 11 },
      p2: { owner: false, contributionMultiplier: 1.99, confirmationTime: 12 },
      p3: { owner: false, contributionMultiplier: 1.98, confirmationTime: 13 },
      p4: { owner: false, contributionMultiplier: 1.97 },
      p5: { owner: false, contributionMultiplier: 1.96 },
    },
    reserve: { r1: interested(7, 1.95), r2: interested(8, 1.94), r3: interested(9, 1.93) },
  };
  const result = advanceExpress(group, t - 5 * 60_000);
  assert.deepEqual(Object.keys(result.group.reserveSelected), ['r1', 'r2']);
  assert.equal(result.group.interested.r3, undefined);
});

test('final order uses multiplier, confirmation time, then rank', () => {
  const t = 2_000_000;
  const rows = {
    owner: { owner: true, contributionMultiplier: 1.9, confirmationTime: 5, rank: 1 },
    a: { owner: false, contributionMultiplier: 2, confirmationTime: 20, rank: 3 },
    b: { owner: false, contributionMultiplier: 2, confirmationTime: 10, rank: 9 },
    c: { owner: false, contributionMultiplier: 2, confirmationTime: 20, rank: 2 },
    d: { owner: false, contributionMultiplier: 1.8, confirmationTime: 1, rank: 1 },
    e: { owner: false, contributionMultiplier: 1.7, confirmationTime: 1, rank: 1 },
  };
  const result = advanceExpress({ scheduleTime: t, gbs: { a: { ...gb('owner'), rank: 1 } }, ranks: { a: 3, b: 9, c: 2, d: 1, e: 1 }, interested: rows, workflow: { stage: 'reserve_confirmation' } }, t - 2 * 60_000);
  assert.deepEqual(Object.values(result.group.finalOrder).map((x) => x.userId), ['b', 'c', 'a', 'owner', 'd', 'e']);
});
