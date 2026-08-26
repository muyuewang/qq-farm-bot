#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const coreRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(coreRoot, '..');
const outputDir = path.join(repoRoot, 'web', 'public', 'game-config', 'effect_images', 'rain-poem');
const cacheRoot = path.join(
  os.homedir(),
  'Library/Containers/com.tencent.qqexminiprogram/Data/Library/Application Support/QQEX/miniapp/fs',
);
const astcenc = path.join(coreRoot, 'data', 'tools', 'astcenc-5.5.0', 'bin', 'astcenc');

function latestCachedFile(filename) {
  const matches = [];
  for (const account of fs.readdirSync(cacheRoot)) {
    const candidate = path.join(cacheRoot, account, '1112386029', 'usr', 'gamecaches', 'extraRes', filename);
    if (fs.existsSync(candidate)) matches.push(candidate);
  }
  return matches.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} failed`);
}

if (!fs.existsSync(astcenc)) {
  throw new Error('缺少 astcenc，请先运行 extract-plant-phase-images.js --install-tool');
}

const rainAtlas = latestCachedFile('178771313005665.astc');
const lightningAtlas = latestCachedFile('178771175018329.astc');
const fogTexture = latestCachedFile('178771313003063.astc');
if (!rainAtlas || !lightningAtlas || !fogTexture) throw new Error('QQ 官方雨落成诗特效缓存不完整');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rain-poem-effects-'));
fs.mkdirSync(outputDir, { recursive: true });

const rainPng = path.join(tempDir, 'rain-atlas.png');
const lightningPng = path.join(tempDir, 'lightning-atlas.png');
run(astcenc, ['-dl', rainAtlas, rainPng]);
run(astcenc, ['-dl', lightningAtlas, lightningPng]);
run(astcenc, ['-dl', fogTexture, path.join(outputDir, 'rain-fog.png')]);

run('ffmpeg', ['-loglevel', 'error', '-y', '-i', rainPng, '-vf', 'crop=941:968:3:3', path.join(outputDir, 'rain-streaks.png')]);

const frames = [
  ['lightning-00.png', 'crop=101:105:3:313'],
  ['lightning-01.png', 'crop=95:104:3:420'],
  ['lightning-02.png', 'crop=114:109:3:147,transpose=2'],
  ['lightning-03.png', 'crop=118:105:3:36,transpose=2'],
];
for (const [name, filter] of frames) {
  run('ffmpeg', ['-loglevel', 'error', '-y', '-i', lightningPng, '-vf', filter, path.join(outputDir, name)]);
}

console.log(`已导出官方雨落成诗特效：${outputDir}`);
