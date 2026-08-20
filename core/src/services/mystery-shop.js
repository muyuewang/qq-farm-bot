const { getItemById, getItemImageById } = require('../config/gameConfig');
const { sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { toNum, log, logWarn } = require('../utils/utils');
const { getAutomation } = require('../models/store');

const SERVICE = 'gamepb.mysteryshoppb.MysteryShopService';
const CURRENCY_NAMES = {
  1001: '金币',
  1002: '点券',
  1005: '金豆豆',
};

// 商人可能在登录完成后才出现，不能只依赖登录时的一次检查。
// 十分钟一次的只读查询可确保限时商品进入自动购买流程，同时避免过于频繁地请求。
const AUTO_BUY_CHECK_INTERVAL_MS = 10 * 60 * 1000;

function normalizeNPC(reply) {
  const npc = reply?.npc;
  const itemId = toNum(npc?.item_id);
  const itemInfo = getItemById(itemId);
  const endTime = toNum(reply?.end_time);
  const purchased = !!npc?.purchased;

  return {
    active: !!reply?.active && !purchased && (!endTime || endTime * 1000 > Date.now()),
    npcId: toNum(npc?.npc_id),
    itemId,
    itemType: toNum(npc?.item_type),
    itemName: itemInfo?.name || `物品${itemId}`,
    itemImage: getItemImageById(itemId),
    itemCount: toNum(npc?.item_count),
    currencyId: toNum(npc?.currency_id),
    currencyName: CURRENCY_NAMES[toNum(npc?.currency_id)] || `货币${toNum(npc?.currency_id)}`,
    price: toNum(npc?.price),
    originalPrice: toNum(npc?.original_price),
    discount: toNum(npc?.discount),
    purchased,
    startTime: toNum(reply?.start_time),
    endTime,
  };
}

async function getActiveMysteryShop() {
  const request = types.GetActiveMysteryNPCRequest.encode(
    types.GetActiveMysteryNPCRequest.create({})
  ).finish();
  const { body } = await sendMsgAsync(SERVICE, 'GetActiveNPC', request);
  return normalizeNPC(types.GetActiveMysteryNPCReply.decode(body));
}

async function buyMysteryShopGoods(npcId) {
  const id = toNum(npcId);
  if (id <= 0) throw new Error('无效的神秘商人 ID');

  const request = types.BuyMysteryShopRequest.encode(
    types.BuyMysteryShopRequest.create({ npc_id: id })
  ).finish();
  const { body } = await sendMsgAsync(SERVICE, 'Buy', request);
  const reply = types.BuyMysteryShopReply.decode(body);
  return {
    reward: {
      itemId: toNum(reply?.reward?.item_id),
      count: toNum(reply?.reward?.count),
    },
    purchased: !!reply?.npc?.purchased,
  };
}

async function abandonMysteryShop() {
  const request = types.AbandonMysteryShopRequest.encode(
    types.AbandonMysteryShopRequest.create({})
  ).finish();
  const { body } = await sendMsgAsync(SERVICE, 'Abandon', request);
  types.AbandonMysteryShopReply.decode(body);
  return { abandoned: true };
}

function isCurrencyAllowed(currencyId, automation = getAutomation() || {}) {
  const keyByCurrency = {
    1001: 'mystery_shop_allow_gold',
    1002: 'mystery_shop_allow_coupon',
    1005: 'mystery_shop_allow_gold_bean',
  };
  const key = keyByCurrency[toNum(currencyId)];
  return !!key && automation[key] === true;
}

async function checkAndAutoBuyMysteryShop() {
  const automation = getAutomation() || {};
  if (automation.mystery_shop_auto_buy !== true) return { skipped: true, reason: 'disabled' };

  try {
    const offer = await getActiveMysteryShop();
    if (!offer.active) return { skipped: true, reason: 'inactive' };
    if (!isCurrencyAllowed(offer.currencyId, automation)) {
      log('商城', `神秘商人自动购买已跳过：未允许使用${offer.currencyName}`, {
        module: 'shop', event: '神秘商人自动购买', result: 'skip', currencyId: offer.currencyId
      });
      return { skipped: true, reason: 'currency_not_allowed', offer };
    }

    const result = await buyMysteryShopGoods(offer.npcId);
    log('商城', `神秘商人自动购买成功：${offer.itemName} x${offer.itemCount}，花费 ${offer.price} ${offer.currencyName}`, {
      module: 'shop', event: '神秘商人自动购买', result: 'success', itemId: offer.itemId,
      count: offer.itemCount, currencyId: offer.currencyId, price: offer.price
    });
    return { ...result, offer };
  } catch (err) {
    logWarn('商城', `神秘商人自动购买检查失败: ${err.message}`, {
      module: 'shop', event: '神秘商人自动购买', result: 'error', error: err.message
    });
    return { skipped: true, reason: 'error', error: err.message };
  }
}

module.exports = {
  AUTO_BUY_CHECK_INTERVAL_MS,
  getActiveMysteryShop,
  buyMysteryShopGoods,
  abandonMysteryShop,
  checkAndAutoBuyMysteryShop,
  isCurrencyAllowed,
  normalizeNPC,
};
