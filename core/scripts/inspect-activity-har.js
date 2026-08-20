#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const protobuf = require('protobufjs');

function usage() {
  console.error('用法: npm run inspect:activity-har -- /完整路径/抓包.har');
}

function toPlain(type, message) {
  return type.toObject(message, {
    longs: Number,
    enums: String,
    bytes: String,
    defaults: false,
  });
}

async function main() {
  const harPath = process.argv[2] ? path.resolve(process.argv[2]) : '';
  if (!harPath || !fs.existsSync(harPath)) {
    usage();
    process.exitCode = 1;
    return;
  }

  const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));
  const entries = Array.isArray(har?.log?.entries) ? har.log.entries : [];
  const messages = entries.flatMap(entry => (
    Array.isArray(entry?._webSocketMessages) ? entry._webSocketMessages : []
  ));

  const protoDir = path.resolve(__dirname, '../src/proto');
  const root = new protobuf.Root();
  await root.load([
    path.join(protoDir, 'game.proto'),
    path.join(protoDir, 'corepb.proto'),
    path.join(protoDir, 'activitypb.proto'),
  ], { keepCase: true });

  const GateMessage = root.lookupType('gatepb.Message');
  const ActivityOperateReply = root.lookupType('gamepb.activitypb.OperateReply');
  const rows = [];

  for (const [index, frame] of messages.entries()) {
    const encoded = frame?.payload?.buffer;
    if (!encoded) continue;

    let gate;
    try {
      gate = GateMessage.decode(Buffer.from(encoded, 'base64'));
    } catch {
      continue;
    }

    const meta = gate.meta || {};
    const service = String(meta.service_name || '');
    const method = String(meta.method_name || '');
    const direction = Number(frame.flow) === 0 ? 'request' : 'response';
    const row = {
      index,
      time: new Date(Number(frame.timestamp) || 0).toISOString(),
      direction,
      service,
      method,
      clientSeq: Number(meta.client_seq || 0),
      bodyBytes: gate.body?.length || 0,
    };

    if (service === 'gamepb.activitypb.ActivityService'
      && method === 'Operate'
      && direction === 'response'
      && gate.body?.length) {
      try {
        row.activity = toPlain(
          ActivityOperateReply,
          ActivityOperateReply.decode(gate.body),
        );
      } catch (err) {
        row.decodeError = err.message;
      }
    }
    rows.push(row);
  }

  console.log(JSON.stringify({
    source: harPath,
    websocketFrameCount: messages.length,
    messages: rows,
  }, null, 2));
}

main().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exitCode = 1;
});
