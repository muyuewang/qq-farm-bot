function classifyGatewayDefer(health = {}) {
  if (health.healthy) return '';
  if (health.reason === 'request_stuck' || health.reason === 'heartbeat_stale' || health.reason === 'disconnected') {
    return 'gateway_unhealthy';
  }
  return 'gateway_contention';
}

function planNextSyncPacing({ cleanRounds = 0, deferredKind = '' } = {}) {
  if (deferredKind === 'gateway_unhealthy') {
    return { quota: 10, retryMs: 30 * 60 * 1000, cleanRounds: 0 };
  }
  if (deferredKind) {
    return { quota: 10, retryMs: 60 * 1000, cleanRounds: 0 };
  }
  const nextCleanRounds = Math.max(0, Number(cleanRounds) || 0) + 1;
  return {
    quota: nextCleanRounds >= 1 ? 25 : 10,
    retryMs: 3 * 60 * 1000,
    cleanRounds: nextCleanRounds,
  };
}

module.exports = { classifyGatewayDefer, planNextSyncPacing };
