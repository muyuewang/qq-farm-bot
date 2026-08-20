/**
 * 月卡服务 - 每日自动领取月卡礼包
 *
 * 功能：
 * - 查询月卡状态（是否拥有、是否可领取）
 * - 自动领取月卡每日奖励
 */
const { sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { log, toNum } = require('../utils/utils');
const { getItemById } = require('../config/gameConfig');

const DAILY_KEY = 'month_card_gift';

// 两次检查最小间隔：10分钟
const CHECK_COOLDOWN_MS = 10 * 60 * 1000;

// 每日状态追踪
let doneDateKey = '';
let lastCheckAt = 0;
let lastClaimAt = 0;
let lastResult = '';
let lastHasCard = null;
let lastHasClaimable = null;

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
// 1001→金币, 1002→经验, 200→点券

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
    } else if (id === 200) {
      parts.push(`点券${count}`);
    } else {
      const info = getItemById(id);
      const name = info && info.name ? String(info.name) : `物品#${id}`;
      parts.push(`${name}x${count}`);
    }
  }
  return parts.join('/');
}

// ---- RPC 调用 ----

async function getMonthCardInfos() {
  const request = types.GetMonthCardInfosRequest.encode(
    types.GetMonthCardInfosRequest.create({})
  ).finish();
  const { body } = await sendMsgAsync('gamepb.mallpb.MallService', 'GetMonthCardInfos', request);
  return types.GetMonthCardInfosReply.decode(body);
}

async function claimMonthCardReward(goodsId) {
  const request = types.ClaimMonthCardRewardRequest.encode(
    types.ClaimMonthCardRewardRequest.create({ goods_id: Number(goodsId) || 0 })
  ).finish();
  const { body } = await sendMsgAsync('gamepb.mallpb.MallService', 'ClaimMonthCardReward', request);
  return types.ClaimMonthCardRewardReply.decode(body);
}

// ---- 主逻辑 ----

/**
 * 执行每日月卡礼包领取
 * @param {boolean} force - 强制检查
 */
async function performDailyMonthCardGift(force = false) {
  const now = Date.now();

  if (!force && isDoneToday()) return false;
  if (!force && now - lastCheckAt < CHECK_COOLDOWN_MS) return false;

  lastCheckAt = now;

  try {
    const reply = await getMonthCardInfos();
    const infos = Array.isArray(reply && reply.infos) ? reply.infos : [];

    lastHasCard = infos.length > 0;

    // 筛选可领取的月卡
    const claimable = infos.filter(
      (info) => info && info.can_claim && Number(info.goods_id || 0) > 0
    );

    lastHasClaimable = claimable.length > 0;

    if (!infos.length) {
      markDoneToday();
      lastResult = 'none';
      log('月卡', '当前没有月卡或已过期', { module: 'task', event: DAILY_KEY, result: 'none' });
      return false;
    }

    if (!claimable.length) {
      markDoneToday();
      lastResult = 'none';
      log('月卡', '今日暂无可领取月卡礼包', { module: 'task', event: DAILY_KEY, result: 'none' });
      return false;
    }

    let claimed = 0;
    for (const card of claimable) {
      try {
        const result = await claimMonthCardReward(Number(card.goods_id || 0));
        const items = Array.isArray(result && result.items) ? result.items : [];
        const summary = getRewardSummary(items);
        log('月卡',
          summary ? `领取成功 → ${summary}` : '领取成功',
          { module: 'task', event: DAILY_KEY, result: 'ok', goodsId: Number(card.goods_id || 0) }
        );
        claimed += 1;
      } catch (err) {
        log('月卡',
          `领取失败(gid=${Number(card.goods_id || 0)}): ${err.message}`,
          { module: 'task', event: DAILY_KEY, result: 'error', goodsId: Number(card.goods_id || 0) }
        );
      }
    }

    if (claimed > 0) {
      lastClaimAt = Date.now();
      markDoneToday();
      lastResult = 'ok';
      return true;
    }

    log('月卡', '本次未成功领取月卡礼包', { module: 'task', event: DAILY_KEY, result: 'none' });
    lastResult = 'none';
    return false;
  } catch (err) {
    lastResult = 'error';
    log('月卡', `查询月卡礼包失败: ${err.message}`, {
      module: 'task', event: DAILY_KEY, result: 'error',
    });
    return false;
  }
}

module.exports = {
  performDailyMonthCardGift,
  getMonthCardDailyState: () => ({
    key: DAILY_KEY,
    doneToday: isDoneToday(),
    lastCheckAt,
    lastClaimAt,
    result: lastResult,
    hasCard: lastHasCard,
    hasClaimable: lastHasClaimable,
  }),
};
