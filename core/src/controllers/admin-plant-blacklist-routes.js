function getAccountOrRespond(req, res, { getAccountIdFromRequest, canAccessAccount }) {
  const accountId = getAccountIdFromRequest(req);
  if (!accountId) {
    res.status(400).json({ ok: false, error: "Missing accountId" });
    return null;
  }
  if (!canAccessAccount(req, accountId)) {
    res.status(403).json({ ok: false, error: "无权访问此账号" });
    return null;
  }
  return accountId;
}

function getPlantBlacklist(store, accountId) {
  return store.getPlantBlacklist ? store.getPlantBlacklist(accountId) : [];
}

function setPlantBlacklist({ store, provider, accountId, list }) {
  if (store.setPlantBlacklist) store.setPlantBlacklist(accountId, list);
  if (provider && typeof provider.broadcastConfig === "function") {
    provider.broadcastConfig(accountId);
  }
  return getPlantBlacklist(store, accountId);
}

function registerAdminPlantBlacklistRoutes({
  app,
  provider,
  store,
  requireAdminToken,
  getAccountIdFromRequest,
  canAccessAccount,
  sendProviderError,
}) {
  const access = { getAccountIdFromRequest, canAccessAccount };

  app.get("/api/plant-blacklist", requireAdminToken, (req, res) => {
    try {
      const accountId = getAccountOrRespond(req, res, access);
      if (!accountId) return;

      res.json({ ok: true, data: getPlantBlacklist(store, accountId) });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  app.post("/api/plant-blacklist", requireAdminToken, (req, res) => {
    try {
      const accountId = getAccountOrRespond(req, res, access);
      if (!accountId) return;

      const seedId = Number((req.body || {}).seedId);
      if (!seedId) {
        return res.status(400).json({ ok: false, error: "Missing seedId" });
      }

      const blacklist = getPlantBlacklist(store, accountId);
      if (!blacklist.includes(seedId)) {
        setPlantBlacklist({
          store,
          provider,
          accountId,
          list: [...blacklist, seedId],
        });
      }
      res.json({ ok: true, data: getPlantBlacklist(store, accountId) });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  app.delete("/api/plant-blacklist/:seedId", requireAdminToken, (req, res) => {
    try {
      const accountId = getAccountOrRespond(req, res, access);
      if (!accountId) return;

      const seedId = Number(req.params.seedId);
      if (!seedId) {
        return res.status(400).json({ ok: false, error: "Missing seedId" });
      }

      const nextBlacklist = getPlantBlacklist(store, accountId).filter(
        (item) => item !== seedId,
      );
      const data = setPlantBlacklist({
        store,
        provider,
        accountId,
        list: nextBlacklist,
      });
      res.json({ ok: true, data });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  app.post("/api/plant-blacklist/batch", requireAdminToken, (req, res) => {
    try {
      const accountId = getAccountOrRespond(req, res, access);
      if (!accountId) return;

      const seedIds = (req.body || {}).seedIds || [];
      if (!Array.isArray(seedIds)) {
        return res
          .status(400)
          .json({ ok: false, error: "seedIds must be an array" });
      }

      const blacklist = getPlantBlacklist(store, accountId);
      const nextBlacklist = [
        ...new Set([
          ...blacklist,
          ...seedIds
            .map(Number)
            .filter((seedId) => Number.isFinite(seedId) && seedId > 0),
        ]),
      ];
      const data = setPlantBlacklist({
        store,
        provider,
        accountId,
        list: nextBlacklist,
      });
      res.json({ ok: true, data });
    } catch (error) {
      sendProviderError(res, error);
    }
  });

  app.delete("/api/plant-blacklist", requireAdminToken, (req, res) => {
    try {
      const accountId = getAccountOrRespond(req, res, access);
      if (!accountId) return;

      setPlantBlacklist({ store, provider, accountId, list: [] });
      res.json({ ok: true, data: [] });
    } catch (error) {
      sendProviderError(res, error);
    }
  });
}

module.exports = { registerAdminPlantBlacklistRoutes };
