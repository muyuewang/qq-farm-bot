"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WxLoginService = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const { getNativeWxLoginCode } = require("./native-protocol");
function asRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}
const QR_CONNECT_URL = "https://open.weixin.qq.com/connect/qrconnect";
const QR_IMAGE_BASE = "https://open.weixin.qq.com/connect/qrcode/";
const QR_POLL_URL = "https://long.open.weixin.qq.com/connect/l/qrconnect";
const CALLBACK_URL = "https://yybadaccess.3g.qq.com/pc_yyb/pcyyb_oauth";
const LOGIN_BUFFER_URL = "https://yybadaccess.3g.qq.com/pc_yyb_auth/pcyyb_get_wx_login_buffer_auth";
const REFRESH_TOKEN_URL = "https://yybadaccess.3g.qq.com/pc_yyb_auth/pcyyb_refresh_token_auth";
const USER_INFO_URL = "https://yybadaccess.3g.qq.com/pc_yyb/pcyyb_get_user_info";
const OAUTH_APP_ID = "wxd44977328b36e647";
const USER_AGENT = "Mozilla/5.0";
const LOGIN_BUFFER_ACCESS_KEY = "wgrdg373hy26ww2";
function cookieHeader(cookies) {
    return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}
function storeCookies(cookies, headers) {
    const headerValue = headers.get("set-cookie");
    const extendedHeaders = headers;
    const values = typeof extendedHeaders.getSetCookie === "function"
        ? extendedHeaders.getSetCookie()
        : headerValue ? [headerValue] : [];
    for (const value of values) {
        const pair = value.split(";", 1)[0].trim();
        const separator = pair.indexOf("=");
        if (separator > 0)
            cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
}
async function request(url, cookies, init = {}, timeout = 35e3) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        let currentUrl = url;
        let method = init.method || "GET";
        let body = init.body;
        for (let redirects = 0; redirects <= 5; redirects++) {
            const headers = new Headers(init.headers);
            headers.set("User-Agent", USER_AGENT);
            if (cookies.size)
                headers.set("Cookie", cookieHeader(cookies));
            const response = await fetch(currentUrl, { ...init, method, body, headers, redirect: "manual", signal: controller.signal });
            storeCookies(cookies, response.headers);
            const location = response.headers.get("location");
            if (response.status < 300 || response.status >= 400 || !location) {
                return { status: response.status, body: Buffer.from(await response.arrayBuffer()), headers: response.headers };
            }
            currentUrl = new URL(location, currentUrl).toString();
            if (response.status === 303 || (response.status === 301 || response.status === 302) && method === "POST") {
                method = "GET";
                body = void 0;
            }
        }
        throw new Error("Too many redirects while contacting WeChat");
    }
    finally {
        clearTimeout(timer);
    }
}
function requiredCookie(cookies, name) {
    const value = cookies.get(name);
    if (!value)
        throw new Error(`WeChat OAuth callback did not provide ${name}`);
    return value;
}
function pickLoginBuffer(data) {
    const source = asRecord(data);
    const snake = asRecord(asRecord(asRecord(source.ext_info).list_s).login_buffer).value;
    const camel = asRecord(asRecord(asRecord(source.extInfo).listS).loginBuffer).value;
    const value = (Array.isArray(snake) ? snake[0] : undefined)
        || (Array.isArray(camel) ? camel[0] : undefined)
        || "";
    return typeof value === "string" ? value : "";
}
function attachRotatedCredentials(error, refreshToken, accessToken) {
    const credentialError = (error instanceof Error ? error : new Error(String(error)));
    credentialError.refreshtoken = refreshToken;
    credentialError.accesstoken = accessToken;
    return credentialError;
}
class WxLoginService {
    async createQrSession() {
        const cookies = /* @__PURE__ */ new Map();
        const params = new URLSearchParams({
            appid: OAUTH_APP_ID,
            redirect_uri: `${CALLBACK_URL}?login_type=WX`,
            response_type: "code",
            scope: "snsapi_login,snsapi_runtime_pcsdk",
            state: "web",
            fast_login: "1",
            self_redirect: "true"
        });
        const page = await request(`${QR_CONNECT_URL}?${params}`, cookies);
        if (page.status < 200 || page.status >= 300)
            throw new Error(`Unable to create WeChat QR session (HTTP ${page.status})`);
        const uuid = /\/connect\/qrcode\/([^"'>\s]+)/.exec(page.body.toString("utf8"))?.[1];
        if (!uuid)
            throw new Error("Unable to parse the WeChat QR session");
        const qr = await request(`${QR_IMAGE_BASE}${encodeURIComponent(uuid)}`, cookies);
        if (qr.status < 200 || qr.status >= 300)
            throw new Error(`Unable to download WeChat QR image (HTTP ${qr.status})`);
        return { session: { cookies, uuid }, qr: qr.body };
    }
    async poll(session) {
        if (session.oauthCode)
            return "authorized";
        const params = new URLSearchParams({ uuid: String(session.uuid || ""), _: String(Date.now()) });
        const response = await request(`${QR_POLL_URL}?${params}`, session.cookies, {}, 35e3);
        if (response.status < 200 || response.status >= 300)
            throw new Error(`WeChat QR polling failed (HTTP ${response.status})`);
        const body = response.body.toString("utf8");
        const errcode = /wx_errcode\s*=\s*(\d+)/.exec(body)?.[1];
        if (errcode === "408")
            return "waiting";
        if (errcode === "404")
            return "scanned";
        if (errcode === "403")
            return "cancelled";
        if (errcode === "402")
            return "expired";
        if (errcode === "405") {
            const code = /wx_code\s*=\s*'([^']+)'/.exec(body)?.[1];
            if (!code)
                throw new Error("WeChat authorization response did not include a code");
            session.oauthCode = code;
            return "authorized";
        }
        throw new Error("Unrecognized WeChat QR polling response");
    }
    async confirm(session) {
        if (!session.oauthCode)
            throw new Error("Waiting for scan authorization");
        const params = new URLSearchParams({ login_type: "WX", code: session.oauthCode, state: "web" });
        const callback = await request(`${CALLBACK_URL}?${params}`, session.cookies);
        if (callback.status < 200 || callback.status >= 400)
            throw new Error(`WeChat authorization callback failed (HTTP ${callback.status})`);
        const openid = requiredCookie(session.cookies, "openid");
        const accessToken = requiredCookie(session.cookies, "accesstoken");
        // refreshtoken 可选（部分环境不回传）；存在则用于 loginBuffer 保活刷新
        const refreshToken = session.cookies.get("refreshtoken") || "";
        const payload = JSON.stringify({ extInfo: { listS: { unionid: { value: [openid] }, user_id: { value: [openid] }, access_token: { value: [accessToken] } }, listI: { user_type: { value: [0] } } } });
        const timestamp = String(Date.now());
        const nonce = String(node_crypto_1.default.randomInt(1e3, 1e4));
        const signature = node_crypto_1.default.createHash("md5").update(`${payload}${timestamp}${LOGIN_BUFFER_ACCESS_KEY}${nonce}`).digest("hex");
        const response = await request(LOGIN_BUFFER_URL, session.cookies, {
            method: "POST",
            body: payload,
            headers: { "Content-Type": "application/json", "Ual-Access-Businessid": "pc_yyb_auth", "Ual-Access-Timestamp": timestamp, "Ual-Access-Nonce": nonce, "Ual-Access-Signature": signature }
        });
        if (response.status < 200 || response.status >= 300)
            throw new Error(`Unable to obtain WeChat login buffer (HTTP ${response.status})`);
        const data = asRecord(JSON.parse(response.body.toString("utf8")));
        const loginBuffer = data.code === 0 ? pickLoginBuffer(data) : "";
        if (typeof loginBuffer !== "string" || !loginBuffer)
            throw new Error("WeChat login buffer response is invalid");
        session.cookies.clear();
        session.openid = openid;
        session.accesstoken = accessToken;
        session.refreshtoken = refreshToken;
        session.loginBuffer = loginBuffer;
        return { openid, loginBuffer };
    }
    async fetchUserInfo(session) {
        if (!session || !session.openid || !session.accesstoken)
            throw new Error("登录会话未确认，无法获取用户信息");
        const timestamp = String(Date.now());
        const nonce = String(node_crypto_1.default.randomInt(1e3, 1e4));
        // pcyyb_get_user_info 的签名 key 为空串：md5(ts + "" + nonce)
        const signature = node_crypto_1.default.createHash("md5").update(`${timestamp}${nonce}`).digest("hex");
        const response = await request(USER_INFO_URL, session.cookies, {
            headers: {
                "Ual-Access-Access-Token": session.accesstoken,
                "Ual-Access-Login-Type": "2",
                "Ual-Access-Openid": session.openid,
                "Ual-Access-Businessid": "pc_yyb",
                "Ual-Access-Guid": "web",
                "Ual-Access-Nonce": nonce,
                "Ual-Access-Requestid": String(node_crypto_1.default.randomInt(1e3, 1e4)),
                "Ual-Access-Signature": signature,
                "Ual-Access-Timestamp": timestamp
            }
        });
        if (response.status < 200 || response.status >= 300)
            throw new Error(`Unable to fetch WeChat user info (HTTP ${response.status})`);
        return asRecord(JSON.parse(response.body.toString("utf8")));
    }
    async issueCode(session, appId) {
        if (!session.loginBuffer)
            throw new Error("WeChat login session has not been confirmed");
        return getNativeWxLoginCode(session.loginBuffer, appId);
    }
    async refreshLoginBuffer(session) {
        if (!session || !session.openid || !session.refreshtoken)
            throw new Error("缺少刷新凭证（refreshtoken），请重新扫码登录");
        // 字段必须 camelCase（refreshTokenRequest：userInfo/openId/refreshToken/accessToken/loginType），
        // 用 snake_case 服务器解析不到 refreshtoken → code=-109 "RefreshToken empty token"
        const payload = JSON.stringify({ userInfo: { openId: session.openid, refreshToken: session.refreshtoken, accessToken: session.accesstoken || "", loginType: "WX" } });
        const timestamp = String(Date.now());
        const nonce = String(node_crypto_1.default.randomInt(1e3, 1e4));
        const signature = node_crypto_1.default.createHash("md5").update(`${payload}${timestamp}${LOGIN_BUFFER_ACCESS_KEY}${nonce}`).digest("hex");
        const response = await request(REFRESH_TOKEN_URL, session.cookies, {
            method: "POST",
            body: payload,
            headers: { "Content-Type": "application/json", "Ual-Access-Businessid": "pc_yyb_auth", "Ual-Access-Timestamp": timestamp, "Ual-Access-Nonce": nonce, "Ual-Access-Signature": signature }
        });
        if (response.status < 200 || response.status >= 300)
            throw new Error(`Unable to refresh WeChat token (HTTP ${response.status})`);
        const data = asRecord(JSON.parse(response.body.toString("utf8")));
        if (data.code !== 0)
            throw new Error(`WeChat token refresh failed: code=${String(data.code)} msg=${String(data.msg)}`);
        const info = asRecord(data.user_info || data.userInfo);
        const accessToken = String(info.access_token || info.accessToken || "");
        const refreshToken = String(info.refresh_token || info.refreshToken || session.refreshtoken);
        if (!accessToken)
            throw new Error("WeChat token refresh response missing access_token");
        // refresh token 为滚动凭证：刷新接口成功后旧 token 已失效，后续 loginBuffer 请求即使失败，
        // 调用方也必须持久化这里的新 token，避免下一次使用旧 token 永久陷入 40030。
        session.accesstoken = accessToken;
        session.refreshtoken = refreshToken;
        // 用新凭证换新 loginBuffer（凭证放 Cookie 头，服务器可能校验）
        const lbPayload = JSON.stringify({ extInfo: { listS: { unionid: { value: [session.openid] }, user_id: { value: [session.openid] }, access_token: { value: [accessToken] } }, listI: { user_type: { value: [0] } } } });
        const ts2 = String(Date.now());
        const nonce2 = String(node_crypto_1.default.randomInt(1e3, 1e4));
        const sig2 = node_crypto_1.default.createHash("md5").update(`${lbPayload}${ts2}${LOGIN_BUFFER_ACCESS_KEY}${nonce2}`).digest("hex");
        try {
            const lbResp = await request(LOGIN_BUFFER_URL, session.cookies, {
                method: "POST",
                body: lbPayload,
                headers: { "Content-Type": "application/json", "Ual-Access-Businessid": "pc_yyb_auth", "Ual-Access-Timestamp": ts2, "Ual-Access-Nonce": nonce2, "Ual-Access-Signature": sig2, "Cookie": `openid=${session.openid}; accesstoken=${accessToken}; refreshtoken=${refreshToken}` }
            });
            if (lbResp.status < 200 || lbResp.status >= 300)
                throw new Error(`Unable to obtain WeChat login buffer (HTTP ${lbResp.status})`);
            const lbData = asRecord(JSON.parse(lbResp.body.toString("utf8")));
            const loginBuffer = lbData.code === 0 ? pickLoginBuffer(lbData) : "";
            if (typeof loginBuffer !== "string" || !loginBuffer) {
                throw new Error(`WeChat login buffer refresh failed: code=${String(lbData.code ?? "unknown")} msg=${String(lbData.msg || "invalid response")}`);
            }
            session.loginBuffer = loginBuffer;
            return { loginBuffer, refreshtoken: refreshToken, accesstoken: accessToken };
        }
        catch (error) {
            throw attachRotatedCredentials(error, refreshToken, accessToken);
        }
    }
    destroy(session) {
        session.cookies.clear();
        session.oauthCode = void 0;
        session.openid = void 0;
        session.accesstoken = void 0;
        session.refreshtoken = void 0;
        session.loginBuffer = void 0;
    }
}
exports.WxLoginService = WxLoginService;

