/**
 * 二维码登录服务 - 支持 QQ 扫码登录和小程序登录
 *
 * 功能：
 * - QQ 网页扫码登录（VIP/QZone 渠道）
 * - QQ 小程序登录码生成与状态轮询
 */
const { Buffer } = require('node:buffer');
const axios = require('axios');
const QRCode = require('qrcode');
const { CookieUtils, HashUtils } = require('../utils/qrutils');

// 浏览器 UA
const ChromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ---- QQ 网页扫码登录渠道预设 ----

const QQ_VIP_PRESET = {
  name: 'QQ会员 (VIP)',
  description: 'QQ会员官网',
  aid: '8000201',
  daid: '18',
  redirectUri: 'https://vip.qq.com/loginsuccess.html',
  referrer: 'https://xui.ptlogin2.qq.com/cgi-bin/xlogin?appid=8000201&style=20&s_url=https%3A%2F%2Fvip.qq.com%2Floginsuccess.html&maskOpacity=60&daid=18&target=self',
};

const QQ_QZONE_PRESET = {
  name: 'QQ空间 (QZone)',
  description: 'QQ空间网页版',
  aid: '549000912',
  daid: '5',
  redirectUri: 'https://qzs.qzone.qq.com/qzone/v5/loginsucc.html?para=izone',
  referrer: 'https://qzone.qq.com/',
};

// ---- QQ 扫码登录会话 ----

class QRLoginSession {
  static Presets = { vip: QQ_VIP_PRESET, qzone: QQ_QZONE_PRESET };

  /**
   * 请求生成二维码
   * @param {'vip'|'qzone'} presetName - 登录渠道
   * @returns {{ qrsig, qrcode, url }}
   */
  static async requestQRCode(presetName = 'vip') {
    const preset = this.Presets[presetName] || this.Presets.vip;
    const params = new URLSearchParams({
      appid: preset.aid,
      e: '2',
      l: 'M',
      s: '3',
      d: '72',
      v: '4',
      t: String(Math.random()),
      daid: preset.daid,
    });
    params.set('u1', preset.redirectUri);

    const url = `https://ssl.ptlogin2.qq.com/ptqrshow?${params.toString()}`;

    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
          Referer: preset.referrer || 'https://xui.ptlogin2.qq.com/',
          'User-Agent': ChromeUA,
        },
      });

      const qrsig = CookieUtils.getValue(response.headers['set-cookie'], 'qrsig');
      const qrcodeBase64 = Buffer.from(response.data).toString('base64');

      return {
        qrsig,
        qrcode: `data:image/png;base64,${qrcodeBase64}`,
        url,
      };
    } catch (err) {
      console.error('Request QRCode Error:', err.message);
      throw err;
    }
  }

  /**
   * 检查扫码状态
   * @param {string} qrsig - 二维码签名
   * @param {'vip'|'qzone'} presetName - 登录渠道
   * @returns {{ ret, msg, nickname, jumpUrl, cookie }}
   */
  static async checkStatus(qrsig, presetName = 'vip') {
    const preset = this.Presets[presetName] || this.Presets.vip;
    const ptqrtoken = HashUtils.hash(qrsig);

    const params = new URLSearchParams({
      ptqrtoken: String(ptqrtoken),
      from_ui: '1',
      aid: preset.aid,
      daid: preset.daid,
      action: `0-0-${Date.now()}`,
      pt_uistyle: '40',
      js_ver: '21020514',
      js_type: '1',
    });
    params.set('u1', preset.redirectUri);

    const url = `https://ssl.ptlogin2.qq.com/ptqrlogin?${params.toString()}`;

    try {
      const response = await axios.get(url, {
        headers: {
          Cookie: `qrsig=${qrsig}`,
          Referer: preset.referrer || 'https://xui.ptlogin2.qq.com/',
          'User-Agent': ChromeUA,
        },
      });

      const data = response.data;
      const match = data.match(/ptuiCB\((.+)\)/);
      if (!match) throw new Error('Invalid response format');

      // 提取回调参数（JavaScript 字符串字面量）
      const args = [];
      const strRe = /'([^']*)'/g;
      for (let m = strRe.exec(match[1]); m !== null; m = strRe.exec(match[1])) {
        args.push(m[1]);
      }

      const [ret, , jumpUrl, , msg, nickname] = args;
      return {
        ret,
        msg,
        nickname,
        jumpUrl,
        cookie: response.headers['set-cookie'],
      };
    } catch (err) {
      console.error('Check Status Error:', err.message);
      throw err;
    }
  }
}

// ---- QQ 小程序登录 ----

const QQ_FARM_MINI_PROGRAM_PRESET = {
  name: 'QQ经典农场 (Farm)',
  description: 'QQ经典农场小程序',
  appid: '1112386029',
};

class MiniProgramLoginSession {
  static QUA = 'V1_HT5_QDT_0.70.2209190_x64_0_DEV_D';
  static Presets = { farm: QQ_FARM_MINI_PROGRAM_PRESET };

  static getHeaders() {
    return {
      qua: MiniProgramLoginSession.QUA,
      host: 'q.qq.com',
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': ChromeUA,
    };
  }

  /**
   * 请求小程序登录码
   * @returns {{ code, url, image }}
   */
  static async requestLoginCode() {
    try {
      const response = await axios.get('https://q.qq.com/ide/devtoolAuth/GetLoginCode', {
        headers: this.getHeaders(),
      });
      const { code, data } = response.data;

      if (+code !== 0) throw new Error('获取登录码失败');

      const loginCode = data.code || '';
      const url = `https://h5.qzone.qq.com/qqq/code/${loginCode}?_proxy=1&from=ide`;
      const image = await QRCode.toDataURL(url, {
        width: 300,
        margin: 1,
        errorCorrectionLevel: 'M',
      });

      return { code: loginCode, url, image };
    } catch (err) {
      console.error('MP Request Login Code Error:', err.message);
      throw err;
    }
  }

  /**
   * 查询扫码状态
   * @param {string} code - 登录码
   * @returns {{ status: 'Wait'|'OK'|'Used'|'Error', ticket?, uin?, nickname? }}
   */
  static async queryStatus(code) {
    try {
      const response = await axios.get(
        `https://q.qq.com/ide/devtoolAuth/syncScanSateGetTicket?code=${code}`,
        { headers: this.getHeaders() }
      );

      if (response.status !== 200) return { status: 'Error' };

      const { code: apiCode, data } = response.data;

      if (+apiCode === 0) {
        const result = { status: 'Wait' };
        if (+data.ok !== 1) return result;
        return {
          status: 'OK',
          ticket: data.ticket,
          uin: data.uin,
          nickname: data.nick || '',
        };
      }

      if (+apiCode === -10001) return { status: 'Used' };

      return { status: 'Error', msg: `Code: ${apiCode}` };
    } catch (err) {
      console.error('MP Query Status Error:', err.message);
      throw err;
    }
  }

  /**
   * 用 ticket 换取授权码
   * @param {string} ticket
   * @param {string} appid - 默认 '1112386029'
   */
  static async getAuthCode(ticket, appid = '1112386029') {
    try {
      const response = await axios.post(
        'https://q.qq.com/ide/login',
        { appid, ticket },
        { headers: this.getHeaders() }
      );
      if (response.status !== 200) return '';
      const { code } = response.data;
      return code || '';
    } catch (err) {
      console.error('MP Get Auth Code Error:', err.message);
      return '';
    }
  }
}

module.exports = {
  QRLoginSession,
  MiniProgramLoginSession,
};
