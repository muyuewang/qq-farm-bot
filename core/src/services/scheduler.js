const { createModuleLogger } = require('./logger');
const schedulerLogger = createModuleLogger('scheduler');

// 全局调度器注册表: namespace → { namespace, createdAt, timers: Map }
const schedulerRegistry = new Map();

/**
 * 将输入值转换为非负整数毫秒延迟
 * @param {number|*} raw - 原始延迟值
 * @param {number} fallbackMs - 无效输入时的默认值（默认 0）
 * @returns {number} 非负整数毫秒
 */
function toDelayMs(raw, fallbackMs = 0) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return Math.max(0, fallbackMs | 0);
  return Math.max(0, Math.floor(value));
}

/** 确保命名空间在注册表中存在，不存在则创建 */
function ensureNamespaceStore(namespace) {
  const ns = String(namespace || 'default');
  const existing = schedulerRegistry.get(ns);
  if (existing) return existing;
  const store = {
    namespace: ns,
    createdAt: Date.now(),
    timers: new Map()
  };
  schedulerRegistry.set(ns, store);
  return store;
}

/** 将任务内部数据标准化为快照对象 */
function normalizeTaskSnapshot(taskName, raw) {
  const data = raw || {};
  return {
    name: String(taskName || ''),
    kind: data.kind || 'timeout',
    delayMs: Math.max(0, Number(data.delayMs) || 0),
    createdAt: Number(data.createdAt) || 0,
    nextRunAt: Number(data.nextRunAt) || 0,
    lastRunAt: Number(data.lastRunAt) || 0,
    runCount: Number(data.runCount) || 0,
    running: !!data.running,
    preventOverlap: data.preventOverlap !== false
  };
}

/**
 * 获取调度器注册表快照，用于调试/API
 * @param {string} filterNs - 可选，仅返回特定命名空间
 */
function getSchedulerRegistrySnapshot(filterNs = '') {
  const targetNs = String(filterNs || '').trim();
  const schedulers = [];
  for (const [ns, store] of schedulerRegistry.entries()) {
    if (targetNs && ns !== targetNs) continue;
    const tasks = [];
    for (const [taskName, taskData] of store.timers.entries()) {
      tasks.push(normalizeTaskSnapshot(taskName, taskData));
    }
    tasks.sort((a, b) => a.name.localeCompare(b.name));
    schedulers.push({
      namespace: ns,
      createdAt: Number(store.createdAt) || 0,
      taskCount: tasks.length,
      tasks
    });
  }
  schedulers.sort((a, b) => a.namespace.localeCompare(b.namespace));
  return {
    generatedAt: Date.now(),
    schedulerCount: schedulers.length,
    schedulers
  };
}

/**
 * 创建调度器实例
 * @param {string} namespace - 调度器命名空间，默认 'default'
 * @returns 调度器 API 对象
 */
