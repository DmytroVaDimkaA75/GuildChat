// Static snapshot of The Arc contribution boost for levels 1-180.
// Source: https://api.foe-helper.com/v1/LegendaryBuilding/get?id=X_FutureEra_Landmark1&level={level}
const ARC_CONTRIBUTION_BOOSTS = Object.freeze([
  10, 12, 14, 17, 19, 22, 24, 26, 29, 31,
  32, 33, 34, 35, 36, 37, 38, 39, 40, 41,
  42, 43, 44, 45, 46, 47, 48, 49, 50, 51,
  52, 53, 54, 55, 56, 57, 58, 59, 60, 61,
  62, 63, 64, 65, 66, 67, 68, 69, 70, 71,
  72, 73, 74, 75, 76, 77, 78, 79, 79.5, 80,
  80.5, 81, 81.5, 82, 82.5, 83, 83.5, 84, 84.5, 85,
  85.5, 86, 86.5, 87, 87.5, 88, 88.5, 89, 89.5, 90,
  90.1, 90.2, 90.3, 90.4, 90.5, 90.6, 90.7, 90.8, 90.9, 91,
  91.1, 91.2, 91.3, 91.4, 91.5, 91.6, 91.7, 91.8, 91.9, 92,
  92.1, 92.2, 92.3, 92.4, 92.5, 92.6, 92.7, 92.8, 92.9, 93,
  93.1, 93.2, 93.3, 93.4, 93.5, 93.6, 93.7, 93.8, 93.9, 94,
  94.1, 94.2, 94.3, 94.4, 94.5, 94.6, 94.7, 94.8, 94.9, 95,
  95.1, 95.2, 95.3, 95.4, 95.5, 95.6, 95.7, 95.8, 95.9, 96,
  96.1, 96.2, 96.3, 96.4, 96.5, 96.6, 96.7, 96.8, 96.9, 97,
  97.1, 97.2, 97.3, 97.4, 97.5, 97.6, 97.7, 97.8, 97.9, 98,
  98.1, 98.2, 98.3, 98.4, 98.5, 98.6, 98.7, 98.8, 98.9, 99,
  99.1, 99.2, 99.3, 99.4, 99.5, 99.6, 99.7, 99.8, 99.9, 100,
]);

const findRequiredArcLevel = ({ nominalCost, contribution }) => {
  const nominal = Number(nominalCost);
  const amount = Number(contribution);
  if (!Number.isFinite(nominal) || nominal <= 0) return 0;
  if (!Number.isFinite(amount) || amount <= nominal) return 0;

  const index = ARC_CONTRIBUTION_BOOSTS.findIndex(
    (boost) => nominal * (100 + boost) >= amount * 100
  );
  return index === -1 ? null : index + 1;
};

module.exports = { ARC_CONTRIBUTION_BOOSTS, findRequiredArcLevel };
