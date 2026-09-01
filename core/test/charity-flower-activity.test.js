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
      share_status: 2,
      share_reward: [{ id: 1001, count: 2 }],
      personal_rewards: [{ need_personal_score: 20, reward: [{ id: 1002, count: 1 }], reached: true, claimed: false }],
      final_pack_threshold: 100,
      final_reward: [{ id: 1003, count: 1 }],
      settlement_time: 1788969600,
      final_reward_eligible: true,
      can_donate: true,
      xhh_status: 2,
      xhh_success_orders: [{ day: 1, code: 'redacted', transaction_id: 'redacted', count: 1 }],
      compliance_agreed: true,
      business_id: 'redacted',
      xhh_reward: [{ id: 1004, count: 1 }],
    },
  };
}

test('charity flower normalizes official state without exposing order details', () => {
  const activity = normalizeCharityFlowerActivity(fixture(), 1788192000);
  assert.equal(activity.active, true);
  assert.deepEqual(activity.love, { itemId: 101604, count: 8, personalScore: 30, canDonate: true });
  assert.deepEqual(activity.global, { score: 8813565, target: 10000000, amountYuan: 88135.65, targetYuan: 100000, reached: false });
  assert.equal(activity.share.claimable, true);
  assert.equal(activity.personalRewards[0].needScore, 20);
  assert.equal(activity.publicFund.claimable, true);
  assert.equal(activity.publicFund.complianceAgreed, true);
  assert.equal(activity.publicFund.successCount, 1);
  assert.equal('successOrders' in activity.publicFund, false);
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
