const fs = require('node:fs');
const { getDataFile } = require('../config/runtime-paths');
const { scanActivityUpdates } = require('./activity-update-scanner');

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;
const STATE_FILE = getDataFile('activity-update-report.json');

let timer = null;
let running = false;
let report = null;
let knownActivityIds = [];
let intervalMs = DEFAULT_INTERVAL_MS;
let nextScanAt = 0;
let onlineScanner = null;
let localScanEnabled = false;

function emptyLocalReport() {
  return {
    scannedAt: Date.now(),
    appId: '1112386029',
    source: null,
    candidateCount: 0,
    incompleteCandidates: [],
    detectedActivityIds: [],
    unknownActivityIds: [],
    caches: [],
    warnings: [],
    localScanEnabled: false,
  };
}

function readSavedReport() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeSavedReport(value) {
  try {
    fs.mkdirSync(require('node:path').dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, `${JSON.stringify(value, null, 2)}\n`);
  } catch (error) {
    console.warn(`[活动更新] 保存分析结果失败: ${error.message}`);
  }
}

function analyzeReport(scanned, previous, online = null) {
  // 正式候选必须得到在线接口确认。本机源码/缓存仅作为辅助证据展示。
  const candidateIds = [...new Set(online?.unknownActivityIds || [])]
    .sort((a, b) => b - a);
  const groups = new Map();
  for (const id of candidateIds) {
    const date = String(id).slice(0, 8);
    const items = groups.get(date) || [];
    items.push(id);
    groups.set(date, items);
  }
  const previousVersion = previous?.source?.version || '';
  return {
    ...scanned,
    status: !scanned.source && !online?.available
      ? 'unavailable'
      : candidateIds.length ? 'update-found' : 'up-to-date',
    unknownActivityIds: candidateIds,
    online,
    localEvidence: {
      enabled: scanned.localScanEnabled === true,
      unknownActivityIds: scanned.unknownActivityIds || [],
      detectedActivityIds: scanned.detectedActivityIds || [],
      source: scanned.source || null,
      caches: scanned.caches || [],
      warnings: scanned.warnings || [],
    },
    sourceChanged: !!previousVersion && previousVersion !== scanned.source?.version,
    previousSourceVersion: previousVersion || null,
    analysis: {
      candidateGroups: [...groups.entries()].map(([date, ids]) => ({ date, ids })),
      requiresProtocolSample: candidateIds.length > 0,
      safeToAutoApply: false,
      summary: candidateIds.length
        ? `发现 ${candidateIds.length} 个候选活动 ID，已自动读取在线活动列表和只读活动分组`
        : online?.available
          ? '在线活动列表未发现尚未登记的新活动'
          : '在线分析等待已连接账号',
    },
  };
}

async function runActivityUpdateScan() {
  if (running) return report;
  running = true;
  try {
    const previous = report || readSavedReport();
    const scanned = localScanEnabled
      ? { ...scanActivityUpdates({ knownActivityIds }), localScanEnabled: true }
      : emptyLocalReport();
    let online = null;
    if (typeof onlineScanner === 'function') {
      try {
        online = await onlineScanner(knownActivityIds, scanned);
      } catch (error) {
        online = { available: false, error: error.message || String(error), activities: [], groups: [], unknownActivityIds: [] };
      }
    }
    report = analyzeReport(scanned, previous, online);
    writeSavedReport(report);
    return report;
  } finally {
    running = false;
    nextScanAt = Date.now() + intervalMs;
  }
}

function scheduleNextScan() {
  if (timer) clearTimeout(timer);
  nextScanAt = Date.now() + intervalMs;
  timer = setTimeout(async () => {
    try {
      await runActivityUpdateScan();
    } catch (error) {
      console.warn(`[活动更新] 定时分析失败: ${error.message}`);
    } finally {
      scheduleNextScan();
    }
  }, intervalMs);
  timer.unref?.();
}

function startActivityUpdateMonitor(options = {}) {
  knownActivityIds = (options.knownActivityIds || []).map(Number);
  onlineScanner = typeof options.onlineScanner === 'function' ? options.onlineScanner : null;
  localScanEnabled = options.localScanEnabled === true
    || String(process.env.ACTIVITY_LOCAL_SCAN_ENABLED || '').toLowerCase() === 'true';
  intervalMs = Math.max(MIN_INTERVAL_MS, Number(options.intervalMs) || Number(process.env.ACTIVITY_UPDATE_INTERVAL_MS) || DEFAULT_INTERVAL_MS);
  report = report || readSavedReport();
  scheduleNextScan();
  setImmediate(() => runActivityUpdateScan().catch(error => {
    console.warn(`[活动更新] 初始分析失败: ${error.message}`);
  }));
}

function getActivityUpdateState() {
  return {
    running,
    intervalMs,
    nextScanAt,
    report: report || readSavedReport(),
  };
}

module.exports = {
  DEFAULT_INTERVAL_MS,
  analyzeReport,
  getActivityUpdateState,
  runActivityUpdateScan,
  startActivityUpdateMonitor,
};
