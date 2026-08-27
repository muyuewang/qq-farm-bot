const assert = require('node:assert/strict');
const test = require('node:test');

const { loadProto } = require('../src/utils/proto');
const {
  encodeRainPoemPrankRequest,
  getPrankBottleInventory,
  isRainPoemPrankAlreadyActiveError,
} = require('../src/services/rain-poem-prank-service');

test.before(async () => {
  await loadProto();
});

test('prank bottle inventory keeps frog and cloud bottles separate', () => {
  assert.deepEqual(getPrankBottleInventory([
    { id: 5005, count: 2 },
    { id: 5006, count: 3 },
    { id: 5002, count: 9 },
  ]), { frog: 2, cloud: 3 });
});

test('frog bottle request matches the successful official ItemService.Use capture', () => {
  const frog = encodeRainPoemPrankRequest(1000036036, 5005, 10586);

  assert.equal(Buffer.from(frog).toString('hex'), '0a08088d27100130da52120808c4adeddc031800');
});

test('unknown items cannot be sent through the prank placement helper', () => {
  assert.throws(() => encodeRainPoemPrankRequest(1, 5002, 1), /不支持的使坏瓶/);
  assert.throws(() => encodeRainPoemPrankRequest(1, 5005, 0), /缺少背包 UID/);
});

test('an existing prank event limit is recognized as an active effect', () => {
  assert.equal(isRainPoemPrankAlreadyActiveError(new Error(
    'gamepb.itempb.ItemService.Use 错误: code=1033011 该使坏事件同时存在数量已达上限'
  )), true);
  assert.equal(isRainPoemPrankAlreadyActiveError(new Error('code=1000021 配置不存在')), false);
});
