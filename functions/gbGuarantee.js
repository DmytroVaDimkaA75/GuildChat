const FALLBACK_CONTRIBUTION_MULTIPLIER = 1.9;
const { ARC_CONTRIBUTION_BOOSTS, findRequiredArcLevel } = require("./arcLevels");

const GUARANTEE_STATUSES = Object.freeze({
  SECURED_GUILD_MEMBER: "secured_guild_member",
  GUILD_MEMBER_CAN_BE_OVERTAKEN: "guild_member_can_be_overtaken",
  GUILD_MEMBER_BELOW_PLACE_COST: "guild_member_below_place_cost",
  OUTSIDER_CAN_BE_OVERTAKEN: "outsider_can_be_overtaken",
  OUTSIDER_CANNOT_BE_OVERTAKEN: "outsider_cannot_be_overtaken",
  OUTSIDER_WITHOUT_GUILD_CHALLENGER: "outsider_without_guild_challenger",
  EMPTY_GUARANTEED: "empty_guaranteed",
  EMPTY_REQUIRES_OWNER_GUARANTEE: "empty_requires_owner_guarantee",
  EMPTY_URGENT_DEPOSIT: "empty_urgent_deposit",
  EMPTY_URGENT_PROPORTIONAL_DEPOSIT: "empty_urgent_proportional_deposit",
  EMPTY_OWNER_CONFIRMATION_REQUIRED: "empty_owner_confirmation_required",
  NO_ACTION_REQUIRED: "no_action_required",
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
  if (!Number.isFinite(number) || number < min) throw new Error(`Invalid ${field}`);
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
    matches.push({
      branchId,
      branchName: String(branch?.name || "").trim() || undefined,
      contributionMultiplier: asFiniteNumber(
        branch?.rules?.contributionMultiplier,
        "contributionMultiplier"
      ),
      requiredArcLevel: asFiniteNumber(branch?.rules?.ArcLevel ?? 0, "ArcLevel"),
    });
  });
  if (matches.length === 0) return null;
  const highestMultiplier = Math.max(...matches.map((item) => item.contributionMultiplier));
  const highestMatches = matches.filter(
    (item) => item.contributionMultiplier === highestMultiplier
  );
  if (highestMatches.length === 1) return highestMatches[0];
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
  if (
    typeof response.total_fp !== "number" ||
    !Number.isFinite(response.total_fp) ||
    response.total_fp < 0
  ) {
    throw new ApiValidationError("Invalid total_fp");
  }
  if (response.level !== targetLevel) throw new ApiValidationError("API level mismatch");
  if (!Array.isArray(response.patron_bonus)) {
    throw new ApiValidationError("Invalid patron_bonus");
  }

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
    totalFp: response.total_fp,
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
    avatar: String(contributor?.avatar || "").trim() || undefined,
    imageUrl: String(guildUsers?.[contributorId]?.imageUrl || "").trim() || undefined,
    membership: Object.prototype.hasOwnProperty.call(guildUsers || {}, contributorId)
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

const buildPlaces = ({ nominalPlaces, branches, ownerUserId, buildingId, currentLevel }) =>
  nominalPlaces.map((place) => {
    const branch = selectBranch(branches, {
      ownerUserId,
      buildingId,
      currentLevel,
      placeNumber: place.placeNumber,
    });
    // A coefficient belongs to a concrete place of a concrete GB. Only use
    // the agreed 1.9 fallback when no GBChat branch matches that place.
    const coefficient = branch?.contributionMultiplier ?? FALLBACK_CONTRIBUTION_MULTIPLIER;
    return {
      ...place,
      placeCost: Math.max(1, Math.round(place.nominalCost * coefficient)),
      coefficient,
      ...(branch?.branchId ? { branchId: branch.branchId } : {}),
      ...(branch?.branchName ? { branchName: branch.branchName } : {}),
      requiredArcLevel: branch?.requiredArcLevel ?? 0,
    };
  });

const distributeContributors = ({ candidates, places, remainingFp }) => {
  const distribution = [];
  let placeNumber = 1;
  let candidateIndex = 0;

  while (candidateIndex < candidates.length) {
    const candidate = candidates[candidateIndex];
    if (placeNumber > 5) {
      distribution.push({ placeNumber, occupant: candidate });
      candidateIndex += 1;
      placeNumber += 1;
      continue;
    }

    const placeCost = places[placeNumber - 1].placeCost;
    const nextCandidateFp = candidates[candidateIndex + 1]?.forgePoints || 0;
    const qualifiesByCost = candidate.forgePoints >= placeCost;
    const isAlreadyProtected = !canOvertake(
      nextCandidateFp,
      remainingFp,
      candidate.forgePoints
    );

    if (candidate.membership === "guild_member" || qualifiesByCost || isAlreadyProtected) {
      distribution.push({ placeNumber, occupant: candidate });
      candidateIndex += 1;
    } else {
      distribution.push({ placeNumber, occupant: null });
    }
    placeNumber += 1;
  }

  while (placeNumber <= 5) {
    distribution.push({ placeNumber, occupant: null });
    placeNumber += 1;
  }
  return distribution;
};

