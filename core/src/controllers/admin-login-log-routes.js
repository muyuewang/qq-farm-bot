function registerAdminLoginLogRoutes({
  app,
  userStore,
  logger,
  requireAdminToken,
  requireAdminRole,
  requireDangerConfirmation,
}) {
  app.get('/api/admin/login-logs', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      const { limit, offset } = req.query || {};
      const result = userStore.getLoginLogs(limit, offset);
      res.json({ ok: true, data: result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.delete('/api/admin/login-logs', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      if (!requireDangerConfirmation(req, res, 'CLEAR_LOGIN_LOGS')) return;
      const result = userStore.clearLoginLogs();
      logger.warn('清空登录日志', {
        admin: req.currentUser?.username || '',
        confirmation: 'CLEAR_LOGIN_LOGS',
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });
}

module.exports = {
  registerAdminLoginLogRoutes,
};
