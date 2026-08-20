const crypto = require('node:crypto');

function createAdminSessionManager({ logger, getIo }) {
  const adminTokens = new Set();
  const adminSessions = new Map();

  function generateAdminToken() {
    return crypto.randomBytes(24).toString('hex');
  }

  function sendUnauthorized(res) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized',
    });
  }

  function logAdminSessionRejected(reason, username) {
    logger.warn('admin session rejected', {
      reason,
      username,
    });
  }

  function logAdminSessionEvent(event, reason, username) {
    logger.info(event, {
      reason,
      username,
    });
  }

  function createAdminSession(user) {
    const token = generateAdminToken();
    adminTokens.add(token);
    adminSessions.set(token, user);
    return token;
  }

  function invalidateAdminSession(token) {
    adminTokens.delete(token);
    adminSessions.delete(token);
  }

  function disconnectAdminTokenSockets(token) {
    const io = typeof getIo === 'function' ? getIo() : null;
    if (!io) return;
    for (const socket of io.sockets.sockets.values()) {
      String(socket.data.adminToken || '') === String(token)
        && socket.disconnect(true);
    }
  }

  function invalidateAdminSessionAndDisconnect(token) {
    invalidateAdminSession(token);
    disconnectAdminTokenSockets(token);
  }

  function invalidateAdminSessions(predicate) {
    for (const [token, session] of adminSessions.entries()) {
      if (predicate(session, token))
        invalidateAdminSessionAndDisconnect(token);
    }
  }

  function updateAdminSessions(predicate, updateSession) {
    for (const [token, session] of adminSessions.entries()) {
      if (predicate(session, token)) {
        updateSession(session, token);
        adminSessions.set(token, session);
      }
    }
  }

  function getAdminSessionRejection(currentUser) {
    if (
      !currentUser
      || currentUser.role === 'admin'
      || currentUser.role === 'super_admin'
      || !currentUser.card
    ) {
      return null;
    }
    if (currentUser.card.enabled === false) {
      return {
        reason: 'banned',
        error: '账号已被封禁，请联系管理员',
      };
    }
    if (
      currentUser.card.expiresAt
      && currentUser.card.expiresAt < Date.now()
    ) {
      return {
        reason: 'expired',
        error: '账号已过期，请续费后重新登录',
      };
    }
    return null;
  }

  function requireAdminToken(req, res, next) {
    const token = req.headers['x-admin-token'];
    if (!token || !adminTokens.has(token))
      return sendUnauthorized(res);
    req.adminToken = token;
    req.currentUser = adminSessions.get(token);
    const rejection = getAdminSessionRejection(req.currentUser);
    if (rejection) {
      logAdminSessionRejected(rejection.reason, req.currentUser.username);
      invalidateAdminSession(token);
      return res.status(403).json({
        ok: false,
        error: rejection.error,
      });
    }
    next();
  }

  function cleanupInvalidAdminSessions() {
    const now = Date.now();
    const expiredSessions = [];
    for (const [token, session] of adminSessions.entries()) {
      if (session.role === 'admin' || session.role === 'super_admin')
        continue;
      if (session.card && session.card.enabled === false) {
        logAdminSessionEvent(
          'admin session cleanup queued',
          'banned',
          session.username,
        );
        expiredSessions.push({
          token,
          username: session.username,
          reason: 'banned',
        });
        continue;
      }
      if (
        session.card
        && session.card.expiresAt
        && session.card.expiresAt < now
      ) {
        logAdminSessionEvent(
          'admin session cleanup queued',
          'expired',
          session.username,
        );
        expiredSessions.push({
          token,
          username: session.username,
          reason: 'expired',
        });
      }
    }
    for (const { token, username, reason } of expiredSessions) {
      invalidateAdminSessionAndDisconnect(token);
      logAdminSessionEvent('admin session force logout', reason, username);
    }
  }

  function hasToken(token) {
    return adminTokens.has(token);
  }

  function getSession(token) {
    return adminSessions.get(token) || null;
  }

  return {
    cleanupInvalidAdminSessions,
    createAdminSession,
    getSession,
    hasToken,
    invalidateAdminSessionAndDisconnect,
    invalidateAdminSessions,
    requireAdminToken,
    updateAdminSessions,
  };
}

module.exports = {
  createAdminSessionManager,
};
