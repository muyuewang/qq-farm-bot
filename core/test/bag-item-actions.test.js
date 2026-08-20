const assert = require('node:assert/strict');
const test = require('node:test');

const { sellMergedBagItems } = require('../src/controllers/admin-bag-routes');
const { types, loadProto } = require('../src/utils/proto');

test('use request carries the complete bag item including uid', async () => {
  await loadProto();
  const encoded = types.UseRequest.encode(types.UseRequest.create({
    item: { id: 101304, count: 1, uid: 8558 },
  })).finish();
  const decoded = types.UseRequest.decode(encoded);

  assert.equal(Number(decoded.item.id), 101304);
  assert.equal(Number(decoded.item.count), 1);
  assert.equal(Number(decoded.item.uid), 8558);
});

test('use reply separates consumed items from rewards', async () => {
  await loadProto();
  const decoded = types.UseReply.decode(Buffer.from(
    '0a0908b89706100130ee4212160883a6011001188092b8c398feffffff0130b7473801',
    'hex',
  ));

  assert.equal(Number(decoded.used_items[0].id), 101304);
  assert.equal(Number(decoded.items[0].id), 21251);
  assert.equal(Number(decoded.items[0].count), 1);
});

test('one-click sale sends duplicate item ids one uid at a time', async () => {
  const calls = [];
  const provider = {
    async sellItems(accountId, items) {
      calls.push({ accountId, items });
      return { sold: items.length };
    },
  };

  const result = await sellMergedBagItems(provider, 'account-1', [
    { id: 1026, count: 1, uid: 9025 },
    { id: 1026, count: 1, uid: 8572 },
    { id: 1026, count: 1, uid: 8786 },
  ]);

  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(call => call.items[0].uid), [9025, 8572, 8786]);
  assert.equal(result.length, 3);
});
