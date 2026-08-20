const { getItemById, getSeedImageBySeedId } = require("../config/gameConfig");
  const { toNum } = require("../utils/utils");

const PET_ITEM_IDS = [90011, 90002, 90003];
const PET_ITEM_ORDER = {
  90011: 1,
  90002: 2,
  90003: 3,
};

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

function registerAdminPetShopRoutes({
  app,
  provider,
  adminLogger,
  getAccountIdFromRequest,
  canAccessAccount,
  sendProviderError,
}) {
  app.get("/api/shop/pet", async (req, res) => {
    const accountId = getAuthorizedAccountId({
      req,
      res,
      getAccountIdFromRequest,
      canAccessAccount,
    });
    if (!accountId) return;

    try {
      const shopType = 3;
      const status = provider.getStatus(accountId);
      const userLevel = status?.status?.level || 0;
      const userGold = status?.status?.gold || 0;
      const userGoldBean = status?.status?.goldBean || 0;
      let shopReply;
      try {
        shopReply = await provider.getShopInfo(accountId, shopType);
      } catch (error) {
        adminLogger.error("获取宠物商店失败", { error: error.message });
        return res.json({
          ok: false,
          error: `获取宠物商店失败:\x20${  error.message}`,
        });
      }

      if (!shopReply || !shopReply.goods_list) {
        adminLogger.info("宠物商店返回数据为空", { shopReply });
        return res.json({ ok: true, data: [] });
      }

      const goods = [];
      for (const canBuy of shopReply.goods_list) {
        const itemId = toNum(canBuy.item_id) || 0;
        if (!PET_ITEM_IDS.includes(itemId)) continue;

        const itemConfig = getItemById(itemId);
        if (!itemConfig) continue;

        let requiredLevel = 0;
        for (const condition of canBuy.conds || []) {
          if (toNum(condition.type) === 1)
            requiredLevel = toNum(condition.param) || 0;
        }

        const limitCount = toNum(canBuy.limit_count) || 0;
        const boughtNum = toNum(canBuy.bought_num) || 0;
        const isSoldOut = limitCount > 0 && boughtNum >= limitCount;
        const price = toNum(canBuy.price) || 0;
        const isGoldenBean = itemId === 90011;

        goods.push({
          id: toNum(canBuy.id) || 0,
          itemId,
          itemCount: toNum(canBuy.item_count) || 1,
          price,
          limitCount,
          boughtNum,
          unlocked: !!canBuy.unlocked,
          requiredLevel,
          name: itemConfig.name || `宠物${  itemId}`,
          image: getSeedImageBySeedId(itemId),
          desc: itemConfig.desc || "",
          isGoldenBean,
          canBuy:
            canBuy.unlocked &&
            userLevel >= requiredLevel &&
            !isSoldOut &&
            (isGoldenBean ? userGoldBean >= price : userGold >= price),
          isSoldOut,
        });
      }

      goods.sort(
        (left, right) =>
          (PET_ITEM_ORDER[left.itemId] || 99) -
          (PET_ITEM_ORDER[right.itemId] || 99),
      );
      res.json({
        ok: true,
        data: goods,
        userGold,
        userGoldBean,
      });
    } catch (error) {
      adminLogger.error("获取宠物商店失败", {
        error: error.message,
        stack: error.stack,
      });
      sendProviderError(res, error);
    }
  });
}

module.exports = { registerAdminPetShopRoutes };
