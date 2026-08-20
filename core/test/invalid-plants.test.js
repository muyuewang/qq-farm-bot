const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { filterInvalidPlants, isInvalidPlant, isInvalidSeedId } = require('../src/config/invalidPlants');
const { getAllPlants, getItemById, getPlantById, getPlantBySeedId, isSeedItem } = require('../src/config/gameConfig');

test('异常植物黑名单同时按植物 ID 和种子 ID 生效', () => {
  assert.equal(isInvalidPlant({ id: 2020002, seed_id: 20002 }), true);
  assert.equal(isInvalidPlant({ id: 1020002, seed_id: 29999 }), true);
  assert.equal(isInvalidSeedId(29999), true);
  assert.deepEqual(filterInvalidPlants([
    { id: 2020002, seed_id: 29999 },
    { id: 1020002, seed_id: 20002 },
  ]), [{ id: 1020002, seed_id: 20002 }]);
});

test('异常白萝卜不会进入运行时植物配置', () => {
  assert.equal(getPlantById(2020002), undefined);
  assert.equal(getPlantBySeedId(29999), undefined);
  assert.equal(getItemById(29999), undefined);
  assert.equal(isSeedItem(29999), false);
  assert.equal(getAllPlants().some(plant => plant.id === 2020002 || plant.seed_id === 29999), false);
});

test('原始 Plant.json 不保留已知异常白萝卜', () => {
  const plants = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'src', 'gameConfig', 'Plant.json'),
    'utf8',
  ));
  assert.equal(plants.some(plant => plant.id === 2020002 || plant.seed_id === 29999), false);
});
