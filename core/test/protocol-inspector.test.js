const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const protobuf = require('protobufjs');
const {
  auditMessage,
  inspectCapture,
  loadProtocol,
  rawFields,
  redact,
  resolveRpcPair,
  wireShape,
} = require('../scripts/inspect-protocol-capture');

function makeHar(file, bytes) {
  fs.writeFileSync(file, JSON.stringify({
    log: { entries: [{ _webSocketMessages: [{ flow: 1, timestamp: 1, payload: { buffer: Buffer.from(bytes).toString('base64') } }] }] },
  }));
}

test('协议检查器从 service 反射或消息命名推导 RPC 类型', async () => {
  const protocol = await loadProtocol();
  const reflected = resolveRpcPair(protocol, 'gamepb.activitypb.ActivityService', 'List');
  assert.equal(reflected.request.fullName, '.gamepb.activitypb.ListRequest');
  const inferred = resolveRpcPair(protocol, 'gamepb.plantpb.PlantService', 'AllLands');
  assert.equal(inferred.response.fullName, '.gamepb.plantpb.AllLandsReply');
});

test('协议检查器解码 HAR 响应并脱敏敏感字段', async () => {
  const protocol = await loadProtocol();
  const pair = resolveRpcPair(protocol, 'gamepb.userpb.UserService', 'Login');
  const reply = pair.response.encode(pair.response.create({ basic: { gid: 123, open_id: 'secret-open-id' } })).finish();
  const gate = protocol.gate.encode(protocol.gate.create({
    meta: { service_name: 'gamepb.userpb.UserService', method_name: 'Login', message_type: 2 },
    body: reply,
    auth_token: 'outer-secret',
  })).finish();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'protocol-inspector-'));
  const har = path.join(dir, 'capture.har');
  makeHar(har, gate);
  const result = await inspectCapture({ input: har, shape: false, audit: true, showSensitive: false });
  assert.equal(result.messageCount, 1);
  assert.equal(result.messages[0].decoded.basic.open_id, '[REDACTED]');
  assert.deepEqual(result.issues, []);
});

test('wire 工具保留结构并报告未知字段', () => {
  const Type = new protobuf.Type('Known').add(new protobuf.Field('name', 1, 'string'));
  const body = Buffer.from([0x0A, 0x01, 0x61, 0x10, 0x07]);
  const issues = new Set();
  auditMessage(Type, body, 'Known', issues);
  assert.match([...issues][0], /unknown field 2/);
  assert.deepEqual(wireShape(body).map(item => item.path), ['1', '2']);
  assert.equal(rawFields(body)[0].bytes, 1);
  assert.equal(redact({ auth_token: 'x', normal: 1 }, false).auth_token, '[REDACTED]');
});
