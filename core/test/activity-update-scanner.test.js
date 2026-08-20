const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { scanActivityUpdates } = require('../src/services/activity-update-scanner');

test('活动更新扫描按 wasm 修改时间选择最新完整源码并报告未知活动', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'activity-update-scanner.'));
  const miniappRoot = path.join(root, 'miniapp_src');
  const fsRoot = path.join(root, 'fs');
  const older = path.join(miniappRoot, '1112386029_3_old');
  const latest = path.join(miniappRoot, '1112386029_3_latest');
  for (const directory of [older, latest]) {
    fs.mkdirSync(path.join(directory, 'tsdk'), { recursive: true });
    fs.mkdirSync(path.join(directory, 'assets'));
    fs.writeFileSync(path.join(directory, 'game.json'), '{}');
    fs.writeFileSync(path.join(directory, 'tsdk', 'tsdk.wasm'), 'wasm');
  }
  fs.writeFileSync(path.join(older, 'game.js'), '2026072700');
  fs.writeFileSync(path.join(latest, 'game.js'), '2026072700 2026081800 2026081800 2054922799');
  const future = new Date(Date.now() + 1000);
  fs.utimesSync(path.join(latest, 'tsdk', 'tsdk.wasm'), future, future);

  const report = scanActivityUpdates({ miniappRoot, fsRoot, knownActivityIds: [2026072700] });
  assert.equal(report.source.version, '1112386029_3_latest');
  assert.deepEqual(report.unknownActivityIds, [2026081800]);
  assert.equal(report.status, 'update-found');
  assert.ok(report.warnings.some(message => message.includes('gamecaches')));
});
