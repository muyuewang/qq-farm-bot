const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  assetCandidates,
  buildTableIndex,
  findRows,
  findSettingsFile,
  parseConfigRows,
  resolveAssetPath,
} = require('../src/services/cdn-resource-finder');

test('配置表索引支持表名归一化、ID、精确名称和模糊名称查询', () => {
  const index = buildTableIndex([
    {
      name: 'MutantEffect',
      rows: [
        { id: 5, name: '冰冻', icon_res: 'icons/frozen' },
        { id: 6, effect_name: '黄金冰冻' },
      ],
    },
  ]);
  assert.equal(findRows(index, { table: 'mutant_effect', id: 5 })[0].row.name, '冰冻');
  assert.equal(findRows(index, { table: 'mutant-effect', name: '冰冻' }).length, 1);
  assert.equal(findRows(index, { table: 'Mutant Effect', name: '黄金' })[0].row.id, 6);
});

test('Cocos 序列化配置行和植物图片候选可被提取', () => {
  const serialized = [];
  serialized[5] = [[null, null, [{ id: 1 }]]];
  assert.deepEqual(parseConfigRows(serialized), [{ id: 1 }]);
  const candidates = assetCandidates({ asset_name: 'Crop_9003' });
  assert.equal(candidates[0], 'model/v4/Crop_9003_Seed/spriteFrame');
  assert.ok(candidates.includes('model/v4/Crop_9003_6/spriteFrame'));
});

test('资源路径可解析为带版本 hash 的 CDN PNG URL', () => {
  const settings = { assets: { server: 'https://cdn.example', bundleVers: { plant: 'v1' } } };
  const config = {
    uuids: ['12345678-1234-1234-1234-123456789abc', 'unused'],
    versions: { native: [0, 'nativehash'] },
    paths: {
      0: ['icons/frozen'],
      1: ['icons/frozen/spriteFrame'],
    },
  };
  const result = resolveAssetPath(settings, new Map([['plant', config]]), 'icons/frozen');
  assert.equal(result.bundle, 'plant');
  assert.equal(result.assetPath, 'icons/frozen/spriteFrame');
  assert.equal(result.imageUrl,
    'https://cdn.example/remote/plant/native/12/12345678-1234-1234-1234-123456789abc.nativehash.png');
});

test('多个 settings 文件时选择修改时间最新的文件', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cdn-resource-settings.'));
  const first = path.join(root, 'old', 'src', 'settings.old.json');
  const latest = path.join(root, 'latest', 'src', 'settings.new.json');
  fs.mkdirSync(path.dirname(first), { recursive: true });
  fs.mkdirSync(path.dirname(latest), { recursive: true });
  fs.writeFileSync(first, '{}');
  fs.writeFileSync(latest, '{}');
  const future = new Date(Date.now() + 1000);
  fs.utimesSync(latest, future, future);
  assert.equal(findSettingsFile(root), latest);
});
