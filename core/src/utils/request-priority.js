const { AsyncLocalStorage } = require('node:async_hooks');

/**
 * Gateway 请求优先级分层策略（纯函数，可单测）。
 *
 * Gateway 是单条 WebSocket 复用，所有业务共享一条连接。按「班次」分层，优先级从高到低：
 * 1. critical   —— 心跳 / ACE AntiData。掉了就直接下线，必须永远有槽位。
 * 2. foreground —— 用户在面板上的前台操作。人在等结果，优先级仅次于保命流量。
 * 3. farm       —— 自己农场的后台定时任务。
 * 4. friend     —— 好友农场的后台定时任务。
 * 5. background —— 宠物同步等「补数据」任务，只在网关完全空闲时才发。
 *
 * 容量约束：
 * - critical 的两条通道（heartbeat / ace）各自保留一个槽位，互不挤占；
 * - 业务流量（foreground/farm/friend）总在途不超过 MAX_BUSINESS_IN_FLIGHT；
 * - 其中非前台业务（farm/friend）不超过 MAX_NON_FOREGROUND_BUSINESS_IN_FLIGHT；
 * - background 只在连接彻底空闲时才发；
 * - 低优先班次等待超过 CLASS_STARVATION_MS 时会被提升到队首。
 */

const REQUEST_CLASS_ORDER = ['critical', 'foreground', 'farm', 'friend', 'background'];

const CRITICAL_LANES = ['heartbeat', 'ace'];

const BUSINESS_CLASSES = ['foreground', 'farm', 'friend'];

const MAX_BUSINESS_IN_FLIGHT = 3;
const MAX_NON_FOREGROUND_BUSINESS_IN_FLIGHT = 2;

const MAX_IN_FLIGHT_BY_CLASS = {
    critical: 2,
    foreground: 3,
    farm: 2,
    friend: 1,
    background: 1,
};

const MAX_QUEUED_BY_CLASS = {
    critical: 8,
    foreground: 60,
    farm: 40,
    friend: 30,
    background: 10,
};

const CLASS_STARVATION_MS = 4000;

const REQUEST_CLASS_MARKER = {
    critical: '!',
    foreground: '',
    farm: '#',
    friend: '&',
    background: '~',
};

const priorityContext = new AsyncLocalStorage();

function isRequestClass(value) {
    return typeof value === 'string' && REQUEST_CLASS_ORDER.includes(value);
}

function isCriticalLane(value) {
    return typeof value === 'string' && CRITICAL_LANES.includes(value);
}

function normalizeRequestClass(value) {
    return isRequestClass(value) ? value : null;
}

function classOf(request) {
    return normalizeRequestClass(request && request.requestClass) || 'foreground';
}

function isBusinessClass(requestClass) {
    return BUSINESS_CLASSES.includes(requestClass);
}

function resolveRequestClass(options, ambientClass) {
    const opts = options || {};
    if (isCriticalLane(opts.criticalLane) || opts.priority === 'high') return 'critical';
    const explicit = normalizeRequestClass(opts.requestClass);
    if (explicit) return explicit;
    if (opts.priority === 'low') return 'background';
    return normalizeRequestClass(ambientClass) || 'foreground';
}

function countInFlight(inFlight, predicate) {
    let count = 0;
    for (const request of inFlight) {
        if (predicate(request, classOf(request))) count += 1;
    }
    return count;
}

/**
 * 从队列里挑出下一个可以发送的请求下标；没有可发送的就返回 -1。
 * 只读入参，由调用方负责把选中的请求移出队列。
 */
