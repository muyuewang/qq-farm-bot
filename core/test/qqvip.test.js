const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const protobuf = require('protobufjs');

const {
  getAvailableVipTypes,
  getVipRewardLabels,
} = require('../src/services/qqvip');

let proto;

test.before(async () => {
  const root = new protobuf.Root();
  await root.load([
    path.join(__dirname, '../src/proto/corepb.proto'),
    path.join(__dirname, '../src/proto/qqvippb.proto'),
  ], { keepCase: true });
  proto = {
    status: root.lookupType('gamepb.qqvippb.GetQQVipRewardsStatusReply'),
    claimRequest: root.lookupType('gamepb.qqvippb.ClaimQQVipRewardsRequest'),
    claimReply: root.lookupType('gamepb.qqvippb.ClaimQQVipRewardsReply'),
  };
});

test('VIP status reads reward types from repeated field 5 configs', () => {
  const status = proto.status.decode(Buffer.from('2a0228012a022802', 'hex'));

  assert.deepEqual(getAvailableVipTypes(status), [1, 2]);
});

test('VIP reward types use readable log labels', () => {
  assert.deepEqual(getVipRewardLabels([1]), ['VIP奖励']);
  assert.deepEqual(getVipRewardLabels([2]), ['SVIP奖励']);
  assert.deepEqual(getVipRewardLabels([1, 2]), ['VIP奖励', 'SVIP奖励']);
});

test('SVIP-only claim matches the captured packed request', () => {
  const payload = proto.claimRequest.encode(
    proto.claimRequest.create({ vip_types: [2] })
  ).finish();

  assert.equal(payload.toString('hex'), '0a0102');
});

test('VIP and SVIP claim matches the captured packed request', () => {
  const payload = proto.claimRequest.encode(
    proto.claimRequest.create({ vip_types: [1, 2] })
  ).finish();

  assert.equal(payload.toString('hex'), '0a020102');
});

test('VIP rewards decode items from response field 3', () => {
  const encoded = proto.claimReply.encode(proto.claimReply.create({
    items: [{ id: 80011, count: 10 }],
  })).finish();
  const reply = proto.claimReply.decode(encoded);

  assert.equal(encoded[0], 0x1A);
  assert.equal(Number(reply.items[0].id), 80011);
  assert.equal(Number(reply.items[0].count), 10);
});
