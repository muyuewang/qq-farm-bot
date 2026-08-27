#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REQUIRED = ['game.js', 'game.json', path.join('tsdk', 'tsdk.wasm'), 'assets'];
const APP_PREFIX = '1112386029_3_';
const DEFAULT_ROOT = path.join(
  os.homedir(),
  'Library',
  'Containers',
  'com.tencent.qqexminiprogram',
  'Data',
  'Library',
  'Application Support',
  'QQEX',
  'miniapp',
  'temps',
  'miniapp_src',
);

function usage() {
  console.error('Usage: find-latest-miniapp.js [--root <miniapp_src>] [--source <candidate>] [--all]');
}

function parseArgs(argv) {
  const options = { root: DEFAULT_ROOT, source: null, all: false, rootSet: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--all') options.all = true;
    else if (arg === '--root' || arg === '--source') {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} requires a path`);
      options[arg.slice(2)] = path.resolve(value);
      if (arg === '--root') options.rootSet = true;
      index += 1;
    }
    else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.source && options.rootSet) throw new Error('--source and --root cannot be used together');
  return options;
}

function inspectCandidate(directory) {
  const absolute = path.resolve(directory);
  const missing = REQUIRED.filter(relative => !fs.existsSync(path.join(absolute, relative)));
  if (missing.length) return { directory: absolute, complete: false, missing };
  const wasm = path.join(absolute, 'tsdk', 'tsdk.wasm');
  const stat = fs.statSync(wasm);
  return {
    directory: fs.realpathSync(absolute),
    complete: true,
    wasm: {
      path: fs.realpathSync(wasm),
      mtime: stat.mtime.toISOString(),
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    },
  };
}

function discover(options) {
  if (options.source) return [inspectCandidate(options.source)];
  if (!fs.existsSync(options.root)) throw new Error(`Miniapp source root does not exist: ${options.root}`);
  return fs.readdirSync(options.root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith(APP_PREFIX))
    .map(entry => inspectCandidate(path.join(options.root, entry.name)));
}

try {
  const options = parseArgs(process.argv.slice(2));
  const candidates = discover(options);
  const complete = candidates
    .filter(candidate => candidate.complete)
    .sort((left, right) => right.wasm.mtimeMs - left.wasm.mtimeMs);
  if (!complete.length) {
    console.error(JSON.stringify({ selected: null, candidates }, null, 2));
    process.exit(2);
  }
  console.log(JSON.stringify({
    selected: complete[0],
    candidates: options.all ? candidates : undefined,
  }, null, 2));
}
catch (error) {
  console.error(error.message);
  usage();
  process.exit(1);
}
