const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyIpv4,
  ipv4ToInt,
  isTailscaleIp,
  resolveAdvertiseAddresses,
} = require('../src/capture/ip-utils');

test('ipv4ToInt converts dotted decimal strings', () => {
  assert.equal(ipv4ToInt('192.168.1.1'), 0xC0A80101);
  assert.equal(ipv4ToInt('10.0.0.1'), 0x0A000001);
  assert.equal(ipv4ToInt('invalid'), null);
  assert.equal(ipv4ToInt('256.1.1.1'), null);
  assert.equal(ipv4ToInt(''), null);
  assert.equal(ipv4ToInt('1.2.3'), null);
});

test('classifyIpv4 distinguishes tailscale/lan/other', () => {
  // Tailscale CGNAT 100.64.0.0/10
  assert.equal(classifyIpv4('100.64.0.1'), 'tailscale');
  assert.equal(classifyIpv4('100.64.0.2'), 'tailscale');
  assert.equal(classifyIpv4('100.127.255.255'), 'tailscale');
  assert.equal(classifyIpv4('100.128.0.1'), 'other');

  // 局域网
  assert.equal(classifyIpv4('10.1.2.3'), 'lan');
  assert.equal(classifyIpv4('172.16.0.1'), 'lan');
  assert.equal(classifyIpv4('172.31.255.255'), 'lan');
  assert.equal(classifyIpv4('192.168.3.75'), 'lan');
  assert.equal(classifyIpv4('172.32.0.1'), 'other');

  // 公网
  assert.equal(classifyIpv4('8.8.8.8'), 'other');
  assert.equal(classifyIpv4('127.0.0.1'), 'other');
});

test('isTailscaleIp shortcut', () => {
  assert.equal(isTailscaleIp('100.64.0.2'), true);
  assert.equal(isTailscaleIp('192.168.1.1'), false);
});

test('resolveAdvertiseAddresses with explicit list keeps order priority', () => {
  const result = resolveAdvertiseAddresses({
    advertiseIps: ['192.168.3.75', '100.64.0.2'],
    preferOrder: ['tailscale', 'lan', 'other'],
  });
  // tailscale 优先作为 host
  assert.equal(result.host, '100.64.0.2');
  assert.deepEqual(result.addresses, [
    { address: '100.64.0.2', kind: 'tailscale' },
    { address: '192.168.3.75', kind: 'lan' },
  ]);
});

test('resolveAdvertiseAddresses host follows lan first when no tailscale', () => {
  const result = resolveAdvertiseAddresses({
    advertiseIps: ['192.168.1.10', '10.0.0.5'],
    preferOrder: ['tailscale', 'lan', 'other'],
  });
  assert.equal(result.host, '10.0.0.5');
});

test('resolveAdvertiseAddresses with auto includes detected addresses', () => {
  const result = resolveAdvertiseAddresses({ advertiseIps: ['auto'] });
  assert.ok(result.addresses.length > 0);
  assert.ok(result.host);
});

test('resolveAdvertiseAddresses handles mixed auto and explicit', () => {
  const result = resolveAdvertiseAddresses({ advertiseIps: ['auto', '1.2.3.4'] });
  const hosts = result.addresses.map(item => item.address);
  assert.ok(hosts.includes('1.2.3.4'));
});
