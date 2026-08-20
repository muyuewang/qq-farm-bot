/**
 * QQ会员服务 - 每日自动领取VIP礼包
 *
 * 功能：
 * - 查询每日VIP礼包状态
 * - 自动领取每日VIP礼包
 */
const { sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { log, toNum } = require('../utils/utils');
const { getItemById } = require('../config/gameConfig');

const DAILY_KEY = 'vip_daily_gift';

// 两次检查最小间隔：10分钟
const CHECK_COOLDOWN_MS = 10 * 60 * 1000;

// 每日状态追踪
let doneDateKey = '';
let lastCheckAt = 0;
let lastClaimAt = 0;
let lastResult = '';
let lastHasGift = null;
let lastCanClaim = null;

// ---- 日期工具 ----

function getDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function markDoneToday() {
  doneDateKey = getDateKey();
}

function isDoneToday() {
  return doneDateKey === getDateKey();
}

// ---- 奖励摘要 ----
// 1001→金币, 1002→经验, 500→点券

function getRewardSummary(items) {
  const list = Array.isArray(items) ? items : [];
  const parts = [];
  for (const item of list) {
    const id = toNum(item.id);
    const count = toNum(item.count);
    if (count <= 0) continue;
    if (id === 1001 || id === 500001) {
      parts.push(`金币${count}`);
    } else if (id === 1002 || id === 500002) {
      parts.push(`经验${count}`);
    } else if (id === 500) {
      parts.push(`点券${count}`);
    } else {
      const info = getItemById(id);
      const name = info && info.name ? String(info.name) : `物品#${id}`;
      parts.push(`${name}x${count}`);
    }
  }
  return parts.join('/');
}

/**
 * 判断是否"已领取"错误
 */
function isAlreadyClaimedError(err) {
  const msg = String(err && err.message || '');
  return msg.includes('code=1021002') || msg.includes('今日已领取') || msg.includes('已领取');
}

// ---- RPC 调用 ----

async function refreshVipInfo() {
  const request = types.RefreshVipInfoRequest.encode(
    types.RefreshVipInfoRequest.create({})
  ).finish();
  const { body } = await sendMsgAsync('gamepb.qqvippb.QQVipService', 'RefreshVipInfo', request);
  return types.RefreshVipInfoReply.decode(body);
}

async function getDailyGiftStatus() {
  const request = types.GetQQVipRewardsStatusRequest.encode(
    types.GetQQVipRewardsStatusRequest.create({})
  ).finish();
  const { body } = await sendMsgAsync('gamepb.qqvippb.QQVipService', 'GetQQVipRewardsStatus', request);
  return types.GetQQVipRewardsStatusReply.decode(body);
}

function getAvailableVipTypes(status) {
  const configs = Array.isArray(status && status.reward_configs)
    ? status.reward_configs
    : [];
  return configs
    .map(config => toNum(config && config.vip_type))
    .filter((vipType, index, list) => (
      (vipType === 1 || vipType === 2) && list.indexOf(vipType) === index
    ));
}

function getVipRewardLabels(vipTypes) {
  const labels = {
    1: 'VIP奖励',
    2: 'SVIP奖励',
  };
  return (Array.isArray(vipTypes) ? vipTypes : [])
    .map(vipType => labels[toNum(vipType)])
    .filter(Boolean);
}

async function claimDailyGift(vipTypes) {
  const request = types.ClaimQQVipRewardsRequest.encode(
    types.ClaimQQVipRewardsRequest.create({ vip_types: vipTypes })
  ).finish();
  const { body } = await sendMsgAsync(
    'gamepb.qqvippb.QQVipService',
    'ClaimQQVipRewards',
    request
  );
  return types.ClaimQQVipRewardsReply.decode(body);
}

// ---- 主逻辑 ----

/**
 * 执行每日VIP礼包领取
 * @param {boolean} force - 强制检查
 */
async function performDailyVipGift(force = false) {
  const now = Date.now();

  if (!force && isDoneToday()) return false;
  if (!force && now - lastCheckAt < CHECK_COOLDOWN_MS) return false;

  lastCheckAt = now;

  try {
    await refreshVipInfo();
    const status = await getDailyGiftStatus();
    const availableVipTypes = getAvailableVipTypes(status);

    lastHasGift = availableVipTypes.length > 0;
    lastCanClaim = availableVipTypes.length > 0;

    if (!availableVipTypes.length) {
      markDoneToday();
      lastResult = 'none';
      log('会员', '今日暂无可领取会员礼包', { module: 'task', event: DAILY_KEY, result: 'none' });
      return false;
    }

    const reply = await claimDailyGift(availableVipTypes);
    const items = Array.isArray(reply && reply.items) ? reply.items : [];
    const summary = getRewardSummary(items);
    const vipRewards = getVipRewardLabels(availableVipTypes);
    const rewardLabel = vipRewards.join('、') || '会员礼包';

    log('会员',
      summary ? `${rewardLabel}领取成功 → ${summary}` : `${rewardLabel}领取成功`,
      {
        module: 'task',
        event: DAILY_KEY,
        result: 'ok',
        count: items.length,
        vipTypes: availableVipTypes,
        vipRewards,
      }
    );

    lastClaimAt = Date.now();
    markDoneToday();
    lastResult = 'ok';
    return true;
  } catch (err) {
    // 如果已经领取过，也标记完成
    if (isAlreadyClaimedError(err)) {
      markDoneToday();
      lastClaimAt = Date.now();
      lastResult = 'ok';
      log('会员', '今日会员礼包已领取', { module: 'task', event: DAILY_KEY, result: 'ok' });
      return false;
    }

    lastResult = 'error';
    log('会员', `领取会员礼包失败: ${err.message}`, {
      module: 'task', event: DAILY_KEY, result: 'error',
    });
    return false;
  }
}

module.exports = {
  performDailyVipGift,
  getAvailableVipTypes,
  getVipRewardLabels,
  getVipDailyState: () => ({
    key: DAILY_KEY,
    doneToday: isDoneToday(),
    lastCheckAt,
    lastClaimAt,
    result: lastResult,
    hasGift: lastHasGift,
    canClaim: lastCanClaim,
  }),
};
