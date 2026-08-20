/**
 * 种植分析服务 - 植物排名计算
 *
 * 功能：
 * - 解析生长时间、化肥减少时间
 * - 按经验/化肥经验/金币/利润/等级对各植物进行排名
 */
const { getAllPlants, getFruitPrice, getSeedPrice, getItemImageById, getSeedLevel } = require('../config/gameConfig');

const SECONDS_PER_HOUR = 3600;

/**
 * 解析生长阶段字符串中的总时间（秒）
 * 格式如 "phase1:300;phase2:600;..."
 */
function parseGrowTime(growPhases) {
  if (!growPhases) return -1;
  const phases = growPhases.split(';').filter((p) => p.length > 0);
  let totalSec = 0;
  for (const phase of phases) {
    const match = phase.match(/:(\d+)$/);
    if (match) totalSec += Number.parseInt(match[1], 10);
  }
  return totalSec;
}

/**
 * 解析普通化肥减少时间（第一个阶段的时长即为化肥减少量）
 */
function parseNormalFertilizerReduceSec(growPhases) {
  if (!growPhases) return 0;
  const phases = String(growPhases).split(';').filter((p) => p.length > 0);
  if (!phases.length) return 0;
  const first = phases[0];
  const match = first.match(/:(\d+)$/);
  return match ? Number.parseInt(match[1], 10) || 0 : 0;
}

/**
 * 格式化秒数为人类可读时间
 */
function formatTime(secs) {
  if (secs < 60) return `${secs}秒`;
  if (secs < 3600) return `${Math.floor(secs / 60)}分${secs % 60}秒`;
  const hours = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  return mins > 0 ? `${hours}时${mins}分` : `${hours}时`;
}

/**
 * 获取植物排名列表
 * @param {'exp'|'fert'|'gold'|'profit'|'fert_profit'|'level'} sortBy - 排序方式
 */
function getPlantRankings(sortBy = 'exp') {
  const allPlants = getAllPlants();
  const eligiblePlants = allPlants.filter(
    (p) => p.seed_id > 0 && p.grow_phases
  );

  const rankings = [];

  for (const plant of eligiblePlants) {
    const growTime = parseGrowTime(plant.grow_phases);
    if (growTime <= 0) continue;

    const seasons = Number(plant.seasons) || 1;
    const isMultiSeason = seasons === 2;

    // 有效生长时间（多季作物 ×1.5）
    const effectiveGrowTime = isMultiSeason ? growTime * 1.5 : growTime;

    const expPerHarvest = Number.parseInt(plant.exp, 10) || 0;
    const totalExp = isMultiSeason ? expPerHarvest * 2 : expPerHarvest;

    // 经验/小时
    const expPerHour = totalExp / effectiveGrowTime * SECONDS_PER_HOUR;

    const reduceSec = parseNormalFertilizerReduceSec(plant.grow_phases);
    const reduceSecApplied = isMultiSeason ? reduceSec * 1.5 : reduceSec;
    const fertGrowTime = effectiveGrowTime - reduceSecApplied;
    const fertEffectiveTime = fertGrowTime > 0 ? fertGrowTime : effectiveGrowTime;

    // 化肥后经验/小时
    const normalFertilizerExpPerHour = totalExp / fertEffectiveTime * SECONDS_PER_HOUR;

    // 金币计算
    const fruitId = Number(plant.fruit && plant.fruit.id) || 0;
    const fruitCountPerHarvest = Number(plant.fruit && plant.fruit.count) || 0;
    const fruitPrice = getFruitPrice(fruitId);
    const seedPrice = getSeedPrice(Number(plant.seed_id) || 0);

    // 总收入
    const income = fruitCountPerHarvest * fruitPrice * (isMultiSeason ? 2 : 1);
    const netProfit = income - seedPrice;

    // 金币/小时 和 利润/小时
    const goldPerHour = income / effectiveGrowTime * SECONDS_PER_HOUR;
    const profitPerHour = netProfit / effectiveGrowTime * SECONDS_PER_HOUR;
    const fertProfitPerHour = netProfit / fertEffectiveTime * SECONDS_PER_HOUR;

    const level = getSeedLevel(Number(plant.seed_id) || 0);
    const levelOrNull = Number.isFinite(level) && level > 0 ? level : null;

    rankings.push({
      id: plant.id,
      seedId: plant.seed_id,
      name: plant.name,
      seasons,
      level: levelOrNull,
      growTime: effectiveGrowTime,
      growTimeStr: formatTime(effectiveGrowTime),
      reduceSec,
      reduceSecApplied,
      expPerHour: Number.parseFloat(expPerHour.toFixed(2)),
      normalFertilizerExpPerHour: Number.parseFloat(normalFertilizerExpPerHour.toFixed(2)),
      goldPerHour: Number.parseFloat(goldPerHour.toFixed(2)),
      profitPerHour: Number.parseFloat(profitPerHour.toFixed(2)),
      normalFertilizerProfitPerHour: Number.parseFloat(fertProfitPerHour.toFixed(2)),
      income,
      netProfit,
      fruitId,
      fruitCount: fruitCountPerHarvest,
      fruitPrice,
      seedPrice,
      image: getItemImageById(plant.seed_id),
    });
  }

  // 排序
  if (sortBy === 'exp') {
    rankings.sort((a, b) => b.expPerHour - a.expPerHour);
  } else if (sortBy === 'fert') {
    rankings.sort((a, b) => b.normalFertilizerExpPerHour - a.normalFertilizerExpPerHour);
  } else if (sortBy === 'gold') {
    rankings.sort((a, b) => b.goldPerHour - a.goldPerHour);
  } else if (sortBy === 'profit') {
    rankings.sort((a, b) => b.profitPerHour - a.profitPerHour);
  } else if (sortBy === 'fert_profit') {
    rankings.sort((a, b) => b.normalFertilizerProfitPerHour - a.normalFertilizerProfitPerHour);
  } else if (sortBy === 'level') {
    const levelVal = (v) => (v === null || v === undefined ? -Infinity : Number(v));
    rankings.sort((a, b) => levelVal(b.level) - levelVal(a.level));
  }

  return rankings;
}

module.exports = {
  getPlantRankings,
};
