const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-farm-bag-seeds-'));
process.env.FARM_DATA_DIR = dataDir;

const store = require('../src/models/store');
const { compareBagSeedGameOrder } = require('../src/utils/bag-seed-order');

test.after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function seed(seedId, requiredLevel, options = {}) {
  return {
    seedId,
    requiredLevel,
    count: options.count ?? 1,
    plantSize: options.plantSize ?? 1,
  };
}

test('bag seed priority follows game rarity, exp and id order', () => {
  const result = store.syncBagSeedPriority('game-sort', [
    { ...seed(26032, 1), rarity: 3, plantExp: 1440 },
    { ...seed(20002, 1), rarity: 1, plantExp: 1 },
    { ...seed(20261, 21), rarity: 2, plantExp: 1440 },
    { ...seed(20129, 81), rarity: 2, plantExp: 1680 },
    { ...seed(20329, 1), rarity: 3, plantExp: 688 },
    { ...seed(21037, 1), rarity: 3, plantExp: 1680 },
  ], { persist: false });

  assert.deepEqual(result.priority, [20129, 21037, 20261, 26032, 20329, 20002]);
  assert.deepEqual(result.seeds.map(item => item.seedId), result.priority);
  assert.equal(result.changed, true);
});

test('personal bag seed tab matches the official client order', () => {
  const seeds = [
    [29003, '星语铃花', 3, 7680],
    [20129, '勿忘我', 2, 1680],
    [21037, '银星海棠', 3, 1680],
    [21050, '萱草', 3, 1680],
    [21353, '紫薇', 3, 1680],
    [21380, '梧桐', 3, 1680],
    [21404, '月光花', 3, 1680],
    [20108, '铃兰', 2, 1440],
    [20185, '似何莲', 2, 1440],
    [20261, '针垫花', 2, 1440],
    [20264, '帝王血', 2, 1440],
    [21251, '紫茉莉', 3, 1440],
    [26032, '月见草', 3, 1440],
    [20329, '发财红包', 3, 688],
    [20002, '白萝卜', 1, 1],
  ].reverse().map(([id, name, rarity, plantExp]) => ({ id, name, rarity, plantExp }));

  seeds.sort(compareBagSeedGameOrder);

  assert.deepEqual(seeds.map(item => item.name), [
    '星语铃花', '勿忘我', '银星海棠', '萱草', '紫薇',
    '梧桐', '月光花', '铃兰', '似何莲', '针垫花',
    '帝王血', '紫茉莉', '月见草', '发财红包', '白萝卜',
  ]);
});

test('current game order replaces a previously saved order', () => {
  const accountId = 'replace-old';
  store.applyConfigSnapshot({
    bagSeedPriority: [103, 102, 101],
    bagSeedKnownIds: [103, 102, 101],
  }, { accountId, persist: false });

  const result = store.syncBagSeedPriority(accountId, [
    { ...seed(101, 1), rarity: 1, plantExp: 10 },
    { ...seed(103, 3), rarity: 2, plantExp: 20 },
    { ...seed(102, 2), rarity: 2, plantExp: 30 },
  ], { persist: false });

  assert.deepEqual(result.priority, [102, 103, 101]);
  assert.equal(result.changed, true);
});

test('removed preferred strategies fall back to supported defaults', () => {
  const accountId = 'removed-preferred-strategy';
  store.applyConfigSnapshot({
    plantingStrategy: 'preferred',
    bagSeedFallbackStrategy: 'preferred',
  }, { accountId, persist: false });

  const config = store.getConfigSnapshot(accountId);
  assert.equal(config.plantingStrategy, 'max_exp');
  assert.equal(store.getBagSeedFallbackStrategy(accountId), 'level');
  assert.equal('preferredSeedId' in config, false);
});

test('empty and 2x2 seeds are excluded from the 1x1 priority', () => {
  const result = store.syncBagSeedPriority('one-by-one-only', [
    seed(101, 1),
    seed(102, 9, { plantSize: 2 }),
    seed(103, 8, { count: 0 }),
  ], { persist: false });

  assert.deepEqual(result.priority, [101]);
  assert.deepEqual(result.knownIds, [101]);
  assert.deepEqual(result.seeds.map(item => item.seedId), [101]);
});
