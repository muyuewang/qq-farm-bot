const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { createWorkerManager } = require('../src/runtime/worker-manager');

function createHarness(t) {
  const proc = new EventEmitter();
  proc.send = () => {};
  proc.kill = () => {};
  const workers = {};
  const reminders = [];
  const accountLogs = [];
  const manager = createWorkerManager({
    fork: () => proc,
    runtimeMode: 'fork',
    processRef: { pkg: false, env: {}, execPath: process.execPath },
    mainEntryPath: '',
    workerScriptPath: '',
    workers,
    globalLogs: [],
    log: () => {},
    addAccountLog: (...args) => accountLogs.push(args),
    normalizeStatusForPanel: value => value,
    buildConfigSnapshotForAccount: () => ({}),
    getOfflineAutoDeleteMs: () => Infinity,
    triggerOfflineReminder: params => reminders.push(params),
    addOrUpdateAccount: () => {},
    getAccounts: () => ({ accounts: [] }),
    deleteAccount: () => {}
  });
  t.after(() => manager.dispose());
  manager.startWorker({ id: 'a1', name: '测试账号', username: 'owner', code: 'code' });
  return { proc, workers, reminders, accountLogs };
}

test('WS 400 登录失效立即触发下线提醒并携带所属用户', (t) => {
  const { proc, reminders } = createHarness(t);
  proc.emit('message', { type: 'ws_error', code: 400, message: 'token expired' });

  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].username, 'owner');
  assert.match(reminders[0].reason, /^ws_400:/);
});

test('Worker 意外退出触发提醒，正常停止退出不触发', (t) => {
  const unexpected = createHarness(t);
  unexpected.proc.emit('exit', 1, null);
  assert.equal(unexpected.reminders.length, 1);
  assert.match(unexpected.reminders[0].reason, /^worker_exit:/);

  const normal = createHarness(t);
  normal.workers.a1.stopping = true;
  normal.proc.emit('exit', 0, null);
  assert.equal(normal.reminders.length, 0);
});

test('踢下线后 Worker 退出不会重复发送提醒', (t) => {
  const { proc, reminders } = createHarness(t);
  proc.emit('message', { type: 'account_kicked', reason: '异地登录' });
  proc.emit('exit', 0, null);

  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].username, 'owner');
  assert.equal(reminders[0].reason, 'kickout:异地登录');
});
