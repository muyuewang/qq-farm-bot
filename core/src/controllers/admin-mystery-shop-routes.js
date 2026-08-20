function getAuthorizedAccountId({
  req,
  res,
  getAccountIdFromRequest,
  canAccessAccount,
}) {
  const accountId = getAccountIdFromRequest(req);
  if (!accountId) {
    res.status(400).json({ ok: false, error: 'Missing x-account-id' });
    return null;
  }
  if (!canAccessAccount(req, accountId)) {
    res.status(403).json({ ok: false, error: '无权访问此账号' });
    return null;
  }
  return accountId;
}

function registerAdminMysteryShopRoutes({
  app,
  provider,
  getAccountIdFromRequest,
  canAccessAccount,
  sendProviderError,
}) {
  app.get('/api/shop/mystery', async (req, res) => {
    const accountId = getAuthorizedAccountId({
      req,
      res,
      getAccountIdFromRequest,
      canAccessAccount,
    });
    if (!accountId) return;

    try {
      const status = provider.getStatus(accountId);
      if (!status?.connection?.connected) {
        return res.json({ ok: false, error: '获取神秘商人失败: 账号未运行' });
      }
      const data = await provider.getMysteryShop(accountId);
      res.json({ ok: true, data });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  app.post('/api/shop/mystery/buy', async (req, res) => {
    const accountId = getAuthorizedAccountId({
      req,
      res,
      getAccountIdFromRequest,
      canAccessAccount,
    });
    if (!accountId) return;

    const npcId = Number(req.body?.npcId) || 0;
    if (npcId <= 0) {
      return res.status(400).json({ ok: false, error: '缺少神秘商人 ID' });
    }

    try {
      const data = await provider.buyMysteryShopGoods(accountId, npcId);
      res.json({ ok: true, data });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  app.post('/api/shop/mystery/abandon', async (req, res) => {
    const accountId = getAuthorizedAccountId({
      req,
      res,
      getAccountIdFromRequest,
      canAccessAccount,
    });
    if (!accountId) return;

    try {
      const data = await provider.abandonMysteryShop(accountId);
      res.json({ ok: true, data });
    } catch (error) {
      sendProviderError(res, error);
    }
  });
}

module.exports = { registerAdminMysteryShopRoutes };
