const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const protobuf = require('protobufjs');

const { analyzeLands } = require('../src/services/farm-land-analyzer');
const { analyzeFriendLands } = require('../src/services/friend-land-analyzer');
const { getGoldenBugCount } = require('../src/services/golden-bug-service');

const CAPTURED_PUT_REPLY_HEX = '0aa0010818100118032005420e080110571a0808e90710c0cc8d084a0a08a09c0110e80728d00f5277088da13e1209e78c95e78cb4e6a1832210080210ccf9ccd206180a38cf8bcdd206220a080610f492cdd2061813280150edb80258d80478a0658001018801019001d804b001ee03d001edb802d801d80492020a08e90710ac02188da13e9a021408adb012100118022087dd8dc30428f0f9ccd206a802468001031209089f4e1001186428011a090818120508cd08101e220a0818120608adb0121001';

let proto;

test.before(async () => {
  const root = new protobuf.Root();
  await root.load([
    path.join(__dirname, '../src/proto/corepb.proto'),
    path.join(__dirname, '../src/proto/plantpb.proto'),
  ], { keepCase: true });
  proto = {
    request: root.lookupType('gamepb.plantpb.PutSocialItemRequest'),
    reply: root.lookupType('gamepb.plantpb.PutSocialItemReply'),
    farmingReply: root.lookupType('gamepb.plantpb.FarmingReply'),
  };
});

test('farming reply decodes the captured 720 exp golden bug clear reward', () => {
  const reply = proto.farmingReply.decode(Buffer.from('1a0a0801120608cd0810d005', 'hex'));

  assert.equal(Number(reply.social_rewards[0].items[0].id), 1101);
  assert.equal(Number(reply.social_rewards[0].items[0].count), 720);
});

test('golden bug request matches the captured client payload', () => {
  const payload = proto.request.encode(proto.request.create({
    host_gid: 1212748551,
    land_ids: [24],
    item_id: 301101,
    social_type: 2,
  })).finish();

  assert.equal(payload.toString('hex'), '0887a6a4c20412011818adb0122802');
});

test('golden bug reply decodes its limit, reward, cost, and land marker', () => {
  const reply = proto.reply.decode(Buffer.from(CAPTURED_PUT_REPLY_HEX, 'hex'));

  assert.equal(Number(reply.operation_limits[0].id), 10015);
  assert.equal(Number(reply.operation_limits[0].day_times), 1);
  assert.equal(Number(reply.operation_limits[0].day_times_lt), 100);
  assert.equal(Number(reply.rewards[0].items[0].id), 1101);
  assert.equal(Number(reply.rewards[0].items[0].count), 30);
  assert.equal(Number(reply.costs[0].items[0].id), 301101);
  assert.equal(Number(reply.costs[0].items[0].count), 1);
  assert.equal(Number(reply.land[0].plant.social_items[0].item_id), 301101);
  assert.equal(Number(reply.land[0].plant.social_items[0].owner_gid), 1214475911);
});

test('land analyzers keep golden bugs separate from ordinary insects', () => {
  const land = {
    id: 7,
    unlocked: true,
    plant: {
      id: 1020029,
      phases: [{ phase: 3, begin_time: 1 }],
      insect_owners: [],
      social_items: [{ item_id: 301101, type: 2, owner_gid: 123 }],
    },
  };

  const own = analyzeLands([land]);
  const friend = analyzeFriendLands([land], 456);

  assert.deepEqual(own.needBug, []);
  assert.deepEqual(own.needGoldenBug, [7]);
  assert.deepEqual(friend.canPutGoldenBug, []);

  land.plant.social_items = [];
  assert.deepEqual(analyzeFriendLands([land], 456).canPutGoldenBug, [7]);
});

test('golden bug inventory totals only item 301101', () => {
  assert.equal(getGoldenBugCount([
    { id: 301101, count: 9 },
    { id: 301101, count: 3 },
    { id: 1001, count: 999 },
  ]), 12);
});
