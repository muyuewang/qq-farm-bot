const { createModuleLogger } = require('./logger');

const logger = createModuleLogger('nongme-plant-data');

const DATA_URL = 'https://nong.me/data/plants-data.js';
const IMAGE_BASE_URL = 'https://nong.me/img';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FAILURE_CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

let cache = null;
let cacheExpiresAt = 0;
let pendingRequest = null;

function parsePlantsDataScript(source) {
  const text = String(source || '');
  const match = text.match(/JSON\.parse\s*\(\s*atob\s*\(\s*["']([A-Za-z0-9+/=]+)["']\s*\)\s*\)/);
  if (!match) {
    throw new Error('nong.me plants payload not found');
  }

  const decoded = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
  const plants = Array.isArray(decoded?.plants) ? decoded.plants : [];
  const byFruitId = new Map();

  for (const plant of plants) {
    const fruitId = Number(plant?.fruit_id) || 0;
    const seedId = Number(plant?.seed_id) || 0;
    if (fruitId <= 0 || seedId <= 0) continue;

    byFruitId.set(fruitId, {
      ...plant,
      fruit_id: fruitId,
      seed_id: seedId,
      plant_id: Number(plant.plant_id) || 0,
      level: Number(plant.level) || 0,
    });
  }

  return {
    meta: decoded?.meta || {},
    plants,
    byFruitId,
  };
}

async function requestPlantsData() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(DATA_URL, {
      signal: controller.signal,
      headers: {
        accept: 'application/javascript,text/javascript;q=0.9,*/*;q=0.8',
        'user-agent': 'qq-farm-bot/2.3',
      },
    });
    if (!response.ok) {
      throw new Error(`nong.me returned HTTP ${response.status}`);
    }
    return parsePlantsDataScript(await response.text());
  } finally {
    clearTimeout(timeout);
  }
}

async function getNongmePlantData(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cache && now < cacheExpiresAt) return cache;
  if (pendingRequest) return pendingRequest;

  pendingRequest = requestPlantsData()
    .then((result) => {
      cache = result;
      cacheExpiresAt = Date.now() + CACHE_TTL_MS;
      logger.info('nong.me 图鉴数据已更新', {
        count: result.byFruitId.size,
        source: result.meta?.source || '',
      });
      return result;
    })
    .catch((err) => {
      const hasStaleCache = !!cache?.byFruitId?.size;
      cache = cache || { meta: {}, plants: [], byFruitId: new Map() };
      cacheExpiresAt = Date.now() + FAILURE_CACHE_TTL_MS;
      logger.warn('nong.me 图鉴数据获取失败，使用本地配置', {
        error: err.message,
        hasStaleCache,
      });
      return cache;
    })
    .finally(() => {
      pendingRequest = null;
    });

  return pendingRequest;
}

function getNongmeSeedImageUrl(seedId) {
  const id = Number(seedId) || 0;
  return id > 0 ? `${IMAGE_BASE_URL}/${id}.png` : '';
}

function resetNongmePlantDataCache() {
  cache = null;
  cacheExpiresAt = 0;
  pendingRequest = null;
}

module.exports = {
  DATA_URL,
  getNongmePlantData,
  getNongmeSeedImageUrl,
  parsePlantsDataScript,
  resetNongmePlantDataCache,
};
