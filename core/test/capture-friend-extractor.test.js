const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const protobuf = require('protobufjs');

const {
  createFriendExtractor,
  FRIEND_SERVICE,
} = require('../src/capture/friend-extractor');

let gateMessageType = null;

async function buildGateMessageType() {
  if (gateMessageType) return gateMessageType;
  const root = new protobuf.Root();
  await root.load([
    path.join(__dirname, '../src/proto/game.proto'),
    path.join(__dirname, '../src/proto/friendpb.proto'),
  ], { keepCase: true });
  gateMessageType = root.lookupType('gatepb.Message');
  return gateMessageType;
}

function encodeVarint(value) {
  const bytes = [];
  let v = value;
  while (v > 0x7F) {
    bytes.push((v & 0x7F) | 0x80);
    v = Math.floor(v / 128);
  }
  bytes.push(v);
  return Buffer.from(bytes);
}

function encodeGameFriend(gid) {
  const gidField = Buffer.concat([Buffer.from([0x08]), encodeVarint(gid)]);
  return Buffer.concat([Buffer.from([0x0A, gidField.length]), gidField]);
}

function encodeFriendReply(gids) {
  return Buffer.concat(gids.map(gid => encodeGameFriend(gid)));
}

async function createMessage(serviceName, methodName, body) {
  const type = await buildGateMessageType();
  return type.encode(type.create({
    meta: {
      service_name: serviceName,
      method_name: methodName,
      message_type: 2,
      client_seq: 1,
      server_seq: 1,
    },
    body,
  })).finish();
}

test('extracts gids from FriendService.GetAll reply', async () => {
  const extractor = await createFriendExtractor();
  const message = await createMessage(
    FRIEND_SERVICE,
    'GetAll',
    encodeFriendReply([10001, 10002, 10003]),
  );
  const result = extractor.handleMessage(message);
  assert.deepEqual(result.gids, [10001, 10002, 10003]);
  assert.equal(result.source, 'gamepb.friendpb.FriendService.GetAll');
  assert.equal(result.complete, true);
});

test('extracts gids from SyncAll reply', async () => {
  const extractor = await createFriendExtractor();
  const message = await createMessage(FRIEND_SERVICE, 'SyncAll', encodeFriendReply([90001]));
  const result = extractor.handleMessage(message);
  assert.deepEqual(result.gids, [90001]);
  assert.equal(result.complete, true);
});

test('GetGameFriends batches are partial (not complete)', async () => {
  const extractor = await createFriendExtractor();
  const message = await createMessage(FRIEND_SERVICE, 'GetGameFriends', encodeFriendReply([10001]));
  const result = extractor.handleMessage(message);
  assert.deepEqual(result.gids, [10001]);
  assert.equal(result.complete, false);
});

test('ignores unrelated services and malformed messages', async () => {
  const extractor = await createFriendExtractor();
  const other = await createMessage('gamepb.plantpb.PlantService', 'AllLands', Buffer.from([0x08, 0x01]));
  assert.equal(extractor.handleMessage(other), null);
  assert.equal(extractor.handleMessage(Buffer.from('not a protobuf')), null);
  assert.equal(extractor.handleMessage(Buffer.alloc(0)), null);
});

test('rejects zero and non-integer gids', async () => {
  const extractor = await createFriendExtractor();
  // gid 0 与 -1 应被过滤
  const message = await createMessage(FRIEND_SERVICE, 'GetAll', encodeFriendReply([0]));
  const result = extractor.handleMessage(message);
  assert.deepEqual(result.gids, []);
});
