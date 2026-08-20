function registerAdminCareerRoutes({
  app,
  provider,
  getAccountIdFromRequest,
  canAccessAccount,
  sendProviderError,
}) {
  app.get('/api/career', async (req, res) => {
    const accountId = getAccountIdFromRequest(req);
    if (!accountId) return res.status(400).json({ ok: false, error: 'Missing x-account-id' });
    if (!canAccessAccount(req, accountId)) {
      return res.status(403).json({ ok: false, error: '无权访问此账号' });
    }

    try {
      const status = provider.getStatus(accountId);
      const gid = Number(req.query.gid || status?.status?.gid) || 0;
      if (!gid) return res.status(400).json({ ok: false, error: '当前账号尚未取得角色 GID' });
      const data = await provider.getCareerInfo(accountId, gid);
      res.json({ ok: true, data });
    } catch (error) {
      sendProviderError(res, error);
    }
  });
}

module.exports = { registerAdminCareerRoutes };
