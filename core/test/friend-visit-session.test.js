const assert = require('node:assert/strict');
const test = require('node:test');

const {
  acquireFriendVisitSession,
  releaseFriendVisitSession,
  getFriendVisitSessionSnapshot,
} = require('../src/services/friend-visit-session');

test('friend visit sessions serialize enter-to-leave regions', async () => {
  const first = await acquireFriendVisitSession(1);
  let secondGranted = false;
  const secondPromise = acquireFriendVisitSession(2).then(token => {
    secondGranted = true;
    return token;
  });
  await Promise.resolve();
  assert.equal(secondGranted, false);
  assert.deepEqual(getFriendVisitSessionSnapshot(), { activeGid: 1, queued: 1 });
  releaseFriendVisitSession(first);
  const second = await secondPromise;
  assert.equal(second.gid, 2);
  releaseFriendVisitSession(second);
  assert.deepEqual(getFriendVisitSessionSnapshot(), { activeGid: 0, queued: 0 });
});
