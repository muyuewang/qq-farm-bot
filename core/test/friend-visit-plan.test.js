const assert = require('node:assert/strict');
const test = require('node:test');

const { buildFriendVisitPlan } = require('../src/services/friend-visit-plan');

test('friend visit plan merges steal and help into one entry per friend', () => {
  const plan = buildFriendVisitPlan({
    stealTargets: [{ gid: 2, name: 'B', level: 8 }, { gid: 1, name: 'A', level: 9 }],
    helpTargets: [{ gid: 2, name: 'B', hasGuardDog: true }, { gid: 3, name: 'C' }],
  });

  assert.equal(plan.length, 3);
  assert.deepEqual(plan[0], {
    gid: 2,
    name: 'B',
    level: 8,
    actions: { steal: true, help: true },
    hasGuardDog: true,
  });
  assert.equal(new Set(plan.map(item => item.gid)).size, plan.length);
});