function createScheduler(namespace = 'default') {
  const ns = String(namespace || 'default');
  const store = ensureNamespaceStore(ns);
  const timers = store.timers;

  /** 清除单个任务 */
  function clearTask(taskName) {
    const key = String(taskName || '');
    const record = timers.get(key);
    if (!record) return false;
    timers.delete(key);
    if (record.kind === 'interval') {
      clearInterval(record.handle);
    } else {
      clearTimeout(record.handle);
    }
    return true;
  }

  /** 清除当前命名空间下所有任务 */
  function clearAll() {
    const keys = Array.from(timers.keys());
    for (const key of keys) clearTask(key);
  }

  /**
   * 设置一次性超时任务
   * @param {string} taskName - 任务名称（唯一标识）
   * @param {number} delay - 延迟毫秒
   * @param {Function} callback - 回调函数
   * @returns {Timeout} setTimeout 句柄
   */
  function setTimeoutTask(taskName, delay, callback) {
    const key = String(taskName || '');
    if (!key) throw new Error('taskName 不能为空');
    if (typeof callback !== 'function') throw new Error(`timeout 任务 ${key} 缺少回调函数`);

    clearTask(key);
    const delayMs = toDelayMs(delay, 0);
    const record = {
      kind: 'timeout',
      delayMs,
      createdAt: Date.now(),
      nextRunAt: Date.now() + delayMs,
      lastRunAt: 0,
      runCount: 0,
      running: false,
      preventOverlap: true,
      handle: null
    };

    const handle = setTimeout(async () => {
      const current = timers.get(key);
      if (!current || current.handle !== handle) return;
      current.running = true;
      current.lastRunAt = Date.now();
      current.runCount += 1;
      try {
        await callback();
      } catch (err) {
        schedulerLogger.warn(`[${ns}] timeout 任务执行失败: ${key}`, {
          module: 'scheduler',
          scope: ns,
          task: key,
          error: err && err.message ? err.message : String(err)
        });
      } finally {
        const after = timers.get(key);
        if (after && after.handle === handle) timers.delete(key);
      }
    }, delayMs);

    record.handle = handle;
    timers.set(key, record);
    return handle;
  }

  /**
   * 设置周期性间隔任务
   * @param {string} taskName - 任务名称（唯一标识）
   * @param {number} interval - 间隔毫秒
   * @param {Function} callback - 回调函数
   * @param {object} options - { preventOverlap, runImmediately }
   * @returns {Interval} setInterval 句柄
   */
  function setIntervalTask(taskName, interval, callback, options = {}) {
    const key = String(taskName || '');
    if (!key) throw new Error('taskName 不能为空');
    if (typeof callback !== 'function') throw new Error(`interval 任务 ${key} 缺少回调函数`);

    clearTask(key);
    const intervalMs = Math.max(1, toDelayMs(interval, 1000));
    const preventOverlap = options.preventOverlap !== false;
    const runImmediately = !!options.runImmediately;

    const record = {
      kind: 'interval',
      delayMs: intervalMs,
      createdAt: Date.now(),
      nextRunAt: Date.now() + intervalMs,
      lastRunAt: 0,
      runCount: 0,
      running: false,
      preventOverlap,
      handle: null
    };

    const runner = async () => {
      const current = timers.get(key);
      if (!current) return;
      if (preventOverlap && current.running) return;
      current.running = true;
      current.lastRunAt = Date.now();
      current.runCount += 1;
      try {
        await callback();
      } catch (err) {
        schedulerLogger.warn(`[${ns}] interval 任务执行失败: ${key}`, {
          module: 'scheduler',
          scope: ns,
          task: key,
          error: err && err.message ? err.message : String(err)
        });
      } finally {
        const after = timers.get(key);
        if (after) {
          after.running = false;
          after.nextRunAt = Date.now() + intervalMs;
        }
      }
    };

    // 如果设置了立即执行，在下一个微任务中触发
    if (runImmediately) {
      Promise.resolve().then(runner).catch(() => null);
    }

    const handle = setInterval(runner, intervalMs);
    record.handle = handle;
    timers.set(key, record);
    return handle;
  }

  /** 检查任务是否存在 */
  function has(taskName) {
    return timers.has(String(taskName || ''));
  }

  /** 获取当前命名空间所有任务名 */
  function getTaskNames() {
    return Array.from(timers.keys());
  }

  /** 获取当前命名空间快照 */
  function getSnapshot() {
    const snap = getSchedulerRegistrySnapshot(ns);
    return snap.schedulers[0] || {
      namespace: ns,
      createdAt: Date.now(),
      taskCount: 0,
      tasks: []
    };
  }

  return {
    setTimeoutTask,
    setIntervalTask,
    clear: clearTask,
    clearAll,
    has,
    getTaskNames,
    getSnapshot
  };
}

module.exports = {
  createScheduler,
  getSchedulerRegistrySnapshot
};
