const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('mystery shop history is isolated by account and newest first', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-mystery-history-'));
  process.env.FARM_DATA_DIR = dataDir;
  const { appendMysteryShopHistory, getMysteryShopHistory } = require('../src/services/mystery-shop-history');
  const offer = { npcId: 7, itemId: 42, itemName: '测试商品', itemCount: 2, currencyId: 1001, currencyName: '金币', price: 88 };

  appendMysteryShopHistory('account-a', offer, { reward: { itemId: 42, count: 2 } }, 'auto');
  appendMysteryShopHistory('account-a', { ...offer, npcId: 8 }, { reward: { itemId: 42, count: 3 } }, 'manual');

  const records = getMysteryShopHistory('account-a');
  assert.equal(records.length, 2);
  assert.equal(records[0].npcId, 8);
  assert.equal(records[0].source, 'manual');
  assert.equal(records[1].source, 'auto');
  assert.deepEqual(getMysteryShopHistory('account-b'), []);
  fs.rmSync(dataDir, { recursive: true, force: true });
});
