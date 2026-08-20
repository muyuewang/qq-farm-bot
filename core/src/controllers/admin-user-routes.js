function registerAdminUserRoutes({
  app,
  requireAdminToken,
  requireAdminRole,
  requireSuperAdminRole,
  requireDangerConfirmation,
  getAdminUserMutationError,
  userStore,
  adminLogger,
  invalidateAdminSessions,
  updateAdminSessions,
}) {
  app.get("/api/admin/users", requireAdminToken, requireAdminRole, (req, res) => {
    try {
      res.json({ ok: true, data: userStore.getAllUsers() });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get(
    "/api/admin/users-with-password",
    requireAdminToken,
    requireSuperAdminRole,
    (req, res) => {
      try {
        res.json({ ok: true, data: userStore.getAllUsersWithPassword() });
      } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
      }
    },
  );

  app.post(
    "/api/admin/users/clear-expired",
    requireAdminToken,
    requireAdminRole,
    (req, res) => {
      try {
        if (!requireDangerConfirmation(req, res, "CLEAR_EXPIRED_USERS")) return;
        const result = userStore.clearExpiredUsers();
        if (result.ok && result.deletedCount > 0) {
          for (const username of result.deletedUsers) {
            invalidateAdminSessions((session) => session.username === username);
          }
          adminLogger.info("清理到期用户", {
            admin: req.currentUser.username,
            deletedCount: result.deletedCount,
            deletedUsers: result.deletedUsers,
          });
        }
        res.json(result);
      } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
      }
    },
  );

  app.post(
    "/api/admin/users/:username",
    requireAdminToken,
    requireAdminRole,
    (req, res) => {
      try {
        if (!requireDangerConfirmation(req, res, "UPDATE_USER_STATUS")) return;
        const { username } = req.params;
        const mutationError = getAdminUserMutationError(
          req.currentUser,
          username,
        );
        if (mutationError) {
          return res.status(403).json({ ok: false, error: mutationError });
        }

        const user = userStore.updateUser(username, req.body || {});
        if (!user) {
          return res.status(404).json({ ok: false, error: "用户不存在" });
        }

        adminLogger.warn("更新用户状态", {
          admin: req.currentUser?.username || "",
          username,
          enabled: user && user.card ? user.card.enabled !== false : null,
          expiresAt: user && user.card ? user.card.expiresAt || null : null,
          confirmation: "UPDATE_USER_STATUS",
        });
        res.json({ ok: true, data: user });
      } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
      }
    },
  );

  app.post(
    "/api/admin/users/:username/edit",
    requireAdminToken,
    requireAdminRole,
    (req, res) => {
      try {
        if (!requireDangerConfirmation(req, res, "EDIT_USER")) return;
        const { username } = req.params;
        const mutationError = getAdminUserMutationError(
          req.currentUser,
          username,
        );
        if (mutationError) {
          return res.status(403).json({ ok: false, error: mutationError });
        }

        const {
          newUsername,
          password,
          accountLimit,
          expiresAt,
          isPermanent,
        } = req.body || {};
        const result = userStore.editUser(username, {
          newUsername,
          password,
          accountLimit,
          expiresAt,
          isPermanent,
        });
        if (!result.ok) return res.status(400).json(result);

        adminLogger.warn("编辑用户资料", {
          admin: req.currentUser?.username || "",
          username,
          newUsername: result.user?.username || username,
          changedPassword: !!String(password || "").trim(),
          accountLimit: result.user?.accountLimit || accountLimit || null,
          isPermanent: isPermanent === true,
          expiresAt: expiresAt ?? null,
          confirmation: "EDIT_USER",
        });
        updateAdminSessions(
          (session) =>
            session.username === username || session.username === newUsername,
          (session) => {
            session.username = result.user.username;
            session.card = result.user.card;
            session.accountLimit = result.user.accountLimit;
          },
        );
        res.json({ ok: true, data: result.user });
      } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
      }
    },
  );

  app.delete(
    "/api/admin/users/:username",
    requireAdminToken,
    requireAdminRole,
    (req, res) => {
      try {
        if (!requireDangerConfirmation(req, res, "DELETE_USER")) return;
        const { username } = req.params;
        const currentUser = req.currentUser;
        if (currentUser && currentUser.username === username) {
          return res
            .status(400)
            .json({ ok: false, error: "不能删除自己的账号" });
        }

        const mutationError = getAdminUserMutationError(currentUser, username);
        if (mutationError) {
          return res.status(403).json({ ok: false, error: mutationError });
        }

        const result = userStore.deleteUser(username, true);
        if (!result.ok) return res.status(400).json(result);

        adminLogger.warn("删除用户", {
          admin: req.currentUser?.username || "",
          username,
          confirmation: "DELETE_USER",
        });
        invalidateAdminSessions((session) => session.username === username);
        res.json({ ok: true });
      } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
      }
    },
  );

  app.post(
    "/api/admin/users/:username/renew",
    requireAdminToken,
    requireAdminRole,
    (req, res) => {
      try {
        if (!requireDangerConfirmation(req, res, "RENEW_USER")) return;
        const { username } = req.params;
        const { cardCode } = req.body || {};
        if (!cardCode) {
          return res.status(400).json({ ok: false, error: "请提供卡密" });
        }

        const result = userStore.renewUser(username, cardCode);
        if (!result.ok) return res.status(400).json(result);

        updateAdminSessions(
          (session) => session.username === username,
          (session) => {
            session.card = result.card;
            session.accountLimit = result.accountLimit;
          },
        );
        const data = {
          card: result.card,
          accountLimit: result.accountLimit,
          cardType: result.cardType,
        };
        adminLogger.warn("用户续费", {
          admin: req.currentUser?.username || "",
          username,
          cardCode,
          cardType: result.cardType || null,
          accountLimit: result.accountLimit ?? null,
          confirmation: "RENEW_USER",
        });
        res.json({ ok: true, data });
      } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
      }
    },
  );
}

module.exports = { registerAdminUserRoutes };
