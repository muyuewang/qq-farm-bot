const nodemailer = require('nodemailer');

let pushoo = null;
try {
  pushoo = require('pushoo').default;
} catch {
  pushoo = null;
}

function assertRequiredText(name, value) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${name} 不能为空`);
  return text;
}

function firstText(raw, keys) {
  if (!raw || typeof raw !== 'object') return '';
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null && value !== '') return String(value);
  }
  return '';
}

function flattenValues(input, depth = 0, output = []) {
  if (depth > 3 || input === undefined || input === null) return output;
  if (typeof input !== 'object') {
    output.push(String(input));
    return output;
  }
  if (Array.isArray(input)) {
    for (const item of input) flattenValues(item, depth + 1, output);
    return output;
  }
  for (const value of Object.values(input)) flattenValues(value, depth + 1, output);
  return output;
}

function parsePushResult(result) {
  const raw = result && typeof result === 'object' ? result : { data: result };
  const status = String(raw.status || raw.Status || '').toLowerCase();
  const codeValue = raw.code ?? raw.errcode ?? raw.errCode ?? raw.retcode ?? raw.errorCode ?? raw.statusCode;
  const code = codeValue === undefined || codeValue === null ? '' : String(codeValue);
  const msg = firstText(raw, ['msg', 'message', 'errmsg', 'errMsg', 'error_description', 'description'])
    || (raw.error && typeof raw.error === 'object' ? firstText(raw.error, ['message', 'msg', 'errmsg']) : '')
    || (typeof result === 'string' ? result : '');

  const valuesText = flattenValues(raw).join(' ');
  const successText = /成功|执行成功|发送成功|ok|success|delivered successfully/i.test(`${msg} ${valuesText}`);
  const failureText = /失败|错误|error|fail|invalid|unauthorized|forbidden|denied/i.test(`${msg} ${status}`);
  const explicitError = !!raw.error || status === 'error' || status === 'failed' || raw.ok === false || raw.success === false;
  const successFlag = raw.ok === true || raw.success === true || raw.result === 'success';
  const successCode = code === '' || code === '0' || code === 'ok' || code === 'success' || code === '200' || code === '204';
  const ok = !explicitError && !failureText && (successFlag || successCode || successText || status === 'success');

  return {
    ok,
    code: code || (ok ? 'ok' : 'error'),
    msg: msg || (ok ? '发送成功' : '发送失败'),
    raw,
  };
}

/**
 * 通过 pushoo 发送多渠道推送。
 * @param {object} payload
 * @param {string} payload.channel
 * @param {string} [payload.endpoint]
 * @param {string} payload.token
 * @param {string} payload.title
 * @param {string} payload.content
 * @returns {{ ok, code, msg, raw }}
 */
async function sendPushooMessage(payload = {}) {
  if (!pushoo) {
    throw new Error('缺少 pushoo 依赖，请在 core 目录执行 npm install');
  }

  const channel = assertRequiredText('推送渠道', payload.channel).toLowerCase();
  const endpoint = String(payload.endpoint || '').trim();
  const rawToken = String(payload.token || '').trim();
  const token = channel === 'webhook' ? rawToken : assertRequiredText('推送 token', rawToken);
  const title = assertRequiredText('推送标题', payload.title);
  const content = assertRequiredText('推送内容', payload.content);

  const request = { title, content };
  if (token) request.token = token;
  if (channel === 'webhook') {
    request.options = {
      webhook: {
        url: assertRequiredText('Webhook 地址', endpoint),
        method: 'POST',
      },
    };
  }

  const result = await pushoo(channel, request);
  return parsePushResult(result);
}

/**
 * 通过 SMTP 发送邮件（用于下线提醒等推送）
 * @param {object} options - 邮件配置
 * @param {string} options.smtpHost - SMTP 服务器地址
 * @param {number} options.smtpPort - SMTP 端口（默认 465）
 * @param {string} options.smtpUser - 邮箱账号
 * @param {string} options.smtpPass - 授权码
 * @param {string} options.senderName - 发件人名称
 * @param {string} options.recipientEmail - 收件人邮箱
 * @param {string} options.subject - 邮件主题
 * @param {string} options.content - 邮件内容
 * @returns {{ ok, code, msg, raw }}
 */
async function sendSmtpEmail(options = {}) {
  const smtpHost = String(options.smtpHost || '').trim();
  const smtpPort = Number(options.smtpPort) || 465;
  const smtpUser = String(options.smtpUser || '').trim();
  const smtpPass = String(options.smtpPass || '').trim();
  const senderName = String(options.senderName || '').trim();
  const recipientEmail = String(options.recipientEmail || '').trim();
  const subject = String(options.subject || '下线提醒').trim();
  const content = String(options.content || '').trim();

  // 参数校验
  if (!smtpHost) throw new Error('SMTP服务器地址不能为空');
  if (!smtpUser) throw new Error('邮箱账号不能为空');
  if (!smtpPass) throw new Error('授权码不能为空');
  if (!recipientEmail) throw new Error('收件人邮箱不能为空');
  if (!content) throw new Error('邮件内容不能为空');

  const from = senderName
    ? `"${senderName}" <${smtpUser}>`
    : smtpUser;

  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,  // 465 端口使用 SSL
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });

  const mailOptions = {
    from,
    to: recipientEmail,
    subject,
    text: content
  };

  const raw = await transport.sendMail(mailOptions);
  return {
    ok: true,
    code: 'ok',
    msg: '邮件发送成功',
    raw
  };
}

module.exports = {
  sendSmtpEmail,
  sendPushooMessage
};
