/**
 * 授权验证服务 - 软件许可证管理
 *
 * 功能：
 * - 基于机器码生成/验证许可证密钥
 * - 交互式授权验证流程
 * - AES-256-CBC 加密 + MD5 哈希
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const readline = require('node:readline');
const process = require('node:process');
const { generateMachineId, getMachineIdDisplay } = require('../utils/machine-id');
const { getDataFile, ensureDataDir } = require('../config/runtime-paths');
const { LICENSE_ENABLED } = require('../config/license-config');

// 许可证密钥种子
const LICENSE_SECRET = 'zDJp2Wv7cLawful5w7rTF8mB5foq1EUsU';

// 许可证文件路径
const LICENSE_FILE = getDataFile('license.json');

// AES 密钥：使用 scrypt 从种子派生，32 字节（AES-256）
const AES_KEY = crypto.scryptSync(LICENSE_SECRET, 'salt', 32);

// AES IV：全零 16 字节
const AES_IV = Buffer.alloc(16, 0);

/**
 * AES-256-CBC 加密
 */
function aesEncrypt(plainText) {
  const cipher = crypto.createCipheriv('aes-256-cbc', AES_KEY, AES_IV);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

/**
 * 根据机器码生成许可证密钥
 * 格式：XXXX-XXXX-XXXX-XXXX（16位十六进制，大写）
 */
function generateLicenseKey(machineId, secret = LICENSE_SECRET) {
  const normalizedId = machineId.replace(/-/g, '').toUpperCase();
  const combined = normalizedId + secret;
  const hashInput = aesEncrypt(combined);
  const hash = crypto.createHash('md5').update(hashInput).digest('hex').toUpperCase();
  const key = hash.substring(0, 16); // 取前16位
  return key.match(/.{1,4}/g)?.join('-') || key;
}

/**
 * 验证许可证密钥是否有效
 */
function verifyLicenseKey(machineId, licenseKey, secret = LICENSE_SECRET) {
  const expectedKey = generateLicenseKey(machineId, secret);
  const normalizedInput = licenseKey.replace(/-/g, '').toUpperCase();
  return expectedKey.replace(/-/g, '') === normalizedInput;
}

/**
 * 从文件加载许可证
 */
function loadLicense() {
  try {
    if (!fs.existsSync(LICENSE_FILE)) return null;
    const content = fs.readFileSync(LICENSE_FILE, 'utf8');
    const data = JSON.parse(content);
    if (data && data.machineId && data.licenseKey && data.verifiedAt) {
      return data;
    }
  } catch (_) {
    // 文件损坏或不存在
  }
  return null;
}

/**
 * 保存许可证到文件
 */
function saveLicense(machineId, licenseKey) {
  ensureDataDir();
  const data = {
    machineId: machineId.replace(/-/g, '').toUpperCase(),
    licenseKey: licenseKey.replace(/-/g, '').toUpperCase(),
    verifiedAt: Date.now(),
  };
  fs.writeFileSync(LICENSE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * 检查当前机器许可证状态
 */
function checkLicense() {
  const licenseData = loadLicense();
  if (!licenseData) {
    const machineId = generateMachineId();
    return { valid: false, reason: 'no_license', machineId };
  }

  const currentMachineId = generateMachineId();
  const storedMachineId = licenseData.machineId.replace(/-/g, '').toUpperCase();

  if (storedMachineId !== currentMachineId) {
    return { valid: false, reason: 'machine_id_mismatch', machineId: currentMachineId };
  }

  const isValid = verifyLicenseKey(storedMachineId, licenseData.licenseKey);
  if (!isValid) {
    return { valid: false, reason: 'invalid_license', machineId: currentMachineId };
  }

  return { valid: true, machineId: storedMachineId };
}

// ---- 交互式授权 ----

// 最大重试次数
const MAX_ATTEMPTS = 5;

function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * 交互式提示用户输入许可证密钥
 * 最多允许 MAX_ATTEMPTS 次尝试
 */
async function promptForLicense() {
  const rl = createReadlineInterface();
  const machineId = generateMachineId();
  const machineIdDisplay = getMachineIdDisplay();

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                      软件授权验证                          ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  本软件需要授权才能使用                                    ║');
  console.log('║                                                           ║');
  console.log(`║  您的机器码: ${machineIdDisplay.padEnd(38)}║`);
  console.log('║                                                           ║');
  console.log('║  请将机器码发送给管理员获取卡密                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  let attempts = 0;

  while (attempts < MAX_ATTEMPTS) {
    const key = await prompt(rl, '请输入卡密: ');
    if (!key) {
      console.log('卡密不能为空，请重新输入');
      attempts++;
      continue;
    }

    const isValid = verifyLicenseKey(machineId, key);
    if (isValid) {
      saveLicense(machineId, key);
      console.log('');
      console.log('✓ 授权验证成功！');
      console.log('');
      rl.close();
      return true;
    }

    attempts++;
    const remaining = MAX_ATTEMPTS - attempts;
    if (remaining > 0) {
      console.log(`✗ 卡密无效，请检查后重新输入（剩余 ${remaining} 次机会）`);
    } else {
      console.log('✗ 卡密验证失败次数过多，程序即将退出');
    }
  }

  rl.close();
  return false;
}

/**
 * 验证并运行（主入口）
 * - 如果 LICENSE_ENABLED 为 false，跳过验证
 * - 否则检查许可证，无效则提示用户输入
 */
async function verifyAndRun() {
  if (!LICENSE_ENABLED) return true;

  const status = checkLicense();
  if (status.valid) return true;

  console.log('');
  console.log(`[授权检查] 状态: ${status.reason}`);
  return await promptForLicense();
}

module.exports = {
  generateMachineId,
  getMachineIdDisplay,
  generateLicenseKey,
  verifyAndRun,
  LICENSE_SECRET,
  LICENSE_ENABLED,
};