const occupantPayload = (occupant) => ({
  contributorId: occupant.contributorId,
  playerName: occupant.playerName,
  forgePoints: occupant.forgePoints,
  membership: occupant.membership,
  ...(occupant.avatar ? { avatar: occupant.avatar } : {}),
  ...(occupant.imageUrl ? { imageUrl: occupant.imageUrl } : {}),
});

const buildDeveloperDebug = ({ distribution, places, ownerDeposit }) => ({
  ownerDeposit,
  places: distribution.map(({ placeNumber, occupant }) => {
    const place = placeNumber <= 5 ? places[placeNumber - 1] : null;
    return {
      placeNumber,
      ...(place ? {
        nominalCost: place.nominalCost,
        coefficient: place.coefficient,
        placeCost: place.placeCost,
        ...(place.branchId ? { branchId: place.branchId } : {}),
        ...(place.branchName ? { branchName: place.branchName } : {}),
      } : {}),
      occupant: occupant ? occupantPayload(occupant) : null,
    };
  }),
});

const action = (type, actor, amount, extra = {}) => ({ type, actor, amount, ...extra });

const calculateEmptyResult = ({ target, distribution, places, remainingFp }) => {
  const place = places[target.placeNumber - 1];
  const followingPlaces = distribution.filter(
    (item) => item.placeNumber > target.placeNumber
  );
  const allFollowingEmpty = followingPlaces.every((item) => !item.occupant);
  const common = {
    placeNumber: target.placeNumber,
    placeCost: place.placeCost,
    nominalCost: place.nominalCost,
    coefficient: place.coefficient,
    ...(place.branchId ? { branchId: place.branchId } : {}),
    ...(place.branchName ? { branchName: place.branchName } : {}),
    requiredArcLevel: place.requiredArcLevel,
  };

  if (allFollowingEmpty) {
    const emptyPlaces = places.slice(target.placeNumber - 1);
    const sumEmptyPlaceCosts = emptyPlaces.reduce((sum, item) => sum + item.placeCost, 0);
    const emptyCommon = { ...common, sumEmptyPlaceCosts };

    if (sumEmptyPlaceCosts > remainingFp) {
      const oneFpPlacesCount = emptyPlaces.filter((item) => item.placeCost === 1).length;
      const weightedPlaces = emptyPlaces.filter((item) => item.placeCost > 1);
      const weightSum = weightedPlaces.reduce((sum, item) => sum + item.placeCost, 0);
      const proportionalPool = remainingFp - 1 - oneFpPlacesCount;
      const recommendedDeposit = place.placeCost === 1
        ? 1
        : Math.ceil(proportionalPool * place.placeCost / weightSum);
      return {
        ...emptyCommon,
        status: GUARANTEE_STATUSES.EMPTY_URGENT_PROPORTIONAL_DEPOSIT,
        ownerClosingFp: 1,
        oneFpPlacesCount,
        proportionalPool,
        weightSum,
        recommendedDeposit,
        action: action("guild_member_deposit", "guild_member", recommendedDeposit),
      };
    }

    if (sumEmptyPlaceCosts === remainingFp) {
      const nextEmptyPlace = emptyPlaces[1];
      if (!nextEmptyPlace && place.placeCost === 1) {
        return {
          ...emptyCommon,
          status: GUARANTEE_STATUSES.EMPTY_OWNER_CONFIRMATION_REQUIRED,
          recommendedDeposit: 0,
          ownerClosingFp: 1,
          action: action("confirm_with_owner", "owner", 1),
        };
      }
      const leaveOneFp = !nextEmptyPlace || nextEmptyPlace.placeCost === 1;
      const recommendedDeposit = place.placeCost - (leaveOneFp ? 1 : 0);
      return {
        ...emptyCommon,
        status: GUARANTEE_STATUSES.EMPTY_URGENT_DEPOSIT,
        recommendedDeposit,
        ownerClosingFp: leaveOneFp ? 1 : 0,
        ...(nextEmptyPlace ? {
          nextEmptyPlace: {
            placeNumber: nextEmptyPlace.placeNumber,
            placeCost: nextEmptyPlace.placeCost,
          },
        } : {}),
        action: action("guild_member_deposit", "guild_member", recommendedDeposit),
      };
    }
  }

  if (place.placeCost > remainingFp) return null;

  const nearestOutsider = distribution.find(
    (item) => item.placeNumber > target.placeNumber &&
      item.occupant?.membership === "outsider"
  )?.occupant;
  const ownerGuaranteeFp = Math.max(
    0,
    (nearestOutsider?.forgePoints || 0) + remainingFp - 2 * place.placeCost
  );
  if (ownerGuaranteeFp > 0) {
    return {
      ...common,
      status: GUARANTEE_STATUSES.EMPTY_REQUIRES_OWNER_GUARANTEE,
      ownerGuaranteeFp,
      ...(nearestOutsider ? { nearestOutsider: occupantPayload(nearestOutsider) } : {}),
      action: action("owner_deposit", "owner", ownerGuaranteeFp),
    };
  }
  return {
    ...common,
    status: GUARANTEE_STATUSES.EMPTY_GUARANTEED,
    ownerGuaranteeFp: 0,
    ...(nearestOutsider ? { nearestOutsider: occupantPayload(nearestOutsider) } : {}),
    action: action("guild_member_deposit", "guild_member", place.placeCost),
  };
};

