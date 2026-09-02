const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeCharityFlowerActivity, isCharityFlowerActive } = require('../src/services/activity');
const { loadProto, types } = require('../src/utils/proto');

function fixture() {
  return {
    activity: { id: 2026090901, title: '公益小红花', start_time: 1788192000, end_time: 1788969599 },
    charity_flower: {
      love_item_id: 101604,
      love_count: 8,
      personal_score: 30,
      global_score: 8813565,
      max_global_score: 10000000,
      seed_reward_status: 2,
      seed_reward: { id: 1001, count: 2 },
      personal_rewards: [
        { target: 20, reward: [{ id: 1002, count: 1 }], status: 0 },
        { target: 50, reward: [{ id: 1006, count: 1 }], status: 1 },
      ],
      global_reward: { target: 10000000, reward: [{ id: 1005, count: 1 }] },
      final_pack_threshold: 100,
      final_reward: [{ id: 1003, count: 1 }],
      settlement_time: 1788969600,
      final_reward_eligible: true,
      can_donate: true,
      flow_status: 2,
      // 1788192000 在 UTC+8 为 2026-09-01：一条今日记录 + 一条昨日记录
      public_fund_orders: [
        { date: 20260901, order_id: 'today-order', token: 'today-token', status: 1 },
        { date: 20260831, order_id: 'yesterday-order', token: 'yesterday-token', status: 1 },
      ],
      compliance_agreed: true,
      business_id: 'redacted',
      daily_reward: [{ id: 1004, count: 1 }],
      daily_reward_status: 2,
    },
  };
}

test('charity flower normalizes official state without exposing order details', () => {
  const activity = normalizeCharityFlowerActivity(fixture(), 1788192000);
  assert.equal(activity.active, true);
  assert.deepEqual(activity.love, { itemId: 101604, count: 8, personalScore: 30, canDonate: true });
  assert.equal(activity.global.score, 8813565);
  assert.equal(activity.global.target, 10000000);
  assert.equal(activity.global.amountYuan, 88135.65);
  assert.equal(activity.global.targetYuan, 100000);
  assert.equal(activity.global.reached, false);
  assert.equal(activity.global.reward.length, 1);
  assert.equal(activity.global.reward[0].itemId, 1005);
  assert.equal(activity.seedReward.claimable, true);
  assert.equal(activity.seedReward.claimed, false);
  // 抓包语义：status 0=已达成可领取，1=已领取。30 份爱心达到 20 档 → 档位 0 可领取
  assert.equal(activity.personalRewards[0].needScore, 20);
  assert.equal(activity.personalRewards[0].claimable, true);
  assert.equal(activity.personalRewards[0].claimed, false);
  // 档位 50 未达成且 status=1 → 已领取语义，不可再领取
  assert.equal(activity.personalRewards[1].reached, false);
  assert.equal(activity.personalRewards[1].claimable, false);
  assert.equal(activity.personalRewards[1].claimed, true);
  // flow_status=2（今日已收获小红花）+ 当日公益基金记录 → 每日礼包已领取
  assert.equal(activity.dailyGift.harvestedToday, true);
  assert.equal(activity.dailyGift.claimed, true);
  assert.equal(activity.dailyGift.claimable, false);
  assert.equal(activity.publicFund.claimedToday, true);
  assert.equal(activity.publicFund.claimable, false);
  assert.equal(activity.publicFund.complianceAgreed, true);
  assert.equal(activity.publicFund.successCount, 2);
  assert.equal('successOrders' in activity.publicFund, false);
  // 个人 30 < 结算门槛 100 → 个人条件未达成，尽管服务端字段为 true
  assert.equal(activity.finalReward.personalReached, false);
  assert.equal(activity.finalReward.globalReached, false);
  assert.equal(activity.finalReward.eligible, false);
  assert.equal(activity.finalReward.serverEligible, true);
});

test('charity flower daily gift stays claimable when only past fund orders exist', () => {
  const node = fixture();
  node.charity_flower.public_fund_orders = [{ date: 20260831, order_id: 'old', token: 'old', status: 1 }];
  const activity = normalizeCharityFlowerActivity(node, 1788192000);
  assert.equal(activity.publicFund.claimedToday, false);
  assert.equal(activity.publicFund.claimable, true);
  assert.equal(activity.dailyGift.claimed, false);
  assert.equal(activity.dailyGift.claimable, true);
});

