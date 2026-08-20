const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_CONFIG,
  loadConfig,
  normalizeConfig,
  parsePortRange,
  splitList,
} = require('../src/capture/config');

test('default config exposes expected fields', () => {
  assert.equal(DEFAULT_CONFIG.apiHost, '127.0.0.1');
  assert.equal(DEFAULT_CONFIG.apiPort, 8450);
  assert.deepEqual(DEFAULT_CONFIG.proxyBind, ['0.0.0.0']);
  assert.deepEqual(DEFAULT_CONFIG.advertiseIps, ['auto']);
  assert.ok(DEFAULT_CONFIG.captureHosts.length > 0);
  assert.ok(DEFAULT_CONFIG.proxyPortFrom >= 1024);
  assert.ok(DEFAULT_CONFIG.proxyPortTo > DEFAULT_CONFIG.proxyPortFrom);
});

test('splitList handles arrays and comma strings', () => {
  assert.deepEqual(splitList(['a', 'b']), ['a', 'b']);
  assert.deepEqual(splitList('a, b,,c'), ['a', 'b', 'c']);
  assert.deepEqual(splitList(''), []);
});

test('parsePortRange validates port ranges', () => {
  assert.deepEqual(parsePortRange('18000-18999', 1, 2), { from: 18000, to: 18999 });
  assert.deepEqual(parsePortRange('', 100, 200), { from: 100, to: 200 });
  assert.deepEqual(parsePortRange('invalid', 100, 200), { from: 100, to: 200 });
  assert.deepEqual(parsePortRange('30000-1000', 100, 200), { from: 100, to: 200 });
  assert.deepEqual(parsePortRange('80-90', 100, 200), { from: 100, to: 200 });
});

test('normalizeConfig fills defaults and sanitizes values', () => {
  const config = normalizeConfig({ apiPort: '9999', proxyPortFrom: '5000', proxyPortTo: '6000' });
  assert.equal(config.apiPort, 9999);
  assert.equal(config.proxyPortFrom, 5000);
  assert.equal(config.proxyPortTo, 6000);
  assert.equal(config.autoStopSec >= 60, true);
});

test('loadConfig writes default file on first run', () => {
  const { config, configPath } = loadConfig({ dataDir: '/tmp/capture-config-test' });
  const fs = require('node:fs');
  assert.ok(fs.existsSync(configPath));
  assert.equal(config.apiHost, '127.0.0.1');
});

test('loadConfig applies env overrides', () => {
  process.env.CAPTURE_API_PORT = '19400';
  process.env.CAPTURE_ADVERTISE_IPS = '10.0.0.9,100.64.0.9';
  try {
    const { config } = loadConfig({ dataDir: '/tmp/capture-config-test-env' });
    assert.equal(config.apiPort, 19400);
    assert.deepEqual(config.advertiseIps, ['10.0.0.9', '100.64.0.9']);
  } finally {
    delete process.env.CAPTURE_API_PORT;
    delete process.env.CAPTURE_ADVERTISE_IPS;
  }
});
