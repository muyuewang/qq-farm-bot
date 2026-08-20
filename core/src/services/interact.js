/**
 * 访客互动记录服务 - 获取和解析好友互动记录
 *
 * 功能：
 * - 多 RPC 路由尝试获取访客记录
 * - 互动类型识别（偷取/帮忙/捣乱）
 * - 作物名称解析
 */
const { getFruitName, getPlantByFruitId, getPlantById, getPlantName } = require('../config/gameConfig');
const { sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { logWarn, toNum, toTimeSec, sleep } = require('../utils/utils');

// ---- RPC 路由候选（按优先级尝试） ----

const RPC_CANDIDATES = [
  ['gamepb.interactpb.InteractService', 'InteractRecords'],
  ['gamepb.interactpb.InteractService', 'GetInteractRecords'],
  ['gamepb.interactpb.VisitorService', 'InteractRecords'],
  ['gamepb.interactpb.VisitorService', 'GetInteractRecords'],
];

// ---- 并发锁与最小间隔 ----

let fetchInteractLock = false;
let lastFetchInteractTime = 0;

// 两次请求最小间隔：500ms
const FETCH_INTERACT_MIN_INTERVAL_MS = 500;

// ---- 互动类型标签 ----

const ACTION_LABELS = {
  '1': '偷取作物',
  '2': '帮忙',
  '3': '捣乱',
};

function getActionLabel(actionType) {
  return ACTION_LABELS[actionType] || '互动';
}

// ---- 数据解析 ----

/**
 * 构建互动详情文字描述
 */
function buildActionDetail(record) {
  const cropCount = Number(record.cropCount) || 0;
  const times = Number(record.times) || 0;
  const landId = Number(record.landId) || 0;
  const parts = [];

  if (record.actionType === 1) {
    // 偷取
    if (record.cropName && cropCount > 0) {
      parts.push(`偷取 ${record.cropName} × ${cropCount}`);
    } else if (record.cropName) {
      parts.push(`偷取 ${record.cropName}`);
    } else if (cropCount > 0) {
      parts.push(`偷取作物 × ${cropCount}`);
    } else {
      parts.push('偷取作物');
    }
  } else if (record.actionType === 2) {
    // 帮忙
    parts.push(times > 0 ? `帮忙 ${times} 次` : '帮忙');
  } else if (record.actionType === 3) {
    // 捣乱
    parts.push(times > 0 ? `捣乱 ${times} 次` : '捣乱');
  } else {
    parts.push(times > 0 ? `互动 ${times} 次` : '互动');
  }

  if (landId > 0) parts.push(`地块 ${landId}`);

  return parts.join(' · ');
}

/**
 * 解析作物名称
 */
function resolveCropName(cropId) {
  const id = Number(cropId) || 0;
  if (id <= 0) return '';

  if (getPlantById(id)) return getPlantName(id);
  if (getPlantByFruitId(id)) return getFruitName(id);

  return '';
}

/**
 * 标准化互动记录
 */
function normalizeInteractRecord(raw, index) {
  const actionType = toNum(raw && raw.action_type);
  const visitorGid = toNum(raw && raw.visitor_gid);
  const cropId = toNum(raw && raw.crop_id);
  const cropCount = toNum(raw && raw.crop_count);
  const times = toNum(raw && raw.times);
  const level = toNum(raw && raw.level);
  const fromType = toNum(raw && raw.from_type);
  const serverTimeSec = toTimeSec(raw && raw.server_time);
  const extra = (raw && raw.extra) || {};
  const landId = toNum(extra.land_id);
  const flag1 = toNum(extra.flag1);
  const flag2 = toNum(extra.flag2);

  const cropName = resolveCropName(cropId);
  const nick = String(raw && raw.nick || '').trim() || `GID:${visitorGid}`;
  const avatarUrl = String(raw && raw.avatar_url || '').trim();

  const record = {
    key: `${serverTimeSec || 0}-${visitorGid || 0}-${actionType || 0}-${index}`,
    serverTimeSec,
    serverTimeMs: serverTimeSec > 0 ? serverTimeSec * 1000 : 0,
    actionType,
    actionLabel: getActionLabel(actionType),
    visitorGid,
    nick,
    avatarUrl,
    cropId,
    cropName,
    cropCount,
    times,
    fromType,
    level,
    landId,
    flag1,
    flag2,
  };

  record.actionDetail = buildActionDetail(record);
  return record;
}

// ---- RPC 调用 ----

/**
 * 获取互动记录（多路由尝试）
 */
async function fetchInteractReply() {
  if (!types.InteractRecordsRequest || !types.InteractRecordsReply) {
    throw new Error('访客记录 proto 未加载');
  }

  // 并发锁
  while (fetchInteractLock) {
    await sleep(100);
  }

  // 最小间隔检查
  const now = Date.now();
  const elapsed = now - lastFetchInteractTime;
  if (elapsed < FETCH_INTERACT_MIN_INTERVAL_MS) {
    await sleep(FETCH_INTERACT_MIN_INTERVAL_MS - elapsed);
  }

  fetchInteractLock = true;
  lastFetchInteractTime = Date.now();

  try {
    const request = types.InteractRecordsRequest.encode(
      types.InteractRecordsRequest.create({})
    ).finish();

    const errors = [];

    for (let i = 0; i < RPC_CANDIDATES.length; i++) {
      const [service, method] = RPC_CANDIDATES[i];
      try {
        // 非首个请求间隔 500ms
        if (i > 0) await sleep(500);
        const { body } = await sendMsgAsync(service, method, request);
        return types.InteractRecordsReply.decode(body);
      } catch (err) {
        const msg = err && err.message ? err.message : String(err || 'unknown');
        errors.push(`${service}.${method}: ${msg}`);

        // 服务端返回了业务错误码（如 code=1020002 网络繁忙），
        // 说明该接口存在于服务端但被拒绝了，不必继续尝试其他路由
        if (msg.includes('code=')) {
          break;
        }
      }
    }

    logWarn('好友', `访客记录接口调用失败: ${errors.join(' | ')}`, {
      module: 'friend',
      event: 'interact_records',
      result: 'error',
    });

    throw new Error('访客记录接口调用失败，请确认服务名和方法名是否与当前版本一致');
  } finally {
    fetchInteractLock = false;
  }
}

// ---- 主入口 ----

/**
 * 获取并标准化互动记录列表
 * 按时间降序 → 访客ID降序 → 操作类型降序排列
 */
async function getInteractRecords() {
  const reply = await fetchInteractReply();
  const records = Array.isArray(reply && reply.records) ? reply.records : [];

  return records
    .map((raw, idx) => normalizeInteractRecord(raw, idx))
    .sort(
      (a, b) =>
        b.serverTimeSec - a.serverTimeSec ||
        b.visitorGid - a.visitorGid ||
        b.actionType - a.actionType
    );
}

module.exports = {
  getInteractRecords,
};
