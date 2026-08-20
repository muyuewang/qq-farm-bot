const {
  getAuthorizedAccountId,
  requireConnectedAccount,
} = require("./admin-activity-route-helpers");

function isQingmeiClaimAlreadyHandledError(err) {
  const message = String(err?.message || err || "");
  return message.includes("已领取")
    || message.includes("已经领取")
    || message.includes("重复领取")
    || message.includes("already");
}

function isQingmeiWineBusinessError(err) {
  const message = String(err?.message || err || "");
  return !!err?.qingmeiWine
    || message.includes("青梅酿")
    || message.includes("ActivityService.Operate")
    || message.includes("ShareService");
}

function registerAdminHeluActivityRoutes({
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

  app.get("/api/activity/star", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;

    try {
      if (!requireConnectedAccount(res, provider, accountId, "获取心许千灯星垂野失败: 账号未运行"))
        return;
      res.json({ ok: true, activity: await provider.getStarActivity(accountId) });
    } catch (err) {
      sendProviderError(res, err);
    }
  });

  app.post("/api/activity/star/records/claim", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;

    try {
      if (!requireConnectedAccount(res, provider, accountId, "观星礼录领取失败: 账号未运行"))
        return;
      res.json(await provider.claimStarRecordRewards(accountId));
    } catch (err) {
      sendProviderError(res, err);
    }
  });

  app.post("/api/activity/star/exchange", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;

    try {
      if (!requireConnectedAccount(res, provider, accountId, "星砂商店兑换失败: 账号未运行"))
        return;

      const slotId = Number(req.body?.slotId) || 0;
      const count = Math.floor(Number(req.body?.count) || 0);
      if (slotId <= 0) {
        return res.status(400).json({ ok: false, error: "缺少有效的星砂商店槽位" });
      }
      if (count <= 0) {
        return res.status(400).json({ ok: false, error: "兑换数量必须大于 0" });
      }
      res.json(await provider.exchangeStarShopItem(accountId, slotId, count));
    } catch (err) {
      sendProviderError(res, err);
    }
  });

  app.get("/api/activity/helu", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;

    try {
      if (!requireConnectedAccount(res, provider, accountId, "获取奇遇礼莲失败: 账号未运行"))
        return;

      const activity = await provider.getHeluActivity(accountId);
      res.json({
        ok: true,
        activity,
      });
    } catch (err) {
      sendProviderError(res, err);
    }
  });

  app.post("/api/activity/helu/draw", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;

    try {
      if (!requireConnectedAccount(res, provider, accountId, "奇遇礼莲抽奖失败: 账号未运行"))
        return;

      const result = await provider.drawHeluGiftLotus(accountId, req.body || {});
      res.json({
        ok: true,
        ...result,
      });
    } catch (err) {
      sendProviderError(res, err);
    }
  });

  app.post("/api/activity/helu/passport/claim", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;

    try {
      if (!requireConnectedAccount(res, provider, accountId, "荷风游记领取失败: 账号未运行"))
        return;

      const result = await provider.claimSeasonPassportRewards(accountId);
      const activity = await provider.getHeluActivity(accountId);
      res.json({
        ok: true,
        ...result,
        activity,
      });
    } catch (err) {
      sendProviderError(res, err);
    }
  });

  app.post("/api/activity/star/passport/claim", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;

    try {
      if (!requireConnectedAccount(res, provider, accountId, "千星游记领取失败: 账号未运行"))
        return;
      const result = await provider.claimSeasonPassportRewards(accountId);
      res.json({ ok: true, ...result, activity: await provider.getStarActivity(accountId) });
    } catch (err) {
      sendProviderError(res, err);
    }
  });

  app.post("/api/activity/helu/solar/claim", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;

    try {
      if (!requireConnectedAccount(res, provider, accountId, "节令小札领取失败: 账号未运行"))
        return;

      const termId = Number(req.body?.termId) || 0;
      const result = await provider.claimSolarTermsReward(accountId, termId);
      const activity = await provider.getHeluActivity(accountId);
      res.json({
        ok: true,
        ...result,
        activity,
      });
    } catch (err) {
      sendProviderError(res, err);
    }
  });

  app.post("/api/activity/star/solar/claim", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;

    try {
      if (!requireConnectedAccount(res, provider, accountId, "节令小札领取失败: 账号未运行"))
        return;
      const result = await provider.claimSolarTermsReward(accountId, Number(req.body?.termId) || 0);
      res.json({ ok: true, ...result, activity: await provider.getStarActivity(accountId) });
    } catch (err) {
      sendProviderError(res, err);
    }
  });

  app.post("/api/activity/helu/exchange", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;

    try {
      if (!requireConnectedAccount(res, provider, accountId, "荷露商店兑换失败: 账号未运行"))
        return;

      const slotId = Number(req.body?.slotId) || 0;
      const count = Math.floor(Number(req.body?.count) || 0);
      if (count <= 0) {
        return res.status(400).json({ ok: false, error: "兑换数量必须大于 0" });
      }
      const result = await provider.exchangeHeluShopItem(accountId, slotId, count);
      res.json({
        ok: true,
        ...result,
      });
    } catch (err) {
      sendProviderError(res, err);
    }
  });

  app.post("/api/activity/qingmei/claim", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;

    try {
      if (!requireConnectedAccount(res, provider, accountId, "领取青梅种子失败: 账号未运行"))
        return;

      const result = await provider.claimQingmeiSeeds(accountId);
      let activity = result.activity || null;
      if (!activity) {
        try {
          activity = await provider.getStarActivity(accountId);
        } catch {
          activity = null;
        }
      }
      res.json({
        ok: true,
        ...result,
        activity,
        qingmei: result.qingmei || activity?.qingmei || null,
      });
    } catch (err) {
      if (isQingmeiClaimAlreadyHandledError(err)) {
        let activity = null;
        try {
          activity = await provider.getStarActivity(accountId);
        } catch {
          activity = null;
        }
        res.json({
          ok: true,
          alreadyClaimed: true,
          claimedCount: 0,
          activity,
          qingmei: activity?.qingmei || {
            claimed: true,
            claimable: false,
          },
        });
        return;
      }
      sendProviderError(res, err);
    }
  });

  app.post("/api/activity/qingmei/wine/sell", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;

    try {
      if (!requireConnectedAccount(res, provider, accountId, "青梅酿售卖失败: 账号未运行"))
        return;

      const result = await provider.brewAndSellQingmeiWine(accountId, req.body || {});
      res.json({
        ok: true,
        ...result,
      });
    } catch (err) {
      if (isQingmeiWineBusinessError(err)) {
        let activity = null;
        try {
          activity = await provider.getStarActivity(accountId);
        } catch {
          activity = null;
        }
        res.json({
          ok: false,
          stage: err?.stage || '',
          error: err?.message || '青梅酿售卖失败',
          activity,
          qingmei: activity?.qingmei || null,
        });
        return;
      }
      sendProviderError(res, err);
    }
  });

  app.get("/api/activity/qixi", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;
    try {
      if (!requireConnectedAccount(res, provider, accountId, "获取鹊桥寄情失败: 账号未运行")) return;
      const [activity, friendReply] = await Promise.all([
        provider.getQixiActivity(accountId),
        provider.getFriends(accountId, false).catch(() => ({ friends: [] })),
      ]);
      const friends = Array.isArray(friendReply) ? friendReply
        : Array.isArray(friendReply?.friends) ? friendReply.friends
        : Array.isArray(friendReply?.game_friends) ? friendReply.game_friends : [];
      res.json({
        ok: true,
        activity,
        friends: friends.map(friend => ({
          gid: Number(friend?.gid) || 0,
          name: String(friend?.name || friend?.nickname || `好友${friend?.gid || ""}`),
          avatar: String(friend?.avatarUrl || friend?.avatar_url || friend?.avatar || ""),
          level: Number(friend?.level) || 0,
        })).filter(friend => friend.gid > 0),
      });
    } catch (err) {
      sendProviderError(res, err);
    }
  });

  app.post("/api/activity/qixi/bridge/build", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;
    try {
      if (!requireConnectedAccount(res, provider, accountId, "驻建鹊桥失败: 账号未运行")) return;
      res.json(await provider.buildQixiBridge(accountId));
    } catch (err) {
      sendProviderError(res, err);
    }
  });

  app.post("/api/activity/qixi/dew/use", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;
    try {
      if (!requireConnectedAccount(res, provider, accountId, "使用鹊羽灵露失败: 账号未运行")) return;
      res.json(await provider.useQixiDew(accountId, { limit: Number(req.body?.limit) || 0 }));
    } catch (err) {
      sendProviderError(res, err);
    }
  });

  app.post("/api/activity/qixi/gift", async (req, res) => {
    const accountId = getAuthorizedAccountId(req, res, routeContext);
    if (!accountId) return;
    const friendGid = Number(req.body?.friendGid) || 0;
    const count = Math.max(1, Math.floor(Number(req.body?.count) || 1));
    if (!friendGid) return res.status(400).json({ ok: false, error: "请选择有效好友" });
    try {
      if (!requireConnectedAccount(res, provider, accountId, "香囊赠送失败: 账号未运行")) return;
      res.json(await provider.sendQixiSachet(accountId, friendGid, count));
    } catch (err) {
      sendProviderError(res, err);
    }
  });
}

module.exports = { registerAdminHeluActivityRoutes };
