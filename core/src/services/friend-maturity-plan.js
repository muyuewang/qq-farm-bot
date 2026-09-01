const { toNum, toTimeSec, getServerTimeSec } = require('../utils/utils');

const DEFAULT_CALIBRATION_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_STALE_AFTER_MS = 6 * 60 * 60 * 1000;
const DEFAULT_RECHECK_AFTER_DUE_MS = 5 * 60 * 1000;

const plans = new Map();
let nextCalibrationAt = 0;
let calibrationCursor = 0;

function normalizeAbsoluteTime(value, nowSec = getServerTimeSec()) {
  const raw = toTimeSec(value);
  if (raw <= 0) return 0;
  return raw > 1_000_000_000 ? raw : nowSec + raw;
}

function findNearestFutureMaturity(lands, nowSec = getServerTimeSec()) {
  let nearest = 0;
  for (const land of Array.isArray(lands) ? lands : []) {
    const phases = land && land.plant && Array.isArray(land.plant.phases)
      ? land.plant.phases : [];
    for (const phase of phases) {
      const phaseCode = toNum(phase && phase.phase);
      const phaseId = toNum(phase && phase.phase_id);
      if (phaseCode !== 6 && phaseId !== 19) continue;
      const matureAt = normalizeAbsoluteTime(phase.begin_time, nowSec);
      if (matureAt <= nowSec) continue;
      if (!nearest || matureAt < nearest) nearest = matureAt;
    }
  }
  return nearest;
}

function updatePlan(gid, patch) {
  const numericGid = toNum(gid);
  if (!numericGid) return null;
  const current = plans.get(numericGid) || {
    gid: numericGid, name: '', matureAt: 0, summaryObservedAt: 0, landsObservedAt: 0,
  };
  const next = { ...current, ...patch, gid: numericGid };
  plans.set(numericGid, next);
  return next;
}

function observeFriendSummary(friend, nowMs = Date.now(), nowSec = getServerTimeSec()) {
  const gid = toNum(friend && friend.gid);
  if (!gid) return null;
  const plant = friend && friend.plant || {};
  const matureAt = normalizeAbsoluteTime(plant.ripe_time_sec, nowSec);
  return updatePlan(gid, {
    name: friend.remark || friend.name || `GID:${gid}`,
    matureAt: matureAt > nowSec ? matureAt : (plans.get(gid)?.matureAt || 0),
    summaryObservedAt: nowMs,
    source: matureAt > nowSec ? 'summary' : (plans.get(gid)?.source || 'summary'),
  });
}

function observeFriendLands(gid, lands, options = {}) {
  const nowMs = Number(options.nowMs) || Date.now();
  const nowSec = Number(options.nowSec) || getServerTimeSec();
  const source = options.source || 'lands';
  const observedMatureAt = findNearestFutureMaturity(lands, nowSec);
  const currentMatureAt = plans.get(toNum(gid))?.matureAt || 0;
  const partial = source === 'lands_notify' || source === 'harvest_reply';
  const matureAt = partial && currentMatureAt > nowSec
    ? (observedMatureAt > nowSec ? Math.min(currentMatureAt, observedMatureAt) : currentMatureAt)
    : observedMatureAt;
  return updatePlan(gid, {
    name: options.name || plans.get(toNum(gid))?.name || `GID:${toNum(gid)}`,
    matureAt,
    landsObservedAt: nowMs,
    source,
  });
}

function claimDueFriends(options = {}) {
  const nowSec = Number(options.nowSec) || getServerTimeSec();
  const limit = Math.max(1, Math.min(Number(options.limit) || 12, 30));
  const due = [...plans.values()]
    .filter(plan => plan.matureAt > 0 && plan.matureAt <= nowSec)
    .sort((a, b) => a.matureAt - b.matureAt || a.gid - b.gid)
    .slice(0, limit);
  for (const plan of due) {
    updatePlan(plan.gid, {
      matureAt: nowSec + Math.ceil(DEFAULT_RECHECK_AFTER_DUE_MS / 1000),
      source: 'due-recheck',
    });
  }
  return due.map(plan => ({ gid: plan.gid, name: plan.name || `GID:${plan.gid}` }));
}

function isCalibrationDue(nowMs = Date.now()) {
  return !nextCalibrationAt || nowMs >= nextCalibrationAt;
}

function markCalibrated(nowMs = Date.now(), intervalMs = DEFAULT_CALIBRATION_INTERVAL_MS) {
  nextCalibrationAt = nowMs + Math.max(60_000, Number(intervalMs) || DEFAULT_CALIBRATION_INTERVAL_MS);
}

function selectCalibrationFriends(friends, options = {}) {
  const nowMs = Number(options.nowMs) || Date.now();
  const staleAfterMs = Math.max(60_000, Number(options.staleAfterMs) || DEFAULT_STALE_AFTER_MS);
  const limit = Math.max(1, Math.min(Number(options.limit) || 3, 10));
  const list = (Array.isArray(friends) ? friends : [])
    .filter(friend => toNum(friend && friend.gid) > 0)
    .filter(friend => {
      const plan = plans.get(toNum(friend.gid));
      return !plan || !plan.landsObservedAt || nowMs - plan.landsObservedAt >= staleAfterMs;
    });
  if (list.length === 0) return [];
  const cursor = calibrationCursor % list.length;
  const rotated = [...list.slice(cursor), ...list.slice(0, cursor)];
  const selected = rotated.slice(0, limit);
  calibrationCursor = (cursor + selected.length) % list.length;
  return selected;
}

function getNextStealDelayMs(options = {}) {
  const nowMs = Number(options.nowMs) || Date.now();
  const nowSec = Number(options.nowSec) || getServerTimeSec();
  const fallbackMs = Math.max(60_000, Number(options.fallbackMs) || DEFAULT_CALIBRATION_INTERVAL_MS);
  let wakeAt = nextCalibrationAt || nowMs;
  for (const plan of plans.values()) {
    if (plan.matureAt <= 0) continue;
    const matureMs = nowMs + Math.max(0, plan.matureAt - nowSec) * 1000;
    if (!wakeAt || matureMs < wakeAt) wakeAt = matureMs;
  }
  return Math.max(1_000, Math.min(fallbackMs, wakeAt - nowMs));
}

function resetFriendMaturityPlans() {
  plans.clear();
  nextCalibrationAt = 0;
  calibrationCursor = 0;
}

function getFriendMaturityPlanSnapshot() {
  return { plans: [...plans.values()].map(item => ({ ...item })), nextCalibrationAt };
}

module.exports = {
  DEFAULT_CALIBRATION_INTERVAL_MS,
  normalizeAbsoluteTime,
  findNearestFutureMaturity,
  observeFriendSummary,
  observeFriendLands,
  claimDueFriends,
  isCalibrationDue,
  markCalibrated,
  selectCalibrationFriends,
  getNextStealDelayMs,
  resetFriendMaturityPlans,
  getFriendMaturityPlanSnapshot,
};
