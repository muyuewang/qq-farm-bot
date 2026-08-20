const process = require('node:process');

const {
    startAdminServer,
    emitRealtimeStatus,
    emitRealtimeLog,
    emitRealtimeAccountLog,
} = require('./src/controllers/admin');
const { createRuntimeEngine } = require('./src/runtime/runtime-engine');
const { createModuleLogger } = require('./src/services/logger');
const { verifyAndRun } = require('./src/services/license');

const mainLogger = createModuleLogger('main');
const isWorkerProcess = process.env.FARM_WORKER === '1';

async function bootstrap() {
    if (isWorkerProcess) {
        require('./src/core/worker');
        return;
    }

    // 抓包服务子命令：qq-farm-bot --capture（或 FARM_CAPTURE_SERVER=1）
    if (process.argv.includes('--capture') || process.env.FARM_CAPTURE_SERVER === '1') {
        const { startCaptureServer } = require('./src/capture/index');
        const { resolveAdvertiseAddresses } = require('./src/capture/ip-utils');
        const { config, stop, log } = await startCaptureServer();
        const advertise = resolveAdvertiseAddresses(config);
        log.info(`抓包服务已启动，API: http://${config.apiHost}:${config.apiPort}`);
        log.info(`对外代理地址: ${advertise.addresses.length
            ? advertise.addresses.map(item => `${item.address} (${item.kind})`).join(', ')
            : '未检测到可用地址'}`);
        const shutdown = (signal) => {
            log.info(`收到 ${signal}，正在关闭抓包服务...`);
            void stop().then(() => process.exit(0));
        };
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        return;
    }

    const licenseValid = await verifyAndRun();
    if (!licenseValid) {
        console.error('');
        console.error('[Error] License verification failed, exiting.');
        console.error('');
        process.exit(1);
        return;
    }

    const runtimeEngine = createRuntimeEngine({
        processRef: process,
        mainEntryPath: __filename,
        startAdminServer,
        onStatusSync: (accountId, status) => {
            emitRealtimeStatus(accountId, status);
        },
        onLog: (entry, accountId) => {
            if (accountId && entry) {
                entry.accountId = accountId;
            }
            emitRealtimeLog(entry);
        },
        onAccountLog: (entry) => {
            emitRealtimeAccountLog(entry);
        },
    });

    runtimeEngine.start({
        startAdminServer: true,
        autoStartAccounts: false,
    }).catch((err) => {
        mainLogger.error('runtime bootstrap failed', {
            error: err && err.message ? err.message : String(err),
        });
    });
}

bootstrap().catch((err) => {
    console.error('Bootstrap failed:', err);
    process.exit(1);
});
