#!/usr/bin/env node
/**
 * 抓包服务 CLI 入口
 *
 * 启动后提供：
 * - REST API：默认 http://127.0.0.1:8450（bot 管理面板的“抓包登录”使用）
 * - MITM 代理端口池：默认 18000-18999，绑定全部网卡 IP（局域网 / Tailscale）
 *
 * 配置见 <core>/data/capture/config.json，或使用 CAPTURE_* 环境变量。
 */

const process = require('node:process');
const { startCaptureServer } = require('./src/capture/index');

async function main() {
  const { config, stop, log } = await startCaptureServer();

  const advertise = require('./src/capture/ip-utils').resolveAdvertiseAddresses(config);
  log('info', '抓包服务启动完成');
  log('info', `API: http://${config.apiHost}:${config.apiPort}`);
  log('info', `代理端口池: ${config.proxyPortFrom}-${config.proxyPortTo}`);
  log('info', `代理绑定 IP: ${(config.proxyBind || []).join(', ')}`);
  log('info', `对外代理地址（手机 Wi-Fi 代理填写）: ${advertise.addresses.length
    ? advertise.addresses.map(item => `${item.address}:<代理端口> (${item.kind})`).join(', ')
    : '未检测到可用地址，请检查 CAPTURE_ADVERTISE_IPS 配置'}`);

  const shutdown = async (signal) => {
    log('info', `收到 ${signal}，正在关闭...`);
    await stop();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[capture] 启动失败:', error && error.message ? error.message : error);
  process.exit(1);
});
