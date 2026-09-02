const test = require('node:test');
const assert = require('node:assert/strict');

const { sendMeowMessage, sendPushooMessage } = require('../src/services/push');

test('sendMeowMessage 要求昵称与接口地址格式', async () => {
  await assert.rejects(
    () => sendMeowMessage({ token: '', title: 't', content: 'c' }),
    /昵称/,
  );
  await assert.rejects(
    () => sendMeowMessage({ token: 'nick', endpoint: 'ftp://bad', title: 't', content: 'c' }),
    /接口地址格式无效/,
  );
});

test('sendMeowMessage 业务状态非 200 判定为失败', async (t) => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      status: 200,
      json: async () => ({ status: 400, msg: '昵称不存在' }),
    };
  };

  const result = await sendPushooMessage({ channel: 'meow', token: 'nick', title: '标题', content: '内容' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'error');
  assert.equal(result.msg, '昵称不存在');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.chuckfang.com/nick');
  assert.deepEqual(JSON.parse(calls[0].options.body), { title: '标题', msg: '内容' });
});

test('sendMeowMessage 状态 200 判定为成功且支持自定义接口地址', async (t) => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    calls.push(url);
    return {
      status: 200,
      json: async () => ({ status: 200, msg: '发送成功' }),
    };
  };

  const result = await sendMeowMessage({
    token: 'nick',
    endpoint: 'https://meow.example.com/',
    title: '标题',
    content: '内容',
  });
  assert.equal(result.ok, true);
  assert.equal(result.code, 'ok');
  assert.deepEqual(calls, ['https://meow.example.com/nick']);
});
