function registerAdminCardRoutes({
  app,
  requireAdminToken,
  requireAdminRole,
  requireDangerConfirmation,
  userStore,
  adminLogger,
}) {
  app.get("/api/admin/cards", requireAdminToken, requireAdminRole, (req, res) => {
    try {
      res.json({ ok: true, data: userStore.getAllCards() });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/admin/cards", requireAdminToken, requireAdminRole, (req, res) => {
    try {
      const { count } = req.body || {};
      const confirmation =
        count && Number.parseInt(count, 10) > 1
          ? "CREATE_CARDS_BATCH"
          : "CREATE_CARD";
      if (!requireDangerConfirmation(req, res, confirmation)) return;

      const { description, days, type, durationValue, durationUnit, isPermanent, value } = req.body || {};
      if (!description || (days === undefined && durationValue === undefined && value === undefined && !isPermanent)) {
        return res.status(400).json({ ok: false, error: "请提供描述和时长" });
      }

      const cardType = type === "quota" ? "quota" : "time";
      const permanentRequested =
        isPermanent === true || Number(days) === -1 || Number(durationValue) === -1;
      const requestedValue = Number(
        cardType === "quota" ? value ?? days : durationValue ?? days,
      );
      if (cardType === "time" && !permanentRequested && (!Number.isFinite(requestedValue) || requestedValue <= 0)) {
        return res.status(400).json({ ok: false, error: "时间卡时长必须大于 0，永久卡请使用 -1" });
      }
      if (cardType === "quota" && (!Number.isFinite(requestedValue) || requestedValue <= 0)) {
        return res.status(400).json({ ok: false, error: "额度卡数量必须大于 0" });
      }
      const durationOptions = { durationValue, durationUnit, isPermanent, value };
      if (count && Number.parseInt(count, 10) > 1) {
        const cards = userStore.createCardsBatch(
          description,
          days,
          count,
          cardType,
          durationOptions,
        );
        adminLogger.warn("批量创建卡密", {
          admin: req.currentUser?.username || "",
          description: String(description || "").trim(),
          count: cards.length,
          type: cardType,
          days: Number(days),
          durationValue: durationValue === undefined ? null : Number(durationValue),
          durationUnit: durationUnit || null,
          isPermanent: isPermanent === true,
          confirmation: "CREATE_CARDS_BATCH",
        });
        return res.json({
          ok: true,
          data: cards,
          batch: true,
          count: cards.length,
        });
      }

      const card = userStore.createCard(description, days, cardType, durationOptions);
      adminLogger.info("创建卡密", {
        admin: req.currentUser?.username || "",
        description: String(description || "").trim(),
        type: cardType,
        days: Number(days),
        durationValue: durationValue === undefined ? null : Number(durationValue),
        durationUnit: durationUnit || null,
        isPermanent: isPermanent === true,
        code: card?.code || "",
        confirmation: "CREATE_CARD",
      });
      res.json({ ok: true, data: card });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post(
    "/api/admin/cards/batch-delete",
    requireAdminToken,
    requireAdminRole,
    (req, res) => {
      try {
        if (!requireDangerConfirmation(req, res, "DELETE_CARDS_BATCH")) return;
        const { codes } = req.body || {};
        if (!Array.isArray(codes) || codes.length === 0) {
          return res
            .status(400)
            .json({ ok: false, error: "请提供要删除的卡密列表" });
        }

        const result = userStore.deleteCardsBatch(codes);
        adminLogger.warn("批量删除卡密", {
          admin: req.currentUser?.username || "",
          deleteCount: codes.length,
          confirmation: "DELETE_CARDS_BATCH",
        });
        res.json(result);
      } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
      }
    },
  );

  app.post(
    "/api/admin/cards/:code",
    requireAdminToken,
    requireAdminRole,
    (req, res) => {
      try {
        if (!requireDangerConfirmation(req, res, "UPDATE_CARD_STATUS")) return;
        const { code } = req.params;
        const card = userStore.updateCard(code, req.body || {});
        if (!card) {
          return res.status(404).json({ ok: false, error: "卡密不存在" });
        }

        adminLogger.warn("更新卡密状态", {
          admin: req.currentUser?.username || "",
          code,
          enabled: card?.enabled !== false,
          confirmation: "UPDATE_CARD_STATUS",
        });
        res.json({ ok: true, data: card });
      } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
      }
    },
  );

  app.delete(
    "/api/admin/cards/:code",
    requireAdminToken,
    requireAdminRole,
    (req, res) => {
      try {
        if (!requireDangerConfirmation(req, res, "DELETE_CARD")) return;
        const { code } = req.params;
        const deleted = userStore.deleteCard(code);
        if (!deleted) {
          return res.status(404).json({ ok: false, error: "卡密不存在" });
        }

        adminLogger.warn("删除卡密", {
          admin: req.currentUser?.username || "",
          code,
          confirmation: "DELETE_CARD",
        });
        res.json({ ok: true });
      } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
      }
    },
  );

  app.get("/api/card-claim/status", (req, res) => {
    try {
      const status = userStore.getCardClaimStatus();
      const availableTimeCards = userStore.getAvailableTimeCardCount();
      res.json({
        ok: true,
        enabled: status.enabled,
        availableTimeCards,
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post(
    "/api/admin/card-claim/status",
    requireAdminToken,
    requireAdminRole,
    (req, res) => {
      try {
        if (!requireDangerConfirmation(req, res, "UPDATE_CARD_CLAIM_STATUS")) {
          return;
        }

        const { enabled } = req.body;
        const availableTimeCards = userStore.getAvailableTimeCardCount();
        if (enabled && availableTimeCards <= 0) {
          return res.status(400).json({
            ok: false,
            error: "可领取时间卡密库存不足，无法开启卡密领取功能",
            availableTimeCards,
          });
        }

        const status = userStore.setCardClaimStatus(enabled);
        adminLogger.warn("更新卡密领取功能状态", {
          admin: req.currentUser?.username || "",
          enabled: !!status.enabled,
          availableTimeCards,
          confirmation: "UPDATE_CARD_CLAIM_STATUS",
        });
        res.json({
          ok: true,
          enabled: status.enabled,
          availableTimeCards,
        });
      } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
      }
    },
  );

  app.post("/api/card-claim/claim", (req, res) => {
    try {
      const userAgent = req.headers["user-agent"] || "";
      const username = req.body?.username || null;
      userStore.clearExpiredClaimRecords();
      const claim = userStore.claimCardByUA(userAgent, username);
      if (!claim.ok) {
        const payload = { ok: false, error: claim.error };
        if (claim.remainingMs) payload.remainingMs = claim.remainingMs;
        return res.status(400).json(payload);
      }

      res.json({
        ok: true,
        cardCode: claim.cardCode,
        days: claim.days,
        description: claim.description,
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get(
    "/api/admin/card-claim/records",
    requireAdminToken,
    requireAdminRole,
    (req, res) => {
      try {
        res.json({ ok: true, data: userStore.getCardClaimRecords() });
      } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
      }
    },
  );
}

module.exports = { registerAdminCardRoutes };
