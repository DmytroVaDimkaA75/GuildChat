const test = require("node:test");
const assert = require("node:assert/strict");
const {
  branchMatches,
  calculateGuarantee,
  canOvertake,
  selectBranch,
  sortContributors,
  validateApiPayload,
  writeIfCurrent,
} = require("./gbGuarantee");

const api = (bonuses = [10, 5, 3, 2, 1], totalFp = 100, level = 2) => ({
  status: 200,
  response: {
    level,
    total_fp: totalFp,
    patron_bonus: bonuses.map((forgepoints, index) => ({ rank: index + 1, forgepoints })),
  },
});

const contributor = (forgePoints, rank, playerName = "Player") => ({ forgePoints, rank, playerName });
const base = (overrides = {}) => ({
  ownerUserId: "owner",
  buildingId: "gb",
  building: { level: 1, contributors: { owner: contributor(20, 1) } },
  guildUsers: { owner: {} },
  branches: {},
  apiPayload: api(),
  calculatedAt: 123,
  ...overrides,
});

test("equal FP keeps the lower contributor rank above", () => {
  const sorted = sortContributors([
    { contributorId: "late", forgePoints: 20, rank: 2 },
    { contributorId: "early", forgePoints: 20, rank: 1 },
  ]);
  assert.deepEqual(sorted.map((item) => item.contributorId), ["early", "late"]);
});

test("a tie is not an overtake", () => {
  assert.equal(canOvertake(40, 10, 50), false);
  assert.equal(canOvertake(40, 11, 50), true);
});

test("missing API ranks still produce five places with minimum cost 1", () => {
  const result = calculateGuarantee(base({ apiPayload: api([10, 5]) }));
  assert.equal(validateApiPayload(api([10, 5]), 2).places.length, 5);
  const thirdEmpty = calculateGuarantee(base({
    apiPayload: api([10, 5], 30),
    building: { level: 1, contributors: {
      owner: contributor(15, 1), a: contributor(10, 2), b: contributor(5, 3),
    } },
    guildUsers: { owner: {}, a: {}, b: {} },
  }));
  assert.equal(result.place.fixedCost, 10);
  assert.equal(thirdEmpty.place.placeNumber, 3);
  assert.equal(thirdEmpty.place.fixedCost, 1);
});

test("missing or empty rule lists are unrestricted", () => {
  const input = { ownerUserId: "owner", buildingId: "gb", currentLevel: 1, placeNumber: 2 };
  assert.equal(branchMatches({ branch: { rules: {} }, ...input }), true);
  assert.equal(branchMatches({ branch: { rules: { allowedGBs: [], placeLimit: {}, selectedMembers: [] } }, ...input }), true);
});

test("highest matching contributionMultiplier wins", () => {
  const selected = selectBranch({
    low: { rules: { contributionMultiplier: 1.8 } },
    high: { rules: { contributionMultiplier: 1.9 } },
  }, { ownerUserId: "owner", buildingId: "gb", currentLevel: 1, placeNumber: 1 });
  assert.equal(selected.branchId, "high");
});

test("equal highest multipliers omit an ambiguous chat destination", () => {
  const selected = selectBranch({
    first: { name: "First", rules: { contributionMultiplier: 1.9, ArcLevel: 120 } },
    second: { name: "Second", rules: { contributionMultiplier: 1.9, ArcLevel: 100 } },
  }, { ownerUserId: "owner", buildingId: "gb", currentLevel: 1, placeNumber: 1 });
  assert.deepEqual(selected, { contributionMultiplier: 1.9, requiredArcLevel: 100 });
});

test("ArcLevel only becomes a visibility requirement", () => {
  const common = { rules: { contributionMultiplier: 1.9, ArcLevel: 120 } };
  const result = calculateGuarantee(base({ branches: { branch: common } }));
  assert.equal(result.place.fixedCost, 19);
  assert.equal(result.place.requiredArcLevel, 120);
});

