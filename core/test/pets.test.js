const assert = require('node:assert/strict');
const test = require('node:test');

const { buildPetSnapshot } = require('../src/services/pets');
const { _test: storeTest } = require('../src/models/store');
const { findNearestMatureSeconds } = require('../src/services/capital-mode');

test('pet snapshot uses current protocol ownership and bag food inventory', () => {
  const snapshot = buildPetSnapshot({
    dogs: [{ id: 90001, name: '小黄狗', owned: 1, level: 2 }],
    current_dog_id: 90001,
    protect_time: 3600,
    max_protect_time: 2592000,
    foods: [{ id: 90004, duration: 86400, status: 1 }]
  }, { items: [{ id: 90004, count: 3 }] });
  assert.equal(snapshot.deployedId, 90001);
  assert.equal(snapshot.dogs.find(dog => dog.id === 90001).owned, true);
  assert.equal(snapshot.foods.find(food => food.id === 90004).count, 3);
  assert.equal(snapshot.foodSeconds, 3600);
});

test('capital mode defaults off and clamps its lead time', () => {
  assert.deepEqual(storeTest.normalizeCapitalMode(null), { enabled: false, dogId: 0, leadSeconds: 10 });
  assert.deepEqual(storeTest.normalizeCapitalMode({ enabled: true, selectedDogId: '90002', secondsBeforeMature: 1 }), { enabled: true, dogId: 90002, leadSeconds: 5 });
  assert.equal(storeTest.normalizeCapitalMode({ leadSeconds: 999 }).leadSeconds, 300);
});

test('capital mode detects already harvestable land immediately', () => {
  assert.equal(findNearestMatureSeconds([], { harvestable: [1] }), 0);
});