test('charity daily gift follows the red-flower flow status', () => {
  // flow_status=1：今日小红花未收获 → 即使没有今日订单也不可领礼包
  const notHarvested = normalizeCharityFlowerActivity((() => {
    const node = fixture();
    node.charity_flower.public_fund_orders = [];
    node.charity_flower.flow_status = 1;
    return node;
  })(), 1788192000);
  assert.equal(notHarvested.dailyGift.harvestedToday, false);
  assert.equal(notHarvested.dailyGift.claimed, false);
  assert.equal(notHarvested.dailyGift.claimable, false);
  assert.equal(notHarvested.publicFund.claimable, false);

  // flow_status=2：已收获待领 → 无今日订单时可领取
  const harvested = normalizeCharityFlowerActivity((() => {
    const node = fixture();
    node.charity_flower.public_fund_orders = [];
    node.charity_flower.flow_status = 2;
    return node;
  })(), 1788192000);
  assert.equal(harvested.dailyGift.harvestedToday, true);
  assert.equal(harvested.dailyGift.claimed, false);
  assert.equal(harvested.dailyGift.claimable, true);
  assert.equal(harvested.publicFund.claimable, true);

  // flow_status=3：每日礼包已领取
  const claimed = normalizeCharityFlowerActivity((() => {
    const node = fixture();
    node.charity_flower.public_fund_orders = [];
    node.charity_flower.flow_status = 3;
    return node;
  })(), 1788192000);
  assert.equal(claimed.dailyGift.harvestedToday, true);
  assert.equal(claimed.dailyGift.claimed, true);
  assert.equal(claimed.dailyGift.claimable, false);
  assert.equal(claimed.publicFund.claimable, false);
});

test('charity flower reward replies decode the capture-verified selectors', async () => {
  if (!types.ActivityOperateReply) await loadProto();
  const Reply = types.ActivityOperateReply;

  const seedReply = Reply.decode(Buffer.from(
    '0895e38ec6071023ba08180a160893a3011006188092b8c398feffffff01309a153801',
    'hex',
  ));
  assert.equal(Number(seedReply.charity_flower_claim_share.awards[0].id), 20883);
  assert.equal(Number(seedReply.charity_flower_claim_share.awards[0].count), 6);

  const progressReply = Reply.decode(Buffer.from(
    '0895e38ec6071025ca080a081e1206088df1041001',
    'hex',
  ));
  assert.equal(Number(progressReply.charity_flower_claim_reward.need_personal_score), 30);
  assert.equal(Number(progressReply.charity_flower_claim_reward.awards[0].id), 80013);
  assert.equal(Number(progressReply.charity_flower_claim_reward.awards[0].count), 1);

  const fundReply = Reply.decode(Buffer.from(
    '0895e38ec6071026d208590801121251514e43323639394d5732303236303930311a160881f1041002188092b8c398feffffff0130a3153801222c32303236303930315f63665f6634363830383363386365323761666139323730363466393236643533643462',
    'hex',
  ));
  assert.equal(Number(fundReply.charity_flower_claim_xhh.xhh_num), 1);
  assert.equal(fundReply.charity_flower_claim_xhh.xhh_code, 'QQNC2699MW20260901');
  assert.equal(Number(fundReply.charity_flower_claim_xhh.awards[0].id), 80001);
  assert.equal(Number(fundReply.charity_flower_claim_xhh.awards[0].count), 2);
  assert.equal(fundReply.charity_flower_claim_xhh.trans_code, '20260901_cf_f468083c8ce27afa927064f926d53d4b');
});

test('charity flower activity includes both exact time boundaries', () => {
  assert.equal(isCharityFlowerActive(1788191999), false);
  assert.equal(isCharityFlowerActive(1788192000), true);
  assert.equal(isCharityFlowerActive(1788969599), true);
  assert.equal(isCharityFlowerActive(1788969600), false);
});

test('charity flower requests match the official static encoders', async () => {
  if (!types.ActivityOperateRequest) await loadProto();
  const encode = (cmd, field, value = {}) => Buffer.from(types.ActivityOperateRequest.encode(
    types.ActivityOperateRequest.create({ id: 2026090901, cmd, [field]: value }),
  ).finish()).toString('hex');

  assert.equal(encode(35, 'charity_flower_claim_share'), '0895e38ec6071023b20800');
  assert.equal(encode(36, 'charity_flower_donate_all'), '0895e38ec6071024ba0800');
  assert.equal(encode(37, 'charity_flower_claim_reward', { need_personal_score: 30 }), '0895e38ec6071025c20802081e');
  assert.equal(encode(38, 'charity_flower_claim_xhh'), '0895e38ec6071026ca0800');
  assert.equal(encode(39, 'charity_flower_set_compliance_agreed', { agreed: true }), '0895e38ec6071027d208020801');
});
