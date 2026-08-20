const {
    getItemById,
    getSeedHarvestInfo,
    getSeedImageBySeedId,
  } = require("../config/gameConfig");
  const { toNum } = require("../utils/utils");

function getAuthorizedAccountId({
  req,
  res,
  getAccountIdFromRequest,
  canAccessAccount,
  missingAccountPayload = { ok: false, error: "Missing\x20x-account-id" },
}) {
  const accountId = getAccountIdFromRequest(req);
  if (!accountId) {
    res.status(400).json(missingAccountPayload);
    return null;
  }
  if (!canAccessAccount(req, accountId)) {
    res.status(403).json({ ok: false, error: "无权访问此账号" });
    return null;
  }
  return accountId;
}

function registerAdminSeedShopRoutes({
  app,
  provider,
  adminLogger,
  getAccountIdFromRequest,
  canAccessAccount,
  sendProviderError,
}) {
  app.get("/api/seeds", async (req, res) => {
    const accountId = getAuthorizedAccountId({
      req,
      res,
      getAccountIdFromRequest,
      canAccessAccount,
      missingAccountPayload: { ok: false },
    });
    if (!accountId) return;

    try {
      const seeds = await provider.getSeeds(accountId);
      res.json({ ok: true, data: seeds });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  app.get("/api/shop/seed", async (req, res) => {
    const accountId = getAuthorizedAccountId({
      req,
      res,
      getAccountIdFromRequest,
      canAccessAccount,
    });
    if (!accountId) return;

    try {
      const shopType = 2;
      const status = provider.getStatus(accountId);
      const userLevel = status?.status?.level || 0;
      let shopReply;
      try {
        shopReply = await provider.getShopInfo(accountId, shopType);
      } catch (error) {
        adminLogger.error("获取种子商店失败", { error: error.message });
        return res.json({
          ok: false,
          error: `获取种子商店失败:\x20${  error.message}`,
        });
      }

      if (!shopReply || !shopReply.goods_list) {
        adminLogger.info("商店返回数据为空", { shopReply });
        return res.json({
          ok: true,
          data: [],
          debug: {
            reason: "shopReply\x20or\x20goods_list\x20is\x20empty",
            shopReply: shopReply ? "exists" : "null",
          },
        });
      }

      const debug = {
        goodsCount: shopReply.goods_list.length,
        sampleItems: [],
        filteredItems: [],
      };
      const seeds = [];

      for (const unlocked of shopReply.goods_list) {
        const itemId = toNum(unlocked.item_id) || 0;
        if (debug.sampleItems.length < 3) {
          debug.sampleItems.push({
            goodsId: toNum(unlocked.id),
            itemId,
            unlocked: unlocked.unlocked,
          });
        }

        const itemConfig = getItemById(itemId);
        if (!itemConfig) {
          if (debug.filteredItems.length < 5) {
            debug.filteredItems.push({
              itemId,
              reason: "not_found_in_config",
            });
          }
          continue;
        }

        const itemType = Number(itemConfig.type);
        if (itemType !== 5) {
          if (debug.filteredItems.length < 5) {
            debug.filteredItems.push({
              itemId,
              type: itemType,
              reason: "not_seed_type",
            });
          }
          continue;
        }

        let requiredLevel = 0;
        for (const condition of unlocked.conds || []) {
          if (toNum(condition.type) === 1)
            requiredLevel = toNum(condition.param) || 0;
        }

        const limitCount = toNum(unlocked.limit_count) || 0;
        const boughtNum = toNum(unlocked.bought_num) || 0;
        const isSoldOut = limitCount > 0 && boughtNum >= limitCount;
        const harvestInfo = getSeedHarvestInfo(itemId);

        seeds.push({
          id: toNum(unlocked.id) || 0,
          itemId,
          itemCount: toNum(unlocked.item_count) || 1,
          price: toNum(unlocked.price) || 0,
          limitCount,
          boughtNum,
          unlocked: !!unlocked.unlocked,
          requiredLevel,
          seedLevel: Number(itemConfig.level) || 0,
          name: itemConfig.effectDesc || itemConfig.name || `种子${  itemId}`,
          assetName: itemConfig.asset_name || `Crop_${  itemId - 20000}`,
          image: getSeedImageBySeedId(itemId),
          canBuy: unlocked.unlocked && userLevel >= requiredLevel && !isSoldOut,
          isSoldOut,
          expPerSeason: harvestInfo.expPerSeason,
          seasons: harvestInfo.seasons,
          incomePerSeason: harvestInfo.incomePerSeason,
        });
      }

      seeds.sort((left, right) => left.requiredLevel - right.requiredLevel);
      res.json({ ok: true, data: seeds, debug });
    } catch (error) {
      adminLogger.error("获取种子商店失败", {
        error: error.message,
        stack: error.stack,
      });
      sendProviderError(res, error);
    }
  });
}

module.exports = { registerAdminSeedShopRoutes };
