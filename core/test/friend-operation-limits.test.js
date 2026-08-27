const assert = require('node:assert/strict');
const test = require('node:test');

const {
  PUT_BUG_OPERATION_ID,
  PUT_WEED_OPERATION_ID,
  BAD_SHARED_LIMIT_ID,
  PUT_BUG_LIMIT_ID,
  canOperateBad,
  getBadRemainingTimes,
  updateOperationLimits,
} = require('../src/services/friend-operation-limits');

test('put-insect and put-weed use the official shared daily counter', () => {
  updateOperationLimits([
    { id: BAD_SHARED_LIMIT_ID, day_times: 80, day_times_lt: 100 },
    { id: PUT_BUG_LIMIT_ID, day_times: 30, day_times_lt: 100 },
  ]);

  assert.equal(getBadRemainingTimes(PUT_BUG_OPERATION_ID), 20);
  assert.equal(getBadRemainingTimes(PUT_WEED_OPERATION_ID), 20);
  assert.equal(getBadRemainingTimes(), 20);
  assert.equal(canOperateBad(), true);
});

test('the shared daily counter stops both bad-operation types', () => {
  updateOperationLimits([
    { id: PUT_BUG_LIMIT_ID, day_times: 40, day_times_lt: 100 },
    { id: BAD_SHARED_LIMIT_ID, day_times: 100, day_times_lt: 100 },
  ]);

  assert.equal(getBadRemainingTimes(PUT_BUG_OPERATION_ID), 0);
  assert.equal(getBadRemainingTimes(PUT_WEED_OPERATION_ID), 0);
  assert.equal(canOperateBad(), false);
});
