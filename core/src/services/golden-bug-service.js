const {
  getConfigSnapshot,
  getFriendBlacklist,
  isAutomationOn,
} = require('../models/store');
const { getUserState, isConnected, sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { log, logWarn, randomDelay, toLong, toNum } = require('../utils/utils');
const {
  enterFriendFarm,
  extractReplyFriends,
  getAllFriends,
  handleFriendEnterError,
  inFriendQuietHours,
  leaveFriendFarm,
} = require('./friend-api');
const { analyzeFriendLands } = require('./friend-land-analyzer');
const {
  GOLDEN_BUG_OPERATION_ID,
  checkDailyReset,
  getRemainingTimes,
  updateOperationLimits,
} = require('./friend-operation-limits');
const { recordOperation } = require('./stats');
const { getBag, getBagItems } = require('./warehouse');

const GOLDEN_BUG_ITEM_ID = 301101;
const GOLDEN_BUG_SOCIAL_TYPE = 2;
const GOLDEN_BUG_DAILY_LIMIT = 100;
const MIN_RUN_INTERVAL_MS = 10 * 60 * 1000;

let lastRunAt = 0;
let running = false;

function getGoldenBugCount(items) {
  return (Array.isArray(items) ? items : []).reduce((total, item) => (
    toNum(item && item.id) === GOLDEN_BUG_ITEM_ID
      ? total + Math.max(0, toNum(item && item.count))
      : total
  ), 0);
}

async function putGoldenBug(gid, landId) {
  const payload = types.PutSocialItemRequest.encode(
    types.PutSocialItemRequest.create({
      host_gid: toLong(gid),
      land_ids: [toLong(landId)],
      item_id: toLong(GOLDEN_BUG_ITEM_ID),
      social_type: toLong(GOLDEN_BUG_SOCIAL_TYPE),
    })
  ).finish();
  const { body } = await sendMsgAsync(
    'gamepb.plantpb.PlantService',
    'PutSocialItem',
    payload
  );
  const reply = types.PutSocialItemReply.decode(body);
  updateOperationLimits(reply.operation_limits);
  return reply;
}

async function runGoldenBugPlacement(options = {}) {
  if (running || !isConnected() || !isAutomationOn('friend') || !isAutomationOn('friend_golden_bug')) return null;
  if (inFriendQuietHours()) return null;

  const now = Date.now();
  if (!options.force && now - lastRunAt < MIN_RUN_INTERVAL_MS) return null;

  running = true;
  lastRunAt = now;
  try {
    const userState = getUserState();
    if (!toNum(userState && userState.gid)) return null;

    const accountId = process.env.FARM_ACCOUNT_ID || '';
    const config = getConfigSnapshot(accountId);
    const keepCount = Math.max(0, toNum(config.goldenBugKeepCount));
    const roundLimit = Math.max(1, Math.min(100, toNum(config.goldenBugRoundLimit) || 24));
    const bag = await getBag();
    const inventory = getGoldenBugCount(getBagItems(bag));
    const usableInventory = Math.max(0, inventory - keepCount);
    checkDailyReset();
    const dailyRemaining = getRemainingTimes(GOLDEN_BUG_OPERATION_ID, GOLDEN_BUG_DAILY_LIMIT);
    let remaining = Math.min(usableInventory, dailyRemaining, roundLimit);

    if (remaining <= 0) return { placed: 0, inventory, dailyRemaining };

    const allFriendsReply = await getAllFriends();
    const blacklist = new Set(getFriendBlacklist(accountId).map(toNum));
    const friends = extractReplyFriends(allFriendsReply)
      .map(friend => ({
        gid: toNum(friend && friend.gid),
        name: friend && (friend.remark || friend.name) || '',
        level: toNum(friend && friend.level),
      }))
      .filter(friend => friend.gid > 0 && friend.gid !== toNum(userState.gid) && !blacklist.has(friend.gid))
      .sort((a, b) => b.level - a.level);

    let placed = 0;
    let consecutiveFailures = 0;
    for (const friend of friends) {
      if (remaining <= 0) break;

      let entered = false;
      try {
        const enterReply = await enterFriendFarm(friend.gid);
        entered = true;
        const analysis = analyzeFriendLands(
          enterReply.lands || [],
          toNum(userState.gid),
          friend.name
        );
        const targets = analysis.canPutGoldenBug.slice(0, remaining);

        for (const landId of targets) {
          try {
            await putGoldenBug(friend.gid, landId);
            placed++;
            remaining--;
            consecutiveFailures = 0;
            recordOperation('goldenBugPut', 1);
            await randomDelay(500, 1000);
          } catch (err) {
            const message = String(err && err.message || '未知错误');
            logWarn('好友', `给 ${friend.name || `GID:${friend.gid}`} 放置黄金虫失败: ${message}`, {
              module: 'friend',
              event: '放置黄金虫',
              result: 'error',
              friendGid: friend.gid,
              landId,
            });
            consecutiveFailures++;
            if (consecutiveFailures >= 3) remaining = 0;
            break;
          }
        }
      } catch (err) {
        handleFriendEnterError(friend.gid, friend.name || `GID:${friend.gid}`, err);
      } finally {
        if (entered) {
          try { await leaveFriendFarm(friend.gid); } catch { }
        }
      }

      if (remaining > 0) await randomDelay(500, 1500);
    }

    if (placed > 0) {
      log('好友', `黄金虫投放完成 ${placed} 只，获得经验 ${placed * 30}`, {
        module: 'friend',
        event: '放置黄金虫',
        result: 'ok',
        count: placed,
        exp: placed * 30,
        inventoryBefore: inventory,
      });
    }
    return { placed, inventory, dailyRemaining };
  } catch (err) {
    logWarn('好友', `黄金虫投放检查失败: ${err.message}`, {
      module: 'friend',
      event: '放置黄金虫',
      result: 'error',
    });
    return null;
  } finally {
    running = false;
  }
}

module.exports = {
  GOLDEN_BUG_DAILY_LIMIT,
  GOLDEN_BUG_ITEM_ID,
  GOLDEN_BUG_SOCIAL_TYPE,
  getGoldenBugCount,
  putGoldenBug,
  runGoldenBugPlacement,
};
