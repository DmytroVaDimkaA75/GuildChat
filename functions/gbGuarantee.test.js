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
const { ARC_CONTRIBUTION_BOOSTS, findRequiredArcLevel } = require("./arcLevels");

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

test("static Arc config maps the exact recommended contribution to the minimum level", () => {
  assert.equal(ARC_CONTRIBUTION_BOOSTS.length, 180);
  assert.equal(ARC_CONTRIBUTION_BOOSTS[41], 63);
  assert.equal(findRequiredArcLevel({ nominalCost: 760, contribution: 1232 }), 42);
  assert.equal(findRequiredArcLevel({ nominalCost: 760, contribution: 1239 }), 43);
  assert.equal(findRequiredArcLevel({ nominalCost: 760, contribution: 1520 }), 180);
  assert.equal(findRequiredArcLevel({ nominalCost: 760, contribution: 760 }), 0);
});

test("rounding placeCost up by <=0.5 FP does not inflate the Arc level (F-002)", () => {
  // placeCost = round(405 * 1.9) = round(769.5) = 770; the 0.5 FP round-up must
  // still map to Arc 80 (+90% boost = the ×1.9 branch), not 82.
  assert.equal(
    findRequiredArcLevel({ nominalCost: 405, contribution: 770 }),
    82,
    "without the branch multiplier the rounded placeCost inflates the level",
  );
  assert.equal(
    findRequiredArcLevel({ nominalCost: 405, contribution: 770, multiplier: 1.9 }),
    80,
  );
  // A genuinely larger deposit (R-002 overtake) is still evaluated as-is.
  assert.equal(
    findRequiredArcLevel({ nominalCost: 405, contribution: 900, multiplier: 1.9 }),
    null,
  );
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

test("an underpaid guild member keeps the actual place without shifting lower guild members", () => {
  const distribution = distributeContributors({
    candidates: [
      candidate("first", 1043, "guild_member", 2),
      candidate("second", 680, "guild_member", 3),
      candidate("third", 170, "guild_member", 4),
      candidate("fourth", 30, "guild_member", 5),
    ],
    places: catalogPlaces([2040, 680, 166, 29, 10]),
    remainingFp: 371,
  });

  assert.deepEqual(
    distribution.slice(0, 4).map((item) => item.occupant?.contributorId),
    ["first", "second", "third", "fourth"]
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
  assert.equal(result.developerDebug.ownerDeposit, 0);
  assert.deepEqual(
    result.developerDebug.places.map((place) => ({
      placeNumber: place.placeNumber,
      occupant: place.occupant?.contributorId || null,
    })),
    [
      { placeNumber: 1, occupant: "anna" },
      { placeNumber: 2, occupant: "bohdan" },
      { placeNumber: 3, occupant: "vira" },
      { placeNumber: 4, occupant: null },
      { placeNumber: 5, occupant: "hlib" },
      { placeNumber: 6, occupant: "dana" },
      { placeNumber: 7, occupant: "yevhen" },
    ]
  );
  assert.equal(result.developerDebug.places[0].nominalCost, 1000);
  assert.equal(result.developerDebug.places[0].coefficient, 1.9);
  assert.equal(result.developerDebug.places[0].placeCost, 1900);
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
    places: catalogPlaces([400, 50, 25, 10, 5]),
    remainingFp: 300,
  });
  assert.equal(result.status, GUARANTEE_STATUSES.OUTSIDER_CAN_BE_OVERTAKEN);
  assert.deepEqual(result.action, {
    type: "guild_member_top_up",
    actor: "guild_member",
    amount: 165,
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
    places: catalogPlaces([1000, 500, 200, 400, 50]),
    remainingFp: 300,
  });
  assert.equal(result.placeNumber, 4);
  assert.equal(result.status, GUARANTEE_STATUSES.OUTSIDER_CAN_BE_OVERTAKEN);
});

test("outsider without a guild challenger requests a new guild deposit", () => {
  const outsider = candidate("yevhen", 80, "outsider");
  const result = findFirstActionableResult({
    distribution: [{ placeNumber: 1, occupant: outsider }],
    places: catalogPlaces([200, 50, 25, 10, 5]),
    remainingFp: 300,
  });
  assert.equal(result.status, GUARANTEE_STATUSES.OUTSIDER_WITHOUT_GUILD_CHALLENGER);
  assert.deepEqual(result.action, {
    type: "guild_member_deposit",
    actor: "guild_member",
    amount: 190,
  });
});

test("G-002 skips an outsider when the safe deposit exceeds the place cost", () => {
  const distribution = [
    { placeNumber: 1, occupant: candidate("max", 1230, "guild_member") },
    { placeNumber: 2, occupant: candidate("cavalo", 620, "guild_member") },
    { placeNumber: 3, occupant: candidate("lymon", 210, "guild_member") },
    { placeNumber: 4, occupant: candidate("tertiadecima", 56, "outsider") },
    { placeNumber: 5, occupant: candidate("geminist", 48, "outsider") },
  ];
  const result = findFirstActionableResult({
    distribution,
    places: catalogPlaces([1230, 620, 210, 48, 10]),
    remainingFp: 134,
  });

  assert.equal(result, null);
});

test("R-007 skips an existing guild challenger when its safe total exceeds place cost", () => {
  const distribution = [
    { placeNumber: 1, occupant: candidate("outsider", 11709, "outsider") },
    { placeNumber: 2, occupant: candidate("guild", 1340, "guild_member") },
  ];
  const result = findFirstActionableResult({
    distribution,
    places: catalogPlaces([3670, 1220, 300, 75, 15]),
    remainingFp: 17994,
  });

  assert.equal(result.status, GUARANTEE_STATUSES.GUILD_MEMBER_CAN_BE_OVERTAKEN);
  assert.equal(result.placeNumber, 2);
  assert.equal(result.ownerGuaranteeFp, 16654);
});

test("G-003 skips an outsider that cannot be overtaken and guarantees place two", () => {
  const result = calculateGuarantee(base({
    ownerUserId: "274084",
    buildingId: "great_building",
    building: {
      level: 77,
      contributors: {
        "244096": contributor(11, 2, "Tertiadecima"),
        "274084": contributor(650, 2, "иван2000"),
        "850585903": contributor(1539, 1, "Strannik888"),
      },
    },
    guildUsers: { "274084": {} },
    branches: {
      double: { rules: { contributionMultiplier: 2, placeLimit: [1, 2, 3] } },
      onePointNine: { rules: { contributionMultiplier: 1.9, placeLimit: [4, 5] } },
    },
    apiPayload: api([810, 405, 135, 35, 5], 3485, 78),
  }));

  assert.equal(result.remainingFp, 1285);
  assert.equal(result.status, GUARANTEE_STATUSES.EMPTY_GUARANTEED);
  assert.equal(result.placeNumber, 2);
  assert.equal(result.placeCost, 810);
  assert.equal(result.ownerGuaranteeFp, 0);
  assert.deepEqual(result.action, {
    type: "guild_member_deposit",
    actor: "guild_member",
    amount: 810,
  });
});

test("F-002 plain ×1.9 place deposit reports branch Arc level, not the rounded one", () => {
  const result = calculateGuarantee(base({
    ownerUserId: "owner",
    buildingId: "gb",
    building: { level: 1, contributors: { owner: contributor(100, 1, "Owner") } },
    guildUsers: { owner: {} },
    branches: {
      onePointNine: { name: "×1.9", rules: { contributionMultiplier: 1.9 } },
    },
    apiPayload: api([405, 200, 70, 20, 5], 1500, 2),
  }));

  assert.equal(result.status, GUARANTEE_STATUSES.EMPTY_GUARANTEED);
  assert.equal(result.placeNumber, 1);
  assert.equal(result.placeCost, 770); // round(405 * 1.9) = round(769.5)
  assert.equal(result.action.amount, 770);
  assert.equal(result.requiredArcLevel, 80); // +90% boost = the ×1.9 branch, not 82
  assert.equal(result.requiredContributionBoost, 90);
  assert.equal(result.coefficient, 1.9);
  assert.equal(result.effectiveCoefficient, 1.9);
});

test("G-004 asks the owner for only 24 FP to protect place four", () => {
  const result = calculateGuarantee(base({
    ownerUserId: "274084",
    buildingId: "great_building",
    building: {
      level: 81,
      contributors: {
        "274084": contributor(600, 3, "иван2000"),
        "3389246": contributor(1360, 1, "Макс Чайка 999"),
        "851646354": contributor(680, 2, "cavalo escuro"),
        "851689153": contributor(60, 4, "trupis19"),
        "852152036": contributor(234, 3, "seward"),
      },
    },
    guildUsers: {
      "274084": {},
      "3389246": {},
      "851646354": {},
      "851689153": {},
      "852152036": {},
    },
    branches: {
      double: { rules: { contributionMultiplier: 2, placeLimit: [1, 2, 3] } },
      onePointNinetyFive: {
        rules: { contributionMultiplier: 1.95, placeLimit: [4, 5] },
      },
    },
    apiPayload: api([680, 340, 115, 30, 5], 3018, 82),
  }));

  assert.equal(result.remainingFp, 84);
  assert.equal(result.status, GUARANTEE_STATUSES.GUILD_MEMBER_CAN_BE_OVERTAKEN);
  assert.equal(result.placeNumber, 4);
  assert.equal(result.ownerGuaranteeFp, 24);
  assert.deepEqual(result.action, {
    type: "owner_deposit",
    actor: "owner",
    amount: 24,
  });
});

test("G-005 prioritizes Berd 222 top-up to the full cost of place two", () => {
  const result = calculateGuarantee(base({
    ownerUserId: "274084",
    buildingId: "great_building",
    building: {
      level: 64,
      contributors: {
        "244096": contributor(8, 6, "Tertiadecima"),
        "274084": contributor(250, 3, "иван2000"),
        "3389246": contributor(50, 4, "Макс Чайка 999"),
        "9382952": contributor(594, 2, "Berd 222"),
        "9773882": contributor(200, 3, "Lexx84"),
        "850585903": contributor(1150, 1, "Strannik888"),
        "852166780": contributor(10, 5, "Тарквиний Хитрец 893"),
      },
    },
    guildUsers: {
      "274084": {},
      "3389246": {},
      "9382952": {},
      "9773882": {},
      "852166780": {},
    },
    branches: {
      double: { rules: { contributionMultiplier: 2, placeLimit: [1, 2, 3] } },
      onePointNine: { rules: { contributionMultiplier: 1.9, placeLimit: [4, 5] } },
    },
    apiPayload: api([605, 305, 100, 25, 5], 2334, 65),
  }));

  assert.equal(result.remainingFp, 72);
  assert.equal(result.status, GUARANTEE_STATUSES.GUILD_MEMBER_BELOW_PLACE_COST);
  assert.equal(result.placeNumber, 2);
  assert.equal(result.placeCost, 610);
  assert.equal(result.requiredTopUp, 16);
  assert.equal(result.occupant.contributorId, "9382952");
  assert.deepEqual(result.action, {
    type: "guild_member_top_up",
    actor: "guild_member",
    amount: 16,
    contributorId: "9382952",
  });
});

test("G-006 asks the owner for 598 FP before opening place three", () => {
  const result = calculateGuarantee(base({
    ownerUserId: "274084",
    buildingId: "great_building",
    building: {
      level: 130,
      contributors: {
        "244096": contributor(11, 3, "Tertiadecima"),
        "274084": contributor(10000, 1, "иван2000"),
        "3758137": contributor(2258, 2, "Джеминист"),
        "850585903": contributor(4731, 1, "Strannik888"),
      },
    },
    guildUsers: { "274084": {} },
    branches: {
      double: { rules: { contributionMultiplier: 2, placeLimit: [1, 2, 3] } },
      onePointNinetyFive: {
        rules: { contributionMultiplier: 1.95, placeLimit: [4, 5] },
      },
    },
    apiPayload: api([2490, 1245, 415, 105, 20], 19247, 131),
  }));

  assert.equal(result.remainingFp, 2247);
  assert.equal(result.status, GUARANTEE_STATUSES.EMPTY_REQUIRES_OWNER_GUARANTEE);
  assert.equal(result.placeNumber, 3);
  assert.equal(result.placeCost, 830);
  assert.equal(result.ownerGuaranteeFp, 598);
  assert.equal(result.nearestOutsider.contributorId, "244096");
  assert.deepEqual(result.action, {
    type: "owner_deposit",
    actor: "owner",
    amount: 598,
  });
});

test("G-007 asks the owner for 63 FP to protect trupis19 on place four", () => {
  const result = calculateGuarantee(base({
    ownerUserId: "274084",
    buildingId: "great_building",
    building: {
      level: 105,
      contributors: {
        "274084": contributor(3000, 1, "иван2000"),
        "3389246": contributor(2520, 1, "Макс Чайка 999"),
        "851646354": contributor(1260, 2, "cavalo escuro"),
        "851689153": contributor(110, 4, "trupis19"),
        "852152036": contributor(429, 3, "seward"),
      },
    },
    guildUsers: {
      "274084": {},
      "3389246": {},
      "851646354": {},
      "851689153": {},
      "852152036": {},
    },
    branches: {
      double: { rules: { contributionMultiplier: 2, placeLimit: [1, 2, 3] } },
      onePointNinetyFive: {
        rules: { contributionMultiplier: 1.95, placeLimit: [4, 5] },
      },
    },
    apiPayload: api([1260, 630, 210, 55, 10], 7492, 106),
  }));

  assert.equal(result.remainingFp, 173);
  assert.equal(result.status, GUARANTEE_STATUSES.GUILD_MEMBER_CAN_BE_OVERTAKEN);
  assert.equal(result.placeNumber, 4);
  assert.equal(result.ownerGuaranteeFp, 63);
  assert.equal(result.occupant.contributorId, "851689153");
  assert.deepEqual(result.action, {
    type: "owner_deposit",
    actor: "owner",
    amount: 63,
  });
});

test("G-008 opens the first empty place for a guaranteed 1900 FP deposit", () => {
  const result = calculateGuarantee(base({
    ownerUserId: "274084",
    buildingId: "great_building",
    building: {
      level: 54,
      contributors: {
        "274084": contributor(183, 1, "иван2000"),
      },
    },
    guildUsers: { "274084": {} },
    branches: {
      double: { rules: { contributionMultiplier: 2, placeLimit: [1, 2, 3] } },
      onePointNine: { rules: { contributionMultiplier: 1.9, placeLimit: [4, 5] } },
    },
    apiPayload: api([950, 475, 160, 40, 10], 3524, 55),
  }));

  assert.equal(result.remainingFp, 3341);
  assert.equal(result.status, GUARANTEE_STATUSES.EMPTY_GUARANTEED);
  assert.equal(result.placeNumber, 1);
  assert.equal(result.placeCost, 1900);
  assert.equal(result.ownerGuaranteeFp, 0);
  assert.deepEqual(result.action, {
    type: "guild_member_deposit",
    actor: "guild_member",
    amount: 1900,
  });
});

test("G-009 protects the last of two consecutive at-risk guild members", () => {
  const result = calculateGuarantee(base({
    ownerUserId: "274084",
    buildingId: "great_building",
    building: {
      level: 96,
      contributors: {
        "274084": contributor(192, 4, "иван2000"),
        "4491274": contributor(1360, 2, "Yureс"),
        "849088475": contributor(2710, 1, "3arian"),
        "851646354": contributor(450, 3, "cavalo escuro"),
      },
    },
    guildUsers: {
      "274084": {},
      "4491274": {},
      "849088475": {},
      "851646354": {},
    },
    branches: {
      double: { rules: { contributionMultiplier: 2, placeLimit: [1, 2, 3] } },
      onePointNinetyFive: {
        rules: { contributionMultiplier: 1.95, placeLimit: [4, 5] },
      },
    },
    apiPayload: api([1355, 680, 225, 55, 10], 7114, 97),
  }));

  assert.equal(result.remainingFp, 2402);
  assert.equal(result.status, GUARANTEE_STATUSES.GUILD_MEMBER_CAN_BE_OVERTAKEN);
  assert.equal(result.placeNumber, 3);
  assert.equal(result.ownerGuaranteeFp, 1952);
  assert.equal(result.occupant.contributorId, "851646354");
  assert.deepEqual(result.action, {
    type: "owner_deposit",
    actor: "owner",
    amount: 1952,
  });
});

test("G-010 protects consecutive at-risk guild members on places two through five", () => {
  const input = base({
    ownerUserId: "274084",
    buildingId: "great_building",
    building: {
      level: 145,
      contributors: {
        "274084": contributor(13023, 1, "иван2000"),
        "3389246": contributor(5000, 1, "Макс Чайка 999"),
        "4888454": contributor(740, 3, "miheliys"),
        "5569010": contributor(2220, 2, "Yaroslav Lion 1"),
        "7214182": contributor(190, 4, "ВiтькаКучерявий"),
        "9773882": contributor(40, 5, "Lexx84"),
      },
    },
    guildUsers: {
      "274084": {},
      "3389246": {},
      "4888454": {},
      "5569010": {},
      "7214182": {},
      "9773882": {},
    },
    branches: {
      double: { rules: { contributionMultiplier: 2, placeLimit: [1, 2, 3] } },
      onePointNinetyFive: {
        rules: { contributionMultiplier: 1.95, placeLimit: [4, 5] },
      },
    },
    apiPayload: api([2220, 1110, 370, 95, 20], 23852, 146),
  });
  const result = calculateGuarantee(input);

  assert.equal(result.remainingFp, 2639);
  assert.equal(result.status, GUARANTEE_STATUSES.GUILD_MEMBER_CAN_BE_OVERTAKEN);
  assert.equal(result.placeNumber, 5);
  assert.equal(result.ownerGuaranteeFp, 2599);
  assert.equal(result.occupant.contributorId, "9773882");
  assert.deepEqual(result.action, {
    type: "owner_deposit",
    actor: "owner",
    amount: 2599,
  });

  const afterOwnerDeposit = calculateGuarantee({
    ...input,
    building: {
      ...input.building,
      contributors: {
        ...input.building.contributors,
        "274084": contributor(15622, 1, "иван2000"),
      },
    },
  });
  assert.equal(afterOwnerDeposit.remainingFp, 40);
  assert.equal(afterOwnerDeposit.status, GUARANTEE_STATUSES.NO_ACTION_REQUIRED);
});

test("G-011 skips an unbeatable outsider and guarantees place two for 900 FP", () => {
  const result = calculateGuarantee(base({
    ownerUserId: "274084",
    buildingId: "great_building",
    building: {
      level: 50,
      contributors: {
        "244096": contributor(40, 2, "Tertiadecima"),
        "274084": contributor(200, 2, "иван2000"),
        "850585903": contributor(1710, 1, "Strannik888"),
        "853291202": contributor(20, 3, "Дед Мороz"),
      },
    },
    guildUsers: { "274084": {} },
    branches: {
      double: { rules: { contributionMultiplier: 2, placeLimit: [1, 2, 3] } },
      onePointNine: { rules: { contributionMultiplier: 1.9, placeLimit: [4, 5] } },
    },
    apiPayload: api([900, 450, 150, 40, 10], 3331, 51),
  }));

  assert.equal(result.remainingFp, 1361);
  assert.equal(result.status, GUARANTEE_STATUSES.EMPTY_GUARANTEED);
  assert.equal(result.placeNumber, 2);
  assert.equal(result.placeCost, 900);
  assert.equal(result.ownerGuaranteeFp, 0);
  assert.equal(result.nearestOutsider.contributorId, "244096");
  assert.deepEqual(result.action, {
    type: "guild_member_deposit",
    actor: "guild_member",
    amount: 900,
  });
});

test("G-012 requires 1778 owner FP before guaranteeing place one for 2240 FP", () => {
  const input = base({
    ownerUserId: "1120118",
    buildingId: "great_building",
    building: {
      level: 101,
      contributors: {
        "1120118": contributor(45, 2, "Finiva UA"),
        "853324027": contributor(86, 1, "Fisherman2025"),
      },
    },
    guildUsers: { "1120118": {} },
    branches: {
      double: { rules: { contributionMultiplier: 2, placeLimit: [1, 2, 3] } },
      onePointNinetyFive: {
        rules: { contributionMultiplier: 1.95, placeLimit: [4, 5] },
      },
    },
    apiPayload: api([1120, 560, 185, 45, 10], 6303, 102),
  });
  const result = calculateGuarantee(input);

  assert.equal(result.remainingFp, 6172);
  assert.equal(result.status, GUARANTEE_STATUSES.EMPTY_REQUIRES_OWNER_GUARANTEE);
  assert.equal(result.placeNumber, 1);
  assert.equal(result.placeCost, 2240);
  assert.equal(result.ownerGuaranteeFp, 1778);
  assert.equal(result.nearestOutsider.contributorId, "853324027");
  assert.deepEqual(result.action, {
    type: "owner_deposit",
    actor: "owner",
    amount: 1778,
  });

  const afterOwnerDeposit = calculateGuarantee({
    ...input,
    building: {
      ...input.building,
      contributors: {
        ...input.building.contributors,
        "1120118": contributor(1823, 2, "Finiva UA"),
      },
    },
  });
  assert.equal(afterOwnerDeposit.remainingFp, 4394);
  assert.equal(afterOwnerDeposit.status, GUARANTEE_STATUSES.EMPTY_GUARANTEED);
  assert.equal(afterOwnerDeposit.placeNumber, 1);
  assert.deepEqual(afterOwnerDeposit.action, {
    type: "guild_member_deposit",
    actor: "guild_member",
    amount: 2240,
  });
});

test("G-013 requires 1821 owner FP when all guaranteed places are empty", () => {
  const input = base({
    ownerUserId: "1120118",
    buildingId: "great_building",
    building: {
      level: 101,
      contributors: {
        "1120118": contributor(2, 1, "Finiva UA"),
      },
    },
    guildUsers: { "1120118": {}, "guild-member": {} },
    branches: {
      double: { rules: { contributionMultiplier: 2, placeLimit: [1, 2, 3] } },
      onePointNinetyFive: {
        rules: { contributionMultiplier: 1.95, placeLimit: [4, 5] },
      },
    },
    apiPayload: api([1120, 560, 185, 45, 10], 6303, 102),
  });
  const result = calculateGuarantee(input);

  assert.equal(result.remainingFp, 6301);
  assert.equal(result.status, GUARANTEE_STATUSES.EMPTY_REQUIRES_OWNER_GUARANTEE);
  assert.equal(result.placeNumber, 1);
  assert.equal(result.placeCost, 2240);
  assert.equal(result.ownerGuaranteeFp, 1821);
  assert.deepEqual(result.action, {
    type: "owner_deposit",
    actor: "owner",
    amount: 1821,
  });

  const afterOwnerDeposit = calculateGuarantee({
    ...input,
    building: {
      ...input.building,
      contributors: {
        "1120118": contributor(1823, 1, "Finiva UA"),
      },
    },
  });
  assert.equal(afterOwnerDeposit.remainingFp, 4480);
  assert.equal(afterOwnerDeposit.status, GUARANTEE_STATUSES.EMPTY_GUARANTEED);
  assert.equal(afterOwnerDeposit.placeNumber, 1);
  assert.deepEqual(afterOwnerDeposit.action, {
    type: "guild_member_deposit",
    actor: "guild_member",
    amount: 2240,
  });

  const afterGuildDeposit = calculateGuarantee({
    ...input,
    building: {
      ...input.building,
      contributors: {
        "1120118": contributor(1823, 2, "Finiva UA"),
        "guild-member": contributor(2240, 1, "Учасник гільдії"),
      },
    },
  });
  assert.equal(afterGuildDeposit.remainingFp, 2240);
  assert.equal(afterGuildDeposit.status, GUARANTEE_STATUSES.EMPTY_GUARANTEED);
  assert.equal(afterGuildDeposit.placeNumber, 2);
  assert.equal(afterGuildDeposit.placeCost, 1120);
});

test("G-014 requires 18377 owner FP before guaranteeing place one for 6560 FP", () => {
  const input = base({
    ownerUserId: "1120118",
    buildingId: "great_building",
    building: {
      level: 158,
      contributors: {
        "1120118": contributor(12476, 1, "Finiva UA"),
      },
    },
    guildUsers: { "1120118": {}, "guild-member": {} },
    branches: {
      double: { rules: { contributionMultiplier: 2, placeLimit: [1, 2, 3] } },
      onePointNinetyFive: {
        rules: { contributionMultiplier: 1.95, placeLimit: [4, 5] },
      },
    },
    apiPayload: api([3280, 1640, 545, 135, 25], 43973, 159),
  });
  const result = calculateGuarantee(input);

  assert.equal(result.remainingFp, 31497);
  assert.equal(result.status, GUARANTEE_STATUSES.EMPTY_REQUIRES_OWNER_GUARANTEE);
  assert.equal(result.placeNumber, 1);
  assert.equal(result.placeCost, 6560);
  assert.equal(result.ownerGuaranteeFp, 18377);
  assert.deepEqual(result.action, {
    type: "owner_deposit",
    actor: "owner",
    amount: 18377,
  });

  const afterOwnerDeposit = calculateGuarantee({
    ...input,
    building: {
      ...input.building,
      contributors: {
        "1120118": contributor(30853, 1, "Finiva UA"),
      },
    },
  });
  assert.equal(afterOwnerDeposit.remainingFp, 13120);
  assert.equal(afterOwnerDeposit.status, GUARANTEE_STATUSES.EMPTY_GUARANTEED);
  assert.equal(afterOwnerDeposit.placeNumber, 1);
  assert.deepEqual(afterOwnerDeposit.action, {
    type: "guild_member_deposit",
    actor: "guild_member",
    amount: 6560,
  });

  const afterGuildDeposit = calculateGuarantee({
    ...input,
    building: {
      ...input.building,
      contributors: {
        "1120118": contributor(30853, 2, "Finiva UA"),
        "guild-member": contributor(6560, 1, "Учасник гільдії"),
      },
    },
  });
  assert.equal(afterGuildDeposit.remainingFp, 6560);
  assert.equal(afterGuildDeposit.status, GUARANTEE_STATUSES.EMPTY_GUARANTEED);
  assert.equal(afterGuildDeposit.placeNumber, 2);
  assert.equal(afterGuildDeposit.placeCost, 3280);
});

test("G-015 skips expensive outsider overtakes and protects the guild member below", () => {
  const distribution = [
    { placeNumber: 1, occupant: candidate("first-outsider", 34628, "outsider") },
    { placeNumber: 2, occupant: candidate("second-outsider", 11709, "outsider") },
    { placeNumber: 3, occupant: candidate("guild-member", 1340, "guild_member") },
    { placeNumber: 4, occupant: null },
    { placeNumber: 5, occupant: null },
    { placeNumber: 6, occupant: candidate("nearest-outsider", 52, "outsider") },
    { placeNumber: 7, occupant: candidate("outsider-seven", 51, "outsider") },
    { placeNumber: 8, occupant: candidate("outsider-eight", 50, "outsider") },
  ];
  const result = findFirstActionableResult({
    distribution,
    places: catalogPlaces([7340, 3670, 1220, 302, 59]),
    remainingFp: 17994,
  });

  assert.equal(result.status, GUARANTEE_STATUSES.GUILD_MEMBER_CAN_BE_OVERTAKEN);
  assert.equal(result.placeNumber, 3);
  assert.equal(result.occupant.contributorId, "guild-member");
  assert.equal(result.nearestOutsider.contributorId, "nearest-outsider");
  assert.equal(result.ownerGuaranteeFp, 16706);
  assert.deepEqual(result.action, {
    type: "owner_deposit",
    actor: "owner",
    amount: 16706,
  });
});

test("G-016 caps an impossible guild top-up at remaining FP minus one", () => {
  const result = findFirstActionableResult({
    distribution: [
      { placeNumber: 1, occupant: candidate("vovnov", 4070, "guild_member") },
      { placeNumber: 2, occupant: candidate("volodimir", 1043, "guild_member") },
      { placeNumber: 3, occupant: candidate("alex", 680, "guild_member") },
      { placeNumber: 4, occupant: candidate("yurec", 170, "guild_member") },
      { placeNumber: 5, occupant: candidate("oleksii", 30, "guild_member") },
    ],
    places: catalogPlaces([4070, 2040, 680, 166, 29]),
    remainingFp: 371,
  });

  assert.equal(result.status, GUARANTEE_STATUSES.GUILD_MEMBER_BELOW_PLACE_COST);
  assert.equal(result.placeNumber, 2);
  assert.equal(result.placeCostShortfall, 997);
  assert.equal(result.requiredTopUp, 370);
  assert.equal(result.ownerClosingFp, 1);
  assert.equal(result.unrecoverableShortfall, 627);
});

test("G-017 resolves multiple shortfalls strictly from the highest place downward", () => {
  const places = catalogPlaces([3490, 1750, 580, 146, 29]);
  const firstScan = findFirstActionableResult({
    distribution: [
      { placeNumber: 1, occupant: candidate("tarkvin", 3316, "guild_member") },
      { placeNumber: 2, occupant: candidate("vesta", 580, "guild_member") },
      { placeNumber: 3, occupant: candidate("cavalo", 551, "guild_member") },
      { placeNumber: 4, occupant: candidate("passat", 143, "guild_member") },
      { placeNumber: 5, occupant: candidate("yaroslav", 30, "guild_member") },
    ],
    places,
    remainingFp: 1196,
  });
  assert.equal(firstScan.placeNumber, 1);
  assert.equal(firstScan.requiredTopUp, 174);

  const secondScan = findFirstActionableResult({
    distribution: [
      { placeNumber: 1, occupant: candidate("tarkvin", 3490, "guild_member") },
      { placeNumber: 2, occupant: candidate("vesta", 580, "guild_member") },
      { placeNumber: 3, occupant: candidate("cavalo", 551, "guild_member") },
      { placeNumber: 4, occupant: candidate("passat", 143, "guild_member") },
      { placeNumber: 5, occupant: candidate("yaroslav", 30, "guild_member") },
    ],
    places,
    remainingFp: 1022,
  });
  assert.equal(secondScan.placeNumber, 2);
  assert.equal(secondScan.placeCostShortfall, 1170);
  assert.equal(secondScan.requiredTopUp, 1021);
  assert.equal(secondScan.ownerClosingFp, 1);
  assert.equal(secondScan.unrecoverableShortfall, 149);
});

test("G-018 returns no action after an unbeatable outsider when every place is occupied", () => {
  const result = findFirstActionableResult({
    distribution: [
      { placeNumber: 1, occupant: candidate("outsider-1", 1000, "outsider") },
      { placeNumber: 2, occupant: candidate("outsider-2", 500, "outsider") },
      { placeNumber: 3, occupant: candidate("outsider-3", 200, "outsider") },
      { placeNumber: 4, occupant: candidate("outsider-4", 100, "outsider") },
      { placeNumber: 5, occupant: candidate("outsider-5", 50, "outsider") },
    ],
    places: catalogPlaces([900, 450, 180, 90, 45]),
    remainingFp: 20,
  });
  assert.equal(result, null);
});

test("G-018 skips an unaffordable empty gap before returning no action", () => {
  const result = findFirstActionableResult({
    distribution: [
      { placeNumber: 1, occupant: candidate("outsider", 600, "outsider") },
      { placeNumber: 2, occupant: null },
      { placeNumber: 3, occupant: candidate("lower-outsider", 100, "outsider") },
      { placeNumber: 4, occupant: candidate("lower-outsider-2", 50, "outsider") },
      { placeNumber: 5, occupant: candidate("lower-outsider-3", 25, "outsider") },
    ],
    places: catalogPlaces([500, 260, 100, 50, 25]),
    remainingFp: 248,
  });
  assert.equal(result, null);
});

test("empty tail below remaining is immediately guaranteed when the place is protected", () => {
  const places = catalogPlaces([200, 70, 20, 10, 5]);
  const distribution = places.map((place) => ({ placeNumber: place.placeNumber, occupant: null }));
  const result = calculateEmptyResult({
    target: distribution[0], distribution, places, remainingFp: 400,
  });
  assert.equal(result.status, GUARANTEE_STATUSES.EMPTY_GUARANTEED);
  assert.deepEqual(result.action, {
    type: "guild_member_deposit", actor: "guild_member", amount: 200,
  });
});

test("empty tail below remaining requires an owner guarantee when the place is exposed", () => {
  const places = catalogPlaces([200, 70, 20, 10, 5]);
  const distribution = places.map((place) => ({ placeNumber: place.placeNumber, occupant: null }));
  const result = calculateEmptyResult({
    target: distribution[0], distribution, places, remainingFp: 500,
  });
  assert.equal(result.status, GUARANTEE_STATUSES.EMPTY_REQUIRES_OWNER_GUARANTEE);
  assert.equal(result.ownerGuaranteeFp, 100);
  assert.deepEqual(result.action, { type: "owner_deposit", actor: "owner", amount: 100 });
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

test("an empty tail above remaining uses only the current proportional deposit", () => {
  const places = catalogPlaces([200, 50, 25, 10, 1]);
  const distribution = places.map((place) => ({ placeNumber: place.placeNumber, occupant: null }));
  const result = calculateEmptyResult({
    target: distribution[0], distribution, places, remainingFp: 250,
  });
  assert.equal(result.status, GUARANTEE_STATUSES.EMPTY_URGENT_PROPORTIONAL_DEPOSIT);
  assert.equal(result.oneFpPlacesCount, 1);
  assert.equal(result.proportionalPool, 248);
  assert.equal(result.weightSum, 285);
  assert.equal(result.action.amount, 175);
});

test("G-001 recommends 1232 FP for the first empty place", () => {
  const result = calculateGuarantee(base({
    ownerUserId: "851419219",
    buildingId: "great_building",
    building: {
      level: 59,
      contributors: {
        "851419219": contributor(748, 1, "PASSAT B6"),
      },
    },
    guildUsers: { "851419219": {} },
    branches: {
      double: {
        name: "×2",
        rules: {
          contributionMultiplier: 2,
          placeLimit: [1, 2, 3],
        },
      },
      onePointNine: {
        name: "×1.9",
        rules: {
          contributionMultiplier: 1.9,
          placeLimit: [4, 5],
        },
      },
    },
    apiPayload: api([760, 380, 125, 30, 5], 2853, 60),
  }));

  assert.equal(result.status, GUARANTEE_STATUSES.EMPTY_URGENT_PROPORTIONAL_DEPOSIT);
  assert.equal(result.remainingFp, 2105);
  assert.equal(result.sumEmptyPlaceCosts, 2597);
  assert.equal(result.ownerClosingFp, 1);
  assert.equal(result.proportionalPool, 2104);
  assert.equal(result.weightSum, 2597);
  assert.equal(result.recommendedDeposit, 1232);
  assert.equal(result.requiredArcLevel, 42);
  assert.equal(result.requiredContributionBoost, 63);
  assert.equal(result.effectiveCoefficient, 1232 / 760);
  assert.equal(result.coefficient, 1232 / 760);
  assert.deepEqual(result.action, {
    type: "guild_member_deposit",
    actor: "guild_member",
    amount: 1232,
  });
  assert.deepEqual(
    result.developerDebug.places.map((place) => place.placeCost),
    [1520, 760, 250, 57, 10]
  );
});

test("a contributor below fifth place prevents empty-tail calculation", () => {
  const places = catalogPlaces([200, 50, 25, 10, 1]);
  const distribution = [
    ...places.map((place) => ({ placeNumber: place.placeNumber, occupant: null })),
    { placeNumber: 6, occupant: candidate("outsider", 80, "outsider") },
  ];
  const result = calculateEmptyResult({
    target: distribution[0], distribution, places, remainingFp: 250,
  });
  assert.equal(result.status, GUARANTEE_STATUSES.EMPTY_GUARANTEED);
  assert.equal(result.sumEmptyPlaceCosts, undefined);
  assert.equal(result.nearestOutsider.contributorId, "outsider");
});

test("a large remaining amount does not trigger proportional distribution", () => {
  const places = catalogPlaces([6210, 2000, 1200, 800, 453]);
  const distribution = places.map((place) => ({ placeNumber: place.placeNumber, occupant: null }));
  const result = calculateEmptyResult({
    target: distribution[0], distribution, places, remainingFp: 35771,
  });
  assert.equal(places.reduce((sum, place) => sum + place.placeCost, 0), 10663);
  assert.equal(result.status, GUARANTEE_STATUSES.EMPTY_REQUIRES_OWNER_GUARANTEE);
  assert.equal(result.ownerGuaranteeFp, 23351);
  assert.deepEqual(result.action, {
    type: "owner_deposit", actor: "owner", amount: 23351,
  });
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