const findFirstActionableResult = ({ distribution, places, remainingFp }) => {
  for (let targetIndex = 0; targetIndex < distribution.length; targetIndex += 1) {
    const target = distribution[targetIndex];
    const occupant = target.occupant;
    if (!occupant) {
      const emptyResult = calculateEmptyResult({
        target, distribution, places, remainingFp,
      });
      if (emptyResult) return emptyResult;
      continue;
    }

    if (occupant.membership === "guild_member") {
      const place = places[target.placeNumber - 1];
      if (place && occupant.forgePoints < place.placeCost) {
        const placeCostShortfall = place.placeCost - occupant.forgePoints;
        const maximumAvailableTopUp = Math.max(0, remainingFp - 1);
        const requiredTopUp = Math.min(placeCostShortfall, maximumAvailableTopUp);
        const unrecoverableShortfall = placeCostShortfall - requiredTopUp;
        return {
          status: GUARANTEE_STATUSES.GUILD_MEMBER_BELOW_PLACE_COST,
          placeNumber: target.placeNumber,
          placeCost: place.placeCost,
          occupant: occupantPayload(occupant),
          requiredTopUp,
          placeCostShortfall,
          ...(unrecoverableShortfall > 0 ? {
            ownerClosingFp: 1,
            unrecoverableShortfall,
          } : {}),
          action: action(
            "guild_member_top_up",
            "guild_member",
            requiredTopUp,
            { contributorId: occupant.contributorId }
          ),
        };
      }
      const nearestOutsider = distribution.find(
        (item) => item.placeNumber > target.placeNumber &&
          item.occupant?.membership === "outsider"
      )?.occupant;
      const challengerFp = nearestOutsider?.forgePoints || 0;
      if (!canOvertake(challengerFp, remainingFp, occupant.forgePoints)) continue;

      let guaranteeTarget = target;
      let guaranteeOccupant = occupant;
      let guaranteeOutsider = nearestOutsider;
      for (let index = targetIndex + 1; index < distribution.length; index += 1) {
        const following = distribution[index];
        if (following.occupant?.membership !== "guild_member") break;
        const followingOutsider = distribution.find(
          (item) => item.placeNumber > following.placeNumber &&
            item.occupant?.membership === "outsider"
        )?.occupant;
        const followingChallengerFp = followingOutsider?.forgePoints || 0;
        if (!canOvertake(
          followingChallengerFp,
          remainingFp,
          following.occupant.forgePoints
        )) break;
        guaranteeTarget = following;
        guaranteeOccupant = following.occupant;
        guaranteeOutsider = followingOutsider;
      }

      const guaranteeChallengerFp = guaranteeOutsider?.forgePoints || 0;
      const ownerGuaranteeFp = guaranteeChallengerFp + remainingFp -
        guaranteeOccupant.forgePoints;
      return {
        status: GUARANTEE_STATUSES.GUILD_MEMBER_CAN_BE_OVERTAKEN,
        placeNumber: guaranteeTarget.placeNumber,
        occupant: occupantPayload(guaranteeOccupant),
        ...(guaranteeOutsider
          ? { nearestOutsider: occupantPayload(guaranteeOutsider) }
          : {}),
        ownerGuaranteeFp,
        action: action("owner_deposit", "owner", ownerGuaranteeFp),
      };
    }

    const nearestGuildMember = distribution.find(
      (item) => item.placeNumber > target.placeNumber &&
        item.occupant?.membership === "guild_member"
    )?.occupant;
    if (!nearestGuildMember) {
      const guaranteedDeposit = Math.max(
        occupant.forgePoints + 1,
        Math.ceil((occupant.forgePoints + remainingFp) / 2)
      );
      const place = places[target.placeNumber - 1];
      if (
        guaranteedDeposit > remainingFp ||
        !place ||
        guaranteedDeposit > place.placeCost
      ) continue;
      return {
        status: GUARANTEE_STATUSES.OUTSIDER_WITHOUT_GUILD_CHALLENGER,
        placeNumber: target.placeNumber,
        occupant: occupantPayload(occupant),
        action: action("guild_member_deposit", "guild_member", guaranteedDeposit),
      };
    }

    const requiredTopUp = Math.max(
      occupant.forgePoints + 1 - nearestGuildMember.forgePoints,
      Math.ceil(
        (occupant.forgePoints + remainingFp - nearestGuildMember.forgePoints) / 2
      )
    );
    const place = places[target.placeNumber - 1];
    const finalGuildContribution = nearestGuildMember.forgePoints + requiredTopUp;
    if (
      requiredTopUp > remainingFp ||
      !place ||
      finalGuildContribution > place.placeCost
    ) continue;
    return {
      status: GUARANTEE_STATUSES.OUTSIDER_CAN_BE_OVERTAKEN,
      placeNumber: target.placeNumber,
      occupant: occupantPayload(occupant),
      nearestGuildMember: {
        ...occupantPayload(nearestGuildMember),
        requiredTopUp,
      },
      action: action(
        "guild_member_top_up",
        "guild_member",
        requiredTopUp,
        { contributorId: nearestGuildMember.contributorId }
      ),
    };
  }
  return null;
};

