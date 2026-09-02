const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const protobuf = require('protobufjs');

async function loadPayTypes() {
  const root = new protobuf.Root();
  await root.load(path.join(__dirname, '../src/proto/paypb.proto'), { keepCase: true });
  return {
    Request: root.lookupType('gamepb.paypb.GetRechargeInfoRequest'),
    Reply: root.lookupType('gamepb.paypb.GetRechargeInfoReply'),
    Notify: root.lookupType('gamepb.paypb.RechargeInfoNotify'),
  };
}

test('diamond query uses the official MallUI request payload', async () => {
  const { Request } = await loadPayTypes();
  const body = Request.encode(Request.create({ source: 'MallUI' })).finish();
  assert.equal(Buffer.from(body).toString('hex'), '0a064d616c6c5549');
});

test('diamond balance is decoded from recharge_infos[0].balance', async () => {
  const { Reply } = await loadPayTypes();
  const reply = Reply.decode(Buffer.from('0a0308d209', 'hex'));
  assert.equal(Number(reply.recharge_infos[0].balance), 1234);
});

test('recharge notification contains transaction context, not a balance', async () => {
  const { Notify } = await loadPayTypes();
  const notify = Notify.decode(Notify.encode(Notify.create({ transaction_id: 'tx-1', source: 'MallUI' })).finish());
  assert.equal(notify.transaction_id, 'tx-1');
  assert.equal(notify.source, 'MallUI');
  assert.equal(notify.recharge_info, undefined);
});
