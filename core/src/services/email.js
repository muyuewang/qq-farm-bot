/**
 * 邮箱服务 - 自动领取邮件奖励
 * 
 * 功能：
 * - 获取邮箱列表（系统邮件 + 玩家邮件）
 * - 批量领取邮件附件
 * - 每日自动检查并领取邮箱奖励
 */
const { sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { log, toNum } = require('../utils/utils');
const { getItemById } = require('../config/gameConfig');

const DAILY_KEY = 'email_rewards';

// 每日状态追踪
let doneDateKey = '';
let lastCheckAt = 0;

// 两次检查最小间隔：5分钟
const CHECK_COOLDOWN_MS = 5 * 60 * 1000;

// ---- 日期工具 ----

function getDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function markDoneToday() {
  doneDateKey = getDateKey();
}

function isDoneToday() {
  return doneDateKey === getDateKey();
}

// ---- RPC 调用 ----

async function getEmailList(boxType = 1) {
  const request = types.GetEmailListRequest.encode(
    types.GetEmailListRequest.create({ box_type: Number(boxType) || 1 })
  ).finish();
  const { body } = await sendMsgAsync('gamepb.emailpb.EmailService', 'GetEmailList', request);
  return types.GetEmailListReply.decode(body);
}

async function claimEmail(boxType = 1, emailId = '') {
  const request = types.ClaimEmailRequest.encode(
    types.ClaimEmailRequest.create({
      box_type: Number(boxType) || 1,
      email_id: String(emailId || ''),
    })
  ).finish();
  const { body } = await sendMsgAsync('gamepb.emailpb.EmailService', 'ClaimEmail', request);
  return types.ClaimEmailReply.decode(body);
}

async function batchClaimEmail(boxType = 0, emailId = '') {
  const request = types.BatchClaimEmailRequest.encode(
    types.BatchClaimEmailRequest.create({
      box_type: Number(boxType) || 0,
      email_id: String(emailId || ''),
    })
  ).finish();
  const { body } = await sendMsgAsync('gamepb.emailpb.EmailService', 'BatchClaimEmail', request);
  return types.BatchClaimEmailReply.decode(body);
}

// ---- 数据解析 ----

/**
 * 筛选出有未领取奖励的邮件
 */
function collectClaimableEmails(reply) {
  const emails = reply && Array.isArray(reply.emails) ? reply.emails : [];
  return emails.filter(
    (e) => e && e.id && e.has_reward === true && e.claimed !== true
  );
}

/**
 * 标准化邮箱类型：仅允许 1（系统）或 2（玩家），否则返回 0
 */
function normalizeBoxType(value) {
  const num = Number(value);
  return (num === 1 || num === 2) ? num : 0;
}

/**
 * 生成奖励摘要字符串
 * 1001 → 金币, 1002 → 经验, 500 → 点券
 */
function getRewardSummary(items) {
  const list = Array.isArray(items) ? items : [];
  const parts = [];
  for (const item of list) {
    const id = toNum(item.id);
    const count = toNum(item.count);
    if (count <= 0) continue;
    if (id === 1001 || id === 500001) {
      parts.push(`金币${count}`);
    } else if (id === 1002 || id === 500002) {
      parts.push(`经验${count}`);
    } else if (id === 500) {
      parts.push(`点券${count}`);
    } else {
      const info = getItemById(id);
      const name = info && info.name ? String(info.name) : `物品#${id}`;
      parts.push(`${name}x${count}`);
    }
  }
  return parts.join('/');
}

// ---- 主逻辑 ----

/**
 * 检查并领取所有邮箱奖励
 * @param {boolean} force - 强制检查（跳过每日完成和冷却检查）
 */
async function checkAndClaimEmails(force = false) {
  const now = Date.now();
  const emptyResult = { claimed: 0, rewardItems: 0 };

  if (!force && isDoneToday()) return emptyResult;

  const result = { claimed: 0, rewardItems: 0 };

  if (!force && now - lastCheckAt < CHECK_COOLDOWN_MS) return result;

  lastCheckAt = now;

  try {
    // 同时获取两种邮箱类型的列表
    const [boxType1Reply, boxType2Reply] = await Promise.all([
      getEmailList(1).catch(() => ({ emails: [] })),
      getEmailList(2).catch(() => ({ emails: [] })),
    ]);

    // 合并去重邮件
    const merged = new Map();
    const list1 = (boxType1Reply.emails || []).map((e) => ({ ...e, __boxType: 1 }));
    const list2 = (boxType2Reply.emails || []).map((e) => ({ ...e, __boxType: 2 }));

    for (const email of [...list1, ...list2]) {
      if (!email || !email.id) continue;
      if (!merged.has(email.id)) {
        merged.set(email.id, email);
        continue;
      }
      const existing = merged.get(email.id);
      const existingClaimable = !!(existing && existing.has_reward === true && existing.claimed !== true);
      const newClaimable = !!(email && email.has_reward === true && email.claimed !== true);
      // 优先保留可领取的那个
      if (!existingClaimable && newClaimable) {
        merged.set(email.id, email);
      }
    }

    const claimable = collectClaimableEmails({ emails: [...merged.values()] });

    if (claimable.length === 0) {
      markDoneToday();
      log('邮箱', '今日暂无可领取邮箱奖励', { module: 'task', event: DAILY_KEY, result: 'none' });
      return { claimed: 0, rewardItems: 0 };
    }

    const allItems = [];
    let claimed = 0;

    // 按邮箱类型分组
    const groupedByBox = new Map();
    for (const email of claimable) {
      const box = normalizeBoxType(email && email.__boxType);
      if (!groupedByBox.has(box)) groupedByBox.set(box, []);
      groupedByBox.get(box).push(email);
    }

    // 先尝试批量领取
    for (const [boxType, emails] of groupedByBox.entries()) {
      try {
        const firstId = String(emails[0] && emails[0].id || '');
        if (firstId) {
          const batchResult = await batchClaimEmail(boxType, firstId);
          if (Array.isArray(batchResult.items) && batchResult.items.length > 0) {
            allItems.push(...batchResult.items);
          }
          claimed += 1;
        }
      } catch (_) {
        // 批量领取失败，下面逐个重试
      }
    }

    // 逐个领取（回退）
    for (const email of claimable) {
      const boxType = normalizeBoxType(email && email.__boxType);
      try {
        const result = await claimEmail(boxType, String(email.id || ''));
        if (Array.isArray(result.items) && result.items.length > 0) {
          allItems.push(...result.items);
        }
        claimed += 1;
      } catch (_) {
        // 单个失败跳过
      }
    }

    if (claimed > 0) {
      const summary = getRewardSummary(allItems);
      log('邮箱',
        summary
          ? `[邮箱领取] 领取成功 ${claimed} 封 → ${summary}`
          : `[邮箱领取] 领取成功 ${claimed} 封`,
        { module: 'task', event: DAILY_KEY, result: 'ok', count: claimed }
      );
      markDoneToday();
    }

    return { claimed, rewardItems: allItems.length };
  } catch (err) {
    log('邮箱', `领取邮箱奖励失败: ${err.message}`, {
      module: 'task', event: DAILY_KEY, result: 'error',
    });
    return { claimed: 0, rewardItems: 0 };
  }
}

module.exports = {
  getEmailList,
  claimEmail,
  batchClaimEmail,
  checkAndClaimEmails,
  getEmailDailyState: () => ({
    key: DAILY_KEY,
    doneToday: isDoneToday(),
    lastCheckAt,
  }),
};
