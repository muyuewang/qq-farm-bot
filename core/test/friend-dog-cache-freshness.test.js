const assert = require('node:assert/strict');
const test = require('node:test');

const { _test } = require('../src/models/store');

test('friend dog cache is accepted only on the same local date', () => {
  const now = new Date(2026, 7, 31, 12).getTime();
  const yesterday = new Date(2026, 7, 30, 23).getTime();
  const dogInfo = { 123: { dogId: 90021, dogName: '护主犬' } };

  assert.deepEqual(_test.normalizeFriendDogInfoCache({ dogInfo, updatedAt: now }, now), dogInfo);
  assert.equal(_test.normalizeFriendDogInfoCache({ dogInfo, updatedAt: yesterday }, now), null);
  assert.equal(_test.getLocalDateKey(now), '2026-08-31');
});
