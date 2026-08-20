const test = require('node:test');
const assert = require('node:assert/strict');

const {
  addCapturedValues,
  collectQqFriendGids,
  findDuplicateCapturedAccount,
  getCaptureAdvertiseHost,
  getCaptureBypassHosts,
  isCertificateTokenValid,
  isCompleteQqFriendSource,
  mergeKnownFriendGids,
  normalizeApiBase,
  scheduleCapturedAccountStart,
} = require('../src/controllers/admin-capture-routes');

test('normalizeApiBase accepts http(s) and removes trailing slashes', () => {
  assert.equal(normalizeApiBase(' http://127.0.0.1:8450/// '), 'http://127.0.0.1:8450');
  assert.equal(normalizeApiBase('https://capture.example.com/base/'), 'https://capture.example.com/base');
  assert.throws(() => normalizeApiBase('file:///tmp/capture'), /仅支持/);
  assert.throws(() => normalizeApiBase('https://user:pass@example.com'), /仅支持/);
});

test('certificate links require the exact temporary flow token', () => {
  const flow = { certificateToken: 'temporary-certificate-token' };
  assert.equal(isCertificateTokenValid(flow, 'temporary-certificate-token'), true);
  assert.equal(isCertificateTokenValid(flow, 'wrong-certificate-token'), false);
  assert.equal(isCertificateTokenValid(flow, ''), false);
});

test('capture start bypasses the current admin host', () => {
  const hosts = getCaptureBypassHosts({
    hostname: 'farm.example.com',
    headers: {
      host: '10.0.0.5:3007',
      origin: 'https://farm.example.com',
    },
  });
  assert.deepEqual(hosts, ['farm.example.com', '10.0.0.5']);
});

test('embedded capture advertises the address used to access the panel', () => {
  assert.equal(getCaptureAdvertiseHost({
    hostname: '172.29.4.2',
    headers: { host: '192.168.3.75:3007' },
  }), '192.168.3.75');
  assert.equal(getCaptureAdvertiseHost({
    headers: {
      host: '172.29.4.2:3007',
      'x-forwarded-host': 'farm.example.com',
    },
  }), 'farm.example.com');
  assert.equal(getCaptureAdvertiseHost({ headers: { host: 'localhost:3007' } }), '');
});

test('editing an account merges captured friend gids without keeping its own gid', () => {
  const merged = mergeKnownFriendGids(
    [10001, 10002],
    new Set([10002, 10003, 90001]),
    90001,
  );
  assert.deepEqual(merged, [10001, 10002, 10003]);
});

test('captured accounts are rejected when code or gid already exists', () => {
  const accounts = [
    { id: '1', platform: 'qq', code: 'same-code', gid: '90001' },
    { id: '2', platform: 'wx', code: 'wx-code', gid: '90002' },
  ];
  assert.equal(findDuplicateCapturedAccount(accounts, {
    platform: 'qq',
    code: 'same-code',
    accountGid: '',
  })?.id, '1');
  assert.equal(findDuplicateCapturedAccount(accounts, {
    platform: 'qq',
    code: 'new-code',
    accountGid: '90001',
  })?.id, '1');
  assert.equal(findDuplicateCapturedAccount(accounts, {
    platform: 'qq',
    code: 'same-code',
    accountGid: '90001',
  }, '1'), null);
});

test('addCapturedValues finds non-empty code and accumulates friend gids', () => {
  const flow = {
    platform: 'qq',
    code: '',
    accountGid: '',
    openId: '',
    friendGids: new Set(),
    publicInfo: {},
    proxy: {},
    captureStatus: 'idle',
  };

  addCapturedValues(flow, {
    data: {
      channels: {
        qq: {
          status: 'captured',
          codes: [
            { code: '', gid: '90001' },
            { code: 'login-code', gid: '', openid: 'openid-1' },
          ],
        },
      },
      friends: {
        source: 'gamepb.friendpb.FriendService.GetAll',
        items: [{ gid: '10001' }, { gid: 'bad' }, { gid: '10002' }],
      },
      proxy: { running: true },
      publicInfo: { host: 'capture.example.com', mitmPort: 8451 },
    },
  });

  addCapturedValues(flow, {
    data: {
      channels: { qq: { status: 'captured', codes: [] } },
      friends: { items: [{ gid: '10003' }, { gid: '10001' }] },
    },
  });

  assert.equal(flow.code, 'login-code');
  assert.equal(flow.accountGid, '90001');
  assert.equal(flow.openId, 'openid-1');
  assert.deepEqual([...flow.friendGids], [10001, 10002, 10003]);
  assert.equal(flow.friendListComplete, true);
  assert.equal(flow.proxy.running, true);
  assert.equal(flow.publicInfo.mitmPort, 8451);
});

