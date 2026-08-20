#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const protobuf = require('protobufjs');

const SENSITIVE_FIELD = /auth|token|code|cookie|ticket|open_?id|session|password|secret|credential|metadata/i;
const SCALAR_WIRES = {
  double: 1, float: 5, int32: 0, uint32: 0, sint32: 0, fixed32: 5,
  sfixed32: 5, int64: 0, uint64: 0, sint64: 0, fixed64: 1, sfixed64: 1,
  bool: 0, string: 2, bytes: 2,
};

function usage() {
  return [
    '检查 HAR 或 .bin 目录中的 QQ 农场网关协议。',
    '',
    '用法：',
    '  npm run inspect:protocol -- <抓包.har|bin目录> [选项]',
    '',
    '选项：',
    '  --service <名称>       按完整或末尾 service 名过滤',
    '  --method <名称>        按 method/通知类型过滤',
    '  --direction <方向>     request、response 或 notify',
    '  --shape                仅输出 protobuf wire 结构摘要',
    '  --audit                发现未知字段、wire 不匹配或缺失类型时返回非零状态',
    '  --decrypt-requests     使用本地 TSDK WASM 解密请求 body',
    '  --show-sensitive       不脱敏已知敏感字段',
    '  --pretty               格式化 JSON 输出（默认 JSON Lines）',
  ].join('\n');
}

function parseArgs(argv) {
  const args = { input: '', shape: false, audit: false, decryptRequests: false, showSensitive: false, pretty: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('-') && !args.input) args.input = path.resolve(value);
    else if (value === '--service' || value === '--method' || value === '--direction') args[value.slice(2)] = String(argv[++index] || '');
    else if (value === '--shape') args.shape = true;
    else if (value === '--audit') args.audit = true;
    else if (value === '--decrypt-requests') args.decryptRequests = true;
    else if (value === '--show-sensitive') args.showSensitive = true;
    else if (value === '--pretty') args.pretty = true;
    else if (value === '--help' || value === '-h') args.help = true;
    else throw new Error(`未知参数：${value}`);
  }
  if (args.direction && !['request', 'response', 'notify'].includes(args.direction)) {
    throw new Error(`无效方向：${args.direction}`);
  }
  return args;
}

function scalar(value) {
  if (typeof value === 'bigint') return value.toString();
  if (value && typeof value === 'object' && typeof value.toString === 'function') return value.toString();
  return value;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function redact(value, showSensitive, key = '') {
  if (showSensitive) return value;
  if (SENSITIVE_FIELD.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map(item => redact(item, false));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redact(item, false, name)]));
  }
  return value;
}

function readWireValue(reader, wire) {
  if (wire === 0) return scalar(reader.uint64());
  if (wire === 1) return scalar(reader.fixed64());
  if (wire === 2) return Buffer.from(reader.bytes());
  if (wire === 5) return reader.fixed32();
  throw new Error(`不支持的 wire type ${wire}`);
}

function rawFields(buffer, depth = 0) {
  if (depth > 6) return [{ truncated: true, bytes: buffer.length, sha256: sha256(buffer) }];
  const reader = protobuf.Reader.create(buffer);
  const fields = [];
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field <= 0) throw new Error('无效 protobuf field');
    const value = readWireValue(reader, wire);
    if (!Buffer.isBuffer(value)) {
      fields.push({ field, wire, value });
      continue;
    }
    const entry = { field, wire, bytes: value.length, sha256: sha256(value) };
    try {
      const nested = rawFields(value, depth + 1);
      if (nested.length) entry.nested = nested;
    } catch {}
    fields.push(entry);
  }
  return fields;
}

function wireShape(buffer) {
  const paths = new Map();
  function visit(bytes, prefix = '', depth = 0) {
    if (depth > 7) return;
    const reader = protobuf.Reader.create(bytes);
    while (reader.pos < reader.len) {
      const tag = reader.uint32();
      const field = tag >>> 3;
      const wire = tag & 7;
      if (field <= 0) throw new Error('无效 protobuf field');
      const fieldPath = prefix ? `${prefix}.${field}` : String(field);
      const key = `${fieldPath}:${wire}`;
      const value = readWireValue(reader, wire);
      const entry = paths.get(key) || { path: fieldPath, wire, count: 0 };
      entry.count += 1;
      if (Buffer.isBuffer(value)) {
        entry.byteLengths ||= [];
        if (!entry.byteLengths.includes(value.length) && entry.byteLengths.length < 4) entry.byteLengths.push(value.length);
        try { visit(value, fieldPath, depth + 1); } catch {}
      }
      paths.set(key, entry);
    }
  }
  visit(buffer);
  return [...paths.values()];
}

