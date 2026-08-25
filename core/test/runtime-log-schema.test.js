const assert = require('node:assert/strict');
const test = require('node:test');
const { createRuntimeState } = require('../src/runtime/runtime-state');

function createState() {
  const store = new Proxy({}, {
    get: () => () => ({}),
  });
  return createRuntimeState({ store, operationKeys: [] });
}

test('runtime logs expose stable timestamp, level and source fields', () => {
  const state = createState();
  state.log('错误', '连接失败', { accountId: 'account-1' });

  assert.equal(state.globalLogs.length, 1);
  assert.match(state.globalLogs[0].logId, /^runtime-/);
  assert.equal(state.globalLogs[0].level, 'error');
  assert.equal(state.globalLogs[0].source, 'system');
  assert.equal(typeof state.globalLogs[0].ts, 'number');
});

test('account log actions map failures and refreshes to useful levels', () => {
  const state = createState();
  state.addAccountLog('start_failed', '启动失败', 'account-1');
  state.addAccountLog('auto_code_refresh', '凭证已刷新', 'account-1');
  state.addAccountLog('ws_400', '登录失效', 'account-1');

  assert.equal(state.accountLogs[0].level, 'error');
  assert.equal(state.accountLogs[1].level, 'info');
  assert.equal(state.accountLogs[2].level, 'error');
  assert.equal(state.accountLogs[0].source, 'account');
  assert.notEqual(state.accountLogs[0].logId, state.accountLogs[1].logId);
});
