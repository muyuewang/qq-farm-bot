const process = require('node:process');
const { parentPort, workerData } = require('node:worker_threads');

const { CONFIG } = require('../config/config');
const { getLevelExpProgress } = require('../config/gameConfig');
const {
    getAutomation,
    getPreferredSeed,
    getConfigSnapshot,
    applyConfigSnapshot
} = require('../models/store');
const {
    checkAndClaimEmails,
    getEmailDailyState
} = require('../services/email');
const {
    checkFarm,
    startFarmCheckLoop,
    stopFarmCheckLoop,
    refreshFarmCheckLoop,
    getLandsDetail,
    getAvailableSeeds,
    runFarmOperation,
    runFertilizerByConfig,
    ORGANIC_FERTILIZER_ID,
    fertilize,
    removePlant
} = require('../services/farm');
const {
    checkFriends,
    startFriendCheckLoop,
    stopFriendCheckLoop,
    refreshFriendCheckLoop,
    runBadOnceOnStartup,
    runGoldenBugPlacement,
    getFriendsList,
    getFriendLandsDetail,
    doFriendOperation,
    getFriendDogInfo,
    batchGetFriendDogInfo,
    syncFriendsFromGids,
    fetchFriendsDogInfo,
    delFriend
} = require('../services/friend');
const { getInteractRecords } = require('../services/interact');
const { processInviteCodes } = require('../services/invite');
const {
    autoBuyFertilizer,
    checkAndBuyFertilizerBoth,
    buyFreeGifts,
    getFreeGiftDailyState
} = require('../services/mall');
const {
    performDailyMonthCardGift,
    getMonthCardDailyState
} = require('../services/monthcard');
const {
    performDailyVipGift,
    getVipDailyState
} = require('../services/qqvip');
const {
    createScheduler,
    getSchedulerRegistrySnapshot
} = require('../services/scheduler');
const {
    performDailyShare,
    getShareDailyState
} = require('../services/share');
const {
    resetSessionGains,
    recordOperation,
    initStatsWithPersistence,
    saveStats
} = require('../services/stats');
const {
    initStatusBar,
    setStatusPlatform,
    setRecordGoldExpHook,
    statusData
} = require('../services/status');
const {
    cleanupTaskSystem,
    checkAndClaimTasks,
    getTaskClaimDailyState,
    getTaskDailyStateLikeApp,
    getGrowthTaskStateLikeApp
} = require('../services/task');
const {
    sellAllFruits,
    getBag,
    getBagItems,
    openFertilizerGiftPacksSilently
} = require('../services/warehouse');
const {
    connect,
    stopNetwork,
    getWs,
    getUserState,
    networkEvents
} = require('../utils/network');
const { loadProto } = require('../utils/proto');
const { setLogHook, log, toNum } = require('../utils/utils');

// 设置环境变量中的账号ID
if (parentPort && workerData && workerData.accountId && !process.env.FARM_ACCOUNT_ID) {
    process.env.FARM_ACCOUNT_ID = String(workerData.accountId);
}

// ==================== IPC 通信 ====================

/** 发送消息给主进程 */
function sendToMaster(message) {
    if (process.send) {
        process.send(message);
        return;
    }
    if (parentPort) {
        parentPort.postMessage(message);
    }
}

/** 监听主进程消息 */
function onMasterMessage(handler) {
    if (process.send) process.on('message', handler);
    if (parentPort) parentPort.on('message', handler);
}

/** 退出 Worker 进程 */
function exitWorker(code = 0) {
    if (parentPort) {
        try { parentPort.close(); } catch { }
    }
    setImmediate(() => process.exit(code));
}

// ==================== 格式化工具 ====================

function pad2(num) {
    return String(num).padStart(2, '0');
}

function formatLocalDateTime24(date = new Date()) {
    const d = date instanceof Date ? date : new Date();
    const yyyy = d.getFullYear();
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    const hh = pad2(d.getHours());
    const min = pad2(d.getMinutes());
    const ss = pad2(d.getSeconds());
    return `${yyyy  }-${  mm  }-${  dd  } ${  hh  }:${  min  }:${  ss}`;
}

// ==================== 日志/统计钩子 ====================

setLogHook((tag, msg, isWarn, meta) => {
    sendToMaster({
        type: 'log',
        data: {
            time: formatLocalDateTime24(new Date()),
            tag,
            msg,
            isWarn,
            meta: meta || {}
        }
    });
});

setRecordGoldExpHook((gold, exp) => {
    const { recordGoldExp } = require('../services/stats');
    recordGoldExp(gold, exp);
    sendToMaster({
        type: 'stat_update',
        data: { gold, exp }
    });
});

// ==================== 全局状态 ====================

let isRunning = false;
let loginReady = false;
let appliedConfigRevision = 0;
let unifiedSchedulerRunning = false;

// ==================== 工具函数 ====================

/** 判断是否是瞬时网络错误（可忽略） */
function isTransientNetworkError(err) {
    const msg = String(err && err.message || '');
    if (!msg) return false;
    return ['连接未打开', '请求超时', '请求已中断', '连接关闭', '发送失败', '请求队列已满']
        .some(text => msg.includes(text));
}

// ==================== 农场/好友/偷菜 Tick 任务 ====================

let farmTaskRunning = false;
let nextFarmRunAt = 0;
let lastStatusHash = '';
let lastStatusSentAt = 0;
let onSellGain = null;
let onFarmHarvested = null;
let onDogSkillGiftPending = null;
let harvestSellRunning = false;
let onWsError = null;
let onDisconnectHandler = null;
let onClientVersionUpdate = null;
let wsErrorHandledAt = 0;
let lastDailyRunDate = '';
let friendSyncPaused = false;
let starActivityClaimRunning = false;

const workerScheduler = createScheduler('worker');

/** 每日任务是否启用 */
function isDailyRoutineEnabled() { return true; }

