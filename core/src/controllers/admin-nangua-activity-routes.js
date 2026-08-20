const {
  getAuthorizedAccountId,
  requireConnectedAccount,
} = require("./admin-activity-route-helpers");

function registerAdminNanguaActivityRoutes({
  app,
  provider,
  getAccountIdFromRequest,
  canAccessAccount,
  sendProviderError,
}) {
  const routeContext = {
    getAccountIdFromRequest,
    canAccessAccount,
  };

  // Nangua activity is intentionally dormant on the frontend.
  // Keep these backend endpoints isolated so they are easy to restore or remove.
  app.get("/api/activity/shop", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;

    try {
      if (!requireConnectedAccount(res, provider, accountId, "获取活动商店失败: 账号未运行"))
        return;

      const shop = await provider.getActivityShop(accountId);
      res.json({
        ok: true,
        shop,
      });
    } catch (err) {
      sendProviderError(res, err);
    }
  });

  app.post("/api/activity/shop/buy", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;

    const { slotId, price } = req.body || {};
    if (!slotId) {
      return res.status(400).json({
        ok: false,
        error: "Missing slotId",
      });
    }

    try {
      const shop = await provider.buyActivityShopItem(accountId, slotId, price);
      res.json({
        ok: true,
        shop,
      });
    } catch (err) {
      sendProviderError(res, err);
    }
  });

  app.post("/api/activity/shop/refresh", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;

    try {
      const shop = await provider.refreshActivityShop(accountId);
      res.json({
        ok: true,
        shop,
      });
    } catch (err) {
      sendProviderError(res, err);
    }
  });
}

module.exports = { registerAdminNanguaActivityRoutes };
