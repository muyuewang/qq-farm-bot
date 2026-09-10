const catalog = require('../activity-data/pet-diary-2026090101.json');
const { getBag, getBagItems } = require('./warehouse');
const { sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { toNum } = require('../utils/utils');

const GROUP_ID = 2026090100;
const PET_ID = 2026090101;
const SEEDS_ID = 2026090102;
const SHOP_ID = 2026090103;
const DIAMOND_ID = 1004;
const BALANCE_ITEM_IDS = [1028, 1029, 80101, 80102, 80103];

const base = catalog.ActivityPetTreasureHuntBase?.[0] || {};
const fight = catalog.ActivityPetTreasureHuntFight?.[0] || {};
const charmRefresh = catalog.ActivityPetTreasureCharmRefresh?.[0] || {};
const charmCatalog = Array.isArray(catalog.ActivityPetTreasureHuntCharm)
  ? catalog.ActivityPetTreasureHuntCharm
  : [];

// 命令字与字段选择器来自官方 1.14.0.1 encoder（ccpopy 参考仓库协议）
const OPERATIONS = {
  initialize: [27, 'pet_treasure_hunt_finish_cg'],
  feed: [29, 'pet_treasure_hunt_feed'],
  draw: [30, 'pet_treasure_hunt_draw'],
  logs: [31, 'pet_treasure_hunt_get_log'],
  story: [32, 'pet_treasure_hunt_claim_story'],
  refreshCharm: [41, 'pet_treasure_hunt_refresh_charm_pool'],
  equipCharm: [42, 'pet_treasure_hunt_equip_charms'],
  battle: [43, 'pet_treasure_hunt_start_battle'],
  plunderedLogs: [44, 'pet_treasure_hunt_get_plundered_log'],
  openTreasure: [45, 'pet_treasure_hunt_open_treasure'],
  compensation: [46, 'pet_treasure_hunt_claim_plunder_compensation'],
  friendInfo: [47, 'pet_treasure_hunt_get_friend_activity_info'],
  claimDog: [48, 'pet_treasure_hunt_claim_dog'],
  markStories: [49, 'pet_treasure_hunt_mark_story_animated'],
  skipBattle: [50, 'pet_treasure_hunt_set_skip_battle_cg'],
  seeds: [21, 'mega_event_claim_all'],
  shopOpen: [7, null],
  exchange: [1, 'shop_buy'],
};

function list(value) {
  return Array.isArray(value) ? value : [];
}

function parseJson(value) {
  try {
    return JSON.parse(String(value || '{}'));
  } catch {
    return {};
  }
}

function normalizeItem(item, fallbackId = 0) {
  return {
    itemId: toNum(item?.id) || toNum(fallbackId),
    count: toNum(item?.count),
  };
}

function parseFeedCosts() {
  return String(base.feed_items || '1028:700')
    .split(';')
    .map((value) => {
      const [id, count] = String(value).split(':');
      return { itemId: toNum(id), count: toNum(count) };
    })
    .filter(item => item.itemId > 0);
}

function isActiveWindow(head, nowSec) {
  const start = toNum(head?.start_time);
  const end = toNum(head?.end_time);
  return start > 0 && nowSec >= start && nowSec <= end;
}

function normalizeCharm(id) {
  const config = charmCatalog.find(entry => toNum(entry.charm_id) === toNum(id));
  return {
    id: toNum(id),
    name: String(config?.name || `锦囊 ${id}`),
    description: String(config?.desc || ''),
    shortDescription: String(config?.short_desc || config?.desc || ''),
    useLimit: toNum(config?.use_limit),
  };
}

function normalizeTreasure(value) {
  return {
    id: String(value?.id || ''),
    itemId: toNum(value?.item_id),
    count: toNum(value?.count),
    originalCount: toNum(value?.original_count),
    protectedCount: toNum(value?.protected_count),
    maxCount: toNum(value?.max_count),
    status: toNum(value?.status),
    startTime: toNum(value?.start_at) * 1000,
    endTime: toNum(value?.end_at) * 1000,
    createdTime: toNum(value?.created_at) * 1000,
    plunderCount: toNum(value?.plunder_count),
    maxPlunderCount: toNum(value?.max_plunder_count),
    sourceCharmIds: list(value?.source_charm_ids).map(toNum),
    previews: list(value?.battle_previews).map(p => ({
      challengeId: toNum(p?.challenge_item_id),
      canStart: p?.canStart === true || p?.can_start === true,
      maxProfit: normalizeItem(p?.max_profit),
      maxLoss: normalizeItem(p?.max_loss),
      plunderableCount: toNum(p?.plunderable_count),
    })),
  };
}

function bagBalances(bagItems) {
  const map = new Map();
  for (const item of list(bagItems)) {
    const id = toNum(item?.id);
    if (id > 0) map.set(id, (map.get(id) || 0) + Math.max(0, toNum(item?.count)));
  }
  return BALANCE_ITEM_IDS.map((id) => ({ itemId: id, count: map.get(id) || 0 }));
}

async function getPetDiaryGroup() {
  const request = types.ActivityGetGroupRequest.encode(
    types.ActivityGetGroupRequest.create({ id: GROUP_ID, uid: '' }),
  ).finish();
  const { body } = await sendMsgAsync('gamepb.activitypb.ActivityService', 'GetGroup', request);
  const reply = types.PetDiaryGetGroupReply.decode(body);
  if (toNum(reply?.group?.head?.id) !== GROUP_ID) {
    throw new Error('服务端未返回萌宠日记活动');
  }
  return reply.group;
}

async function operatePetDiaryCommand(activityId, command, selector, params = {}) {
  const mapping = Object.entries(OPERATIONS).find(([, value]) => value[0] === command);
  if (!mapping) throw new Error(`未知萌宠命令: ${command}`);
  const request = types.PetDiaryOperateRequest.encode(
    types.PetDiaryOperateRequest.create({
      activity_id: activityId,
      operate_type: command,
      ...(selector ? { [selector]: params } : {}),
    }),
  ).finish();
  const { body } = await sendMsgAsync('gamepb.activitypb.ActivityService', 'Operate', request);
  return types.PetDiaryOperateReply.decode(body);
}

async function openPetDiaryShop() {
  const reply = await operatePetDiaryCommand(SHOP_ID, 7, null, {});
  return reply?.data || null;
}

function normalizePetDiary(group, bagItems, shopData, warnings = []) {
  const nowSec = Math.floor(Date.now() / 1000);
  const children = list(group?.children);
  const petNode = children.find(node => toNum(node?.head?.id) === PET_ID) || null;
  const seedsNode = children.find(node => toNum(node?.head?.id) === SEEDS_ID) || null;
  const shopNode = shopData
    || children.find(node => toNum(node?.head?.id) === SHOP_ID)
    || null;

  if (!petNode?.pet_treasure_hunt) {
    throw new Error('服务端未返回萌宠养成状态');
  }

  const state = petNode.pet_treasure_hunt;
  const nurture = state.nurture || {};
  const feed = state.feed || {};
  const hunt = state.hunt || {};
  const battle = state.battle || {};
  const pool = state.pool || {};
  const plunder = state.plunder || {};
  const active = isActiveWindow(petNode.head, nowSec);
  const adult = toNum(nurture.stage) === 2;
  const feedCosts = parseFeedCosts();
  const huntCosts = list(hunt.treasure_cost).map(item => normalizeItem(item));
  const balances = bagBalances(bagItems);
  const balanceMap = new Map(balances.map(item => [item.itemId, item.count]));

  function costsAvailable(costs) {
    if (!costs.length) return false;
    return costs.every((cost) => {
      if (cost.itemId === DIAMOND_ID || cost.itemId <= 0 || cost.count <= 0) return false;
      return (balanceMap.get(cost.itemId) || 0) >= cost.count;
    });
  }

  const seedRewards = list(seedsNode?.mega_event?.rewards);
  const stories = list(state.story?.stories).map((story) => {
    const desc = parseJson(story?.selected_desc);
    return {
      order: toNum(story?.order),
      unlocked: story?.unlocked === true,
      claimed: story?.claimed === true,
      animated: story?.animated === true,
      photo: String(desc.photo || ''),
      caption: String(desc.say || ''),
    };
  });

  const goods = list(shopNode?.shop?.goods).map((goodsInfo) => {
    const limit = toNum(goodsInfo?.purchase_limit);
    const purchased = toNum(goodsInfo?.purchased_count);
    const costs = list(goodsInfo?.cost).map(item => normalizeItem(item));
    const remaining = limit > 0 ? Math.max(0, limit - purchased) : null;
    const usesDiamond = toNum(goodsInfo?.diamond_cost_count) > 0
      || costs.some(cost => cost.itemId === DIAMOND_ID);
    return {
      id: toNum(goodsInfo?.id),
      name: String(goodsInfo?.name || ''),
      order: toNum(goodsInfo?.order),
      category: String(goodsInfo?.category_tag || '游记好礼'),
      rewards: list(goodsInfo?.item).map(item => normalizeItem(item)),
      costs,
      limit,
      purchased,
      remaining,
      usesDiamond,
      exchangeable: active && isActiveWindow(shopNode?.head, nowSec) && !usesDiamond
        && remaining !== 0 && costsAvailable(costs),
    };
  }).sort((a, b) => a.order - b.order);

  return {
    activityId: PET_ID,
    groupId: GROUP_ID,
    title: '萌宠成长日记',
    active,
    startTime: toNum(petNode.head?.start_time) * 1000,
    endTime: toNum(petNode.head?.end_time) * 1000,
    serverTime: nowSec * 1000,
    rules: String(petNode.head?.desc || ''),
    warnings,
    balances,
    nurture: {
      initialized: nurture.cg_played === true,
      adult,
      growth: toNum(nurture.growth),
      adultGrowth: toNum(base.growth_adult_threshold),
      dogGranted: nurture.dog_granted === true,
      stage: toNum(nurture.stage),
      feedCount: toNum(feed.feed_count),
      feedLimit: toNum(base.daily_feed_limit),
      feedCosts,
      canFeed: active && !adult && toNum(nurture.stage) === 1
        && toNum(feed.feed_count) < toNum(base.daily_feed_limit)
        && costsAvailable(feedCosts),
    },
    hunt: {
      count: toNum(hunt.treasure_count),
      limit: toNum(base.daily_treasure_limit),
      total: toNum(hunt.treasure_total),
      luckyStarTotal: toNum(hunt.lucky_star_gained_total),
      costs: huntCosts,
      canDraw: active && adult && toNum(hunt.treasure_count) < toNum(base.daily_treasure_limit)
        && costsAvailable(huntCosts),
      canPlunder: active && hunt.can_play_plunder === true
        && toNum(battle.battle_count) < toNum(fight.daily_battle_limit),
    },
    seeds: {
      canClaim: active && isActiveWindow(seedsNode?.head, nowSec)
        && seedRewards.some(item => item.claimable === true && item.claimed !== true),
      days: seedRewards.map(item => ({
        day: toNum(item?.unlock_day),
        claimed: item?.claimed === true,
        claimable: item?.claimable === true,
        rewards: list(item?.reward).map(reward => normalizeItem(reward)),
      })),
    },
    stories,
    charms: {
      pool: list(battle.charm_daily_pool).map(normalizeCharm),
      equipped: list(battle.charm_equipped).map(normalizeCharm),
      all: charmCatalog.map(entry => normalizeCharm(entry.charm_id)),
      picked: battle.charm_pick_used === true,
      freeRefreshRemaining: Math.max(
        0,
        toNum(charmRefresh.free_refresh_daily_limit) - toNum(battle.charm_free_refresh_count),
      ),
      canRefresh: active && adult
        && toNum(battle.charm_free_refresh_count) < toNum(charmRefresh.free_refresh_daily_limit),
      refreshNote: '仅展示免费刷新状态；付费刷新可能自动改用钻石，面板不执行。',
    },
    treasures: list(pool.treasures).map(normalizeTreasure),
    compensationCount: toNum(plunder.plunder_compensation_count),
    battleCount: toNum(battle.battle_count),
    battleLimit: toNum(fight.daily_battle_limit),
    skipBattle: battle.is_skip_battle_cg === true,
    shop: goods,
    shopActive: shopNode ? isActiveWindow(shopNode.head, nowSec) : false,
    solarTerms: null,
  };
}

async function loadPetDiarySolarTerms(startTimeMs, endTimeMs) {
  const { getSolarTermsInfo } = require('./activity');
  const solar = await getSolarTermsInfo();
  const terms = list(solar?.terms).filter((term) => {
    const start = Number(term?.startTime) || 0;
    const end = Number(term?.endTime) || 0;
    if (!start && !end) return true;
    return end * 1000 >= startTimeMs && start * 1000 <= endTimeMs;
  });
  return {
    claimableCount: terms.filter(term => term.claimable).length,
    currentTerm: terms.find(term => term.claimable) || terms.find(term => term.status === 3) || terms[0] || null,
    tipsText: String(solar?.tipsText || ''),
    terms,
  };
}

async function getPetDiaryActivity() {
  const warnings = [];
  const group = await getPetDiaryGroup();
  let shopData = null;
  try {
    shopData = await openPetDiaryShop();
    if (!shopData?.shop) throw new Error('拾物小铺目录缺失');
  } catch (err) {
    warnings.push(`拾物小铺：${err.message}`);
  }
  let bagItems = [];
  try {
    bagItems = getBagItems(await getBag());
  } catch (err) {
    warnings.push(`背包读取失败：${err.message}`);
  }
  const activity = normalizePetDiary(group, bagItems, shopData, warnings);
  try {
    activity.solarTerms = await loadPetDiarySolarTerms(activity.startTime, activity.endTime);
  } catch (err) {
    warnings.push(`节令小礼：${err.message}`);
    activity.warnings = warnings;
  }
  return activity;
}

// 串行化活动写操作，避免并发重复消耗
let mutationLock = Promise.resolve();
function serializePetDiaryMutation(task) {
  const run = mutationLock.then(() => task());
  mutationLock = run.catch(() => null);
  return run;
}

function bagBalanceMap(bagItems) {
  const map = new Map();
  for (const item of list(bagItems)) {
    const id = toNum(item?.id);
    if (id > 0) map.set(id, (map.get(id) || 0) + Math.max(0, toNum(item?.count)));
  }
  return map;
}

function costsSatisfied(costs, bagMap, times = 1) {
  if (!costs.length) return false;
  const totals = new Map();
  for (const cost of costs) {
    const id = toNum(cost.itemId ?? cost.id);
    const count = toNum(cost.count);
    if (id <= 0 || id === DIAMOND_ID || count <= 0) return false;
    totals.set(id, (totals.get(id) || 0) + count * times);
  }
  return [...totals].every(([id, amount]) => (bagMap.get(id) || 0) >= amount);
}

function extractRewards(replySelector) {
  return list(replySelector?.rewards || replySelector?.awards).map(item => normalizeItem(item));
}

async function operatePetDiary(action, input = {}) {
  const known = new Set([
    'initialize', 'feed', 'draw', 'story', 'refreshCharm', 'equipCharm',
    'openTreasure', 'compensation', 'claimDog', 'skipBattle', 'seeds', 'exchange', 'solar',
    'battle', 'markStories',
  ]);
  if (!known.has(action)) throw new Error(`未知萌宠操作: ${action}`);

  return serializePetDiaryMutation(async () => {
    const group = await getPetDiaryGroup();
    const nowSec = Math.floor(Date.now() / 1000);
    const children = list(group.children);
    const petNode = children.find(node => toNum(node?.head?.id) === PET_ID);
    const seedsNode = children.find(node => toNum(node?.head?.id) === SEEDS_ID);
    if (action !== 'exchange' && !isActiveWindow(petNode?.head, nowSec)) {
      throw new Error('萌宠成长日记当前不在活动时间内');
    }

    const state = petNode?.pet_treasure_hunt || {};
    const nurture = state.nurture || {};
    const feed = state.feed || {};
    const hunt = state.hunt || {};
    const battle = state.battle || {};
    const pool = state.pool || {};
    const plunder = state.plunder || {};

    let bagMap = new Map();
    try {
      bagMap = bagBalanceMap(getBagItems(await getBag()));
    } catch {
      // 无法读背包时继续，服务端仍会校验
    }

    let activityId = PET_ID;
    let command;
    let selector;
    let params = {};

    if (action === 'initialize') {
      if (nurture.cg_played === true) throw new Error('已领养比熊，请刷新状态');
      [command, selector] = OPERATIONS.initialize;
    } else if (action === 'feed') {
      if (toNum(nurture.stage) !== 1 || toNum(feed.feed_count) >= toNum(base.daily_feed_limit)) {
        throw new Error('当前不可投喂');
      }
      const costs = parseFeedCosts();
      if (!costsSatisfied(costs, bagMap)) throw new Error('萌宠元气糕不足，请先种植活动作物');
      [command, selector] = OPERATIONS.feed;
    } else if (action === 'draw') {
      if (toNum(nurture.stage) !== 2 || toNum(hunt.treasure_count) >= toNum(base.daily_treasure_limit)) {
        throw new Error('当前不可寻宝');
      }
      const costs = list(hunt.treasure_cost).map(item => normalizeItem(item));
      if (!costsSatisfied(costs, bagMap)) throw new Error('寻宝消耗材料不足');
      [command, selector] = OPERATIONS.draw;
    } else if (action === 'story') {
      const order = toNum(input.order);
      if (!order) throw new Error('缺少手记编号');
      if (!list(state.story?.stories).some(s => toNum(s.order) === order && s.unlocked === true && s.claimed !== true)) {
        throw new Error('手记尚未解锁或已领取');
      }
      [command, selector] = OPERATIONS.story;
      params = { order };
    } else if (action === 'seeds') {
      const seedRewards = list(seedsNode?.mega_event?.rewards);
      if (!isActiveWindow(seedsNode?.head, nowSec)
        || !seedRewards.some(r => r.claimable === true && r.claimed !== true)) {
        throw new Error('当前没有可领取的种子礼包');
      }
      activityId = SEEDS_ID;
      [command, selector] = OPERATIONS.seeds;
    } else if (action === 'claimDog') {
      if (toNum(nurture.stage) !== 2 || nurture.dog_granted === true) {
        throw new Error('比熊尚未成年或已经领取');
      }
      [command, selector] = OPERATIONS.claimDog;
    } else if (action === 'refreshCharm') {
      if (toNum(battle.charm_free_refresh_count) >= toNum(charmRefresh.free_refresh_daily_limit)) {
        throw new Error('免费刷新已用完；为避免自动消耗钻石，已停用付费刷新');
      }
      [command, selector] = OPERATIONS.refreshCharm;
    } else if (action === 'equipCharm') {
      const charmId = toNum(input.charmId);
      if (!charmId) throw new Error('缺少锦囊编号');
      if (battle.charm_pick_used === true || !list(battle.charm_daily_pool).includes(charmId)) {
        throw new Error('该锦囊不可选择或今日已经选择');
      }
      [command, selector] = OPERATIONS.equipCharm;
      params = { charm_ids: [charmId] };
    } else if (action === 'openTreasure') {
      const ready = list(pool.treasures).some(t => (
        toNum(t.status) === 3
        || (toNum(t.status) === 2 && toNum(t.end_at) > 0 && toNum(t.end_at) <= nowSec)
      ));
      if (!ready) throw new Error('还没有完成护送的宝藏');
      [command, selector] = OPERATIONS.openTreasure;
    } else if (action === 'compensation') {
      if (toNum(plunder.plunder_compensation_count) <= 0) throw new Error('当前没有可领取的夺宝补偿');
      [command, selector] = OPERATIONS.compensation;
    } else if (action === 'battle') {
      if (hunt.can_play_plunder !== true || toNum(battle.battle_count) >= toNum(fight.daily_battle_limit)) {
        throw new Error('当前不可夺宝');
      }
      const gid = toNum(input.gid);
      const challengeId = toNum(input.challengeId);
      const treasureId = String(input.treasureId || '');
      if (!gid) throw new Error('缺少好友 GID');
      if (![80101, 80102, 80103].includes(challengeId)) throw new Error('挑战书类型无效');
      const friend = await getPetDiaryFriend(gid);
      const treasure = list(friend.treasures).find(t => String(t.id) === treasureId);
      if (!treasure || toNum(treasure.status) !== 2
        || !list(treasure.previews).some(p => toNum(p.challengeId) === challengeId && p.canStart === true)) {
        throw new Error('好友宝藏状态已变化，请重新查看');
      }
      if (!costsSatisfied([{ itemId: challengeId, count: 1 }], bagMap)) {
        throw new Error('对应挑战书不足');
      }
      [command, selector] = OPERATIONS.battle;
      params = { defender_gid: gid, treasure_id: treasureId, challenge_item_id: challengeId };
    } else if (action === 'markStories') {
      const orders = list(input.orders).map(toNum).filter(Boolean);
      if (!orders.length) throw new Error('手记编号无效');
      if (orders.some(order => !list(state.story?.stories).some(s => toNum(s.order) === order && s.unlocked === true))) {
        throw new Error('手记编号无效');
      }
      [command, selector] = OPERATIONS.markStories;
      params = { orders };
    } else if (action === 'skipBattle') {
      if (typeof input.skip !== 'boolean') throw new Error('跳过动画设置无效');
      [command, selector] = OPERATIONS.skipBattle;
      params = { skip: input.skip };
    } else if (action === 'exchange') {
      activityId = SHOP_ID;
      const goodsId = toNum(input.goodsId);
      const count = Math.max(1, toNum(input.count) || 1);
      if (!goodsId) throw new Error('缺少商品编号');
      [command, selector] = OPERATIONS.exchange;
      const shopReply = await operatePetDiaryCommand(SHOP_ID, 7, null, {});
      if (!isActiveWindow(shopReply?.data?.head, nowSec)) throw new Error('拾物小铺当前不可兑换');
      const goods = list(shopReply?.data?.shop?.goods).find(g => toNum(g.id) === goodsId);
      if (!goods) throw new Error('服务端目录未发现该商品');
      const costs = list(goods.cost).map(item => normalizeItem(item));
      if (toNum(goods.diamond_cost_count) > 0 || costs.some(c => c.itemId === DIAMOND_ID)) {
        throw new Error('该商品可能消耗钻石，已阻止兑换');
      }
      const limit = toNum(goods.purchase_limit);
      const purchased = toNum(goods.purchased_count);
      if (limit > 0 && purchased + count > limit) throw new Error('兑换数量超过剩余限购次数');
      if (!costsSatisfied(costs, bagMap, count)) throw new Error('兑换余额不足');
      params = { goods_id: goodsId, count };
    } else if (action === 'solar') {
      const { claimSolarTermsReward } = require('./activity');
      const result = await claimSolarTermsReward(toNum(input.termId) || 0);
      let activity = null;
      let refreshError = '';
      try {
        activity = await getPetDiaryActivity();
      } catch (err) {
        refreshError = `领取已成功，刷新失败：${err.message}`;
      }
      return {
        ok: true,
        action: 'solar',
        rewards: list(result?.rewards).map(item => normalizeItem(item)),
        costs: [],
        message: '节令小礼领取成功',
        activity,
        refreshError,
      };
    }

    const reply = await operatePetDiaryCommand(activityId, command, selector, params);
    if (toNum(reply.activity_id) !== activityId || toNum(reply.operate_type) !== command) {
      throw new Error('活动响应不匹配，请刷新后查看结果');
    }
    const result = selector ? reply[selector] : reply;
    let activity = null;
    let refreshError = '';
    try {
      activity = await getPetDiaryActivity();
    } catch (err) {
      refreshError = `操作已成功，刷新失败：${err.message}`;
    }

    return {
      ok: true,
      action,
      rewards: extractRewards(result),
      costs: list(result?.costs).map(item => normalizeItem(item)),
      message: action === 'battle' && result && result.won === false
        ? '本次夺宝未获胜，已按规则结算'
        : '操作成功',
      activity,
      refreshError,
    };
  });
}

async function getPetDiaryRecords(kind = 'interact') {
  const isPlunder = kind === 'plunder';
  const selector = isPlunder ? 'pet_treasure_hunt_get_plundered_log' : 'pet_treasure_hunt_get_log';
  const command = isPlunder ? OPERATIONS.plunderedLogs[0] : OPERATIONS.logs[0];
  const reply = await operatePetDiaryCommand(PET_ID, command, selector);
  const logs = list(reply?.[selector]?.logs);
  if (!isPlunder) {
    return logs.map(entry => ({
      time: toNum(entry.ts) * 1000,
      type: toNum(entry.type),
      costs: list(entry.costs).map(item => normalizeItem(item)),
      rewards: list(entry.rewards).map(item => normalizeItem(item)),
      dogId: toNum(entry.dog_id),
    }));
  }
  return logs.map(entry => ({
    time: toNum(entry.ts) * 1000,
    attackerGid: toNum(entry.attacker_gid),
    name: String(entry.attacker_name || ''),
    won: entry.attacker_won === true,
    treasureId: String(entry.treasure_id || ''),
    challengeId: toNum(entry.challenge_item_id),
    level: toNum(entry.attacker_level),
    lost: list(entry.lost_items).map(item => normalizeItem(item)),
    injected: list(entry.injected_items).map(item => normalizeItem(item)),
    fake: entry.is_fake === true,
  }));
}

async function getPetDiaryFriend(gidInput) {
  const gid = toNum(gidInput);
  if (gid <= 0) throw new Error('好友 GID 无效');
  const reply = await operatePetDiaryCommand(PET_ID, OPERATIONS.friendInfo[0], OPERATIONS.friendInfo[1], {
    friend_gid: gid,
  });
  const result = reply?.pet_treasure_hunt_get_friend_activity_info;
  if (toNum(result?.gid) !== gid) throw new Error('好友响应不匹配');
  return {
    gid,
    treasures: list(result.info?.treasures).map(normalizeTreasure),
    charms: list(result.info?.defender_charm_ids).map(toNum),
  };
}

module.exports = {
  GROUP_ID,
  PET_ID,
  SEEDS_ID,
  SHOP_ID,
  OPERATIONS,
  getPetDiaryActivity,
  getPetDiaryGroup,
  getPetDiaryFriend,
  operatePetDiary,
  operatePetDiaryCommand,
  getPetDiaryRecords,
  normalizePetDiary,
};
