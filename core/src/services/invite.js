/**
 * 邀请服务 - 处理邀请码（微信平台专用）
 *
 * 功能：
 * - 解析共享链接中的 UID/OpenID
 * - 通过 ReportArkClick 发送好友申请
 * - 自动处理 share.txt 中的邀请码
 */
const { CONFIG } = require('../config/config');
const { getShareFilePath } = require('../config/runtime-paths');
const { sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { toLong, log, logWarn, sleep } = require('../utils/utils');
const { readTextFile, writeTextFileAtomic } = require('./json-db');

// 每次申请间隔：2秒
const INVITE_REQUEST_DELAY = 2000;

/**
 * 从 URL 参数中解析分享信息
 */
function parseShareLink(raw) {
  const result = { uid: null, openid: null, shareSource: null, docId: null };
  const params = raw.startsWith('?') ? raw.slice(1) : raw;
  const searchParams = new URLSearchParams(params);
  result.uid = searchParams.get('uid');
  result.openid = searchParams.get('openid');
  result.shareSource = searchParams.get('share_source');
  result.docId = searchParams.get('doc_id');
  return result;
}

/**
 * 读取 share.txt，去重后返回邀请码列表
 */
function readShareFile() {
  const filePath = getShareFilePath();
  try {
    const content = readTextFile(filePath, '');
    const lines = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l.includes('openid='));

    const results = [];
    const seenUids = new Set();
    for (const line of lines) {
      const parsed = parseShareLink(line);
      if (parsed.openid && parsed.uid && !seenUids.has(parsed.uid)) {
        seenUids.add(parsed.uid);
        results.push(parsed);
      }
    }
    return results;
  } catch (err) {
    logWarn('邀请', `读取 share.txt 失败: ${err.message}`);
    return [];
  }
}

/**
 * 向指定用户发送好友申请（通过 ReportArkClick）
 * scene_id 固定为 '1256'
 */
async function sendReportArkClick(uid, openId, shareSource) {
  const request = types.ReportArkClickRequest.encode(
    types.ReportArkClickRequest.create({
      sharer_id: toLong(uid),
      sharer_open_id: openId,
      share_cfg_id: toLong(shareSource || 0),
      scene_id: '1256',
    })
  ).finish();
  const { body } = await sendMsgAsync('gamepb.userpb.UserService', 'ReportArkClick', request);
  return types.ReportArkClickReply.decode(body);
}

/**
 * 处理所有邀请码
 * - 仅微信平台支持
 * - 读取 share.txt → 逐个发送好友申请 → 清空 share.txt
 */
async function processInviteCodes() {
  if (CONFIG.platform !== 'wx') {
    log('邀请', '当前为 QQ 环境，跳过邀请码处理（仅微信支持）');
    return;
  }

  const codes = readShareFile();
  if (codes.length === 0) return;

  log('邀请', `读取到 ${codes.length} 个邀请码（已去重），开始逐个处理...`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    try {
      await sendReportArkClick(code.uid, code.openid, code.shareSource);
      success++;
      log('邀请', `[${i + 1}/${codes.length}] 已向 uid=${code.uid} 发送好友申请`);
    } catch (err) {
      failed++;
      logWarn('邀请', `[${i + 1}/${codes.length}] 向 uid=${code.uid} 发送申请失败: ${err.message}`);
    }

    // 最后一个不需要等待
    if (i < codes.length - 1) {
      await sleep(INVITE_REQUEST_DELAY);
    }
  }

  log('邀请', `处理完成: 成功 ${success}, 失败 ${failed}`);
  clearShareFile();
}

/**
 * 清空 share.txt 文件
 */
function clearShareFile() {
  const filePath = getShareFilePath();
  try {
    writeTextFileAtomic(filePath, '');
    log('邀请', '已清空 share.txt');
  } catch (_) {
    // 忽略清空失败
  }
}

module.exports = {
  parseShareLink,
  readShareFile,
  sendReportArkClick,
  processInviteCodes,
  clearShareFile,
};
