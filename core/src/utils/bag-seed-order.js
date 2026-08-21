function compareBagSeedGameOrder(left, right) {
  const rareDiff = Number(Number(right && right.rarity) >= 2)
    - Number(Number(left && left.rarity) >= 2);
  if (rareDiff !== 0) return rareDiff;

  const expDiff = Number(right && right.plantExp || 0) - Number(left && left.plantExp || 0);
  if (expDiff !== 0) return expDiff;

  return Number(left && (left.seedId || left.id) || 0)
    - Number(right && (right.seedId || right.id) || 0);
}

module.exports = { compareBagSeedGameOrder };
