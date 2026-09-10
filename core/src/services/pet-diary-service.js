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
  return normalizePetDiary(group, bagItems, shopData, warnings);
}

module.exports = {
  GROUP_ID,
  PET_ID,
  SEEDS_ID,
  SHOP_ID,
  OPERATIONS,
  getPetDiaryActivity,
  getPetDiaryGroup,
  operatePetDiaryCommand,
  normalizePetDiary,
};
