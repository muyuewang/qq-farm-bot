"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkQR = checkQR;
exports.consumePendingWxInfo = consumePendingWxInfo;
exports.getAccountAvatar = getAccountAvatar;
exports.getFarmCode = getFarmCode;
exports.getQRCode = getQRCode;
exports.keepWxCredentialAlive = keepWxCredentialAlive;
exports.peekPendingWxInfo = peekPendingWxInfo;
exports.withAccountCredentialLock = withAccountCredentialLock;
const node_crypto_1 = __importDefault(require("node:crypto"));
const logger_1 = require("./logger");
const service_1 = require("./wx-login/service");
/**
 * 微信登录适配层（vxcode 风格接口）
 * 内部实现：纯 Node 进程内应用宝协议（wx-login service，MMTLS）
 */
const { getAccounts, addOrUpdateAccount } = require('../models/store');
const logger = (0, logger_1.createModuleLogger)('wx-login-adapter');
// 农场小游戏 appid（与 ACE 反作弊 tsdk MINI_PROGRAM_APP_ID 一致）
const TARGET_APP_ID = 'wx5306c5978fdb76e4';
const WX_SESSION_TTL_MS = 300 * 1000;
const wxLogin = new service_1.WxLoginService();
// uuid -> { owner, session, openid, loginBuffer, createdAt }
const wxSessions = new Map();
const farmCodeRequests = new Map();
const credentialOperations = new Map();
function asRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function asRotatedCredentialError(error) {
    return (error instanceof Error ? error : new Error(String(error)));
}
function findAccountByWxid(openid, accountId = '') {
    if (!openid)
        return null;
    const list = typeof getAccounts === 'function' ? getAccounts() : { accounts: [] };
    const accounts = Array.isArray(list) ? list : list.accounts;
    if (accountId) {
        return accounts.find(account => account && String(account.id) === String(accountId)
            && String(account.wxid || '') === String(openid)) || null;
    }
    return accounts.find(account => account && String(account.wxid || '') === String(openid)) || null;
}
function cleanupExpiredSessions() {
    const now = Date.now();
    for (const [uuid, entry] of wxSessions) {
        if (now - entry.createdAt > WX_SESSION_TTL_MS)
            wxSessions.delete(uuid);
    }
}
async function withAccountCredentialLock(openid, accountId, operation) {
    // accountId 是稳定身份；换绑 wxid 时也必须与旧账号正在执行的凭证操作互斥。
    const key = accountId ? `account:${String(accountId)}` : `openid:${String(openid)}`;
    const previous = credentialOperations.get(key) || Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    credentialOperations.set(key, current);
    try {
        return await current;
    }
    finally {
        if (credentialOperations.get(key) === current)
            credentialOperations.delete(key);
    }
}
function findOwnedWxSession(sessionId, openid, owner, requireLoginBuffer = false) {
    cleanupExpiredSessions();
    const uuid = String(sessionId || '');
    const targetOpenid = String(openid || '');
    const targetOwner = String(owner || '');
    const entry = wxSessions.get(uuid);
    if (!entry || !uuid || !targetOpenid || !targetOwner)
        return null;
    if (String(entry.owner || '') !== targetOwner || String(entry.openid || '') !== targetOpenid)
        return null;
    if (requireLoginBuffer && !entry.loginBuffer)
        return null;
    return { uuid, entry };
}
function buildPendingWxInfo(matched) {
    if (!matched)
        return null;
    const { uuid, entry } = matched;
    return {
        sessionId: uuid,
        loginBuffer: String(entry.loginBuffer || ''),
        refreshtoken: entry.refreshtoken || '',
        accesstoken: entry.accesstoken || '',
        avatar: entry.avatar || '',
        nickname: entry.nickname || '',
    };
}
// 从应用宝用户信息响应中取字段（顶层优先，兜底 ext_info.list_s 嵌套）
function pickUserInfoValue(info, keys) {
    const source = asRecord(info);
    for (const k of keys) {
        const v = source[k];
        if (typeof v === 'string' && v)
            return v;
    }
    const nested = asRecord(asRecord(source.ext_info).list_s);
    if (Object.keys(nested).length > 0) {
        for (const k of keys) {
            const v = nested[k];
            if (typeof v === 'string' && v)
                return v;
            const value = asRecord(v).value;
            if (Array.isArray(value)) {
                const first = value.find((item) => typeof item === 'string' && item.length > 0);
                if (first !== undefined)
                    return first;
            }
        }
    }
    return '';
}
// 头像 URL 白名单：仅允许 https 的微信头像域名（qlogo.cn 系），防 SSRF
function isAllowedAvatarUrl(url) {
    if (typeof url !== 'string')
        return false;
    if (!/^https:\/\//i.test(url))
        return false;
    try {
        const host = new URL(url).hostname;
        return host === 'qlogo.cn' || host.endsWith('.qlogo.cn');
    }
    catch {
        return false;
    }
}
/**
 * 取待绑定微信账号的扫码会话数据（loginBuffer/头像/昵称）
 * 时序：JSLogin（getFarmCode）在账号创建前被调用，loginBuffer 需在创建账号时补上
 * 返回会话快照，不在账号持久化成功前消费。
 */
function peekPendingWxInfo(sessionId, openid, owner) {
    return buildPendingWxInfo(findOwnedWxSession(sessionId, openid, owner, true));
}
function consumePendingWxInfo(sessionId, openid, owner) {
    const id = String(sessionId || '');
    const targetOpenid = String(openid || '');
    const entry = wxSessions.get(id);
    if (!entry || entry.openid !== targetOpenid || String(entry.owner || '') !== String(owner || ''))
        return false;
    wxSessions.delete(id);
    return true;
}
// MMTLS 握手失败错误 → 可读指引（区分凭证失效与网络波动）
function humanizeWxCodeError(raw) {
    const s = String(raw || '').replace(/(\btoken\s+)[^\s,;]+/gi, '$1[REDACTED]');
    if (s.includes('ManualAuth rejected')) {
        return '微信登录凭证已失效，请在面板重新扫码登录';
    }
    if (s.includes('socket read timeout') || s.includes('Unable to establish') || s.includes('invalid HTTP response')) {
        return '无法连接微信服务器（网络波动），请稍后重试；若持续失败请重新扫码登录';
    }
    return s;
}
/**
 * 获取微信登录二维码
 * 返回: { Success, Data: { Uuid, QrBase64 } }
 */
async function getQRCode(owner) {
    if (!owner)
        return { Success: false, Message: '缺少登录用户信息' };
    cleanupExpiredSessions();
    try {
        const { session, qr } = await wxLogin.createQrSession();
        const uuid = node_crypto_1.default.randomBytes(16).toString('hex');
        wxSessions.set(uuid, { owner: String(owner || ''), session, createdAt: Date.now() });
        return {
            Success: true,
            Data: {
                Uuid: uuid,
                QrBase64: qr.toString('base64'),
            },
        };
    }
    catch (error) {
        return { Success: false, Message: `获取二维码失败: ${errorMessage(error)}` };
    }
}
/**
 * 轮询扫码状态
 * 返回: { Success, Data: { status } } 或 { Success, Data: { acctSectResp } }
 */
async function checkQR(uuid, owner) {
    const sessionId = String(uuid || '');
    const entry = wxSessions.get(sessionId);
    if (!entry || String(entry.owner || '') !== String(owner || '')) {
        return { Success: false, Message: '二维码已过期，请重新获取' };
    }
    if (Date.now() - entry.createdAt > WX_SESSION_TTL_MS) {
        wxSessions.delete(sessionId);
        return { Success: false, Message: '二维码已过期，请重新获取' };
    }
    try {
        const status = await wxLogin.poll(entry.session);
        switch (status) {
            case 'waiting':
                // 等待扫码
                return { Success: true, Data: { status: 0 } };
            case 'scanned':
                // 已扫码，等待用户确认
                return { Success: true, Data: { status: 1 } };
            case 'authorized': {
                // confirm 只执行一次（OAuth code 一次性，重放已消费的 code 会失败卡死会话）
                if (!entry.confirmed) {
                    if (!entry.confirmPromise) {
                        entry.confirmPromise = (async () => {
                            const { openid } = await wxLogin.confirm(entry.session);
                            entry.openid = openid;
                            entry.loginBuffer = entry.session.loginBuffer;
                            entry.refreshtoken = entry.session.refreshtoken || '';
                            entry.accesstoken = entry.session.accesstoken || '';
                            // 拉取应用宝用户信息（真实昵称 + 头像 URL），失败不阻断登录
                            try {
                                const info = await wxLogin.fetchUserInfo(entry.session);
                                entry.nickname = pickUserInfoValue(info, ['nick_name']) || '';
                                entry.avatar = pickUserInfoValue(info, ['head_img_url', 'head_url', 'headimgurl', 'avatar']) || '';
                            }
                            catch (error) {
                                logger.warn('fetch wx user info failed', { error: errorMessage(error) });
                            }
                        })();
                    }
                    try {
                        await entry.confirmPromise;
                        entry.confirmed = true;
                    }
                    catch (error) {
                        entry.confirmPromise = null;
                        throw error;
                    }
                }
                return {
                    Success: true,
                    Data: {
                        acctSectResp: {
                            userName: entry.openid,
                            nickName: entry.nickname || '微信用户',
                        },
                    },
                };
            }
            case 'cancelled':
                return { Success: false, Message: '用户取消扫码' };
            case 'expired':
                wxSessions.delete(sessionId);
                return { Success: false, Message: '二维码已过期，请重新获取' };
            default:
                return { Success: false, Message: `未知状态: ${status}` };
        }
    }
    catch (error) {
        return { Success: false, Message: `检查登录状态失败: ${errorMessage(error)}` };
    }
}
/**
 * 获取 QQ 农场登录 code（Farm5 compat: openid + forceRefresh）
 * 数据源：账号持久化的 loginBuffer（扫码 confirm 时保存）→ MMTLS 换 code
 * 返回: { Success, Data: { code } }
 */
async function issueFarmCode(openid, options = {}) {
    if (!openid) {
        return { Success: false, Message: '缺少 openid' };
    }
    try {
        // 扫码链路必须显式指定当前用户拥有的会话；后台刷新只使用目标账号的持久化凭证。
        let loginBuffer = '';
        let refreshtoken = '';
        let accesstoken = '';
        let entryAvatar = '';
        const matchedSession = options.sessionId
            ? findOwnedWxSession(options.sessionId, openid, options.owner)
            : null;
        if (options.sessionId && !matchedSession) {
            return { Success: false, Message: '扫码会话无效或已过期，请重新扫码' };
        }
        const sessionEntry = matchedSession && matchedSession.entry;
        if (sessionEntry) {
            if (sessionEntry.loginBuffer)
                loginBuffer = String(sessionEntry.loginBuffer);
            if (sessionEntry.refreshtoken)
                refreshtoken = String(sessionEntry.refreshtoken);
            if (sessionEntry.accesstoken)
                accesstoken = String(sessionEntry.accesstoken);
            if (sessionEntry.avatar)
                entryAvatar = String(sessionEntry.avatar);
        }
        // 后台链路只读取指定账号，避免相同 openid 的多用户账号互相覆盖凭证。
        const account = sessionEntry ? null : findAccountByWxid(openid, options.accountId);
        if (!sessionEntry && account) {
            if (!loginBuffer && account.loginBuffer)
                loginBuffer = String(account.loginBuffer);
            if (!refreshtoken && account.refreshtoken)
                refreshtoken = String(account.refreshtoken);
            if (!accesstoken && account.accesstoken)
                accesstoken = String(account.accesstoken);
        }
        if (!loginBuffer) {
            return { Success: false, Message: '缺少登录凭证（loginBuffer），请重新扫码登录' };
        }
        // 3. 换 code；loginBuffer 失效（ManualAuth rejected）时用 refreshtoken 自动续期重试
        let code = '';
        try {
            code = await wxLogin.issueCode({ loginBuffer }, TARGET_APP_ID);
        }
        catch (issueError) {
            const msg = errorMessage(issueError);
            if (refreshtoken && msg.includes('ManualAuth rejected')) {
                try {
                    // 传空 cookie jar（refresh 请求不依赖 OAuth 回调 cookie，Ual-Access 头鉴权）
                    const refreshed = await wxLogin.refreshLoginBuffer({ openid: String(openid), refreshtoken, accesstoken, cookies: new Map() });
                    loginBuffer = refreshed.loginBuffer;
                    refreshtoken = refreshed.refreshtoken;
                    accesstoken = refreshed.accesstoken || accesstoken;
                    // 编辑重扫随后会保存账号；同步会话中的滚动凭证，避免保存步骤回滚为刷新前的 token。
                    if (sessionEntry) {
                        sessionEntry.loginBuffer = loginBuffer;
                        sessionEntry.refreshtoken = refreshtoken;
                        sessionEntry.accesstoken = accesstoken;
                    }
                    code = await wxLogin.issueCode({ loginBuffer }, TARGET_APP_ID);
                }
                catch (refreshError) {
                    const rotatedError = asRotatedCredentialError(refreshError);
                    // token 刷新成功后凭证已滚动；即使换 loginBuffer 失败，也必须保存新 token。
                    if (account && (rotatedError.refreshtoken || rotatedError.accesstoken)
                        && typeof addOrUpdateAccount === 'function') {
                        addOrUpdateAccount({
                            id: account.id,
                            ...(rotatedError.refreshtoken ? { refreshtoken: rotatedError.refreshtoken } : {}),
                            ...(rotatedError.accesstoken ? { accesstoken: rotatedError.accesstoken } : {}),
                        });
                    }
                    return { Success: false, Message: `获取 Code 失败: ${humanizeWxCodeError(rotatedError.message)}（自动续期失败，请重新扫码登录）` };
                }
            }
            else {
                return { Success: false, Message: `获取 Code 失败: ${humanizeWxCodeError(msg)}` };
            }
        }
        if (!code) {
            return { Success: false, Message: '获取 Code 失败（服务端未返回 code）' };
        }
        // 4. 成功后将 loginBuffer / refreshtoken / accesstoken / 头像持久化到账号（供自动重登/手动启动刷新 code）
        //    注意：refreshtoken/accesstoken 是滚动续期的（每次刷新返回新值），必须总是更新，否则旧 token 过期后续期断裂
        if (account) {
            const updates = {};
            if (loginBuffer && loginBuffer !== account.loginBuffer)
                updates.loginBuffer = loginBuffer;
            if (refreshtoken && refreshtoken !== account.refreshtoken)
                updates.refreshtoken = refreshtoken;
            if (accesstoken && accesstoken !== account.accesstoken)
                updates.accesstoken = accesstoken;
            // 头像也总是更新（重新扫码后头像可能变化，否则前端 cache-bust 的 ?v= 不变，面板一直显示旧头像）
            if (entryAvatar && entryAvatar !== account.avatar)
                updates.avatar = entryAvatar;
            if (Object.keys(updates).length > 0) {
                try {
                    if (typeof addOrUpdateAccount === 'function') {
                        addOrUpdateAccount({ id: account.id, ...updates });
                    }
                }
                catch (error) {
                    logger.warn('persist account fields failed', { openid, error: errorMessage(error) });
                }
            }
        }
        return { Success: true, Data: { code } };
    }
    catch (error) {
        return { Success: false, Message: `获取 Code 失败: ${humanizeWxCodeError(errorMessage(error))}` };
    }
}
async function getFarmCode(openid, options = {}) {
    const targetOpenid = String(openid || '');
    if (!targetOpenid)
        return { Success: false, Message: '缺少 openid' };
    const requestKey = `${targetOpenid}:${options.sessionId || `account:${options.accountId || ''}`}`;
    const inFlight = farmCodeRequests.get(requestKey);
    if (inFlight)
        return inFlight;
    const operation = () => issueFarmCode(targetOpenid, options);
    const request = (options.accountId
        ? withAccountCredentialLock(targetOpenid, options.accountId, operation)
        : operation()).finally(() => {
        if (farmCodeRequests.get(requestKey) === request)
            farmCodeRequests.delete(requestKey);
    });
    farmCodeRequests.set(requestKey, request);
    return request;
}
/**
 * 获取账号头像（微信）
 * 账号 avatar 字段（应用宝远程 URL）→ 白名单校验后代理下载
 * 返回 fetch Response（图片流），失败返回 null
 */
async function getAccountAvatar(openid) {
    if (!openid)
        return null;
    const account = findAccountByWxid(openid);
    const storedAvatar = account && account.avatar;
    if (storedAvatar && isAllowedAvatarUrl(storedAvatar)) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 10000);
            try {
                const response = await fetch(storedAvatar, { signal: controller.signal });
                if (response.ok)
                    return response;
            }
            finally {
                clearTimeout(timer);
            }
        }
        catch (error) {
            logger.warn('native avatar download failed', { openid, error: errorMessage(error) });
        }
    }
    return null;
}
/**
 * 微信凭证主动保活：用账号 refreshtoken 刷新 loginBuffer + refreshtoken（滚动续期）
 * 关键：loginBuffer 实际有效期 > 2h，而 refreshtoken 约 2h 过期——必须主动刷新（不等 loginBuffer 失效），
 * 否则 loginBuffer 失效时 refreshtoken 已过期，续期必然失败（code=-109），只能重新扫码。
 * 每 30 分钟调用一次：refreshtoken 2h 窗口内滚动续期，永不失效。
 */
