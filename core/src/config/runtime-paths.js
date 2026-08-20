const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');

/** 是否被打包为 pkg 可执行文件 */
const isPackaged = !!process.pkg;

/** 获取资源根目录 */
function getResourceRoot() {
    return path.join(__dirname, '..');
}

/**
 * 获取资源文件路径
 * @param  {...string} segments - 路径片段
 */
function getResourcePath(...segments) {
    return path.join(getResourceRoot(), ...segments);
}

/** 获取可写文件的根目录（打包模式用 exe 同级，源码模式用上级目录） */
function getAppRootForWritable() {
    return isPackaged
        ? path.dirname(process.execPath)
        : path.join(__dirname, '../..');
}

/** 获取数据存储目录 */
function getDataDir() {
    if (process.env.FARM_DATA_DIR) {
        return path.resolve(process.env.FARM_DATA_DIR);
    }
    return path.join(getAppRootForWritable(), 'data');
}

/** 确保数据目录存在 */
function ensureDataDir() {
    const dir = getDataDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

/**
 * 获取数据文件完整路径
 * @param {string} filename - 文件名
 */
function getDataFile(filename) {
    return path.join(getDataDir(), filename);
}

/** 获取分享文件路径 */
function getShareFilePath() {
    if (process.env.FARM_DATA_DIR) {
        return path.join(getDataDir(), 'share.txt');
    }
    return path.join(getAppRootForWritable(), 'share.txt');
}

module.exports = {
    isPackaged,
    getResourcePath,
    getDataDir,
    getDataFile,
    ensureDataDir,
    getShareFilePath
};
