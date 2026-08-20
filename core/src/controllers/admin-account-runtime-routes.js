function registerAdminAccountRuntimeRoutes({
  app,
  provider,
  resolveAccountReference,
  canAccessAccount,
}) {
  app.post("/api/accounts/:id/start", async (req, res) => {
    try {
      const accountId = resolveAccountReference(req.params.id);
      if (!canAccessAccount(req, accountId)) {
        return res.status(403).json({ ok: false, error: "无权访问此账号" });
      }

      const started = await provider.startAccount(accountId);
      if (!started) {
        return res.status(404).json({ ok: false, error: "Account not found" });
      }

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/accounts/:id/stop", (req, res) => {
    try {
      const accountId = resolveAccountReference(req.params.id);
      if (!canAccessAccount(req, accountId)) {
        return res.status(403).json({ ok: false, error: "无权访问此账号" });
      }

      const stopped = provider.stopAccount(accountId);
      if (!stopped) {
        return res.status(404).json({ ok: false, error: "Account not found" });
      }

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });
}

module.exports = { registerAdminAccountRuntimeRoutes };