function auditMessage(type, buffer, location, issues) {
  const reader = protobuf.Reader.create(buffer);
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    const fieldId = tag >>> 3;
    const wire = tag & 7;
    const field = type.fieldsById[fieldId];
    if (!field) {
      issues.add(`${location}: unknown field ${fieldId} (wire ${wire})`);
      readWireValue(reader, wire);
      continue;
    }
    const resolved = field.resolve().resolvedType;
    const expected = resolved instanceof protobuf.Type ? 2 : (resolved instanceof protobuf.Enum ? 0 : SCALAR_WIRES[field.type]);
    const packed = field.repeated && field.packed !== false && expected !== 2;
    if (wire !== expected && !(packed && wire === 2)) {
      issues.add(`${location}.${field.name}: wire ${wire}, expected ${expected}`);
      readWireValue(reader, wire);
      continue;
    }
    const value = readWireValue(reader, wire);
    if (Buffer.isBuffer(value) && !field.map && resolved instanceof protobuf.Type) {
      auditMessage(resolved, value, `${location}.${field.name}`, issues);
    }
  }
}

async function loadProtocol() {
  const protoDir = path.resolve(__dirname, '../src/proto');
  const files = fs.readdirSync(protoDir).filter(name => name.endsWith('.proto')).map(name => path.join(protoDir, name));
  const root = new protobuf.Root();
  await root.load(files, { keepCase: true });
  root.resolveAll();
  const rpc = new Map();
  function visit(namespace) {
    for (const item of namespace.nestedArray || []) {
      if (item instanceof protobuf.Service) {
        for (const method of item.methodsArray) {
          rpc.set(`${item.fullName.slice(1)}.${method.name}`, {
            request: method.resolvedRequestType,
            response: method.resolvedResponseType,
          });
        }
      }
      visit(item);
    }
  }
  visit(root);
  return {
    root,
    rpc,
    gate: root.lookupType('gatepb.Message'),
    event: root.lookupType('gatepb.EventMessage'),
  };
}

function loadFrames(input) {
  const stat = fs.statSync(input);
  if (stat.isDirectory()) {
    return fs.readdirSync(input).filter(name => name.endsWith('.bin')).sort().map(name => ({
      source: name,
      bytes: fs.readFileSync(path.join(input, name)),
    }));
  }
  const har = JSON.parse(fs.readFileSync(input, 'utf8'));
  const entries = Array.isArray(har?.log?.entries) ? har.log.entries : [];
  let index = 0;
  return entries.flatMap(entry => (entry?._webSocketMessages || []).map(frame => ({
    source: `har:${index++}`,
    time: Number.isFinite(Number(frame.timestamp)) ? new Date(Number(frame.timestamp)).toISOString() : undefined,
    flow: Number(frame.flow),
    bytes: frame?.payload?.buffer ? Buffer.from(frame.payload.buffer, 'base64') : null,
  }))).filter(frame => frame.bytes);
}

function matchesFilter(value, filter) {
  return !filter || value === filter || value.endsWith(`.${filter}`);
}

function lookupTypeOrNull(root, name) {
  try { return root.lookupType(name); } catch { return null; }
}

function resolveRpcPair(protocol, service, method) {
  const key = `${service}.${method}`;
  if (protocol.rpc.has(key)) return protocol.rpc.get(key);
  const namespace = service.includes('.') ? service.slice(0, service.lastIndexOf('.')) : '';
  const prefix = namespace ? `${namespace}.` : '';
  const request = lookupTypeOrNull(protocol.root, `${prefix}${method}Request`);
  const response = lookupTypeOrNull(protocol.root, `${prefix}${method}Reply`)
    || lookupTypeOrNull(protocol.root, `${prefix}${method}Response`);
  return request || response ? { request, response } : null;
}

