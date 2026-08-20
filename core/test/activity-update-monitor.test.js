const assert = require('node:assert/strict');
const test = require('node:test');
const { analyzeReport } = require('../src/services/activity-update-monitor');

test('本机扫描结果只作为辅助证据，不直接生成在线候选活动', () => {
  const result = analyzeReport({
    source: { version: 'new' },
    unknownActivityIds: [2026081802, 2026081800, 2026081900],
  }, { source: { version: 'old' } });
  assert.equal(result.sourceChanged, true);
  assert.deepEqual(result.unknownActivityIds, []);
  assert.deepEqual(result.localEvidence.unknownActivityIds, [2026081802, 2026081800, 2026081900]);
  assert.deepEqual(result.analysis.candidateGroups, []);
  assert.equal(result.analysis.requiresProtocolSample, false);
  assert.equal(result.analysis.safeToAutoApply, false);
});

test('活动更新分析合并在线 List 和本地源码候选', () => {
  const result = analyzeReport({
    source: { version: 'same' },
    unknownActivityIds: [],
  }, null, {
    available: true,
    unknownActivityIds: [2026081800],
    activities: [{ id: 2026081800, title: '未来活动' }],
    groups: [{ id: 2026081800, title: '未来活动', children: [] }],
  });
  assert.equal(result.status, 'update-found');
  assert.deepEqual(result.unknownActivityIds, [2026081800]);
  assert.equal(result.online.available, true);
});
