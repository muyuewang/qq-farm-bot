const test = require('node:test');
const assert = require('node:assert/strict');
const { loadProto, types } = require('../src/utils/proto');
const { getUserState, handleMessage } = require('../src/utils/network');

test('RechargeInfoNotify does not decode transaction context as a diamond balance', async () => {
  await loadProto();
  const state = getUserState();
  const previous = state.diamond;

  try {
    state.diamond = 77;
    const notifyBody = types.RechargeInfoNotify.encode({
      transaction_id: 'transaction-155',
      source: 'MallUI',
    }).finish();
    const eventBody = types.EventMessage.encode({
      message_type: 'gamepb.paypb.RechargeInfoNotify',
      body: notifyBody,
    }).finish();
    const gateBody = types.GateMessage.encode({
      meta: { message_type: 3 },
      body: eventBody,
    }).finish();

    handleMessage(gateBody);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(state.diamond, 77);
  } finally {
    state.diamond = previous;
  }
});
