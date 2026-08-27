const assert = require('node:assert/strict');
const test = require('node:test');
const { analyzeReport, DEFAULT_INTERVAL_MS } = require('../src/services/activity-update-monitor');
const { normalizeDiscoveryActivity } = require('../src/services/activity');

test('活动自动检测默认每三小时运行一次', () => {
  assert.equal(DEFAULT_INTERVAL_MS, 3 * 60 * 60 * 1000);
});

test('活动发现保留天气任务与研究节点语义', () => {
  const task = normalizeDiscoveryActivity({
    activity: { id: 2026070305, parent_id: 2026070300, type: 6, title: '雨落成诗' },
    weather_tasks: { tasks: [{ id: 1 }] },
  });
  const research = normalizeDiscoveryActivity({
    activity: { id: 2026070304, parent_id: 2026070300, type: 20, title: '雨落成诗' },
    weather_research: { progress: { current_stage: 1 } },
  });
  assert.equal(task.features.weatherTasks, true);
  assert.equal(research.features.weatherResearch, true);
});

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

test('重启初次在线扫描不可用时保留上次成功活动目录', () => {
  const previous = {
    online: {
      available: true,
      scannedAt: 123456,
      unknownActivityIds: [2026090900],
      activities: [{ id: 2026090900, title: '公益小红花' }],
      activityWindows: [{ id: 2026090900, title: '公益小红花', startTime: 1, endTime: 2 }],
      groups: [{ id: 2026090900, title: '公益小红花', children: [{ id: 2026090901 }] }],
    },
  };
  const result = analyzeReport({ source: null, unknownActivityIds: [] }, previous, {
    available: false,
    error: '没有已连接账号',
    activities: [],
    activityWindows: [],
    groups: [],
    unknownActivityIds: [],
  });

  assert.equal(result.online.available, false);
  assert.equal(result.online.stale, true);
  assert.equal(result.online.error, '没有已连接账号');
  assert.equal(result.online.lastSuccessfulScannedAt, 123456);
  assert.deepEqual(result.online.activities, previous.online.activities);
  assert.deepEqual(result.online.activityWindows, previous.online.activityWindows);
  assert.deepEqual(result.online.groups, previous.online.groups);
  assert.deepEqual(result.unknownActivityIds, [2026090900]);

  const nextUnavailableResult = analyzeReport({ source: null, unknownActivityIds: [] }, result, {
    available: false,
    error: '仍没有已连接账号',
    activities: [],
    activityWindows: [],
    groups: [],
    unknownActivityIds: [],
  });
  assert.deepEqual(nextUnavailableResult.online.activityWindows, previous.online.activityWindows);
  assert.equal(nextUnavailableResult.online.lastSuccessfulScannedAt, 123456);
});
