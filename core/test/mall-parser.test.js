const assert = require('node:assert/strict');
const test = require('node:test');

const {
  parseMallLimitInfo,
  parseMallPriceInfo,
  parseMallPriceValue,
} = require('../src/services/mall');

test('parses mall price from the item count instead of the currency id', () => {
  assert.equal(parseMallPriceValue(Buffer.from('08ec071019', 'hex')), 25);
  assert.deepEqual(parseMallPriceInfo(Buffer.from('08ec071019', 'hex')), {
    currencyId: 1004,
    price: 25,
  });
  assert.deepEqual(parseMallPriceInfo(Buffer.from('08ea071019', 'hex')), {
    currencyId: 1002,
    price: 25,
  });
});

test('parses daily and activity purchase limits from current mall protocol', () => {
  assert.deepEqual(parseMallLimitInfo(Buffer.from('08011802', 'hex')), {
    limitType: 1,
    limitCount: 2,
    boughtNum: 0,
  });
  assert.deepEqual(parseMallLimitInfo(Buffer.from('080410031803', 'hex')), {
    limitType: 4,
    limitCount: 3,
    boughtNum: 3,
  });
});
