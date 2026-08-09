const test = require("node:test");
const assert = require("node:assert/strict");
const {
  GUARANTEE_STATUSES,
  buildPlaces,
  calculateEmptyResult,
  calculateGuarantee,
  canOvertake,
  distributeContributors,
  findFirstActionableResult,
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

const contributor = (forgePoints, rank, playerName = "Player") => ({
  forgePoints,
  rank,
  playerName,
});

const candidate = (contributorId, forgePoints, membership, rank = 1) => ({
  contributorId,
  playerName: contributorId,
  forgePoints,
  membership,
  rank,
});

const catalogPlaces = (costs) => costs.map((placeCost, index) => ({
  placeNumber: index + 1,
  nominalCost: placeCost,
  placeCost,
  coefficient: 1,
  requiredArcLevel: 0,
}));

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

test("contributors sort by FP descending and rank ascending", () => {
  const sorted = sortContributors([
    { contributorId: "low", forgePoints: 10, rank: 1 },
    { contributorId: "late", forgePoints: 20, rank: 2 },
    { contributorId: "early", forgePoints: 20, rank: 1 },
  ]);
  assert.deepEqual(sorted.map((item) => item.contributorId), ["early", "late", "low"]);
});

test("a tie is not an overtake", () => {
  assert.equal(canOvertake(40, 10, 50), false);
  assert.equal(canOvertake(40, 11, 50), true);
});

test("missing API ranks still produce five places", () => {
  const validated = validateApiPayload(api([10, 5]), 2);
  assert.equal(validated.places.length, 5);
  assert.equal(validated.places[2].nominalCost, 0);
});

test("places use the highest matching branch and default to coefficient 1.9", () => {
  const selected = selectBranch({
    low: { rules: { contributionMultiplier: 1.8 } },
    high: { rules: { contributionMultiplier: 1.95 } },
  }, { ownerUserId: "owner", buildingId: "gb", currentLevel: 1, placeNumber: 1 });
  assert.equal(selected.branchId, "high");

  const places = buildPlaces({
    nominalPlaces: validateApiPayload(api([100, 50]), 2).places,
    branches: {},
    ownerUserId: "owner",
    buildingId: "gb",
    currentLevel: 1,
  });
  assert.equal(places[0].coefficient, 1.9);
  assert.equal(places[0].placeCost, 190);
  assert.equal(places[2].placeCost, 1);
});

test("each place of one GB selects its own highest matching chat-branch coefficient", () => {
  const places = buildPlaces({
    nominalPlaces: validateApiPayload(api([100, 100, 100, 100, 100]), 2).places,
    branches: {
      firstPlace: {
        name: "First place 1.95",
        rules: {
          contributionMultiplier: 1.95,
          allowedGBs: ["gb"],
          placeLimit: [1],
          selectedMembers: ["owner"],
        },
      },
      secondAndThird: {
        name: "Second and third 1.92",
        rules: {
          contributionMultiplier: 1.92,
          allowedGBs: ["gb"],
          placeLimit: [2, 3],
          selectedMembers: ["owner"],
        },
      },
      lowerSecondPlace: {
        name: "Lower second place coefficient",
        rules: {
          contributionMultiplier: 1.9,
          allowedGBs: ["gb"],
          placeLimit: [2],
          selectedMembers: ["owner"],
        },
      },
    },
    ownerUserId: "owner",
    buildingId: "gb",
    currentLevel: 1,
  });

  assert.deepEqual(
    places.map((place) => place.coefficient),
    [1.95, 1.92, 1.92, 1.9, 1.9]
  );
  assert.deepEqual(
    places.map((place) => place.placeCost),
    [195, 192, 192, 190, 190]
  );
  assert.equal(places[0].branchId, "firstPlace");
  assert.equal(places[1].branchId, "secondAndThird");
  assert.equal(places[3].branchId, undefined);
});

test("a protected contributor occupies a place even below its cost", () => {
  const places = catalogPlaces([1900, 950, 380, 190, 95]);
  const candidates = [
    candidate("anna", 2000, "guild_member", 1),
    candidate("bohdan", 900, "outsider", 2),
    candidate("vira", 500, "guild_member", 3),
    candidate("hlib", 200, "outsider", 4),
  ];
  const distribution = distributeContributors({ candidates, places, remainingFp: 300 });
  assert.equal(distribution[1].occupant.contributorId, "bohdan");
});

test("an unprotected contributor below cost moves down and leaves a gap", () => {
  const places = catalogPlaces([1900, 950, 380, 190, 95]);
  const candidates = [
    candidate("anna", 2000, "guild_member", 1),
    candidate("bohdan", 900, "outsider", 2),
    candidate("vira", 500, "guild_member", 3),
    candidate("hlib", 180, "outsider", 4),
    candidate("dana", 150, "guild_member", 5),
    candidate("yevhen", 80, "outsider", 6),
  ];
  const distribution = distributeContributors({ candidates, places, remainingFp: 300 });
  assert.deepEqual(
    distribution.map((item) => item.occupant?.contributorId || null),
    ["anna", "bohdan", "vira", null, "hlib", "dana", "yevhen"]
  );
});

test("the agreed example returns only the first actionable place", () => {
  const result = calculateGuarantee(base({
    apiPayload: api([1000, 500, 200, 100, 50], 4110),
    building: { level: 1, contributors: {
      owner: contributor(0, 1, "Owner"),
      anna: contributor(2000, 1, "Анна"),
      bohdan: contributor(900, 2, "Богдан"),
      vira: contributor(500, 3, "Віра"),
      hlib: contributor(180, 4, "Гліб"),
      dana: contributor(150, 5, "Дана"),
      yevhen: contributor(80, 6, "Євген"),
    } },
    guildUsers: { owner: {}, anna: {}, vira: {}, dana: {} },
  }));
  assert.equal(result.remainingFp, 300);
  assert.equal(result.placeNumber, 4);
  assert.equal(result.status, GUARANTEE_STATUSES.EMPTY_REQUIRES_OWNER_GUARANTEE);
  assert.deepEqual(result.action, { type: "owner_deposit", actor: "owner", amount: 100 });
});

test("guild member at risk produces an owner guarantee action", () => {
  const distribution = [
    { placeNumber: 1, occupant: candidate("dana", 150, "guild_member") },
    { placeNumber: 2, occupant: candidate("yevhen", 80, "outsider") },
  ];
  const result = findFirstActionableResult({
    distribution,
    places: catalogPlaces([100, 50, 25, 10, 5]),
    remainingFp: 300,
  });
  assert.equal(result.status, GUARANTEE_STATUSES.GUILD_MEMBER_CAN_BE_OVERTAKEN);
  assert.equal(result.ownerGuaranteeFp, 230);
  assert.deepEqual(result.action, { type: "owner_deposit", actor: "owner", amount: 230 });
});

test("an outsider with a guild challenger produces a specific top-up action", () => {
  const distribution = [
    { placeNumber: 1, occupant: candidate("hlib", 180, "outsider") },
    { placeNumber: 2, occupant: candidate("dana", 150, "guild_member") },
  ];
  const result = findFirstActionableResult({
    distribution,
    places: catalogPlaces([100, 50, 25, 10, 5]),
    remainingFp: 300,
  });
  assert.equal(result.status, GUARANTEE_STATUSES.OUTSIDER_CAN_BE_OVERTAKEN);
  assert.deepEqual(result.action, {
    type: "guild_member_top_up",
    actor: "guild_member",
    amount: 31,
    contributorId: "dana",
  });
});

test("secured statuses are skipped before the first actionable place", () => {
  const distribution = [
    { placeNumber: 1, occupant: candidate("anna", 2000, "guild_member") },
    { placeNumber: 2, occupant: candidate("bohdan", 900, "outsider") },
    { placeNumber: 3, occupant: candidate("vira", 500, "guild_member") },
    { placeNumber: 4, occupant: candidate("hlib", 180, "outsider") },
    { placeNumber: 5, occupant: candidate("dana", 150, "guild_member") },
  ];
  const result = findFirstActionableResult({
    distribution,
    places: catalogPlaces([1000, 500, 200, 100, 50]),
    remainingFp: 300,
  });
  assert.equal(result.placeNumber, 4);
  assert.equal(result.status, GUARANTEE_STATUSES.OUTSIDER_CAN_BE_OVERTAKEN);
});

test("outsider without a guild challenger requests a new guild deposit", () => {
  const outsider = candidate("yevhen", 80, "outsider");
  const result = findFirstActionableResult({
    distribution: [{ placeNumber: 1, occupant: outsider }],
    places: catalogPlaces([100, 50, 25, 10, 5]),
    remainingFp: 300,
  });
  assert.equal(result.status, GUARANTEE_STATUSES.OUTSIDER_WITHOUT_GUILD_CHALLENGER);
  assert.deepEqual(result.action, {
    type: "guild_member_deposit",
    actor: "guild_member",
    amount: 81,
  });
});

test("empty tail with more total cost than remaining is immediately guaranteed", () => {
  const places = catalogPlaces([200, 70, 20, 10, 5]);
  const distribution = places.map((place) => ({ placeNumber: place.placeNumber, occupant: null }));
  const result = calculateEmptyResult({
    target: distribution[0], distribution, places, remainingFp: 250,
  });
  assert.equal(result.status, GUARANTEE_STATUSES.EMPTY_GUARANTEED);
  assert.deepEqual(result.action, {
    type: "guild_member_deposit", actor: "guild_member", amount: 200,
  });
});

test("equal empty-tail sum creates an urgent deposit", () => {
  const places = catalogPlaces([200, 50, 25, 10, 5]);
  const distribution = places.map((place) => ({ placeNumber: place.placeNumber, occupant: null }));
  const result = calculateEmptyResult({
    target: distribution[0], distribution, places, remainingFp: 290,
  });
  assert.equal(result.status, GUARANTEE_STATUSES.EMPTY_URGENT_DEPOSIT);
  assert.equal(result.action.amount, 200);
});

test("a following one-FP empty place reduces the urgent deposit by one", () => {
  const places = catalogPlaces([200, 1, 1, 1, 1]);
  const distribution = places.map((place) => ({ placeNumber: place.placeNumber, occupant: null }));
  const result = calculateEmptyResult({
    target: distribution[0], distribution, places, remainingFp: 204,
  });
  assert.equal(result.status, GUARANTEE_STATUSES.EMPTY_URGENT_DEPOSIT);
  assert.equal(result.ownerClosingFp, 1);
  assert.equal(result.action.amount, 199);
});

test("an empty tail below remaining uses only the current proportional deposit", () => {
  const places = catalogPlaces([200, 50, 25, 10, 1]);
  const distribution = places.map((place) => ({ placeNumber: place.placeNumber, occupant: null }));
  const result = calculateEmptyResult({
    target: distribution[0], distribution, places, remainingFp: 300,
  });
  assert.equal(result.status, GUARANTEE_STATUSES.EMPTY_URGENT_PROPORTIONAL_DEPOSIT);
  assert.equal(result.oneFpPlacesCount, 1);
  assert.equal(result.proportionalPool, 298);
  assert.equal(result.weightSum, 285);
  assert.equal(result.action.amount, 210);
});

test("a final one-FP empty place asks the owner", () => {
  const places = catalogPlaces([100, 50, 25, 10, 1]);
  const distribution = [
    { placeNumber: 1, occupant: candidate("a", 100, "guild_member") },
    { placeNumber: 2, occupant: candidate("b", 50, "guild_member") },
    { placeNumber: 3, occupant: candidate("c", 25, "guild_member") },
    { placeNumber: 4, occupant: candidate("d", 10, "guild_member") },
    { placeNumber: 5, occupant: null },
  ];
  const result = calculateEmptyResult({
    target: distribution[4], distribution, places, remainingFp: 1,
  });
  assert.equal(result.status, GUARANTEE_STATUSES.EMPTY_OWNER_CONFIRMATION_REQUIRED);
  assert.deepEqual(result.action, { type: "confirm_with_owner", actor: "owner", amount: 1 });
});

test("stale calculation is not written", async () => {
  let writes = 0;
  const written = await writeIfCurrent({
    updateAtRef: { once: async () => ({ val: () => 2 }) },
    guarantRef: { set: async () => { writes += 1; } },
    triggeringUpdateAt: 1,
    result: { status: "empty_guaranteed" },
  });
  assert.equal(written, false);
  assert.equal(writes, 0);
});

test("invalid and duplicate API ranks are rejected", () => {
  const duplicate = api([10, 5]);
  duplicate.response.patron_bonus[1].rank = 1;
  assert.throws(() => validateApiPayload(duplicate, 2), /duplicated/);

  const invalidCost = api([10]);
  invalidCost.response.patron_bonus[0].forgepoints = "not-a-number";
  assert.throws(
    () => validateApiPayload(invalidCost, 2),
    (error) => error.name === "ApiValidationError"
  );
});
