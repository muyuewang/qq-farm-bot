const { getItemById, getSeedImageBySeedId } = require("../config/gameConfig");
const { toNum } = require("../utils/utils");

const DECORATION_ITEM_IDS = [2130, 2131];
const DECORATION_SHOP_ID = 4;

function getAuthorizedAccountId({
  req,
  res,
  getAccountIdFromRequest,
  canAccessAccount,
}) {
  const accountId = getAccountIdFromRequest(req);
  if (!accountId) {
    res.status(400).json({ ok: false, error: "Missing\x20x-account-id" });
    return null;
  }
  if (!canAccessAccount(req, accountId)) {
    res.status(403).json({ ok: false, error: "无权访问此账号" });
    return null;
  }
  return accountId;
}

function getOwnedDecorationIds(bag) {
  const items = Array.isArray(bag?.originalItems)
    ? bag.originalItems
    : Array.isArray(bag?.items) ? bag.items : [];
  return new Set(items
    .filter((item) => Number(item?.count) > 0)
    .map((item) => Number(item?.id) || 0));
}

function getDecorationGoods(shopReply) {
  const goodsByItemId = new Map();
  for (const goods of shopReply?.goods_list || []) {
    const itemId = toNum(goods?.item_id) || 0;
    if (DECORATION_ITEM_IDS.includes(itemId)) goodsByItemId.set(itemId, goods);
  }
  return goodsByItemId;
}

function buildDecorationItem(itemId, userGoldBean, ownedDecorationIds = new Set(), goods) {
  const itemConfig = getItemById(itemId);
  if (!itemConfig) return null;

  const price = toNum(goods?.price) || Number(itemConfig.price) || 0;
  const limitCount = toNum(goods?.limit_count) || 0;
  const boughtNum = toNum(goods?.bought_num) || 0;
  const soldOut = limitCount > 0 && boughtNum >= limitCount;
  // Used avatar-frame items disappear from the bag, so the shop purchase
  // record is the authoritative ownership source.
  const owned = soldOut || ownedDecorationIds.has(itemId);
  return {
    id: toNum(goods?.id) || itemId,
    itemId,
    itemCount: toNum(goods?.item_count) || 1,
    price,
    limitCount,
    boughtNum,
    name: itemConfig.name || `装扮${  itemId}`,
    image: getSeedImageBySeedId(itemId),
    desc: itemConfig.desc || "",
    effectDesc: itemConfig.effectDesc || "",
    owned,
    canBuy: !owned && goods?.unlocked !== false && userGoldBean >= price,
  };
}

function registerAdminDecorationShopRoutes({
  app,
  provider,
  adminLogger,
  getAccountIdFromRequest,
  canAccessAccount,
  sendProviderError,
}) {
  app.get("/api/shop/decoration", async (req, res) => {
    const accountId = getAuthorizedAccountId({
      req,
      res,
      getAccountIdFromRequest,
      canAccessAccount,
    });
    if (!accountId) return;

    try {
      const status = provider.getStatus(accountId);
      if (!status || !status.connection || !status.connection.connected) {
        return res.json({
          ok: false,
          error: "获取装扮商城失败:\x20账号未运行",
        });
      }

      const userGoldBean = status?.status?.goldBean || 0;
      const [bag, shopReply] = await Promise.all([
        provider.getBag(accountId),
        provider.getShopInfo(accountId, DECORATION_SHOP_ID),
      ]);
      const ownedDecorationIds = getOwnedDecorationIds(bag);
      const decorationGoods = getDecorationGoods(shopReply);
      const decorations = DECORATION_ITEM_IDS.map((itemId) =>
        buildDecorationItem(itemId, userGoldBean, ownedDecorationIds, decorationGoods.get(itemId)),
      ).filter(Boolean);

      res.json({ ok: true, data: decorations, userGoldBean });
    } catch (error) {
      adminLogger.error("获取装扮商城失败", {
        error: error.message,
        stack: error.stack,
      });
      sendProviderError(res, error);
    }
  });
}

module.exports = {
  buildDecorationItem,
  getDecorationGoods,
  getOwnedDecorationIds,
  registerAdminDecorationShopRoutes,
};
