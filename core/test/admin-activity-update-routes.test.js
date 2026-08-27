const assert = require('node:assert/strict');
const test = require('node:test');
const { findUnknownActivities } = require('../src/controllers/admin-activity-update-routes');

test('在线活动分析检查所有未登记 ID，不依赖 ID 大于最大已知值', () => {
  const activities = [
    { id: 2026070300, title: '较小 ID 的新活动' },
    { id: 2026081802, title: '已知活动' },
    { id: 2026081900, title: '较大 ID 的新活动' },
  ];

  assert.deepEqual(
    findUnknownActivities(activities, [2026081802]),
    [activities[0], activities[2]],
  );
});
