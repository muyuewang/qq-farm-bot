const assert = require('node:assert/strict');
const test = require('node:test');

const {
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
} = require('../src/services/friend-maturity-plan');

test.beforeEach(() => resetFriendMaturityPlans());

test('friend summary time fields are treated as absolute unix seconds', () => {
  assert.equal(normalizeAbsoluteTime(1788191751, 1788188294), 1788191751);
  assert.equal(normalizeAbsoluteTime(300, 1788188294), 1788188594);
});

test('nearest future mature phase is selected across lands', () => {
  const now = 1788188000;
  const lands = [
    { plant: { phases: [{ phase: 6, phase_id: 19, begin_time: now + 200 }] } },
    { plant: { phases: [{ phase: 6, phase_id: 19, begin_time: now + 100 }] } },
    { plant: { phases: [{ phase: 6, phase_id: 19, begin_time: now - 100 }] } },
  ];
  assert.equal(findNearestFutureMaturity(lands, now), now + 100);
});

test('land observations drive one due visit and then back off', () => {
  const now = 1788188000;
  observeFriendLands(7, [
    { plant: { phases: [{ phase: 6, phase_id: 19, begin_time: now + 100 }] } },
  ], { nowSec: now, nowMs: 10_000, name: 'friend' });
  assert.deepEqual(claimDueFriends({ nowSec: now + 99, nowMs: 1099_000 }), []);
  assert.equal(claimDueFriends({ nowSec: now + 100, nowMs: 1100_000 })[0].gid, 7);
  assert.deepEqual(claimDueFriends({ nowSec: now + 101, nowMs: 1101_000 }), []);
});

test('summary refresh does not replace detailed-land calibration freshness', () => {
  observeFriendSummary({ gid: 8, name: 'friend', plant: {} }, 20_000, 1000);
  const selected = selectCalibrationFriends([{ gid: 8, name: 'friend' }], {
    nowMs: 20_000, staleAfterMs: 60_000, limit: 1,
  });
  assert.equal(selected[0].gid, 8);
});

test('next wake chooses maturity before low-frequency calibration', () => {
  const now = 1788188000;
  markCalibrated(100_000, 15 * 60 * 1000);
  observeFriendLands(9, [
    { plant: { phases: [{ phase: 6, phase_id: 19, begin_time: now + 60 }] } },
  ], { nowSec: now, nowMs: 100_000 });
  assert.equal(isCalibrationDue(100_001), false);
  assert.equal(getNextStealDelayMs({ nowSec: now, nowMs: 100_000 }), 60_000);
  assert.equal(getFriendMaturityPlanSnapshot().plans.length, 1);
});

test('partial land notifications do not erase an earlier cached maturity', () => {
  const now = 1788188000;
  observeFriendLands(10, [
    { plant: { phases: [{ phase: 6, phase_id: 19, begin_time: now + 60 }] } },
  ], { nowSec: now, nowMs: 100_000, source: 'visit_enter' });
  observeFriendLands(10, [
    { plant: { phases: [{ phase: 6, phase_id: 19, begin_time: now + 120 }] } },
  ], { nowSec: now, nowMs: 101_000, source: 'lands_notify' });
  assert.equal(getFriendMaturityPlanSnapshot().plans[0].matureAt, now + 60);
});
