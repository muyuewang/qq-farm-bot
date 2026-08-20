const process = require("node:process");
const fetch = require("node-fetch");
const { version } = require("../../package.json");
const { getRuntimeConfig } = require("../config/config");
const { getSchedulerRegistrySnapshot } = require("../services/scheduler");

const CHANGELOG_URL = "https://gitee.com/xlzcandy/qq-classic-farm-update-log/raw/master/README.md";
const SCHEDULER_UNSUPPORTED_MESSAGE = "DataProvider does not support scheduler status";

function getPublicAntiResaleConfig(config) {
  return {
    enabled: config.enabled,
    title: config.title,
    author: config.author,
    qq: config.qq,
    content: config.content,
    userThreshold: config.userThreshold,
    intervalSeconds: config.intervalSeconds,
    countdownSeconds: config.countdownSeconds,
  };
}

function registerAdminPublicInfoRoutes({
  app,
  provider,
  store,
  userStore,
  getAccountIdFromRequest,
  canAccessAccount,
  sendProviderError,
}) {
  app.get("/api/ping", (req, res) => {
    res.json({
      ok: true,
      data: { ok: true, uptime: process.uptime(), version },
    });
  });

  app.get("/api/game-version", (req, res) => {
    const runtimeConfig = getRuntimeConfig();
    res.json({ ok: true, clientVersion: runtimeConfig.clientVersion });
  });

  app.get("/api/user-count", (req, res) => {
    try {
      const count = userStore.getUserCount();
      res.json({ ok: true, count });
    }
    catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get("/api/anti-resale-config", (req, res) => {
    try {
      const config = getPublicAntiResaleConfig(store.getAntiResaleConfig());
      const userCount = userStore.getUserCount();
      res.json({ ok: true, config, userCount });
    }
    catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get("/api/changelog", async (req, res) => {
    try {
      const response = await fetch(CHANGELOG_URL);
      if (!response.ok)
        return res.status(500).json({ ok: false, error: "获取更新日志失败" });

      const data = await response.text();
      res.json({ ok: true, data });
    }
    catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get("/api/auth/validate", (req, res) => {
    res.json({ ok: true, data: { valid: true } });
  });

  app.get("/api/scheduler", async (req, res) => {
    try {
      const accountId = getAccountIdFromRequest(req);
      if (accountId && !canAccessAccount(req, accountId))
        return res.status(403).json({ ok: false, error: "无权访问此账号" });

      if (provider && typeof provider.getSchedulerStatus === "function") {
        const status = await provider.getSchedulerStatus(accountId);
        return res.json({ ok: true, data: status });
      }

      return res.json({
        ok: true,
        data: {
          runtime: getSchedulerRegistrySnapshot(),
          worker: null,
          workerError: SCHEDULER_UNSUPPORTED_MESSAGE,
        },
      });
    }
    catch (error) {
      return sendProviderError(res, error);
    }
  });
}

module.exports = { registerAdminPublicInfoRoutes };
