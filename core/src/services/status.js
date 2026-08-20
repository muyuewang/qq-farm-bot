const process = require('node:process');
const { getLevelExpTable, getLevelExpProgress } = require('../config/gameConfig');

// ─── 外部钩子 ───

let recordGoldExpHook = null;

/** 设置金币/经验回调钩子（用于 stats 追踪） */
function setRecordGoldExpHook(hook) {
  recordGoldExpHook = hook;
}

// ─── 状态数据 ───

const statusData = {
  platform: 'qq',
  name: '',
  level: 0,
  gold: 0,
  exp: 0,
  gid: 0,
  openId: '',
  avatar: ''
};

// ─── ANSI 转义序列 ───

const STATUS_LINES = 2;  // 状态栏占用底部 2 行
const ESC = '\x1B';
const SAVE_CURSOR = `${ESC  }7`;
const RESTORE_CURSOR = `${ESC  }8`;
const MOVE_TO = (row, col) => `${ESC  }[${  row  };${  col  }H`;
const CLEAR_LINE = `${ESC  }[2K`;
const SCROLL_REGION = (top, bottom) => `${ESC  }[${  top  };${  bottom  }r`;
const RESET_SCROLL = `${ESC  }[r`;

// 样式
const BOLD = `${ESC  }[1m`;
const RESET = `${ESC  }[0m`;
const DIM = `${ESC  }[2m`;
const CYAN = `${ESC  }[36m`;
const YELLOW = `${ESC  }[33m`;
const GREEN = `${ESC  }[32m`;
const MAGENTA = `${ESC  }[35m`;

let statusEnabled = false;
let termRows = 25;

/** 初始化终端状态栏（需要 TTY） */
function initStatusBar() {
  if (!process.stdout.isTTY) return false;

  termRows = process.stdout.rows || 25;
  statusEnabled = true;

  // 设置滚动区域：顶部到状态栏上方
  process.stdout.write(SCROLL_REGION(1, termRows - STATUS_LINES));
  process.stdout.write(MOVE_TO(termRows - STATUS_LINES + 1, 1));

  // 监听终端 resize 事件
  process.stdout.on('resize', () => {
    termRows = process.stdout.rows || 25;
    process.stdout.write(SCROLL_REGION(1, termRows - STATUS_LINES));
    renderStatusBar();
  });

  renderStatusBar();
  return true;
}

/** 清理状态栏，恢复正常终端 */
function cleanupStatusBar() {
  if (!statusEnabled) return;
  statusEnabled = false;
  process.stdout.write(RESET_SCROLL);
  // 清除底部两行
  process.stdout.write(MOVE_TO(termRows - 1, 1) + CLEAR_LINE);
  process.stdout.write(MOVE_TO(termRows, 1) + CLEAR_LINE);
}

/** 渲染底部状态栏 */
function renderStatusBar() {
  if (!statusEnabled) return;

  const { platform, name, level, gold, exp } = statusData;

  const platformStr = platform === 'wx'
    ? `${MAGENTA  }微信${  RESET}`
    : `${CYAN  }QQ${  RESET}`;

  const nameStr = name ? `${BOLD}${name}${RESET}` : '未登录';
  const levelStr = `${GREEN}Lv${level}${RESET}`;
  const goldStr = `${YELLOW}金币:${gold}${RESET}`;

  let expStr = '';
  if (level > 0 && exp >= 0) {
    const expTable = getLevelExpTable();
    if (expTable) {
      const progress = getLevelExpProgress(level, exp);
      expStr = `${DIM}经验:${progress.current}/${progress.needed}${RESET}`;
    } else {
      expStr = `${DIM}经验:${exp}${RESET}`;
    }
  }

  const statusLine = `${platformStr} | ${nameStr} | ${levelStr} | ${goldStr}${expStr ? ` | ${  expStr}` : ''}`;
  const cols = process.stdout.columns || 80;
  const separator = `${DIM}${'─'.repeat(Math.min(cols, 120))}${RESET}`;

  process.stdout.write(SAVE_CURSOR);
  // 第 1 行状态栏：倒数第 2 行
  process.stdout.write(MOVE_TO(termRows - 1, 1) + CLEAR_LINE + statusLine);
  // 第 2 行：分割线
  process.stdout.write(MOVE_TO(termRows, 1) + CLEAR_LINE + separator);
  process.stdout.write(RESTORE_CURSOR);
}

/**
 * 更新状态数据（部分更新）
 * @param {object} changes - 要更新的字段
 */
function updateStatus(changes) {
  let dirty = false;
  for (const key of Object.keys(changes)) {
    if (statusData[key] !== changes[key]) {
      statusData[key] = changes[key];
      dirty = true;
    }
  }
  if (dirty) {
    if (statusEnabled) renderStatusBar();
    // 通知 stats 层更新金币/经验
    if (recordGoldExpHook && (changes.gold !== undefined || changes.exp !== undefined)) {
      try {
        recordGoldExpHook(statusData.gold, statusData.exp);
      } catch {}
    }
  }
}

function setStatusPlatform(platform) {
  updateStatus({ platform });
}

/** 从登录结果更新状态 */
function updateStatusFromLogin(loginData) {
  updateStatus({
    name: loginData.name || statusData.name,
    level: loginData.level ?? statusData.level,
    gold: loginData.gold ?? statusData.gold,
    exp: loginData.exp ?? statusData.exp,
    gid: loginData.gid ?? statusData.gid,
    openId: loginData.openId || statusData.openId,
    avatar: loginData.avatar || statusData.avatar
  });
}

function updateStatusGold(gold) {
  updateStatus({ gold });
}

function updateStatusLevel(level, exp) {
  const changes = { level };
  if (exp !== undefined) changes.exp = exp;
  updateStatus(changes);
}

module.exports = {
  initStatusBar,
  setRecordGoldExpHook,
  cleanupStatusBar,
  updateStatus,
  setStatusPlatform,
  updateStatusFromLogin,
  updateStatusGold,
  updateStatusLevel,
  statusData
};
