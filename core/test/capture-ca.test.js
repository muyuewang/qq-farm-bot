const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  clearContextCache,
  createRootCa,
  getCaCertDer,
  getSecureContextForHost,
  issueLeafCert,
  loadOrCreateRootCa,
} = require('../src/capture/ca');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-ca-test-'));

test('createRootCa produces a self-signed CA with the expected CN', () => {
  const ca = createRootCa();
  assert.ok(ca.keyPem.includes('BEGIN RSA PRIVATE KEY') || ca.keyPem.includes('BEGIN PRIVATE KEY'));
  assert.ok(ca.certPem.includes('BEGIN CERTIFICATE'));

  const parsed = new crypto.X509Certificate(ca.certPem);
  assert.ok(parsed.subject.includes('CN=QQFarmCaptureRootCA'));
  assert.equal(parsed.issuer, parsed.subject);
  assert.equal(parsed.ca, true);
});

test('loadOrCreateRootCa persists and reloads the same CA', () => {
  const caDir = path.join(tmpDir, 'ca1');
  const first = loadOrCreateRootCa(caDir);
  assert.ok(fs.existsSync(path.join(caDir, 'capture', 'ca', 'ca.key')));
  assert.ok(fs.existsSync(path.join(caDir, 'capture', 'ca', 'ca.crt')));
  const second = loadOrCreateRootCa(caDir);
  assert.equal(first.certPem, second.certPem);
});

test('issueLeafCert signs a leaf that is issued by the CA', () => {
  const ca = createRootCa();
  const leaf = issueLeafCert(ca.cert, ca.key, 'gate-obt.nqf.qq.com');
  const leafCert = new crypto.X509Certificate(leaf.certPem);
  const caCert = new crypto.X509Certificate(ca.certPem);

  assert.ok(leafCert.subject.includes('CN=gate-obt.nqf.qq.com'));
  assert.equal(leafCert.issuer, caCert.subject);
  assert.equal(leafCert.checkIssued(caCert), true);
  assert.equal(leafCert.ca, false);
});

test('getSecureContextForHost caches contexts per host', () => {
  clearContextCache();
  const ca = createRootCa();
  const ctx1 = getSecureContextForHost(ca, 'gate-obt.nqf.qq.com');
  const ctx2 = getSecureContextForHost(ca, 'gate-obt.nqf.qq.com');
  assert.equal(ctx1, ctx2);
  const ctx3 = getSecureContextForHost(ca, 'q.qq.com');
  assert.notEqual(ctx1, ctx3);
  clearContextCache();
});

test('getCaCertDer returns DER bytes', () => {
  const ca = createRootCa();
  const der = getCaCertDer(ca);
  assert.ok(Buffer.isBuffer(der));
  assert.ok(der.length > 200);
  // DER 证书以 SEQUENCE 开头
  assert.equal(der[0], 0x30);
});
