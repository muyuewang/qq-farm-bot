const assert = require('node:assert/strict');
const test = require('node:test');

const { isSeedLockedByLevel } = require('../src/services/planting-service');
const { getAllSeeds } = require('../src/config/gameConfig');

test('level 200 seeds bypass the local planting level check regardless of size', () => {
  for (const plantSize of [1, 2]) {
    for (const requiredLevel of [200, '200']) {
      assert.equal(isSeedLockedByLevel({ requiredLevel, plantSize }, 1), false);
    }
  }
});

test('other seed levels retain their exact unlock boundary', () => {
  for (const requiredLevel of [1, 31, 199, 201]) {
    assert.equal(isSeedLockedByLevel({ requiredLevel }, requiredLevel - 1), true);
    assert.equal(isSeedLockedByLevel({ requiredLevel }, requiredLevel), false);
    assert.equal(isSeedLockedByLevel({ requiredLevel }, requiredLevel + 1), false);
  }
});

test('bubble cotton candy keeps level 200 while the level 31 pumpkin remains locked', () => {
  const seeds = getAllSeeds();
  const bubble = seeds.find(seed => seed.seedId === 29004);
  assert.equal(bubble.requiredLevel, 200);
  assert.equal(isSeedLockedByLevel(bubble, 1), false);
  const pumpkin = seeds.find(seed => seed.seedId === 29998);
  assert.equal(pumpkin.requiredLevel, 31);
  assert.equal(isSeedLockedByLevel(pumpkin, 30), true);
  assert.equal(isSeedLockedByLevel(pumpkin, 31), false);
});
