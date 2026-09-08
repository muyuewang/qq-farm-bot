const napcatLogin = require('../services/napcat-login');
const store = require('../models/store');

function owner(req) { return String(req.currentUser?.username || ''); }
function sendError(res, error) { res.status(400).json({ ok: false, error: error.message || 'NapCat 登录失败' }); }

function registerAdminNapcatLoginRoutes({ app, requireAdminToken, requireAdminRole, requireDangerConfirmation }) {
  app.get('/api/napcat-login/capability', (_req, res) => {
    const systemConfig = store.getSystemConfig() || {};
    res.json({ ok: true, data: { enabled: systemConfig.napcatLoginEnabled === true } });
  });

  app.get('/api/admin/napcat-login/status', requireAdminToken, requireAdminRole, (_req, res) => {
    try {
      const systemConfig = store.getSystemConfig() || {};
      res.json({ ok: true, data: { enabled: systemConfig.napcatLoginEnabled === true } });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/api/admin/napcat-login/status', requireAdminToken, requireAdminRole, (req, res) => {
    try {
      if (!requireDangerConfirmation(req, res, 'UPDATE_NAPCAT_LOGIN_STATUS')) return;
      const { enabled } = req.body || {};
      const current = store.getSystemConfig() || {};
      store.setSystemConfig({ ...current, napcatLoginEnabled: enabled === true });
      res.json({ ok: true, data: { enabled: enabled === true } });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/api/napcat-login/tasks', async (req, res) => {
    try { res.json({ ok: true, data: await napcatLogin.create(owner(req), { refresh: req.body?.refresh === true }) }); } catch (error) { sendError(res, error); }
  });
  app.post('/api/napcat-login/tasks/:id/status', async (req, res) => {
    try { res.json({ ok: true, data: await napcatLogin.status(req.params.id, owner(req)) }); } catch (error) { sendError(res, error); }
  });
  app.post('/api/napcat-login/tasks/:id/code', async (req, res) => {
    try { res.json({ ok: true, data: { ...await napcatLogin.code(req.params.id, owner(req)), appId: napcatLogin.APP_ID } }); } catch (error) { sendError(res, error); }
  });
  app.post('/api/napcat-login/tasks/:id/cancel', async (req, res) => {
    try { await napcatLogin.cancel(req.params.id, owner(req)); res.json({ ok: true }); } catch (error) { sendError(res, error); }
  });
}

module.exports = { registerAdminNapcatLoginRoutes };
