const test = require('node:test');
const assert = require('node:assert/strict');

const { createDataProvider } = require('../src/runtime/data-provider');

function createProvider(globalLogs, accountLogs) {
  return createDataProvider({
    workers: {},
    globalLogs,
    accountLogs,
    store: {},
    getAccounts: () => ({
      accounts: [
        { id: 'account-1' },
        { id: 'account-2' }
      ]
    }),
    filterLogs: logs => logs
  });
}

test('clearLogs removes runtime and historical system logs for one account', () => {
  const globalLogs = [
    { accountId: 'account-1', msg: 'runtime one' },
    { accountId: 'account-2', msg: 'runtime two' },
    { msg: 'global system log' }
  ];
  const accountLogs = [
    { accountId: 'account-1', msg: 'history one' },
    { accountId: 'account-2', msg: 'history two' }
  ];
  const provider = createProvider(globalLogs, accountLogs);

  assert.deepEqual(provider.clearLogs('account-1'), {
    cleared: 2,
    clearedRuntimeLogs: 1,
    clearedAccountLogs: 1,
    accountId: 'account-1'
  });
  assert.deepEqual(globalLogs, [
    { accountId: 'account-2', msg: 'runtime two' },
    { msg: 'global system log' }
  ]);
  assert.deepEqual(accountLogs, [
    { accountId: 'account-2', msg: 'history two' }
  ]);
});

test('clearLogs removes all runtime and historical system logs for all accounts', () => {
  const globalLogs = [{ accountId: 'account-1' }, { accountId: 'account-2' }];
  const accountLogs = [{ accountId: 'account-1' }, { accountId: 'account-2' }];
  const provider = createProvider(globalLogs, accountLogs);

  assert.deepEqual(provider.clearLogs('all'), {
    cleared: 'all',
    clearedRuntimeLogs: 2,
    clearedAccountLogs: 2
  });
  assert.deepEqual(globalLogs, []);
  assert.deepEqual(accountLogs, []);
});
