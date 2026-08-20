/**
 * 限流器服务 - 请求队列与令牌桶实现
 *
 * 功能：
 * - TokenBucket：令牌桶限流算法
 * - PriorityQueue：优先级请求队列
 * - RequestQueue：带限流的异步请求队列
 * - BatchOperationOptimizer：批量农场/好友操作优化
 */
const { createModuleLogger } = require('./logger');

const logger = createModuleLogger('rate-limiter');

// ---- 默认配置 ----

const DEFAULT_CONFIG = {
  maxConcurrent: 3,      // 最大并发数
  minInterval: 100,      // 最小请求间隔（ms）
  maxRetries: 2,         // 最大重试次数
  retryDelay: 500,       // 重试延迟（ms）
  enableBurst: false,    // 是否启用突发
  burstSize: 5,          // 突发大小
};

// ---- 工具 ----

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- 令牌桶 ----

class TokenBucket {
  /**
   * @param {object} options
   * @param {number} options.capacity - 桶容量（最大并发数）
   * @param {number} options.refillRate - 令牌补充速率（ms/个）
   * @param {number} options.maxWait - 最大等待时间（ms）
   */
  constructor(options = {}) {
    this.capacity = options.capacity || DEFAULT_CONFIG.maxConcurrent;
    this.tokens = this.capacity;
    this.refillRate = options.refillRate || 100; // 100ms 补充一个令牌
    this.lastRefill = Date.now();
    this.maxWait = options.maxWait || 60000; // 最大等待 60 秒
  }

  refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = (elapsed / this.refillRate) * this.capacity;
    this.tokens = Math.min(this.capacity, this.tokens + newTokens);
    this.lastRefill = now;
  }

  /**
   * 获取令牌
   * @param {number} count - 需要的令牌数，默认 1
   */
  async acquire(count = 1) {
    const startedAt = Date.now();
    while (this.tokens < count) {
      if (Date.now() - startedAt > this.maxWait) {
        throw new Error('请求等待超时');
      }
      this.refill();
      await sleep(50);
    }
    this.tokens -= count;
    return true;
  }

  /**
   * 释放令牌
   */
  release(count = 1) {
    this.tokens = Math.min(this.capacity, this.tokens + count);
  }
}

// ---- 优先级队列 ----

class PriorityQueue {
  constructor() {
    this.queue = [];
  }

  /**
   * 入队（数值越大优先级越高）
   */
  enqueue(item, priority = 0) {
    const entry = { item, priority, addedAt: Date.now() };
    const idx = this.queue.findIndex((e) => e.priority < priority);
    if (idx === -1) {
      this.queue.push(entry);
    } else {
      this.queue.splice(idx, 0, entry);
    }
  }

  dequeue() {
    return this.queue.shift()?.item;
  }

  peek() {
    return this.queue[0]?.item;
  }

  size() {
    return this.queue.length;
  }

  clear() {
    this.queue = [];
  }
}

// ---- 请求队列 ----

class RequestQueue {
  /**
   * @param {object} options - 合并 DEFAULT_CONFIG
   */
  constructor(options = {}) {
    this.bucket = new TokenBucket({
      capacity: options.maxConcurrent || DEFAULT_CONFIG.maxConcurrent,
      refillRate: options.minInterval || DEFAULT_CONFIG.minInterval,
    });
    this.queue = new PriorityQueue();
    this.processing = false;
    this.config = { ...DEFAULT_CONFIG, ...options };
  }

  /**
   * 添加请求到队列
   * @param {Function} fn - 要执行的异步函数
   * @param {object} options - { priority, retries, label }
   */
  async addRequest(fn, options = {}) {
    const { priority = 0, retries = DEFAULT_CONFIG.maxRetries, label = 'request' } = options;

    return new Promise((resolve, reject) => {
      const task = { fn, resolve, reject, retries, label, attempts: 0 };
      this.queue.enqueue(task, -priority); // 高 priority 先出队
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.size() === 0) return;

    this.processing = true;

    while (this.queue.size() > 0) {
      const task = this.queue.dequeue();
      if (!task) break;

      try {
        await this.bucket.acquire();
        const result = await this.executeTask(task);
        this.bucket.release();
        task.resolve(result);
      } catch (err) {
        this.bucket.release();
        if (task.attempts < task.retries) {
          task.attempts++;
          logger.info(
            `[${task.label}] 请求失败，${task.retries - task.attempts + 1}次重试中...`,
            { error: err.message }
          );
          await sleep(DEFAULT_CONFIG.retryDelay * task.attempts);
          this.queue.enqueue(task, -(task.priority || 0));
        } else {
          task.reject(err);
        }
      }
    }

    this.processing = false;
  }

  async executeTask(task) {
    return await task.fn();
  }

  setConcurrency(n) {
    this.bucket.capacity = Math.max(1, Math.min(n, 20));
  }

  getStatus() {
    return {
      queueSize: this.queue.size(),
      availableTokens: Math.floor(this.bucket.tokens),
      capacity: this.bucket.capacity,
    };
  }

  clear() {
    this.queue.clear();
  }
}

// ---- 批量操作优化器 ----

class BatchOperationOptimizer {
  constructor(options = {}) {
    this.queue = new RequestQueue(options);
  }

  /**
   * 批量农场操作（除草/除虫/浇水合并）
   */
  async batchFarmOperations(operations) {
    const results = [];
    const grouped = { weed: [], bug: [], water: [] };

    for (const op of operations) {
      if (grouped[op.type]) grouped[op.type].push(op);
    }

    const promises = [];

    if (grouped.weed.length > 0) {
      promises.push(
        this.queue.addRequest(async () => {
          return await grouped.weed[0].fn(grouped.weed.map((o) => o.landId));
        }, { priority: 2, label: 'batch_weed' })
      );
    }

    if (grouped.bug.length > 0) {
      promises.push(
        this.queue.addRequest(async () => {
          return await grouped.bug[0].fn(grouped.bug.map((o) => o.landId));
        }, { priority: 2, label: 'batch_bug' })
      );
    }

    if (grouped.water.length > 0) {
      promises.push(
        this.queue.addRequest(async () => {
          return await grouped.water[0].fn(grouped.water.map((o) => o.landId));
        }, { priority: 2, label: 'batch_water' })
      );
    }

    const settled = await Promise.allSettled(promises);

    for (const entry of settled) {
      if (entry.status === 'fulfilled') {
        results.push({ success: true, data: entry.value });
      } else {
        results.push({ success: false, error: entry.reason.message });
      }
    }

    return results;
  }

  /**
   * 批量好友操作
   */
  async batchFriendOperations(operations, options = {}) {
    const { maxConcurrent = 3 } = options;
    this.queue.setConcurrency(maxConcurrent);

    const results = [];
    for (const op of operations) {
      const result = await this.queue.addRequest(
        async () => await op.fn(op.params),
        { priority: op.priority || 0, label: op.label || 'friend_op' }
      );
      results.push({ friendId: op.friendId, success: true, data: result });
    }
    return results;
  }

  getStatus() {
    return this.queue.getStatus();
  }
}

module.exports = {
  RequestQueue,
  TokenBucket,
  PriorityQueue,
  BatchOperationOptimizer,
  DEFAULT_CONFIG,
};