/** 获取当天日期键 */
function getLocalDateKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y  }-${  m  }-${  day}`;
}

// ==================== 每日任务 ====================

async function runDailyRoutines(force = false) {
    if (!loginReady || friendSyncPaused) return;
    try {
        await checkAndClaimEmails(force);
        await performDailyShare(force);
        await performDailyMonthCardGift(force);
        await buyFreeGifts(force);
        await performDailyVipGift(force);
    } catch (err) {
        log('系统', `每日任务调度失败: ${  err.message}`, {
            module: 'system',
            event: '每日任务',
            result: 'error'
        });
    }
}

function stopDailyRoutineTimer() {
    workerScheduler.clear('daily_routine_interval');
}

function startDailyRoutineTimer() {
    stopDailyRoutineTimer();
    lastDailyRunDate = getLocalDateKey();
    runDailyRoutines(true).catch(() => null);

    // 每 60 秒检查一次日期是否变化
    workerScheduler.setIntervalTask('daily_routine_interval', 60000, () => {
        if (!loginReady) return;
        const today = getLocalDateKey();
        if (today === lastDailyRunDate) return;
        lastDailyRunDate = today;
        runDailyRoutines(true)
            .then(() => runBadOnceOnStartup(true))
            .catch(() => null);
    });
}

// ==================== 活动自动控制 ====================

async function runStarActivityAutoClaims() {
    if (!loginReady || friendSyncPaused || starActivityClaimRunning) return;

    const automation = getAutomation() || {};
    const claimPassport = automation.star_passport_claim === true;
    const claimSolarTerms = automation.star_solar_claim === true;
    const claimRecords = automation.star_record_claim === true;
    const claimQingmeiSeedsEnabled = automation.qingmei_seed_claim === true;
    const brewQingmeiWineEnabled = automation.qingmei_wine_brew === true;
    const useQixiDewEnabled = automation.qixi_dew_use === true;
    const buildQixiBridgeEnabled = automation.qixi_bridge_build === true;
    const giftQixiSachetEnabled = automation.qixi_sachet_gift === true;
    const qixiFriendPriority = Array.isArray(automation.qixi_friend_priority)
        ? automation.qixi_friend_priority.map(Number).filter(gid => gid > 0) : [];
    if (!claimPassport && !claimSolarTerms && !claimRecords && !claimQingmeiSeedsEnabled && !brewQingmeiWineEnabled
        && !useQixiDewEnabled && !buildQixiBridgeEnabled && !giftQixiSachetEnabled) return;

    starActivityClaimRunning = true;
    try {
        const {
            getStarActivity,
            claimSeasonPassportRewards,
            claimSolarTermsReward,
            claimStarRecordRewards,
            claimQingmeiSeeds,
            brewAndSellQingmeiWine
        } = require('../services/activity');
        const needsStarActivity = claimPassport || claimSolarTerms || claimRecords || claimQingmeiSeedsEnabled || brewQingmeiWineEnabled;
        const activity = needsStarActivity ? await getStarActivity() : {};
        if (claimPassport && Number(activity?.passport?.claimableLevels || 0) > 0) {
            try {
                const result = await claimSeasonPassportRewards();
                log('活动', `自动领取千星游记完成：${  Number(result?.claimedLevels || 0)  } 级奖励`, {
                    module: 'activity',
                    event: '千星游记自动领取',
                    result: 'success',
                    claimedLevels: Number(result?.claimedLevels || 0)
                });
            } catch (err) {
                log('活动', `自动领取千星游记失败: ${  err.message}`, {
                    module: 'activity',
                    event: '千星游记自动领取',
                    result: 'error'
                });
            }
        }

        if (claimSolarTerms && Number(activity?.solarTerms?.claimableCount || 0) > 0) {
            const terms = Array.isArray(activity?.solarTerms?.terms)
                ? activity.solarTerms.terms.filter(term => term && term.claimable)
                : [];
            for (const term of terms) {
                try {
                    const result = await claimSolarTermsReward(Number(term.id) || 0);
                    log('活动', `自动领取节令小札完成：${  term.title || result?.term?.title || term.id  }`, {
                        module: 'activity',
                        event: '节令小札自动领取',
                        result: 'success',
                        termId: Number(term.id) || 0,
                        termTitle: term.title || result?.term?.title || ''
                    });
                } catch (err) {
                    log('活动', `自动领取节令小札失败: ${  err.message}`, {
                        module: 'activity',
                        event: '节令小札自动领取',
                        result: 'error',
                        termId: Number(term.id) || 0
                    });
                }
            }
        }

        if (claimRecords && Number(activity?.starRecord?.claimableCount || 0) > 0) {
            try {
                const result = await claimStarRecordRewards();
                log('活动', `自动领取观星礼录完成：${  result?.recordIds?.length || 0  } 个星宿`, {
                    module: 'activity',
                    event: '观星礼录自动领取',
                    result: 'success',
                    recordCount: result?.recordIds?.length || 0
                });
            } catch (err) {
                log('活动', `自动领取观星礼录失败: ${  err.message}`, {
                    module: 'activity',
                    event: '观星礼录自动领取',
                    result: 'error'
                });
            }
        }

        // 青梅领取节点不稳定地下发每日 status，不能依赖页面用的 claimable
        // 字段决定是否调用；服务端“已领取”响应会在 service 内标记当天状态。
        if (claimQingmeiSeedsEnabled && activity?.qingmei?.claimActive !== false && activity?.qingmei?.claimed !== true) {
            try {
                const result = await claimQingmeiSeeds();
                const alreadyClaimed = result?.alreadyClaimed === true;
                log('活动', alreadyClaimed
                    ? '自动校验青梅种子：今日已领取'
                    : `自动领取青梅种子完成：${  Number(result?.claimedCount || 0)  } 个`, {
                    module: 'activity',
                    event: '青梅种子自动领取',
                    result: alreadyClaimed ? 'none' : 'success',
                    alreadyClaimed,
                    claimedCount: Number(result?.claimedCount || 0)
                });
            } catch (err) {
                log('活动', `自动领取青梅种子失败: ${  err.message}`, {
                    module: 'activity',
                    event: '青梅种子自动领取',
                    result: 'error'
                });
            }
        }
        if (brewQingmeiWineEnabled && activity?.qingmei?.wineActive !== false && Number(activity?.qingmei?.material?.itemCount || 0) > 0) {
            try {
                const result = await brewAndSellQingmeiWine({ share: true });
                const sellOption = Math.max(1, Number(result?.sell?.multiple || (result?.share?.shared ? 2 : 1)) || 1);
                const incomeMultiple = sellOption === 2 ? 1.5 : 1;
                const previewPrice = Number(result?.preview?.price || 0);
                const finalPrice = Number(result?.brew?.price || 0);
                const brewMultiple = previewPrice > 0 && finalPrice > 0
                    ? Number((finalPrice / previewPrice).toFixed(2))
                    : 1;
                log('活动', `自动酿造并售卖青梅酿完成：酿造 ${  brewMultiple  } 倍，分享收入 ${  incomeMultiple  } 倍，金币 ${  Number(result?.sell?.gold || 0)  }`, {
                    module: 'activity',
                    event: '青梅酿自动酿造',
                    result: 'success',
                    consumedCount: Number(result?.consumedCount || 0),
                    gold: Number(result?.sell?.gold || 0),
                    brewMultiple,
                    previewPrice,
                    finalPrice,
                    incomeMultiple,
                    protocolMultiple: sellOption,
                    shared: result?.share?.shared === true
                });
            } catch (err) {
                log('活动', `自动酿造青梅酿失败: ${  err.message}`, {
                    module: 'activity',
                    event: '青梅酿自动酿造',
                    result: 'error',
                    stage: err?.stage || ''
                });
            }
        }

        if (useQixiDewEnabled || buildQixiBridgeEnabled || giftQixiSachetEnabled) {
            const { getQixiActivity, useQixiDew, buildQixiBridge, sendQixiSachet } = require('../services/activity');
            let qixi = await getQixiActivity();
            if (useQixiDewEnabled && !qixi?.dewUsage?.limitReached && Number(qixi?.items?.dew?.itemCount || 0) > 0) {
                const result = await useQixiDew();
                qixi = result.activity || qixi;
                log('活动', `自动使用鹊羽灵露完成：${Number(result.usedCount || 0)} 个`, { module: 'activity', event: '鹊羽灵露自动使用', result: result.usedCount ? 'success' : 'none' });
            }
            if (buildQixiBridgeEnabled) {
                let built = 0;
                try {
                    while (qixi?.bridge?.canBuild && built < 20) {
                        const result = await buildQixiBridge();
                        if (!result.built) break;
                        built++;
                        qixi = result.activity || qixi;
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    log('活动', `自动驻建鹊桥完成：${built} 阶段`, { module: 'activity', event: '鹊桥自动驻建', result: built ? 'success' : 'none', count: built });
                } catch (err) {
                    log('活动', `自动驻建鹊桥失败: ${err.message}`, { module: 'activity', event: '鹊桥自动驻建', result: 'error', count: built });
                }
            }
            if (giftQixiSachetEnabled && qixiFriendPriority.length > 0 && Number(qixi?.gift?.remainingCount || 0) > 0) {
                let sent = 0;
                for (const gid of qixiFriendPriority) {
                    if (Number(qixi?.gift?.remainingCount || 0) <= 0 || Number(qixi?.items?.sachet?.itemCount || 0) <= 0) break;
                    try {
                        const sendCount = Math.min(
                            Number(qixi.gift.remainingCount || 0),
                            Number(qixi.items.sachet.itemCount || 0)
                        );
                        const result = await sendQixiSachet(gid, sendCount);
                        sent += Number(result.sentCount || 0);
                        qixi = result.activity || qixi;
                    } catch (err) {
                        log('活动', `向好友 ${gid} 赠送香囊失败: ${err.message}`, { module: 'activity', event: '香囊自动赠送', result: 'error', friendGid: gid });
                    }
                }
                log('活动', `自动赠送鹊羽香囊完成：${sent} 个`, { module: 'activity', event: '香囊自动赠送', result: sent ? 'success' : 'none', count: sent });
            }
        }
    } catch (err) {
        if (!isTransientNetworkError(err)) {
            log('活动', `活动自动领取检查失败: ${  err.message}`, {
                module: 'activity',
                event: '活动自动领取检查',
                result: 'error'
            });
        }
    } finally {
        starActivityClaimRunning = false;
    }
}

function stopStarActivityClaimTimer() {
    workerScheduler.clear('star_activity_claim_initial');
    workerScheduler.clear('star_activity_claim_interval');
    starActivityClaimRunning = false;
}

function startStarActivityClaimTimer() {
    stopStarActivityClaimTimer();
    workerScheduler.setTimeoutTask('star_activity_claim_initial', 10000, () => {
        runStarActivityAutoClaims().catch(() => null);
    });
    workerScheduler.setIntervalTask('star_activity_claim_interval', 5 * 60 * 1000, () => {
        runStarActivityAutoClaims().catch(() => null);
    }, { preventOverlap: true });
}

// 神秘商人可能在登录后的任意时间出现；登录后先检查，并持续短周期探测。
function stopMysteryShopAutoBuyTimer() {
    workerScheduler.clear('mystery_shop_auto_buy_initial');
    workerScheduler.clear('mystery_shop_auto_buy_interval');
    workerScheduler.clear('mystery_shop_auto_buy_after_save');
}

function runMysteryShopAutoBuy() {
    if (!loginReady || getAutomation().mystery_shop_auto_buy !== true) return Promise.resolve();
    const { checkAndAutoBuyMysteryShop } = require('../services/mystery-shop');
    return checkAndAutoBuyMysteryShop();
}

function startMysteryShopAutoBuyTimer() {
    const { AUTO_BUY_CHECK_INTERVAL_MS } = require('../services/mystery-shop');
    stopMysteryShopAutoBuyTimer();
    workerScheduler.setTimeoutTask('mystery_shop_auto_buy_initial', 10000, () => {
        runMysteryShopAutoBuy().catch(() => null);
    });
    workerScheduler.setIntervalTask('mystery_shop_auto_buy_interval', AUTO_BUY_CHECK_INTERVAL_MS, () => {
        runMysteryShopAutoBuy().catch(() => null);
    }, { preventOverlap: true });
}

// ==================== 间隔计算 ====================

function normalizeIntervalRangeSec(minVal, maxVal, defaultVal) {
    const def = Math.max(1, Number.parseInt(defaultVal, 10) || 3);
    let min = Math.max(1, Number.parseInt(minVal, 10) || def);
    let max = Math.max(1, Number.parseInt(maxVal, 10) || def);
    if (min > max) [min, max] = [max, min];
    return { min, max };
}

function applyIntervalsToRuntime(intervals) {
    const iv = intervals && typeof intervals === 'object' ? intervals : {};
    const farmDefault = Math.max(2, Number.parseInt(iv.farm, 10) || 2);
    const farmRange = normalizeIntervalRangeSec(iv.farmMin, iv.farmMax, farmDefault);
    CONFIG.farmCheckIntervalMin = farmRange.min * 1000;
    CONFIG.farmCheckIntervalMax = farmRange.max * 1000;
    CONFIG.farmCheckInterval = CONFIG.farmCheckIntervalMin;

    const helpRange = normalizeIntervalRangeSec(iv.helpMin, iv.helpMax, 30);
    CONFIG.helpCheckIntervalMin = helpRange.min * 1000;
    CONFIG.helpCheckIntervalMax = helpRange.max * 1000;

    const stealRange = normalizeIntervalRangeSec(iv.stealMin, iv.stealMax, 25);
    CONFIG.stealCheckIntervalMin = stealRange.min * 1000;
    CONFIG.stealCheckIntervalMax = stealRange.max * 1000;
}

/** 在 [minMs, maxMs] 范围内随机取一个毫秒数 */
function randomIntervalMs(minMs, maxMs) {
    const min = Math.max(1, Math.floor(Number(minMs) || 3));
    const max = Math.max(min, Math.floor(Number(maxMs) || min * 2));
    if (max === min) return min;
    return min + Math.floor(Math.random() * (max - min + 1));
}

// ==================== 统一调度时间重置 ====================

function resetUnifiedSchedule() {
    const farmDelay = randomIntervalMs(
        CONFIG.farmCheckIntervalMin || CONFIG.farmCheckInterval || 3000,
        CONFIG.farmCheckIntervalMax || CONFIG.farmCheckInterval || 5000
    );
    const helpDelay = randomIntervalMs(
        CONFIG.helpCheckIntervalMin || 30000,
        CONFIG.helpCheckIntervalMax || 35000
    );
    const stealDelay = randomIntervalMs(
        CONFIG.stealCheckIntervalMin || 25000,
        CONFIG.stealCheckIntervalMax || 30000
    );
    const now = Date.now();
    nextFarmRunAt = now + farmDelay;
    nextHelpRunAt = now + helpDelay;
    nextStealRunAt = now + stealDelay;
}

// ==================== 农场 Tick ====================

async function runFarmTick(autoConfig) {
    if (farmTaskRunning || friendSyncPaused) return;
    farmTaskRunning = true;

    const nextDelay = randomIntervalMs(
        CONFIG.farmCheckIntervalMin || CONFIG.farmCheckInterval || 3000,
        CONFIG.farmCheckIntervalMax || CONFIG.farmCheckInterval || 5000
    );

    try {
        if (autoConfig.farm) await checkFarm();
        if (autoConfig.task) await checkAndClaimTasks();
        if (autoConfig.email) await checkAndClaimEmails();
        if (autoConfig.fertilizer_gift) await openFertilizerGiftPacksSilently();
    } catch { } finally {
        nextFarmRunAt = Date.now() + nextDelay;
        farmTaskRunning = false;
    }
}

// ==================== 帮助 Tick ====================

let helpTaskRunning = false;
let nextHelpRunAt = 0;

async function runHelpTick(autoConfig) {
    if (helpTaskRunning || friendSyncPaused) return;
    if (!autoConfig.friend_help && !autoConfig.friend_golden_bug) return;
    helpTaskRunning = true;

    const nextDelay = randomIntervalMs(
        CONFIG.helpCheckIntervalMin || 30000,
        CONFIG.helpCheckIntervalMax || 35000
    );

    try {
        if (autoConfig.friend_help) await checkFriends({ onlyHelp: true });
        if (autoConfig.friend_golden_bug) await runGoldenBugPlacement();
    } catch (err) {
        if (!isTransientNetworkError(err)) {
            log('系统', `帮助巡查执行失败: ${  err.message}`, {
                module: 'system',
                event: '帮助巡查',
                result: 'error'
            });
        }
    } finally {
        nextHelpRunAt = Date.now() + nextDelay;
        helpTaskRunning = false;
    }
}

// ==================== 偷菜 Tick ====================

let stealTaskRunning = false;
let nextStealRunAt = 0;

async function runStealTick(autoConfig) {
    if (stealTaskRunning || friendSyncPaused) return;
    if (!autoConfig.friend_steal) return;
    stealTaskRunning = true;

    const nextDelay = randomIntervalMs(
        CONFIG.stealCheckIntervalMin || 25000,
        CONFIG.stealCheckIntervalMax || 30000
    );

    try {
        await checkFriends({ onlySteal: true });
    } catch (err) {
        if (!isTransientNetworkError(err)) {
            log('系统', `偷菜巡查执行失败: ${  err.message}`, {
                module: 'system',
                event: '偷菜巡查',
                result: 'error'
            });
        }
    } finally {
        nextStealRunAt = Date.now() + nextDelay;
        stealTaskRunning = false;
    }
}

// ==================== 统一调度器 ====================

async function runUnifiedTick() {
    if (!unifiedSchedulerRunning || !loginReady || friendSyncPaused) return;

    const now = Date.now();
    const shouldFarm = now >= nextFarmRunAt;
    const shouldHelp = now >= nextHelpRunAt;
    const shouldSteal = now >= nextStealRunAt;

    if (!shouldFarm && !shouldHelp && !shouldSteal) return;

    const autoConfig = getAutomation();
    if (shouldFarm) await runFarmTick(autoConfig);
    if (shouldHelp) await runHelpTick(autoConfig);
    if (shouldSteal) await runStealTick(autoConfig);
}

function scheduleUnifiedNextTick() {
    if (!unifiedSchedulerRunning) return;
    workerScheduler.clear('unified_next_tick');

    if (!loginReady) {
        workerScheduler.setTimeoutTask('unified_next_tick', 500, async () => {
            try { await runUnifiedTick(); } finally { scheduleUnifiedNextTick(); }
        });
        return;
    }

    const now = Date.now();
    const nearest = Math.min(
        Number(nextFarmRunAt) || now + 3000,
        Number(nextHelpRunAt) || now + 30000,
        Number(nextStealRunAt) || now + 25000
    );
    const waitMs = Math.max(100, nearest - now);

    workerScheduler.setTimeoutTask('unified_next_tick', waitMs, async () => {
        try { await runUnifiedTick(); } finally { scheduleUnifiedNextTick(); }
    });
}

function startUnifiedScheduler() {
    if (unifiedSchedulerRunning) return;
    unifiedSchedulerRunning = true;
    resetUnifiedSchedule();
    scheduleUnifiedNextTick();
}

function stopUnifiedScheduler() {
    unifiedSchedulerRunning = false;
    farmTaskRunning = false;
    helpTaskRunning = false;
    stealTaskRunning = false;
    workerScheduler.clear('unified_next_tick');
}

// ==================== 配置同步 ====================

function applyRuntimeConfig(config, syncStatusAfter = false) {
    const prevAuto = getAutomation();
    const accountId = process.env.FARM_ACCOUNT_ID || '';

    applyConfigSnapshot(config || {}, {
        persist: false,
        accountId
    });

    const revision = Number((config || {}).__revision || 0);
    if (revision > 0) appliedConfigRevision = revision;

    const intervals = config && config.intervals && typeof config.intervals === 'object'
        ? config.intervals : null;
    if (intervals) applyIntervalsToRuntime(intervals);

    if (loginReady) {
        refreshFarmCheckLoop(3000);
        refreshFriendCheckLoop(12000);
        resetUnifiedSchedule();
        scheduleUnifiedNextTick();

        const hasAutomation = !!(config && config.automation && typeof config.automation === 'object');
        if (hasAutomation) {
            const newAuto = getAutomation();

            const starClaimBecameEnabled = (
                !prevAuto?.star_passport_claim && newAuto?.star_passport_claim
            ) || (
                !prevAuto?.star_record_claim && newAuto?.star_record_claim
            ) || (
                !prevAuto?.qingmei_seed_claim && newAuto?.qingmei_seed_claim
            ) || (
                !prevAuto?.qingmei_wine_brew && newAuto?.qingmei_wine_brew
            ) || (
                !prevAuto?.qixi_dew_use && newAuto?.qixi_dew_use
            ) || (
                !prevAuto?.qixi_bridge_build && newAuto?.qixi_bridge_build
            ) || (
                !prevAuto?.qixi_sachet_gift && newAuto?.qixi_sachet_gift
            );
            if (starClaimBecameEnabled) {
                workerScheduler.setTimeoutTask('star_activity_claim_after_save', 2000, () => {
                    runStarActivityAutoClaims().catch(() => null);
                });
            }

            const mysteryShopConfigChanged = [
                'mystery_shop_auto_buy',
                'mystery_shop_allow_gold',
                'mystery_shop_allow_coupon',
                'mystery_shop_allow_gold_bean'
            ].some(key => prevAuto?.[key] !== newAuto?.[key]);
            if (newAuto?.mystery_shop_auto_buy && mysteryShopConfigChanged) {
                workerScheduler.setTimeoutTask('mystery_shop_auto_buy_after_save', 2000, () => {
                    runMysteryShopAutoBuy().catch(() => null);
                });
            }

            // 每日任务从关变开 → 立即执行一次
            const prevDailyEnabled = isDailyRoutineEnabled(prevAuto);
            const newDailyEnabled = isDailyRoutineEnabled(newAuto);
            if (!prevDailyEnabled && newDailyEnabled) {
                workerScheduler.setTimeoutTask('daily_routine_immediate', 2000, () => {
                    runDailyRoutines(true).catch(() => null);
                });
            }

            // 施肥策略变化 → 立即施肥
            const prevFert = String(prevAuto && prevAuto.fertilizer ? prevAuto.fertilizer : '').toLowerCase();
            const newFert = String(newAuto && newAuto.fertilizer ? newAuto.fertilizer : '').toLowerCase();
            const fertChanged = prevFert !== newFert;
            if (fertChanged && (newFert === 'both' || newFert === 'organic' || newFert === 'smart' || newFert === 'smart_only' || newFert === 'smart_normal' || newFert === 'final_normal' || newFert === 'final_organic')) {
                workerScheduler.setTimeoutTask('fertilizer_immediate_after_save', 1000, async () => {
                    if (!loginReady) return;
                    try {
                        await runFertilizerByConfig([], { skipNormal: true });
                    } catch (err) {
                        log('施肥', `保存配置后立即施肥失败: ${  err.message}`, {
                            module: 'farm', event: '施肥', result: 'error'
                        });
                    }
                });
            }

            // 好友捣乱从关变开 → 立即执行
            const prevBad = !!(prevAuto && prevAuto.friend_bad);
            const newBad = !!(newAuto && newAuto.friend_bad);
            if (!prevBad && newBad) {
                workerScheduler.setTimeoutTask('friend_bad_immediate', 3000, async () => {
                    if (!loginReady) return;
                    try {
                        await runBadOnceOnStartup(true);
                    } catch (err) {
                        log('好友', `开启自动捣乱后立即执行失败: ${  err.message}`, {
                            module: 'friend', event: '开启捣乱立即执行', result: 'error'
                        });
                    }
                });
            }

            const prevGoldenBug = !!(prevAuto && prevAuto.friend_golden_bug);
            const newGoldenBug = !!(newAuto && newAuto.friend_golden_bug);
            if (!prevGoldenBug && newGoldenBug) {
                workerScheduler.setTimeoutTask('friend_golden_bug_immediate', 3000, async () => {
                    if (!loginReady) return;
                    await runGoldenBugPlacement({ force: true });
                });
            }
        }
    }

    if (syncStatusAfter) syncStatus();
}

// ==================== 主控消息处理 ====================

onMasterMessage(async (msg) => {
    try {
        if (msg.type === 'start') {
            await startBot(msg.config);
        } else if (msg.type === 'stop') {
            await stopBot();
        } else if (msg.type === 'api_call') {
            handleApiCall(msg);
        } else if (msg.type === 'config_sync') {
            applyRuntimeConfig(msg.config || {}, true);
        } else if (msg.type === 'watchdog_ping') {
            sendToMaster({ type: 'watchdog_pong', at: msg.at || Date.now() });
        }
    } catch (err) {
        sendToMaster({ type: 'error', error: err.message });
    }
});

// ==================== 启动/停止 Bot ====================

async function startBot(config) {
    if (isRunning) return;
    isRunning = true;

    const { code, platform } = config;
    CONFIG.platform = platform || 'qq';

    await loadProto();
    log('系统', '正在连接服务器...');

    applyRuntimeConfig(getConfigSnapshot(), false);
    initStatusBar();
    setStatusPlatform(CONFIG.platform);

    // WebSocket 错误监听
    if (onWsError) {
        networkEvents.off('ws_error', onWsError);
        onWsError = null;
    }
    onWsError = (wsErr) => {
        if ((Number(wsErr?.code) || 0) !== 400) return;
        const now = Date.now();
        if (now - wsErrorHandledAt < 5000) return;
        wsErrorHandledAt = now;

        log('系统', '连接被拒绝，可能需要更新 Code');
        sendToMaster({
            type: 'ws_error',
            code: 400,
            message: wsErr?.message || ''
        });
        if (isRunning) {
            workerScheduler.setTimeoutTask('ws_error_cleanup', 500, () => {
                if (isRunning) stopBot().catch(() => exitWorker(0));
            });
        }
    };
    networkEvents.on('ws_error', onWsError);
    networkEvents.on('reconnect_failed', onReconnectFailed);
    networkEvents.on('kickout', onKickout);

    if (onClientVersionUpdate) networkEvents.off('client_version_update', onClientVersionUpdate);
    onClientVersionUpdate = ({ clientVersion, previous }) => {
        sendToMaster({
            type: 'client_version_update',
            clientVersion: String(clientVersion || ''),
            previous: String(previous || '')
        });
    };
    networkEvents.on('client_version_update', onClientVersionUpdate);

    // 断线监听
    if (onDisconnectHandler) networkEvents.off('disconnect', onDisconnectHandler);
    onDisconnectHandler = () => {
        if (!loginReady) return;
        loginReady = false;
        log('系统', '连接断开，暂停自动化任务，等待重连...');
    };
    networkEvents.on('disconnect', onDisconnectHandler);

    // 登录成功回调
    const onReady = async () => {
        loginReady = true;

        // 出售收益监听
        if (onSellGain) networkEvents.off('sell', onSellGain);
        onSellGain = (sellInfo) => {
            const gold = Number(sellInfo && sellInfo.gold || sellInfo || 0);
            const count = Number(sellInfo && sellInfo.count || 0);
            if (!Number.isFinite(gold) || gold <= 0) return;
            if (count > 0) recordOperation('sell', count);
        };
        networkEvents.on('sell', onSellGain);

        // 收获后自动出售
        if (onFarmHarvested) networkEvents.off('farmHarvested', onFarmHarvested);
        onFarmHarvested = async () => {
            if (harvestSellRunning) return;
            if (!getAutomation().sell) return;
            harvestSellRunning = true;
            try {
                await sellAllFruits();
            } catch (err) {
                log('仓库', `收获后自动出售失败: ${  err.message}`, {
                    module: 'warehouse', event: '收获后出售', result: 'error'
                });
            } finally {
                harvestSellRunning = false;
            }
        };
        networkEvents.on('farmHarvested', onFarmHarvested);

        if (onDogSkillGiftPending) networkEvents.off('dogSkillGiftPending', onDogSkillGiftPending);
        onDogSkillGiftPending = (count) => {
            const pendingCount = Math.max(0, toNum(count));
            if (!loginReady || pendingCount <= 0) return;
            require('../services/dog-skill-gifts').checkAndClaimDogSkillGifts(pendingCount).catch(() => null);
        };
        networkEvents.on('dogSkillGiftPending', onDogSkillGiftPending);

        // 获取背包点券数
        try {
            const bag = await getBag();
            const items = getBagItems(bag);
            let couponCount = 0;
            for (const item of items || []) {
                if (toNum(item && item.id) === 1002) {
                    couponCount = toNum(item.count);
                    break;
                }
            }
            const state = getUserState();
            state.coupon = Math.max(0, couponCount);
        } catch { }

        // 初始化统计数据
        const userState = getUserState();
        const accountId = process.env.FARM_ACCOUNT_ID || '';
        initStatsWithPersistence(
            accountId,
            Number(userState.gold || 0),
            Number(userState.exp || 0),
            Number(userState.coupon || 0)
        );
        resetSessionGains();

        // 处理邀请码
        await processInviteCodes();

        // 打开肥料礼包
        if (getAutomation().fertilizer_gift) {
            await openFertilizerGiftPacksSilently().catch(() => 0);
        }

        // 延迟执行放虫放草
        workerScheduler.setTimeoutTask('bad_startup_once', 15000, async () => {
            try {
                await runBadOnceOnStartup();
            } catch (err) {
                log('好友', `启动时放虫放草执行失败: ${  err.message}`, {
                    module: 'friend', event: '启动放虫放草失败', error: err.message
                });
            }
        });

        // 启动各检查循环
        startFarmCheckLoop({ externalScheduler: true });
        startFriendCheckLoop({ externalScheduler: true });

        // 启动统一调度器
        if (unifiedSchedulerRunning) {
            resetUnifiedSchedule();
            scheduleUnifiedNextTick();
        } else {
            startUnifiedScheduler();
        }

        // 启动每日定时器
        startDailyRoutineTimer();
        startStarActivityClaimTimer();
        startMysteryShopAutoBuyTimer();

        syncStatus();
    };

    // 建立连接
    connect(code, onReady);

    // 定期同步状态
    workerScheduler.setIntervalTask('status_sync', 5000, syncStatus, { preventOverlap: true });
}

async function stopBot() {
    if (!isRunning) return exitWorker(0);
    saveStats();
    isRunning = false;
    loginReady = false;
    friendSyncPaused = false;

    stopUnifiedScheduler();
    stopMysteryShopAutoBuyTimer();

    networkEvents.off('kickout', onKickout);
    networkEvents.off('reconnect_failed', onReconnectFailed);
    if (onClientVersionUpdate) {
        networkEvents.off('client_version_update', onClientVersionUpdate);
        onClientVersionUpdate = null;
    }

    if (onDisconnectHandler) {
        networkEvents.off('disconnect', onDisconnectHandler);
        onDisconnectHandler = null;
    }
    if (onWsError) {
        networkEvents.off('ws_error', onWsError);
        onWsError = null;
    }
    if (onSellGain) {
        networkEvents.off('sell', onSellGain);
        onSellGain = null;
    }
    if (onFarmHarvested) {
        networkEvents.off('farmHarvested', onFarmHarvested);
        onFarmHarvested = null;
    }
    if (onDogSkillGiftPending) {
        networkEvents.off('dogSkillGiftPending', onDogSkillGiftPending);
        onDogSkillGiftPending = null;
    }

    stopFarmCheckLoop();
    stopFriendCheckLoop();
    stopDailyRoutineTimer();
    stopStarActivityClaimTimer();
    cleanupTaskSystem();
    workerScheduler.clearAll();
    stopNetwork('账号停止');

    const ws = getWs();
    if (ws) ws.close();

    exitWorker(0);
}

// ==================== 踢下线处理 ====================

function onKickout(info) {
    const reason = info && info.reason ? info.reason : '未知';
    log('系统', `检测到踢下线，准备自动停止账号。原因: ${  reason}`);
    sendToMaster({ type: 'account_kicked', reason });
    workerScheduler.setTimeoutTask('kickout_stop', 500, () => {
        stopBot().catch(() => exitWorker(0));
    });
}

function onReconnectFailed(info) {
    const reason = info && info.reason ? info.reason : '未知';
    log('系统', `连接多次重试失败，准备停止账号。原因: ${  reason}`);
    sendToMaster({ type: 'ws_reconnect_failed', reason });
    stopBot().catch(() => exitWorker(0));
}

// ==================== API 调用处理 ====================

async function handleApiCall(msg) {
    const { id, method, args } = msg;
    let result = null;
    let error = null;

    // 好友同步操作期间暂停自动化
    const isFriendSync = method === 'getFriends' && args[0] === true
        || method === 'fetchFriendsDogInfo'
        || method === 'syncFriendsFromGids';

    if (isFriendSync) {
        friendSyncPaused = true;
        log('系统', '好友同步操作开始，已暂停其他自动化进程', {
            module: 'system', event: '好友同步暂停', method
        });
    }

    try {
        switch (method) {
            case 'getLands':
                result = await getLandsDetail();
                break;
            case 'getFriends':
                result = await getFriendsList(args[0] === true);
                break;
            case 'clearFriendsCache':
                require('../services/friend').clearFriendsListCache();
                result = { ok: true };
                break;
            case 'getInteractRecords':
                result = await getInteractRecords();
                break;
            case 'getFriendLands':
                result = await getFriendLandsDetail(args[0]);
                break;
            case 'doFriendOp':
                result = await doFriendOperation(args[0], args[1]);
                break;
            case 'getFriendDogInfo':
                result = await getFriendDogInfo(args[0]);
                break;
            case 'batchGetFriendDogInfo':
                result = await batchGetFriendDogInfo(args[0]);
                break;
            case 'syncFriendsFromGids':
                result = await syncFriendsFromGids(args[0]);
                break;
            case 'fetchFriendsDogInfo':
                result = await fetchFriendsDogInfo();
                break;
            case 'delFriend':
                result = await delFriend(args[0]);
                break;
            case 'getSeeds':
                result = await getAvailableSeeds();
                break;
            case 'getBag':
                result = await require('../services/warehouse').getBagDetail();
                break;
            case 'getBagSeeds':
                result = await require('../services/warehouse').getBagSeeds();
                break;
            case 'getDogSkillGiftStatus': {
                const dogGifts = require('../services/dog-skill-gifts');
                result = { pendingCount: dogGifts.getPendingGiftCount(await dogGifts.getDogInfo()) };
                break;
            }
            case 'claimDogSkillGifts':
                result = await require('../services/dog-skill-gifts').checkAndClaimDogSkillGifts();
                break;
            case 'useItem': {
                const { useItem } = require('../services/warehouse');
                const itemId = Number(args[0]) || 0;
                const count = Math.max(1, Number(args[1]) || 1);
                const uid = Number(args[2]) || 0;
                result = await useItem(itemId, count, uid);
                break;
            }
            case 'sellItems': {
                const { sellItems } = require('../services/warehouse');
                const items = Array.isArray(args[0]) ? args[0] : [];
                const totalCount = items.reduce((sum, it) => sum + (Number(it.count) || 0), 0);
                result = await sellItems(items.map(it => ({
                    id: it.id, count: it.count, uid: it.uid || 0
                })));
                if (totalCount > 0) recordOperation('sell', totalCount);
                break;
            }
            case 'setAutomation': {
                const item = args && args[0] ? args[0] : {};
                const patch = { [item.key]: item.value };
                applyRuntimeConfig({ automation: patch }, true);
                result = getAutomation();
                break;
            }
            case 'doFarmOp':
                result = await runFarmOperation(args[0]);
                break;
            case 'buyFertilizer': {
                const fertType = args[0] || 'organic';
                const count = Number(args[1]) || 1;
                result = await autoBuyFertilizer(true, fertType, count);
                break;
            }
            case 'checkAndBuyFertilizer': {
                const opts = args[0] || {};
                result = await checkAndBuyFertilizerBoth(opts);
                break;
            }
            case 'getAnalytics': {
                const { getPlantRankings } = require('../services/analytics');
                result = getPlantRankings(args[0]);
                break;
            }
            case 'getShopInfo': {
                const { getShopInfo } = require('../services/farm');
                result = await getShopInfo(args[0]);
                break;
            }
            case 'buyGoods': {
                const { buyGoods } = require('../services/farm');
                result = await buyGoods(args[0], args[1], args[2]);
                break;
            }
            case 'getMallGoods': {
                const { getMallGoodsList } = require('../services/mall');
                result = await getMallGoodsList(0);
                break;
            }
            case 'buyMallGoods': {
                const { purchaseMallGoods } = require('../services/mall');
                result = await purchaseMallGoods(args[0], args[1]);
                break;
            }
            case 'getMysteryShop': {
                const { getActiveMysteryShop } = require('../services/mystery-shop');
                result = await getActiveMysteryShop();
                break;
            }
            case 'buyMysteryShopGoods': {
                const { buyMysteryShopGoods } = require('../services/mystery-shop');
                result = await buyMysteryShopGoods(args[0]);
                break;
            }
            case 'abandonMysteryShop': {
                const { abandonMysteryShop } = require('../services/mystery-shop');
                result = await abandonMysteryShop();
                break;
            }
            case 'getActivityShop': {
                const { getNanguaShop } = require('../services/activity');
                result = await getNanguaShop();
                break;
            }
            case 'getActivityDiscoveryList': {
                const { getActivityDiscoveryList } = require('../services/activity');
                result = await getActivityDiscoveryList();
                break;
            }
            case 'getActivityGroupSnapshot': {
                const { getActivityGroupSnapshot } = require('../services/activity');
                result = await getActivityGroupSnapshot(args[0], args[1]);
                break;
            }
            case 'buyActivityShopItem': {
                const { buyNanguaShopItem } = require('../services/activity');
                result = await buyNanguaShopItem(args[0], args[1]);
                break;
            }
            case 'refreshActivityShop': {
                const { refreshNanguaShop } = require('../services/activity');
                result = await refreshNanguaShop();
                break;
            }
            case 'getHeluActivity': {
                const { getHeluActivity } = require('../services/activity');
                result = await getHeluActivity();
                break;
            }
            case 'getStarActivity': {
                const { getStarActivity } = require('../services/activity');
                result = await getStarActivity();
                break;
            }
            case 'claimStarRecordRewards': {
                const { claimStarRecordRewards } = require('../services/activity');
                result = await claimStarRecordRewards();
                break;
            }
            case 'exchangeStarShopItem': {
                const { exchangeStarShopItem } = require('../services/activity');
                result = await exchangeStarShopItem(args[0], args[1]);
                break;
            }
            case 'getQixiActivity': {
                const { getQixiActivity } = require('../services/activity');
                result = await getQixiActivity();
                break;
            }
            case 'buildQixiBridge': {
                const { buildQixiBridge } = require('../services/activity');
                result = await buildQixiBridge();
                break;
            }
            case 'sendQixiSachet': {
                const { sendQixiSachet } = require('../services/activity');
                result = await sendQixiSachet(args[0], args[1]);
                break;
            }
            case 'useQixiDew': {
                const { useQixiDew } = require('../services/activity');
                result = await useQixiDew(args[0] || {});
                break;
            }
            case 'exchangeHeluShopItem': {
                const { exchangeHeluShopItem } = require('../services/activity');
                result = await exchangeHeluShopItem(args[0], args[1]);
                break;
            }
            case 'drawHeluGiftLotus': {
                const { drawHeluGiftLotus } = require('../services/activity');
                result = await drawHeluGiftLotus(args[0] || {});
                break;
            }
            case 'claimSeasonPassportRewards': {
                const { claimSeasonPassportRewards } = require('../services/activity');
                result = await claimSeasonPassportRewards();
                break;
            }
            case 'claimSolarTermsReward': {
                const { claimSolarTermsReward } = require('../services/activity');
                result = await claimSolarTermsReward(args[0]);
                break;
            }
            case 'claimQingmeiSeeds': {
                const { claimQingmeiSeeds } = require('../services/activity');
                result = await claimQingmeiSeeds();
                break;
            }
            case 'brewAndSellQingmeiWine': {
                const { brewAndSellQingmeiWine } = require('../services/activity');
                result = await brewAndSellQingmeiWine(args[0] || {});
                break;
            }
            case 'getIllustratedList': {
                const { getIllustratedListV2 } = require('../services/illustrated');
                result = await getIllustratedListV2(args[0], args[1]);
                break;
            }
            case 'claimIllustratedRewards': {
                const { claimAllRewardsV2 } = require('../services/illustrated');
                result = await claimAllRewardsV2(args[0]);
                break;
            }
            case 'getCareerInfo': {
                const { getCareerInfo } = require('../services/career');
                result = await getCareerInfo(args[0]);
                break;
            }
            case 'getDailyGiftOverview':
                result = await getDailyGiftOverview();
                break;
            case 'getSchedulers':
                result = getSchedulerRegistrySnapshot();
                break;
            case 'fertilizeLand': {
                const landId = Number(args[0]) || 0;
                if (!landId) {
                    error = '无效的土地ID';
                } else {
                    log('施肥', `正在对土地 ${  landId  } 使用有机肥料催熟`, {
                        module: 'farm', event: '催熟', landId
                    });
                    const fertilizeCount = await fertilize([landId], ORGANIC_FERTILIZER_ID);
                    if (fertilizeCount > 0) {
                        log('施肥', `土地 ${  landId  } 催熟成功`, {
                            module: 'farm', event: '催熟', result: 'ok', landId
                        });
                        result = { success: true, count: fertilizeCount };
                    } else {
                        log('施肥', `土地 ${  landId  } 催熟失败，可能有机肥料不足`, {
                            module: 'farm', event: '催熟', result: 'error', landId
                        });
                        result = { success: false, count: 0 };
                    }
                }
                break;
            }
            case 'removePlant': {
                const landId = Number(args[0]) || 0;
                if (!landId) {
                    error = '无效的土地ID';
                } else {
                    result = await removePlant([landId]);
                }
                break;
            }
            case 'removeAllPlants': {
                const landsDetail = await getLandsDetail();
                const lands = landsDetail?.lands || [];
                const occupiedLands = lands
                    .filter(l => l && l.unlocked && l.status !== 'empty' && l.status !== 'locked')
                    .map(l => l.id);

                if (occupiedLands.length === 0) {
                    result = { removed: 0, message: '没有可铲除的作物' };
                } else {
                    await removePlant(occupiedLands);
                    log('铲除', `已铲除 ${  occupiedLands.length  } 块土地上的作物`, {
                        module: 'farm', event: '一键铲除', result: 'ok', count: occupiedLands.length
                    });
                    result = { removed: occupiedLands.length };
                }
                break;
            }
            default:
                error = 'Unknown method';
        }
    } catch (err) {
        error = err.message;
    }

    if (isFriendSync) {
        friendSyncPaused = false;
        log('系统', '好友同步操作完成，已恢复自动化进程', {
            module: 'system', event: '好友同步恢复', method
        });
    }

    sendToMaster({
        type: 'api_response',
        id,
        result,
        error
    });
}

// ==================== 每日礼包总览 ====================

async function getDailyGiftOverview() {
    const auto = getAutomation() || {};

    const taskState = getTaskDailyStateLikeApp
        ? await getTaskDailyStateLikeApp()
        : getTaskClaimDailyState ? getTaskClaimDailyState() : { doneToday: false, lastClaimAt: 0 };

    const growthState = getGrowthTaskStateLikeApp
        ? await getGrowthTaskStateLikeApp()
        : { doneToday: false, completedCount: 0, totalCount: 0, tasks: [] };

    const emailState = getEmailDailyState
        ? getEmailDailyState()
        : { doneToday: false, lastCheckAt: 0 };

    const freeGiftState = getFreeGiftDailyState
        ? getFreeGiftDailyState()
        : { doneToday: false, lastClaimAt: 0 };

    const shareState = getShareDailyState
        ? getShareDailyState()
        : { doneToday: false, lastClaimAt: 0 };

    const vipState = getVipDailyState
        ? getVipDailyState()
        : { doneToday: false, lastClaimAt: 0 };

    const monthCardState = getMonthCardDailyState
        ? getMonthCardDailyState()
        : { doneToday: false, lastClaimAt: 0 };

    return {
        date: new Date().toISOString().slice(0, 10),
        growth: {
            key: 'growth_task',
            label: '成长任务',
            doneToday: !!growthState.doneToday,
            completedCount: Number(growthState.completedCount || 0),
            totalCount: Number(growthState.totalCount || 0),
            tasks: Array.isArray(growthState.tasks) ? growthState.tasks : []
        },
        gifts: [
            {
                key: 'task_claim',
                label: '每日任务',
                enabled: !!auto.task,
                doneToday: !!taskState.doneToday,
                lastAt: Number(taskState.lastClaimAt || 0),
                completedCount: Number(taskState.completedCount || 0),
                totalCount: Number(taskState.totalCount || 0)
            },
            {
                key: 'email_rewards',
                label: '邮箱奖励',
                enabled: true,
                doneToday: !!emailState.doneToday,
                lastAt: Number(emailState.lastCheckAt || 0)
            },
            {
                key: 'mall_free_gifts',
                label: '商城免费礼包',
                enabled: true,
                doneToday: !!freeGiftState.doneToday,
                lastAt: Number(freeGiftState.lastClaimAt || 0)
            },
            {
                key: 'daily_share',
                label: '分享礼包',
                enabled: true,
                doneToday: !!shareState.doneToday,
                lastAt: Number(shareState.lastClaimAt || 0)
            },
            {
                key: 'vip_daily_gift',
                label: '会员礼包',
                enabled: true,
                doneToday: !!vipState.doneToday,
                lastAt: Number(vipState.lastClaimAt || vipState.lastCheckAt || 0),
                hasGift: Object.hasOwn(vipState, 'hasGift') ? !!vipState.hasGift : undefined,
                canClaim: Object.hasOwn(vipState, 'canClaim') ? !!vipState.canClaim : undefined,
                result: vipState.result || ''
            },
            {
                key: 'month_card_gift',
                label: '月卡礼包',
                enabled: true,
                doneToday: !!monthCardState.doneToday,
                lastAt: Number(monthCardState.lastClaimAt || monthCardState.lastCheckAt || 0),
                hasCard: Object.hasOwn(monthCardState, 'hasCard') ? !!monthCardState.hasCard : undefined,
                hasClaimable: Object.hasOwn(monthCardState, 'hasClaimable') ? !!monthCardState.hasClaimable : undefined,
                result: monthCardState.result || ''
            }
        ]
    };
}

// ==================== 状态同步 ====================

function syncStatus() {
    if (!process.send && !parentPort) return;

    const userState = getUserState();
    const ws = getWs();
    const connected = !!(loginReady && ws && ws.readyState === 1);

    let levelProgress = null;
    const level = userState.level ?? statusData.level ?? 0;
    const exp = userState.exp ?? statusData.exp ?? 0;
    if (level > 0 && exp >= 0) {
        levelProgress = getLevelExpProgress(level, exp);
    }

    const limits = require('../services/friend').getOperationLimits();
    const stats = require('../services/stats').getStats(statusData, userState, connected, limits);

    const now = Date.now();
    const farmRemainSec = Math.max(0, Math.ceil((Number(nextFarmRunAt || 0) - now) / 1000));
    const helpRemainSec = Math.max(0, Math.ceil((Number(nextHelpRunAt || 0) - now) / 1000));
    const stealRemainSec = Math.max(0, Math.ceil((Number(nextStealRunAt || 0) - now) / 1000));

    stats.nextChecks = {
        farmRemainSec,
        helpRemainSec,
        stealRemainSec,
        friendRemainSec: Math.max(helpRemainSec, stealRemainSec)
    };
    stats.automation = getAutomation();
    stats.preferredSeed = getPreferredSeed();
    stats.levelProgress = levelProgress;
    stats.configRevision = appliedConfigRevision;

    const hash = JSON.stringify(stats);
    const now2 = Date.now();

    if (hash !== lastStatusHash || now2 - lastStatusSentAt > 30000) {
        lastStatusHash = hash;
        lastStatusSentAt = now2;
        sendToMaster({ type: 'status_sync', data: stats });
    }
}