async function createDecryptor(enabled) {
  if (!enabled) return null;
  const os = require('node:os');
  const { TsdkRuntime } = require('../src/utils/tsdk-runtime');
  const runtime = new TsdkRuntime({ accountId: 'protocol-inspector', dataDir: path.join(os.tmpdir(), 'qq-farm-protocol-inspector') });
  await runtime.init();
  return buffer => runtime.decrypt(buffer);
}

async function inspectCapture(args) {
  const protocol = await loadProtocol();
  const frames = loadFrames(args.input);
  const decrypt = await createDecryptor(args.decryptRequests);
  const issues = new Set();
  const messages = [];
  for (const frame of frames) {
    let gate;
    try { gate = protocol.gate.decode(frame.bytes); } catch (error) {
      issues.add(`${frame.source}: invalid gate message: ${error.message}`);
      continue;
    }
    const meta = gate.meta || {};
    const messageType = Number(meta.message_type);
    const direction = messageType === 1 ? 'request' : messageType === 2 ? 'response' : messageType === 3 ? 'notify' : 'unknown';
    let body = Buffer.from(gate.body || []);
    let service = String(meta.service_name || '');
    let method = String(meta.method_name || '');
    let type = null;
    let typeName = '';
    if (direction === 'request' && body.length) {
      if (decrypt) body = Buffer.from(await decrypt(body));
      else if (args.audit) issues.add(`${frame.source}: encrypted request not audited (use --decrypt-requests)`);
    }
    if (direction === 'notify') {
      try {
        const notification = protocol.event.decode(body);
        method = String(notification.message_type || '');
        service = '';
        body = Buffer.from(notification.body || []);
        try { type = protocol.root.lookupType(method); } catch { issues.add(`${frame.source}: missing notify type ${method}`); }
      } catch (error) { issues.add(`${frame.source}: invalid EventMessage: ${error.message}`); }
    } else if (direction === 'request' || direction === 'response') {
      const key = `${service}.${method}`;
      const pair = resolveRpcPair(protocol, service, method);
      if (!pair) issues.add(`${frame.source}: missing RPC definition ${key}`);
      else type = pair[direction];
    }
    if (!matchesFilter(service, args.service) || !matchesFilter(method, args.method) || (args.direction && direction !== args.direction)) continue;
    typeName = type?.fullName?.slice(1) || '';
    const row = {
      source: frame.source, time: frame.time, direction, service: service || undefined, method,
      clientSeq: scalar(meta.client_seq), serverSeq: scalar(meta.server_seq),
      errorCode: scalar(meta.error_code), errorMessage: String(meta.error_message || ''),
      bodyBytes: body.length, type: typeName || undefined,
    };
    if (args.shape) {
      try { row.shape = wireShape(body); } catch (error) { row.shapeError = error.message; }
    } else if (direction === 'request' && !decrypt && body.length) {
      row.encrypted = true;
      row.bodySha256 = sha256(body);
    } else {
      if (type) {
        try {
          const decoded = type.toObject(type.decode(body), { longs: String, enums: String, bytes: String, defaults: false });
          row.decoded = redact(decoded, args.showSensitive);
          if (args.audit) auditMessage(type, body, typeName, issues);
        } catch (error) { row.decodeError = error.message; }
      }
      try { row.raw = rawFields(body); } catch (error) { row.rawError = error.message; }
    }
    messages.push(row);
  }
  return { source: args.input, frameCount: frames.length, messageCount: messages.length, messages, issues: [...issues].sort() };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(usage()); return; }
  if (!args.input || !fs.existsSync(args.input)) throw new Error(`抓包不存在：${args.input || '(未指定)'}`);
  const result = await inspectCapture(args);
  if (args.pretty) console.log(JSON.stringify(result, null, 2));
  else {
    for (const message of result.messages) console.log(JSON.stringify(message));
    console.error(JSON.stringify({ source: result.source, frameCount: result.frameCount, messageCount: result.messageCount, issues: result.issues }));
  }
  if (args.audit && result.issues.length) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; });
}

module.exports = { auditMessage, inspectCapture, loadProtocol, parseArgs, rawFields, redact, resolveRpcPair, wireShape };
