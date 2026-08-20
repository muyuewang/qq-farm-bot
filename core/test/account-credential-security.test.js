const test = require('node:test');
const assert = require('node:assert/strict');

const { stripProtectedWxCredentials } = require('../src/controllers/admin-account-routes');

test('账号请求体不能直接注入微信滚动凭据', () => {
  const sanitized = stripProtectedWxCredentials({
    id: '1', wxid: 'wx-new', code: 'farm-code',
    loginBuffer: 'forged-buffer', refreshtoken: 'forged-refresh',
    accesstoken: 'forged-access', refreshToken: 'forged-refresh-camel',
    accessToken: 'forged-access-camel',
  });
  assert.deepEqual(sanitized, { id: '1', wxid: 'wx-new', code: 'farm-code' });
});

test('凭据过滤不会修改原始请求对象', () => {
  const source = { id: '1', loginBuffer: 'secret' };
  stripProtectedWxCredentials(source);
  assert.equal(source.loginBuffer, 'secret');
});
