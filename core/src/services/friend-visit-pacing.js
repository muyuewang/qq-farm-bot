const DEFAULT_MAX_VISITS_PER_RUN = 12;
const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000;

const recentVisits = new Map();
const cursors = new Map();

function stateKey(accountId, mode) {
  return `${String(accountId || 'default')}:${String(mode || 'friend')}`;
}

function pruneRecent(map, now, cooldownMs) {
  for (const [gid, visitedAt] of map.entries()) {
    if (now - visitedAt >= cooldownMs) map.delete(gid);
  }
}

function selectFriendVisitBatch(candidates, options = {}) {
  const list = Array.isArray(candidates) ? candidates.filter(item => Number(item && item.gid) > 0) : [];
  if (list.length === 0) return [];

  const now = Number(options.now) || Date.now();
  const maxVisits = Math.max(1, Math.min(Number(options.maxVisits) || DEFAULT_MAX_VISITS_PER_RUN, 30));
  const cooldownMs = Math.max(0, Number(options.cooldownMs) || DEFAULT_COOLDOWN_MS);
  const key = stateKey(options.accountId, options.mode);
  const recent = recentVisits.get(key) || new Map();
  pruneRecent(recent, now, cooldownMs);

  const cursor = Math.max(0, Number(cursors.get(key)) || 0) % list.length;
  const rotated = [...list.slice(cursor), ...list.slice(0, cursor)];
  let eligible = rotated.filter(item => !recent.has(Number(item.gid)));
  if (eligible.length === 0) eligible = rotated;

  const selected = eligible.slice(0, maxVisits);
  for (const item of selected) recent.set(Number(item.gid), now);
  recentVisits.set(key, recent);
  cursors.set(key, (cursor + Math.max(1, selected.length)) % list.length);
  return selected;
}

function resetFriendVisitPacing() {
  recentVisits.clear();
  cursors.clear();
}

module.exports = {
  DEFAULT_MAX_VISITS_PER_RUN,
  DEFAULT_COOLDOWN_MS,
  selectFriendVisitBatch,
  resetFriendVisitPacing,
};
