const test = require('node:test');
const assert = require('node:assert/strict');

const { WsFrameParser, parseFrameHeader, unmask } = require('../src/capture/ws-parser');

function encodeFrame(payload, { opcode = 0x2, fin = true, mask = null } = {}) {
  const length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.from([(fin ? 0x80 : 0x00) | opcode, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = (fin ? 0x80 : 0x00) | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = (fin ? 0x80 : 0x00) | opcode;
    header[1] = 127;
    header.writeUInt32BE(Math.floor(length / 0x100000000), 2);
    header.writeUInt32BE(length % 0x100000000, 6);
  }

  if (mask) {
    header[1] |= 0x80;
    const maskedPayload = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i += 1) maskedPayload[i] = payload[i] ^ mask[i % 4];
    return Buffer.concat([header, mask, maskedPayload]);
  }
  return Buffer.concat([header, payload]);
}

test('parseFrameHeader handles 7-bit length', () => {
  const header = encodeFrame(Buffer.alloc(10));
  const parsed = parseFrameHeader(header.subarray(0, 2));
  assert.deepEqual(parsed, { headerLen: 2, fin: true, opcode: 2, masked: false, length: 10 });
});

test('parseFrameHeader handles 16-bit and 64-bit lengths', () => {
  const p16 = encodeFrame(Buffer.alloc(300));
  assert.equal(parseFrameHeader(p16).length, 300);
  assert.equal(parseFrameHeader(p16).headerLen, 4);

  const p64 = encodeFrame(Buffer.alloc(70000));
  assert.equal(parseFrameHeader(p64).length, 70000);
  assert.equal(parseFrameHeader(p64).headerLen, 10);
});

test('unmask restores masked payloads', () => {
  const payload = Buffer.from('hello websocket');
  const mask = Buffer.from([0x11, 0x22, 0x33, 0x44]);
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i += 1) masked[i] = payload[i] ^ mask[i % 4];
  assert.deepEqual(unmask(masked, mask), payload);
});

test('WsFrameParser emits unmasked server frames', () => {
  const messages = [];
  const parser = new WsFrameParser({ onMessage: msg => messages.push(msg) });
  parser.push(encodeFrame(Buffer.from('message-1')));
  parser.push(encodeFrame(Buffer.from('message-2')));
  assert.deepEqual(messages, [Buffer.from('message-1'), Buffer.from('message-2')]);
});

test('WsFrameParser handles masked client frames', () => {
  const messages = [];
  const parser = new WsFrameParser({ onMessage: msg => messages.push(msg) });
  const mask = Buffer.from([0xAA, 0xBB, 0xCC, 0xDD]);
  parser.push(encodeFrame(Buffer.from('masked-data'), { mask }));
  assert.deepEqual(messages, [Buffer.from('masked-data')]);
});

test('WsFrameParser assembles fragmented messages', () => {
  const messages = [];
  const parser = new WsFrameParser({ onMessage: msg => messages.push(msg) });
  parser.push(encodeFrame(Buffer.from('part1'), { fin: false }));
  parser.push(encodeFrame(Buffer.from('part2'), { opcode: 0x0, fin: true }));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].toString(), 'part1part2');
});

test('WsFrameParser handles data split across chunks', () => {
  const messages = [];
  const parser = new WsFrameParser({ onMessage: msg => messages.push(msg) });
  const frame = encodeFrame(Buffer.from('split-frame-payload'));
  // 逐字节喂入
  for (let i = 0; i < frame.length; i += 1) parser.push(frame.subarray(i, i + 1));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].toString(), 'split-frame-payload');
});

test('WsFrameParser ignores ping/pong frames', () => {
  const messages = [];
  const parser = new WsFrameParser({ onMessage: msg => messages.push(msg) });
  parser.push(encodeFrame(Buffer.from('ping'), { opcode: 0x9 }));
  parser.push(encodeFrame(Buffer.from('data')));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].toString(), 'data');
});

test('WsFrameParser fires onClose for close frames', () => {
  let closed = false;
  const parser = new WsFrameParser({ onClose: () => { closed = true; } });
  parser.push(encodeFrame(Buffer.from([0x03, 0xE8]), { opcode: 0x8 }));
  assert.equal(closed, true);
});

test('WsFrameParser enforces max payload size', () => {
  let error = null;
  const parser = new WsFrameParser({ maxPayload: 100, onError: e => { error = e; } });
  parser.push(encodeFrame(Buffer.alloc(200)));
  assert.ok(error && /上限/.test(error.message));
});