async function keepWxCredentialAlive(acc) {
    const account = asRecord(acc);
    if (!account.wxid || !account.refreshtoken || !account.loginBuffer) {
        return { Success: false, Message: '缺少微信凭证（refreshtoken/loginBuffer），请重新扫码登录' };
    }
    return withAccountCredentialLock(account.wxid, account.id, async () => {
        const latestAccount = findAccountByWxid(account.wxid, account.id) || account;
        try {
            const refreshed = await wxLogin.refreshLoginBuffer({
                openid: String(latestAccount.wxid),
                refreshtoken: String(latestAccount.refreshtoken),
                accesstoken: String(latestAccount.accesstoken || ''),
                cookies: new Map(),
            });
            if (typeof addOrUpdateAccount === 'function') {
                addOrUpdateAccount({
                    id: account.id,
                    loginBuffer: refreshed.loginBuffer,
                    refreshtoken: refreshed.refreshtoken,
                    accesstoken: refreshed.accesstoken || latestAccount.accesstoken || '',
                });
            }
            logger.info('wx credential keepalive ok', { accountId: account.id });
            return { Success: true };
        }
        catch (error) {
            const rotatedError = asRotatedCredentialError(error);
            if ((rotatedError.refreshtoken || rotatedError.accesstoken) && typeof addOrUpdateAccount === 'function') {
                addOrUpdateAccount({
                    id: account.id,
                    ...(rotatedError.refreshtoken ? { refreshtoken: rotatedError.refreshtoken } : {}),
                    ...(rotatedError.accesstoken ? { accesstoken: rotatedError.accesstoken } : {}),
                });
            }
            const message = humanizeWxCodeError(rotatedError.message);
            logger.warn('keepWxCredentialAlive failed', { accountId: account.id, error: message });
            return { Success: false, Message: message };
        }
    });
}

