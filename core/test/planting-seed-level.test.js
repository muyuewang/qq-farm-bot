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

test('configured level-200 seeds stay plantable while lower levels still lock', () => {
  const seeds = getAllSeeds();
  const level200 = seeds.find(seed => Number(seed.requiredLevel) === 200);
  assert.ok(level200, 'expected at least one configured level-200 seed');
  assert.equal(isSeedLockedByLevel(level200, 1), false);

  const pumpkin = seeds.find(seed => Number(seed.seedId) === 29998 || Number(seed.requiredLevel) === 31);
  if (pumpkin) {
    assert.equal(isSeedLockedByLevel(pumpkin, Number(pumpkin.requiredLevel) - 1), true);
    assert.equal(isSeedLockedByLevel(pumpkin, Number(pumpkin.requiredLevel)), false);
  }
});
