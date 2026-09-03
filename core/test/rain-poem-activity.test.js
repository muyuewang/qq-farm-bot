const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeRainPoemActivity, normalizeWeatherStatus, describeRainPoemFriendWeather, getOwnWeatherStatus, isLightningMutantPlant, buildBottleUseRequest, mergeRainPoemTaskUsage } = require('../src/services/activity');
const { getMutantEffectsByIds } = require('../src/config/gameConfig');
const { loadProto, types } = require('../src/utils/proto');

function fixture() {
  const child = (id, extra = {}) => ({ activity: { id, start_time: 1787709600, end_time: 1788883199, visible: true }, ...extra });
  return { group: { activity: { id: 2026070300, title: '雨落成诗', start_time: 1787709600, end_time: 1788883199, visible: true }, children: [
    child(2026070301, { exchange_shop: { items: [{ id: 200, item: { id: 5001, count: 1 }, cost: { id: 1005, count: 200 }, status: 1, owned: false }] } }),
    child(2026070303, { draw_info: { paid_remaining_count: 10, max_paid_count: 10, paid_currency_id: 5001, paid_price: 1, rewards: [{ item: { id: 5002, count: 1 } }] } }),
    child(2026070304, { weather_research: { progress: { current_stage: 1, stages: [{ id: 1, status: 1, cost: { id: 1027, count: 20 }, reward: { id: 5001, count: 1 } }] } } }),
    child(2026070305, { weather_tasks: { tasks: [{ id: 1, item_id: 5001, reward: { id: 1027, count: 10 }, target: 10, progress: 1 }] } }),
  ] } };
}

test('rain poem uses gold beans and enforces the official daily purchase limit', () => {
  const activity = normalizeRainPoemActivity(fixture(), 1787709600);
  assert.equal(activity.active, true);
  assert.equal(activity.shop.cost.itemId, 1005);
  assert.equal(activity.shop.cost.itemCount, 200);
  assert.equal(activity.shop.dailyLimit, 1);
  assert.equal(activity.shop.available, true);
  assert.equal(activity.summon.dailyUseLimit, 50);
  assert.equal(activity.summon.durationSeconds, 7200);
});

test('rain poem is hidden before start and after end boundaries', () => {
  assert.equal(normalizeRainPoemActivity(fixture(), 1787709599).active, false);
  assert.equal(normalizeRainPoemActivity(fixture(), 1787709600).active, true);
  assert.equal(normalizeRainPoemActivity(fixture(), 1788883199).active, true);
  assert.equal(normalizeRainPoemActivity(fixture(), 1788883200).active, false);
});

test('owned shop slot disables another same-day purchase', () => {
  const reply = fixture();
  reply.group.children[0].exchange_shop.items[0].owned = true;
  const activity = normalizeRainPoemActivity(reply, 1787709600);
  assert.equal(activity.shop.purchasedToday, true);
  assert.equal(activity.shop.available, false);
});

test('weather shop purchase state is also read from ActivityInfo', () => {
  const reply = fixture();
  const shop = reply.group.children[0];
  shop.activity.exchange_shop = shop.exchange_shop;
  shop.activity.exchange_shop.items[0].owned = true;
  delete shop.exchange_shop;
  const activity = normalizeRainPoemActivity(reply, 1787709600);
  assert.equal(activity.shop.purchasedToday, true);
  assert.equal(activity.shop.available, false);
});

test('both weather phases are rainstorms only during their active time', () => {
  assert.equal(normalizeWeatherStatus({ type: 1, status: 1, start_time: 100, end_time: 200 }, 150).rainstorm, true);
  assert.equal(normalizeWeatherStatus({ type: 2, status: 1, start_time: 100, end_time: 200 }, 150).rainstorm, true);
  assert.equal(normalizeWeatherStatus({ type: 1, status: 1, start_time: 100, end_time: 200 }, 201).rainstorm, false);
  assert.equal(normalizeWeatherStatus({ type: 0, status: 1 }, 150).rainstorm, false);
  assert.equal(normalizeWeatherStatus({ type: 1, status: 0 }, 150).rainstorm, false);
  assert.equal(normalizeWeatherStatus({ type: 1, status: 2, start_time: 100, end_time: 200 }, 150).rainstorm, true);
});

