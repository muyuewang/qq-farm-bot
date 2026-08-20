/**
 * 农场调度辅助模块
 * 负责化肥自动购买检测定时器
 */
const { log, logWarn } = require('../utils/utils');
const {
  isAutomationOn,
  getFertilizerBuyOrganicCount,
  getFertilizerBuyOrganicThresholdHours,
  getFertilizerBuyNormalCount,
  getFertilizerBuyNormalThresholdHours,
  getFertilizerBuyCheckIntervalMinutes
} = require('../models/store');
const { checkAndBuyFertilizerBoth } = require('./mall');

let fertilizerBuyCheckTimer = null;

/** 启动化肥自动购买检测定时器 */
function startFertilizerBuyCheckTimer() {
  if (fertilizerBuyCheckTimer) clearInterval(fertilizerBuyCheckTimer);

  if (!isAutomationOn('fertilizer_buy_organic') && !isAutomationOn('fertilizer_buy_normal')) return;

  const intervalMinutes = getFertilizerBuyCheckIntervalMinutes();
  const intervalMs = intervalMinutes * 60 * 1000;

  fertilizerBuyCheckTimer = setInterval(() => {
    checkFertilizerBuyOnce();
  }, intervalMs);

  log('农场', `化肥自动购买检测定时器已启动，间隔 ${intervalMinutes} 分钟`, {
    module: 'farm',
    event: '购买化肥计时器',
    result: 'start',
    intervalMinutes
  });
}

/** 停止化肥自动购买检测定时器 */
function stopFertilizerBuyCheckTimer() {
  if (fertilizerBuyCheckTimer) {
    clearInterval(fertilizerBuyCheckTimer);
    fertilizerBuyCheckTimer = null;
  }
  log('农场', '化肥自动购买检测定时器已停止', {
    module: 'farm',
    event: '购买化肥计时器',
    result: 'stop'
  });
}

/** 执行一次化肥购买检测 */
async function checkFertilizerBuyOnce() {
  if (!isAutomationOn('fertilizer_buy_organic') && !isAutomationOn('fertilizer_buy_normal')) return;

  try {
    const config = {
      buyOrganic: isAutomationOn('fertilizer_buy_organic'),
      buyNormal: isAutomationOn('fertilizer_buy_normal'),
      organicCount: getFertilizerBuyOrganicCount(),
      organicThresholdHours: getFertilizerBuyOrganicThresholdHours(),
      normalCount: getFertilizerBuyNormalCount(),
      normalThresholdHours: getFertilizerBuyNormalThresholdHours()
    };
    await checkAndBuyFertilizerBoth(config);
  } catch (err) {
    logWarn('农场', `化肥自动购买检测失败: ${err.message}`, {
      module: 'farm',
      event: 'fertilizer_auto_buy',
      result: 'error',
      error: err.message
    });
  }
}

module.exports = {
  startFertilizerBuyCheckTimer,
  stopFertilizerBuyCheckTimer
};