test('QQ friend gids continue syncing after the account is added', async () => {
  const saved = [];
  const broadcasts = [];
  const lifecycle = [];
  const flow = {
    id: 'flow-1',
    owner: 'admin',
    accountGid: '90001',
    friendListComplete: false,
    friendGids: new Set(),
    result: { importedFriendCount: 0 },
  };

  const imported = await collectQqFriendGids({
    store: {
      getAccounts: () => ({ accounts: [{ id: 'account-1', createdAt: 123 }] }),
      getKnownFriendGids: () => [10001],
      setKnownFriendGids: (accountId, gids) => saved.push({ accountId, gids }),
    },
    provider: {
      broadcastConfig: accountId => broadcasts.push(accountId),
    },
    logger: { info() {} },
    flow,
    accountId: 'account-1',
    accountCreatedAt: 123,
    refresh: async (_store, targetFlow) => {
      targetFlow.friendGids.add(10002);
      targetFlow.friendGids.add(90001);
      targetFlow.friendSource = 'gamepb.friendpb.FriendService.SyncAll';
      targetFlow.friendListComplete = true;
    },
    stop: async () => {
      lifecycle.push('stop');
    },
    afterStop: async () => lifecycle.push('start'),
  });

  assert.equal(imported, 1);
  assert.deepEqual(saved, [{ accountId: 'account-1', gids: [10001, 10002] }]);
  assert.deepEqual(broadcasts, ['account-1']);
  assert.equal(flow.result.importedFriendCount, 1);
  assert.deepEqual(lifecycle, ['stop', 'start']);
});

test('captured accounts start after the post-proxy delay', () => {
  const calls = [];
  let scheduledCallback = null;
  const flow = { owner: 'admin', result: { startError: '' } };

  scheduleCapturedAccountStart({
    provider: { startAccount: accountId => calls.push(accountId) },
    logger: { warn() {} },
    flow,
    account: { id: 'account-1' },
    isUpdate: false,
    wasRunning: false,
    schedule: (callback, delayMs) => {
      scheduledCallback = callback;
      calls.push(delayMs);
      return null;
    },
  });

  assert.deepEqual(calls, [1500]);
  scheduledCallback();
  assert.deepEqual(calls, [1500, 'account-1']);
});

test('complete QQ friend list sources are recognized', () => {
  assert.equal(isCompleteQqFriendSource('gamepb.friendpb.FriendService.GetAll'), true);
  assert.equal(isCompleteQqFriendSource('gamepb.friendpb.FriendService.SyncAll'), true);
  assert.equal(isCompleteQqFriendSource('gamepb.friendpb.FriendService.GetGameFriends'), false);
  assert.equal(isCompleteQqFriendSource('gamepb.visitpb.VisitService.Enter'), false);
});

test('GetGameFriends batches accumulate without marking the list complete', () => {
  const flow = {
    platform: 'qq',
    friendGids: new Set(),
    publicInfo: {},
    proxy: {},
  };

  addCapturedValues(flow, {
    data: {
      friends: {
        source: 'gamepb.friendpb.FriendService.GetGameFriends',
        items: [{ gid: '10001' }, { gid: '10002' }],
      },
    },
  });
  addCapturedValues(flow, {
    data: {
      friends: {
        source: 'gamepb.friendpb.FriendService.GetGameFriends',
        items: [{ gid: '10003' }],
      },
    },
  });

  assert.deepEqual([...flow.friendGids], [10001, 10002, 10003]);
  assert.notEqual(flow.friendListComplete, true);
});

test('QQ friend collection does not write into a reused account id', async () => {
  let saved = false;
  let stopped = false;
  let started = false;
  const imported = await collectQqFriendGids({
    store: {
      getAccounts: () => ({ accounts: [{ id: 'account-1', createdAt: 456 }] }),
      getKnownFriendGids: () => [],
      setKnownFriendGids: () => {
        saved = true;
      },
    },
    provider: {},
    logger: { info() {} },
    flow: {
      id: 'old-flow',
      owner: 'admin',
      friendGids: new Set([10001]),
      friendListComplete: true,
    },
    accountId: 'account-1',
    accountCreatedAt: 123,
    stop: async () => {
      stopped = true;
    },
    afterStop: async () => {
      started = true;
    },
  });

  assert.equal(imported, 0);
  assert.equal(saved, false);
  assert.equal(stopped, true);
  assert.equal(started, false);
});