test('field 9 marks the current thunderstorm cycle as collected', () => {
  // 本轮雷雨进行中且字段 9=4 → 本轮已采集
  const collected = normalizeWeatherStatus({ type: 2, status: 1, start_time: 100, end_time: 200, field_9: 4 }, 150);
  assert.equal(collected.collectedThisCycle, true);
  // 标记为 0 → 本轮未采集
  assert.equal(normalizeWeatherStatus({ type: 2, status: 1, start_time: 100, end_time: 200, field_9: 0 }, 150).collectedThisCycle, false);
  // 雷雨已结束：即使字段 9 仍为 4，也不再代表“本轮”状态
  assert.equal(normalizeWeatherStatus({ type: 2, status: 1, start_time: 100, end_time: 200, field_9: 4 }, 201).collectedThisCycle, false);
  // 非雷雨天气不判采集
  assert.equal(normalizeWeatherStatus({ type: 0, status: 0, field_9: 4 }, 150).collectedThisCycle, false);
});

test('weather status field 9 decodes from the wire format', async () => {
  if (!types.GetWeatherStatusReply) await loadProto();
  const reply = types.GetWeatherStatusReply.decode(Buffer.from('0a06080210014804', 'hex'));
  assert.equal(reply.weather.type, 2);
  assert.equal(reply.weather.status, 1);
  assert.equal(reply.weather.field_9, 4);
});

test('friend weather panel states cover available, collected, expired and plain farms', () => {
  const available = describeRainPoemFriendWeather(normalizeWeatherStatus({ type: 2, status: 1, start_time: 100, end_time: 200 }, 150));
  assert.deepEqual(available, { weatherType: 2, weatherStatus: 1, weatherEndTime: 200, rainstorm: true, collected: false, expired: false });

  const collected = describeRainPoemFriendWeather(normalizeWeatherStatus({ type: 1, status: 1, start_time: 100, end_time: 200, field_9: 4 }, 150));
  assert.equal(collected.rainstorm, true);
  assert.equal(collected.collected, true);

  const expired = describeRainPoemFriendWeather(normalizeWeatherStatus({ type: 1, status: 1, start_time: 100, end_time: 200 }, 201));
  assert.equal(expired.rainstorm, false);
  assert.equal(expired.expired, true);
  assert.equal(expired.collected, false);

  const plain = describeRainPoemFriendWeather(normalizeWeatherStatus({ type: 0, status: 0 }, 150));
  assert.deepEqual(plain, { weatherType: 0, weatherStatus: 0, weatherEndTime: 0, rainstorm: false, collected: false, expired: false });
});

test('weather task exposes daily progress', () => {
  assert.equal(normalizeRainPoemActivity(fixture(), 1787709600).tasks[0].progress, 1);
});

test('lightning mutant harvest progress controls the daily weather target', () => {
  const reply = fixture();
  reply.group.children[3].weather_tasks.tasks.push({
    id: 3, desc: '每日收集雷电变异作物', target: 10, progress: 9,
    reward: { id: 1027, count: 10 },
  });
  const pending = normalizeRainPoemActivity(reply, 1787709600).lightningHarvest;
  assert.deepEqual(pending, { progress: 9, target: 10, remaining: 1, complete: false, confirmed: true });

  reply.group.children[3].weather_tasks.tasks[1].progress = 10;
  const complete = normalizeRainPoemActivity(reply, 1787709600).lightningHarvest;
  assert.deepEqual(complete, { progress: 10, target: 10, remaining: 0, complete: true, confirmed: true });
});