function selectDispatchIndex(queue, inFlight, now) {
    const list = queue || [];
    if (list.length === 0) return -1;
    const active = inFlight || [];
    const currentTime = now || Date.now();

    // 1) 心跳 / ACE 各占一个独立保留槽位，谁也挤不掉谁。
    for (const lane of CRITICAL_LANES) {
        const laneBusy = countInFlight(active, (request, cls) => cls === 'critical' && request.criticalLane === lane);
        if (laneBusy >= 1) continue;
        const laneIndex = list.findIndex(request => classOf(request) === 'critical' && request.criticalLane === lane);
        if (laneIndex >= 0) return laneIndex;
    }

    // 2) 没有标记通道的 critical 请求只吃 critical 的普通预算。
    const criticalInFlight = countInFlight(active, (_request, cls) => cls === 'critical');
    if (criticalInFlight < MAX_IN_FLIGHT_BY_CLASS.critical) {
        const plainIndex = list.findIndex(request => classOf(request) === 'critical' && !isCriticalLane(request.criticalLane));
        if (plainIndex >= 0) return plainIndex;
    }

    // 3) 业务班次：总预算 + 每班次上限 + 前台保留槽位三重约束。
    const businessInFlight = countInFlight(active, (_request, cls) => isBusinessClass(cls));
    if (businessInFlight < MAX_BUSINESS_IN_FLIGHT) {
        const nonForegroundInFlight = countInFlight(active, (_request, cls) => isBusinessClass(cls) && cls !== 'foreground');
        const perClassInFlight = new Map();
        for (const request of active) {
            const cls = classOf(request);
            perClassInFlight.set(cls, (perClassInFlight.get(cls) || 0) + 1);
        }

        const eligible = [];
        for (let index = 0; index < list.length; index++) {
            const cls = classOf(list[index]);
            if (!isBusinessClass(cls)) continue;
            if ((perClassInFlight.get(cls) || 0) >= MAX_IN_FLIGHT_BY_CLASS[cls]) continue;
            if (cls !== 'foreground' && nonForegroundInFlight >= MAX_NON_FOREGROUND_BUSINESS_IN_FLIGHT) continue;
            eligible.push(index);
        }

        if (eligible.length > 0) {
            // 饥饿保护：等待超过 CLASS_STARVATION_MS 的低优先请求提升到队首
            let starvedIndex = -1;
            let starvedWaitMs = CLASS_STARVATION_MS;
            for (const index of eligible) {
                const enqueuedAt = Number(list[index].enqueuedAt);
                if (!Number.isFinite(enqueuedAt)) continue;
                const waitedMs = Math.max(0, Number(currentTime) - enqueuedAt);
                if (waitedMs >= starvedWaitMs) {
                    starvedWaitMs = waitedMs;
                    starvedIndex = index;
                }
            }
            if (starvedIndex >= 0) return starvedIndex;

            // 按班次优先级选第一个
            for (const cls of REQUEST_CLASS_ORDER) {
                if (!isBusinessClass(cls)) continue;
                for (const index of eligible) {
                    if (classOf(list[index]) === cls) return index;
                }
            }
        }
    }

    // 4) background：只在连接彻底空闲、且队列里没有别的班次时才发。
    if (active.length > 0) return -1;
    if (list.some(request => classOf(request) !== 'background')) return -1;
    return list.findIndex(request => classOf(request) === 'background');
}

function maxQueuedForClass(requestClass) {
    const cls = normalizeRequestClass(requestClass) || 'foreground';
    return MAX_QUEUED_BY_CLASS[cls];
}

function countQueuedByClass(queue, requestClass) {
    const cls = normalizeRequestClass(requestClass) || 'foreground';
    let count = 0;
    for (const request of queue || []) {
        if (classOf(request) === cls) count += 1;
    }
    return count;
}

function isClassQueueFull(queue, requestClass) {
    return countQueuedByClass(queue, requestClass) >= maxQueuedForClass(requestClass);
}

function describeRequestClassMarker(request) {
    if (request && request.criticalLane === 'heartbeat') return '!H:';
    if (request && request.criticalLane === 'ace') return '!A:';
    return REQUEST_CLASS_MARKER[classOf(request)];
}

// ============ AsyncLocalStorage ambient class ============

function runWithRequestPriority(priority, fn) {
    return priorityContext.run(normalizeRequestClass(priority) || 'foreground', fn);
}

function getRequestPriority(fallback) {
    const ambient = priorityContext.getStore();
    if (ambient && isRequestClass(ambient)) return ambient;
    return normalizeRequestClass(fallback) || 'foreground';
}

module.exports = {
    REQUEST_CLASS_ORDER,
    CRITICAL_LANES,
    BUSINESS_CLASSES,
    MAX_BUSINESS_IN_FLIGHT,
    MAX_NON_FOREGROUND_BUSINESS_IN_FLIGHT,
    MAX_IN_FLIGHT_BY_CLASS,
    MAX_QUEUED_BY_CLASS,
    CLASS_STARVATION_MS,
    REQUEST_CLASS_MARKER,
    isRequestClass,
    isCriticalLane,
    normalizeRequestClass,
    classOf,
    isBusinessClass,
    resolveRequestClass,
    selectDispatchIndex,
    maxQueuedForClass,
    countQueuedByClass,
    isClassQueueFull,
    describeRequestClassMarker,
    runWithRequestPriority,
    getRequestPriority,
};
