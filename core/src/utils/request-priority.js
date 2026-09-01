const { AsyncLocalStorage } = require('node:async_hooks');

const PRIORITIES = Object.freeze({
  critical: 0,
  foreground: 1,
  farm: 2,
  friend: 3,
  background: 4,
});

const priorityContext = new AsyncLocalStorage();

function normalizePriority(value) {
  const key = String(value || '').toLowerCase();
  return Object.hasOwn(PRIORITIES, key) ? key : 'foreground';
}

function runWithRequestPriority(priority, fn) {
  return priorityContext.run(normalizePriority(priority), fn);
}

function getRequestPriority(fallback = 'foreground') {
  return normalizePriority(priorityContext.getStore() || fallback);
}

function createRequestGate(options = {}) {
  const maxActive = Math.max(1, Number(options.maxActive) || 8);
  const maxQueued = Math.max(1, Number(options.maxQueued) || 100);
  let active = 0;
  let order = 0;
  const queue = [];

  function drain() {
    queue.sort((a, b) => PRIORITIES[a.priority] - PRIORITIES[b.priority] || a.order - b.order);
    while (active < maxActive && queue.length > 0) {
      const entry = queue.shift();
      active++;
      let released = false;
      entry.resolve(() => {
        if (released) return;
        released = true;
        active = Math.max(0, active - 1);
        drain();
      });
    }
  }

  function acquire(priority) {
    if (queue.length >= maxQueued) {
      return Promise.reject(new Error(`请求调度队列已满: queued=${queue.length}`));
    }
    return new Promise((resolve) => {
      queue.push({ priority: normalizePriority(priority), order: order++, resolve });
      drain();
    });
  }

  function snapshot() {
    return {
      active,
      queued: queue.length,
      byPriority: queue.reduce((result, item) => {
        result[item.priority] = (result[item.priority] || 0) + 1;
        return result;
      }, {}),
    };
  }

  return { acquire, snapshot };
}

module.exports = {
  PRIORITIES,
  normalizePriority,
  runWithRequestPriority,
  getRequestPriority,
  createRequestGate,
};
