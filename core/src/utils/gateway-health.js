function getOldestPendingAgeMs(startedAtValues, now = Date.now()) {
  const values = Array.from(startedAtValues || []).filter(Number.isFinite);
  if (values.length === 0) return 0;
  return Math.max(0, now - Math.min(...values));
}

function evaluateGatewayHealth(input = {}) {
  const connected = input.connected !== false;
  const heartbeatMisses = Math.max(0, Number(input.heartbeatMisses) || 0);
  const oldestPendingAgeMs = Math.max(0, Number(input.oldestPendingAgeMs) || 0);
  const pendingLimitMs = Math.max(1000, Number(input.pendingLimitMs) || 5000);

  if (!connected) return { healthy: false, reason: 'disconnected' };
  // 判定口径对齐官方客户端保活节奏：心跳按 25s 周期发送，「距上次回包的时长」
  // 在周期后段必然超过任何小于间隔的阈值，不能用 heartbeatAgeMs 判定健康；
  // 只有心跳真正漏拍（请求失败）才视为失联。
  if (heartbeatMisses > 0) return { healthy: false, reason: 'heartbeat_stale' };
  if (oldestPendingAgeMs >= pendingLimitMs) return { healthy: false, reason: 'request_stuck' };
  return { healthy: true, reason: 'ok' };
}

function nextBusinessBackoffMs(previousMs = 0, minimumMs = 30000, maximumMs = 60000) {
  const min = Math.max(1000, Number(minimumMs) || 30000);
  const max = Math.max(min, Number(maximumMs) || 60000);
  const previous = Math.max(0, Number(previousMs) || 0);
  return previous > 0 ? Math.min(max, previous * 2) : min;
}

module.exports = { getOldestPendingAgeMs, evaluateGatewayHealth, nextBusinessBackoffMs };
