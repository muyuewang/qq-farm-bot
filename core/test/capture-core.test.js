const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createCaptureCore } = require('../src/capture/index');

const noop = () => {};

function makeDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'capture-core-test-'));
}

test('createCaptureCore exposes ready and getCaCertDer', async () => {
  const core = createCaptureCore({ dataDir: makeDataDir(), log: noop });
  await core.ready;
  const der = core.getCaCertDer();
  assert.ok(Buffer.isBuffer(der));
  assert.ok(der.length > 200);
  await core.stop();
});

test('handleApiRequest implements the full session lifecycle in-process', async () => {
  const core = createCaptureCore({ dataDir: makeDataDir(), log: noop });
  await core.ready;

  // 健康检查
  const health = await core.handleApiRequest('GET', '/api/health', {});
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);

  // 创建会话
  const created = await core.handleApiRequest('POST', '/api/sessions', { sessionId: 'core-test-1', platform: 'qq' });
  assert.equal(created.status, 200);
  assert.equal(created.body.ok, true);

  // 启动代理（进程内，真正监听端口）
  const started = await core.handleApiRequest(
    'POST',
    '/api/capture/start',
    { bypassHosts: ['localhost'] },
    { sessionId: 'core-test-1' },
  );
  assert.equal(started.body.ok, true);
  const snapshot = started.body.data;
  assert.ok(snapshot.publicInfo.mitmPort > 0);
  assert.ok(snapshot.publicInfo.addresses.length > 0);
  assert.equal(snapshot.proxy.running, true);

  // 状态查询
  const state = await core.handleApiRequest('GET', '/api/sessions/core-test-1/state', {});
  assert.equal(state.body.data.proxy.running, true);

  // 添加 code（模拟抓到）并验证快照
  core.sessionStore.addCode(core.sessionStore.getSession('core-test-1'), { code: 'captured-code-123' });
  const captured = await core.handleApiRequest('GET', '/api/sessions/core-test-1/state', {});
  assert.equal(captured.body.data.channels.qq.status, 'captured');
  assert.equal(captured.body.data.channels.qq.codes[0].code, 'captured-code-123');

  // 删除会话（停止代理）
  const deleted = await core.handleApiRequest('DELETE', '/api/sessions/core-test-1', {});
  assert.equal(deleted.body.ok, true);

  await core.stop();
});

test('handleApiRequest returns errors for unknown routes and missing sessions', async () => {
  const core = createCaptureCore({ dataDir: makeDataDir(), log: noop });
  await core.ready;

  const unknown = await core.handleApiRequest('GET', '/api/nope', {});
  assert.equal(unknown.status, 404);

  const missing = await core.handleApiRequest('GET', '/api/sessions/nope/state', {});
  assert.equal(missing.status, 404);
  assert.equal(missing.body.ok, false);

  await core.stop();
});