const calculateGuarantee = ({
  ownerUserId, buildingId, building, guildUsers, branches, apiPayload, calculatedAt,
}) => {
  const currentLevel = asFiniteNumber(building?.level, "building level");
  const { totalFp, places: nominalPlaces } = validateApiPayload(apiPayload, currentLevel + 1);
  const { owner, candidates } = normalizeContributors({
    contributors: building?.contributors,
    ownerUserId,
    guildUsers,
  });
  const investedFp = owner.forgePoints + candidates.reduce(
    (sum, item) => sum + item.forgePoints,
    0
  );
  const remainingFp = totalFp - investedFp;
  if (remainingFp < 0) throw new Error("Contributions exceed total_fp");

  const places = buildPlaces({
    nominalPlaces,
    branches,
    ownerUserId,
    buildingId,
    currentLevel,
  });
  const distribution = distributeContributors({ candidates, places, remainingFp });
  const result = findFirstActionableResult({ distribution, places, remainingFp });
  const targetPlace = result?.placeNumber <= 5 ? places[result.placeNumber - 1] : null;
  // A deposit equal to the plain place cost pays the branch multiplier; the ≤0.5 FP
  // rounding of placeCost must not inflate requiredArcLevel or effectiveCoefficient.
  const isPlainPlaceDeposit = result?.action?.type === "guild_member_deposit"
    && targetPlace
    && result.action.amount === targetPlace.placeCost;
  const calculatedRequiredArcLevel = result?.action?.type === "guild_member_deposit"
    ? findRequiredArcLevel({
      nominalCost: targetPlace?.nominalCost,
      contribution: result.action.amount,
      multiplier: targetPlace?.coefficient,
    })
    : result?.requiredArcLevel;
  const effectiveCoefficient = result?.action?.type === "guild_member_deposit" &&
    Number(targetPlace?.nominalCost) > 0
    ? (isPlainPlaceDeposit
      ? targetPlace.coefficient
      : result.action.amount / targetPlace.nominalCost)
    : null;
  const requiredContributionBoost = calculatedRequiredArcLevel > 0
    ? ARC_CONTRIBUTION_BOOSTS[calculatedRequiredArcLevel - 1]
    : 0;
  const base = {
    calculatedAt,
    totalFp,
    remainingFp,
    developerDebug: buildDeveloperDebug({
      distribution,
      places,
      ownerDeposit: owner.forgePoints,
    }),
  };
  return result
    ? {
      ...base,
      ...result,
      ...(calculatedRequiredArcLevel != null
        ? { requiredArcLevel: calculatedRequiredArcLevel }
        : {}),
      ...(effectiveCoefficient != null ? {
        coefficient: effectiveCoefficient,
        effectiveCoefficient,
        requiredContributionBoost,
      } : {}),
    }
    : { ...base, status: GUARANTEE_STATUSES.NO_ACTION_REQUIRED };
};

const writeIfCurrent = async ({ updateAtRef, guarantRef, triggeringUpdateAt, result }) => {
  const current = (await updateAtRef.once("value")).val();
  if (current !== triggeringUpdateAt) return false;
  await guarantRef.set(result);
  return true;
};

module.exports = {
  ApiValidationError,
  FALLBACK_CONTRIBUTION_MULTIPLIER,
  GUARANTEE_STATUSES,
  branchMatches,
  buildPlaces,
  buildDeveloperDebug,
  calculateEmptyResult,
  calculateGuarantee,
  canOvertake,
  distributeContributors,
  findFirstActionableResult,
  normalizeContributors,
  selectBranch,
  sortContributors,
  validateApiPayload,
  writeIfCurrent,
};
