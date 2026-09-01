const assert = require('node:assert/strict');
const test = require('node:test');

const {
  selectFriendVisitBatch,
  resetFriendVisitPacing,
} = require('../src/services/friend-visit-pacing');

test.beforeEach(() => resetFriendVisitPacing());

test('friend visit pacing caps a run and rotates across candidates', () => {
  const candidates = Array.from({ length: 8 }, (_, index) => ({ gid: index + 1 }));
  const first = selectFriendVisitBatch(candidates, {
    accountId: 'a', mode: 'steal', maxVisits: 3, now: 1000, cooldownMs: 60000,
  });
  const second = selectFriendVisitBatch(candidates, {
    accountId: 'a', mode: 'steal', maxVisits: 3, now: 2000, cooldownMs: 60000,
  });
  assert.deepEqual(first.map(item => item.gid), [1, 2, 3]);
  assert.deepEqual(second.map(item => item.gid), [4, 5, 6]);
});

test('friend visit pacing keeps account and operation state separate', () => {
  const candidates = [{ gid: 1 }, { gid: 2 }];
  selectFriendVisitBatch(candidates, { accountId: 'a', mode: 'help', maxVisits: 1, now: 1000 });
  const other = selectFriendVisitBatch(candidates, { accountId: 'b', mode: 'help', maxVisits: 1, now: 1000 });
  const otherMode = selectFriendVisitBatch(candidates, { accountId: 'a', mode: 'steal', maxVisits: 1, now: 1000 });
  assert.equal(other[0].gid, 1);
  assert.equal(otherMode[0].gid, 1);
});
