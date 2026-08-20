const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');

const TRANSIENT_WRITE_ERROR_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RENAME_RETRY_DELAYS_MS = [25, 50, 100, 200, 400, 800];
let tmpFileCounter = 0;

function waitSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function createTempPath(filePath) {
  tmpFileCounter = (tmpFileCounter + 1) % Number.MAX_SAFE_INTEGER;
  const suffix = [
    process.pid,
    Date.now(),
    tmpFileCounter,
    Math.random().toString(36).slice(2)
  ].join('.');
  return `${filePath  }.${  suffix  }.tmp`;
}

function renameWithRetry(tmpPath, filePath) {
  for (let attempt = 0; attempt <= RENAME_RETRY_DELAYS_MS.length; attempt++) {
    try {
      fs.renameSync(tmpPath, filePath);
      return;
    } catch (err) {
      const code = err && err.code;
      const canRetry = TRANSIENT_WRITE_ERROR_CODES.has(code) && attempt < RENAME_RETRY_DELAYS_MS.length;
      if (!canRetry) throw err;
      waitSync(RENAME_RETRY_DELAYS_MS[attempt]);
    }
  }
}

/** 确保文件的父目录存在 */
function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 读取文本文件
 * @param {string} filePath - 文件路径
 * @param {string} fallback - 文件不存在时的默认值
 */
function readTextFile(filePath, fallback = '') {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

/**
 * 读取 JSON 文件
 * @param {string} filePath - 文件路径
 * @param {Function|*} fallbackFactory - 文件不存在时的默认值（函数则调用取值）
 */
function readJsonFile(filePath, fallbackFactory = () => ({})) {
  const fallback = typeof fallbackFactory === 'function' ? fallbackFactory() : fallbackFactory;
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content || !content.trim()) return fallback;
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

/**
 * 原子写入 JSON 文件（先写临时文件再 rename，避免写入中断导致文件损坏）
 * @param {string} filePath - 目标文件路径
 * @param {*} data - 待写入数据
 * @param {number} indent - JSON 缩进空格数，默认 2
 */
function writeJsonFileAtomic(filePath, data, indent = 2) {
  const json = JSON.stringify(data, null, indent);
  writeTextFileAtomic(filePath, json);
}

/**
 * 原子写入文本文件
 * @param {string} filePath - 目标文件路径
 * @param {string} content - 文本内容
 */
function writeTextFileAtomic(filePath, content = '') {
  ensureParentDir(filePath);
  const tmpPath = createTempPath(filePath);
  try {
    fs.writeFileSync(tmpPath, String(content), 'utf8');
    renameWithRetry(tmpPath, filePath);
  } finally {
    // 清理可能残留的临时文件
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
  }
}

module.exports = {
  readTextFile,
  readJsonFile,
  writeTextFileAtomic,
  writeJsonFileAtomic
};
