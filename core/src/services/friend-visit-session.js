const queue = [];
let active = null;
let nextId = 1;

function drain() {
  if (active || queue.length === 0) return;
  const entry = queue.shift();
  const token = { id: nextId++, gid: entry.gid, released: false, timer: null };
  active = token;
  token.timer = setTimeout(() => releaseFriendVisitSession(token), entry.timeoutMs);
  if (typeof token.timer.unref === 'function') token.timer.unref();
  entry.resolve(token);
}

function acquireFriendVisitSession(gid, options = {}) {
  const timeoutMs = Math.max(30_000, Number(options.timeoutMs) || 2 * 60 * 1000);
  return new Promise(resolve => {
    queue.push({ gid: Number(gid) || 0, timeoutMs, resolve });
    drain();
  });
}

function releaseFriendVisitSession(token) {
  if (!token || token.released) return false;
  token.released = true;
  if (token.timer) clearTimeout(token.timer);
  if (active && active.id === token.id) active = null;
  drain();
  return true;
}

function getFriendVisitSessionSnapshot() {
  return {
    activeGid: active ? active.gid : 0,
    queued: queue.length,
  };
}

module.exports = {
  acquireFriendVisitSession,
  releaseFriendVisitSession,
  getFriendVisitSessionSnapshot,
};
