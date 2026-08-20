const test = require('node:test');
const assert = require('node:assert/strict');
const { types, loadProto } = require('../src/utils/proto');
const { normalizeQixiActivity, isQixiDewLandCandidate } = require('../src/services/activity');
const { getItemById } = require('../src/config/gameConfig');

test('鹊桥活动协议解析阶段、材料和香囊次数', async () => {
  await loadProto();
  const reply = types.ActivityGetGroupReply.create({
    group: {
      activity: { id: 2026081800, title: '鹊桥寄情' },
      children: [
        {
          activity: { id: 2026081801, visible: true, enabled: true },
          qixi_bridge: {
            balances: [{ id: 1024, count: 35 }, { id: 1025, count: 2 }],
            stages: [
              { id: 1, cost: { id: 1024, count: 30 }, rewards: [{ id: 1025, count: 5 }], status: 2 },
              { id: 2, cost: { id: 1024, count: 50 }, status: 1 },
            ],
          },
        },
        {
          activity: { id: 2026081802 },
          qixi_gift: { sent_count: 4, received_count: 12, max_count: 50, rule: { cost: { id: 1025, count: 1 }, enabled: true } },
        },
      ],
    },
  });
  const activity = normalizeQixiActivity(reply);
  assert.equal(activity.items.feather.itemCount, 35);
  assert.equal(activity.bridge.completedCount, 1);
  assert.equal(activity.bridge.nextStage.id, 2);
  assert.equal(activity.bridge.canBuild, false);
  assert.equal(activity.gift.remainingCount, 46);
  assert.equal(activity.gift.cost.itemId, 1025);
});

test('鹊羽灵露使用真实背包 ID 301103 并具有名称映射', () => {
  assert.equal(getItemById(1024)?.name, '鹊羽');
  assert.equal(getItemById(301103)?.name, '鹊羽灵露');
});

test('土地协议保留鹊羽灵露 field_40 状态', async () => {
  if (!types.AllLandsReply) await loadProto();
  const encoded = types.AllLandsReply.encode(types.AllLandsReply.create({
    lands: [{
      id: 1,
      unlocked: true,
      plant: { id: 1020008, field_40: { value_1: 10, value_2: 1 } },
    }],
  })).finish();
  const decoded = types.AllLandsReply.decode(encoded);
  assert.equal(Number(decoded.lands[0].plant.field_40.value_1), 10);
  assert.equal(Number(decoded.lands[0].plant.field_40.value_2), 1);
});

test('鹊羽灵露选地排除服务端已确认生效的土地', () => {
  assert.equal(isQixiDewLandCandidate({ plantId: 1, status: 'growing', qixiDew: { applied: true } }), false);
  assert.equal(isQixiDewLandCandidate({ plantId: 1, status: 'growing', qixiDew: { applied: false } }), true);
  assert.equal(isQixiDewLandCandidate({ plantId: 1, status: 'dead', qixiDew: { applied: false } }), false);
});

test('香囊赠送参数使用独立 field 124 并保留好友优先目标', async () => {
  if (!types.ActivityOperateRequest) await loadProto();
  const bytes = types.ActivityOperateRequest.encode(types.ActivityOperateRequest.create({
    id: 2026081802,
    cmd: 26,
    qixi_gift: { friend_gid: 987654321, gift_id: 11 },
  })).finish();
  const decoded = types.ActivityOperateRequest.decode(bytes);
  assert.equal(Number(decoded.qixi_gift.friend_gid), 987654321);
  assert.equal(Number(decoded.qixi_gift.gift_id), 11);
});