test("empty first unprotected place creates an action", () => {
  const result = calculateGuarantee(base());
  assert.equal(result.place.state, "empty");
  assert.equal(result.action.type, "owner_deposit");
});

test("guild member in first unprotected place uses owner-deposit formula", () => {
  const result = calculateGuarantee(base({
    building: { level: 1, contributors: { owner: contributor(20, 1), member: contributor(30, 2), out: contributor(25, 3) } },
    guildUsers: { owner: {}, member: {} },
  }));
  assert.equal(result.place.state, "guild_member");
  assert.deepEqual(result.action, { type: "owner_deposit", amount: 20 });
});

test("outsider with guild member below produces member top-up", () => {
  const result = calculateGuarantee(base({
    building: { level: 1, contributors: { owner: contributor(20, 1), out: contributor(30, 2), member: contributor(20, 3) } },
    guildUsers: { owner: {}, member: {} },
  }));
  assert.equal(result.action.type, "guild_member_top_up");
  assert.equal(result.action.contributorId, "member");
  assert.equal(result.action.targetContribution, 40);
});

test("outsider without guild member below requires new member deposit", () => {
  const result = calculateGuarantee(base({
    building: { level: 1, contributors: { owner: contributor(20, 1), out: contributor(30, 2) } },
  }));
  assert.equal(result.action.type, "new_guild_member_deposit");
  assert.equal(result.action.amount, 40);
});

test("owner reduces remaining FP but never occupies a place", () => {
  const result = calculateGuarantee(base({
    building: { level: 1, contributors: { owner: contributor(90, 1) } },
  }));
  assert.equal(result.remainingFp, 10);
  assert.equal(result.place.state, "empty");
});

test("missing owner contribution is treated as zero", () => {
  const result = calculateGuarantee(base({
    building: {
      level: 1,
      contributors: {
        member: contributor(30, 1),
        outsider: contributor(20, 2),
      },
    },
    guildUsers: { owner: {}, member: {} },
  }));

  assert.equal(result.remainingFp, 50);
  assert.equal(result.occupant.contributorId, "member");
});

test("a building without contributions is valid", () => {
  const result = calculateGuarantee(base({
    building: { level: 1 },
  }));

  assert.equal(result.remainingFp, 100);
  assert.equal(result.place.state, "empty");
});

test("stale calculation is not written", async () => {
  let writes = 0;
  const written = await writeIfCurrent({
    updateAtRef: { once: async () => ({ val: () => 2 }) },
    guarantRef: { set: async () => { writes += 1; } },
    triggeringUpdateAt: 1,
    result: { status: "ready" },
  });
  assert.equal(written, false);
  assert.equal(writes, 0);
});

test("error status replaces an old ready result", async () => {
  let stored = { status: "ready", place: {} };
  await writeIfCurrent({
    updateAtRef: { once: async () => ({ val: () => 1 }) },
    guarantRef: { set: async (value) => { stored = value; } },
    triggeringUpdateAt: 1,
    result: { status: "api_error" },
  });
  assert.deepEqual(stored, { status: "api_error" });
});

test("invalid and duplicate API ranks are rejected", () => {
  const duplicate = api([10, 5]);
  duplicate.response.patron_bonus[1].rank = 1;
  assert.throws(() => validateApiPayload(duplicate, 2), /duplicated/);
  const invalid = api([10]);
  invalid.response.patron_bonus[0].rank = 6;
  assert.throws(() => validateApiPayload(invalid, 2), /Invalid/);

  const invalidCost = api([10]);
  invalidCost.response.patron_bonus[0].forgepoints = "not-a-number";
  assert.throws(
    () => validateApiPayload(invalidCost, 2),
    (error) => error.name === "ApiValidationError"
  );

  const stringStatus = api([10]);
  stringStatus.status = "200";
  assert.throws(() => validateApiPayload(stringStatus, 2), /status/);

  const stringRank = api([10]);
  stringRank.response.patron_bonus[0].rank = "1";
  assert.throws(() => validateApiPayload(stringRank, 2), /rank/);
});