test('collection task derives used count from the authoritative remaining count', () => {
  const reply = fixture();
  reply.group.children[1].draw_info.paid_remaining_count = 7;
  const activity = mergeRainPoemTaskUsage(normalizeRainPoemActivity(reply, 1787709600), 0);
  const task = activity.tasks.find(item => item.itemId === 5001);
  assert.deepEqual([task.progress, task.target], [3, 10]);
});

test('summon task displays persisted daily usage against the official limit', () => {
  const reply = fixture();
  reply.group.children[3].weather_tasks.tasks.push({
    id: 2, item_id: 5002, reward: { id: 1027, count: 10 }, desc: '使用雷雨召唤瓶', progress: 0,
  });
  const activity = mergeRainPoemTaskUsage(normalizeRainPoemActivity(reply, 1787709600), 3);
  const task = activity.tasks.find(item => item.itemId === 5002);
  assert.equal(activity.summon.usedToday, 3);
  assert.deepEqual([task.progress, task.target], [3, 50]);
});

test('rainstorm summon request matches successful capture', () => {
  assert.equal(Buffer.from(buildBottleUseRequest(5002, 1, 492, 1245950635)).toString('hex'), '0a08088a27100130ec03120808abe58ed2041800');
});

test('farm panel can query the current official weather status', () => {
  assert.equal(typeof getOwnWeatherStatus, 'function');
});

test('only mutant config 12 is treated as lightning mutant', () => {
  assert.equal(isLightningMutantPlant({ mutant_config_ids: [12] }), true);
  assert.equal(isLightningMutantPlant({ mutant_config_ids: [2] }), false);
});

test('lightning mutant is exposed to land detail rendering', () => {
  assert.deepEqual(
    getMutantEffectsByIds([12]).map(effect => [effect.id, effect.name, effect.icon]),
    [[12, '闪电', 'lightning']],
  );
});

test('research status 2 is available and status 4 is completed', () => {
  const reply = fixture();
  reply.group.children[2].weather_research.progress.stages = [
    { id: 1000, status: 4, cost: { id: 1027, count: 20 }, reward: { id: 5001, count: 1 } },
    { id: 1001, status: 2, cost: { id: 1027, count: 40 }, reward: { id: 100003, count: 5 } },
    { id: 1002, status: 1, cost: { id: 1027, count: 40 }, reward: { id: 5005, count: 20 } },
  ];
  const stages = normalizeRainPoemActivity(reply, 1787709600).research.stages;
  assert.deepEqual(stages.map(stage => [stage.completed, stage.available]), [[true, false], [false, true], [false, false]]);
  assert.deepEqual(stages.map(stage => stage.reward.itemName), ['天气采集瓶', '化肥礼包', '青蛙使坏瓶']);
  assert.ok(stages.every(stage => stage.reward.image));
});

test('research node 1000 request matches the official generated schema', async () => {
  if (!types.ActivityOperateRequest) await loadProto();
  const request = types.ActivityOperateRequest.encode(types.ActivityOperateRequest.create({
    id: 2026070304,
    cmd: 40,
    tech_tree_submit_node: { node_id: 1000 },
  })).finish();
  assert.equal(Buffer.from(request).toString('hex'), '08a0c28dc6071028e2080308e807');
});

test('late research rewards have names and icons', () => {
  const reply = fixture();
  reply.group.children[2].weather_research.progress.stages = [
    { id: 1006, status: 1, reward: { id: 4002, count: 1 } },
    { id: 1007, status: 1, reward: { id: 4003, count: 1 } },
    { id: 1008, status: 1, reward: { id: 2159, count: 1 } },
  ];
  const rewards = normalizeRainPoemActivity(reply, 1787709600).research.stages.map(stage => stage.reward);
  assert.deepEqual(rewards.map(item => item.itemName), ['闪电感应', '闪电感应', '雨落成诗头像框']);
  assert.ok(rewards.every(item => item.image));
});
