const { toNum } = require("../utils/utils");

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

function normalizeItemChanges(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    id: toNum(item.id) || 0,
    count: toNum(item.count) || 0,
  }));
}

function registerAdminShopPurchaseRoutes({
  app,
  provider,
  getAccountIdFromRequest,
  canAccessAccount,
  sendProviderError,
}) {
  app.post("/api/shop/buy", async (req, res) => {
    const accountId = getAuthorizedAccountId({
      req,
      res,
      getAccountIdFromRequest,
      canAccessAccount,
    });
    if (!accountId) return;

    try {
      const { goodsId, num, price } = req.body || {};
      if (!goodsId || !num || price === undefined) {
        return res.status(400).json({ ok: false, error: "参数不完整" });
      }

      const buyResult = await provider.buyGoods(accountId, goodsId, num, price);
      res.json({
        ok: true,
        data: {
          goods: buyResult.goods,
          getItems: normalizeItemChanges(buyResult.get_items),
          costItems: normalizeItemChanges(buyResult.cost_items),
        },
      });
    } catch (error) {
      sendProviderError(res, error);
    }
  });
}

module.exports = { registerAdminShopPurchaseRoutes };
