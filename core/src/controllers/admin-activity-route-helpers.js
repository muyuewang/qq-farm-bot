function getAuthorizedAccountId(req, res, { getAccountIdFromRequest, canAccessAccount }) {
  const accountId = getAccountIdFromRequest(req);
  if (!accountId) {
    res.status(400).json({
      ok: false,
      error: "Missing x-account-id",
    });
    return null;
  }

  if (!canAccessAccount(req, accountId)) {
    res.status(403).json({
      ok: false,
      error: "无权访问此账号",
    });
    return null;
  }

  return accountId;
}

function isAccountConnected(provider, accountId) {
  const status = provider.getStatus(accountId);
  return !!(status && status.connection && status.connection.connected);
}

function requireConnectedAccount(res, provider, accountId, error) {
  if (isAccountConnected(provider, accountId)) return true;

  res.json({
    ok: false,
    error,
  });
  return false;
}

module.exports = {
  getAuthorizedAccountId,
  requireConnectedAccount,
};
