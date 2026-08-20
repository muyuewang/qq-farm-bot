const { getItemById, getSeedImageBySeedId } = require("../config/gameConfig");

const DECORATION_ITEM_IDS = [2130, 2131];

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

function buildDecorationItem(itemId, userGoldBean) {
  const itemConfig = getItemById(itemId);
  if (!itemConfig) return null;

  const price = Number(itemConfig.price) || 0;
  return {
    id: itemId,
    itemId,
    itemCount: 1,
    price,
    name: itemConfig.name || `装扮${  itemId}`,
    image: getSeedImageBySeedId(itemId),
    desc: itemConfig.desc || "",
    effectDesc: itemConfig.effectDesc || "",
    canBuy: userGoldBean >= price,
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
      const decorations = DECORATION_ITEM_IDS.map((itemId) =>
        buildDecorationItem(itemId, userGoldBean),
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

module.exports = { registerAdminDecorationShopRoutes };
