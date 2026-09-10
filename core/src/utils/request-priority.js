const { AsyncLocalStorage } = require('node:async_hooks');

const PRIORITIES = Object.freeze({
  critical: 0,
  foreground: 1,
  farm: 2,
  friend: 3,
  background: 4,
});

const REQUEST_CLASSES = Object.freeze(['critical', 'foreground', 'farm', 'friend', 'background']);

// 每个班次的在途上限与排队配额，避免单一业务占满网关。
const CLASS_LIMITS = Object.freeze({
  critical: { maxPending: 8, maxQueued: 32 },
  foreground: { maxPending: 6, maxQueued: 64 },
  farm: { maxPending: 4, maxQueued: 48 },
  friend: { maxPending: 3, maxQueued: 48 },
  background: { maxPending: 2, maxQueued: 32 },
});

const CLASS_MARKERS = Object.freeze({
  critical: '[C]',
  foreground: '[F]',
  farm: '[A]',
  friend: '[D]',
  background: '[B]',
});

const priorityContext = new AsyncLocalStorage();

function normalizePriority(value) {
  const key = String(value || '').toLowerCase();
  return Object.hasOwn(PRIORITIES, key) ? key : 'foreground';
}

function normalizeRequestClass(value) {
  const key = String(value || '').toLowerCase();
  if (Object.hasOwn(CLASS_LIMITS, key)) return key;
  if (key === 'high') return 'critical';
  return '';
}

function runWithRequestPriority(priority, fn) {
  return priorityContext.run(normalizePriority(priority), fn);
}

function getRequestPriority(fallback = 'foreground') {
  return normalizePriority(priorityContext.getStore() || fallback);
}

function classOf(request) {
  return normalizeRequestClass(request && (request.requestClass || request.priority)) || 'foreground';
}

/**
 * 班次由「显式 requestClass > criticalLane > priority 兼容映射 > 调度器环境班次 > 前台」决定。
 */
function resolveRequestClass(options = {}, fallbackPriority = 'foreground') {
  const explicit = normalizeRequestClass(options.requestClass);
  if (explicit) return explicit;
  if (options.criticalLane === 'heartbeat' || options.criticalLane === 'ace') return 'critical';
  const fromPriority = normalizeRequestClass(options.priority)
    || normalizeRequestClass(fallbackPriority);
  return fromPriority || 'foreground';
}

function maxQueuedForClass(requestClass) {
  const key = normalizeRequestClass(requestClass) || 'foreground';
  return CLASS_LIMITS[key].maxQueued;
}

function countByClass(list, requestClass) {
  const key = normalizeRequestClass(requestClass);
  if (!key || !Array.isArray(list)) return 0;
  let count = 0;
  for (const item of list) {
    if (classOf(item) === key) count += 1;
  }
  return count;
}

function isClassQueueFull(queue, requestClass) {
  const key = normalizeRequestClass(requestClass) || 'foreground';
  return countByClass(queue, key) >= CLASS_LIMITS[key].maxQueued;
}

/**
 * 选择下一个可发送请求：先按班次优先级，再按入队时间（老的优先）。
 * 在途已达上限的班次本轮跳过。
 */
function selectDispatchIndex(queue, pendingList, now = Date.now()) {
  if (!Array.isArray(queue) || queue.length === 0) return -1;

  const pendingByClass = Object.create(null);
  for (const key of REQUEST_CLASSES) {
    pendingByClass[key] = countByClass(pendingList, key);
  }

  let bestIndex = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = 0; index < queue.length; index += 1) {
    const request = queue[index];
    if (!request || request.settled) continue;
    const key = classOf(request);
    if (pendingByClass[key] >= CLASS_LIMITS[key].maxPending) continue;
    const classRank = REQUEST_CLASSES.indexOf(key);
    const ageMs = Math.max(0, now - Number(request.enqueuedAt || now));
    // classRank 越小越优先；同班次入队越早 ageMs 越大，score 越小
    const score = classRank * 1e15 - ageMs;
    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function describeRequestClassMarker(request) {
  return CLASS_MARKERS[classOf(request)] || CLASS_MARKERS.foreground;
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
  REQUEST_CLASSES,
  normalizePriority,
  normalizeRequestClass,
  runWithRequestPriority,
  getRequestPriority,
  createRequestGate,
  resolveRequestClass,
  selectDispatchIndex,
  isClassQueueFull,
  maxQueuedForClass,
  describeRequestClassMarker,
  classOf,
};
