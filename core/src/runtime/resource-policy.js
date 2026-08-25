const process = require('node:process');
const { monitorEventLoopDelay } = require('node:perf_hooks');
const os = require('node:os');

function envBool(name, fallback = false) {
  const value = String(process.env[name] || '').trim().toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function envInt(name, fallback, minimum = 0) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.max(minimum, Math.floor(value)) : fallback;
}

const detectedCpuCount = typeof os.availableParallelism === 'function'
  ? os.availableParallelism()
  : os.cpus().length;
const detectedMemoryMb = Math.round(os.totalmem() / 1024 / 1024);
const modeOverride = String(process.env.FARM_LOW_MEMORY_MODE || '').trim();
const lowMemoryMode = modeOverride
  ? envBool('FARM_LOW_MEMORY_MODE', false)
  : detectedCpuCount <= 2 || detectedMemoryMb <= 2560;
const resourcePolicy = Object.freeze({
  lowMemoryMode,
  selection: modeOverride ? 'environment' : 'automatic',
  detectedCpuCount,
  detectedMemoryMb,
  maxRunningAccounts: envInt('FARM_MAX_RUNNING_ACCOUNTS', 0, 0),
  workerStartConcurrency: envInt('FARM_WORKER_START_CONCURRENCY', lowMemoryMode ? 1 : 2, 1),
  workerStartDelayMs: envInt('FARM_WORKER_START_DELAY_MS', lowMemoryMode ? 1500 : 300, 0),
  maxRssMb: envInt('FARM_MAX_RSS_MB', lowMemoryMode ? Math.floor(detectedMemoryMb * 0.8) : 0, 0),
  globalTaskConcurrency: envInt('FARM_GLOBAL_TASK_CONCURRENCY', lowMemoryMode ? 1 : 0, 0),
  statusSyncIntervalMs: envInt('FARM_STATUS_SYNC_INTERVAL_MS', lowMemoryMode ? 30000 : 10000, 1000),
  statusFullSyncIntervalMs: envInt('FARM_STATUS_FULL_SYNC_INTERVAL_MS', lowMemoryMode ? 120000 : 60000, 5000),
  offlinePollMinMs: envInt('FARM_OFFLINE_POLL_MIN_MS', lowMemoryMode ? 5000 : 2000, 500),
  offlinePollMaxMs: envInt('FARM_OFFLINE_POLL_MAX_MS', lowMemoryMode ? 30000 : 10000, 1000),
});

function createResourceMonitor() {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  return {
    snapshot() {
      const memory = process.memoryUsage();
      const toMb = value => Math.round((Number(value) || 0) / 1024 / 1024 * 10) / 10;
      return {
        pid: process.pid,
        uptimeSec: Math.round(process.uptime()),
        memoryMb: {
          rss: toMb(memory.rss),
          heapUsed: toMb(memory.heapUsed),
          heapTotal: toMb(memory.heapTotal),
          external: toMb(memory.external),
          arrayBuffers: toMb(memory.arrayBuffers),
        },
        eventLoopLagMs: {
          mean: Math.round((Number(histogram.mean) || 0) / 1e6 * 10) / 10,
          max: Math.round((Number(histogram.max) || 0) / 1e6 * 10) / 10,
          p99: Math.round((Number(histogram.percentile(99)) || 0) / 1e6 * 10) / 10,
        },
      };
    },
    dispose() { histogram.disable(); },
  };
}

module.exports = { resourcePolicy, createResourceMonitor };
