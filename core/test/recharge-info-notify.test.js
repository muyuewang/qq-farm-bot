const test = require('node:test');
const assert = require('node:assert/strict');
const { loadProto, types } = require('../src/utils/proto');
const { getUserState, handleMessage } = require('../src/utils/network');

test('updates diamond balance from RechargeInfoNotify', async () => {
  await loadProto();
  const state = getUserState();
  const previous = state.diamond;

  try {
    state.diamond = 0;
    // Captured official payload: recharge_info.field_1 (diamond) = 155.
    const notifyBody = Buffer.from('0a09089b01183c2a02ba17120131', 'hex');
    const eventBody = types.EventMessage.encode({
      message_type: 'gamepb.paypb.RechargeInfoNotify',
      body: notifyBody,
    }).finish();
    const gateBody = types.GateMessage.encode({
      meta: { message_type: 3 },
      body: eventBody,
    }).finish();

    handleMessage(gateBody);
    assert.equal(state.diamond, 155);
  } finally {
    state.diamond = previous;
  }
});
