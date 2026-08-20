const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getNongmeSeedImageUrl,
  parsePlantsDataScript,
} = require('../src/services/nongme-plant-data');

test('parses the encoded nong.me plant data payload', () => {
  const payload = {
    meta: { source: 'Plant.json + ItemInfo.json', count: 1 },
    plants: [{
      name: '测试作物',
      seed_id: 21032,
      fruit_id: 41032,
      plant_id: 1021032,
      level: 41,
    }],
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  const result = parsePlantsDataScript(
    `var PLANTS_DATA = JSON.parse(atob("${encoded}"));`,
  );

  assert.equal(result.plants.length, 1);
  assert.equal(result.byFruitId.get(41032).name, '测试作物');
  assert.equal(result.byFruitId.get(41032).seed_id, 21032);
});

test('builds nong.me image URLs from seed IDs only', () => {
  assert.equal(getNongmeSeedImageUrl(21032), 'https://nong.me/img/21032.png');
  assert.equal(getNongmeSeedImageUrl(0), '');
});
