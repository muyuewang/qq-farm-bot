const path = require('node:path');
const { getDataFile } = require('../config/runtime-paths');
const { readJsonFile, writeJsonFileAtomic } = require('./json-db');

const MAX_HISTORY_RECORDS = 100;

function safeAccountId(accountId) {
  return String(accountId || '').trim().replace(/[^\w-]/g, '_');
}

function getHistoryFile(accountId) {
  const id = safeAccountId(accountId);
  if (!id) throw new Error('缺少账号 ID');
  return path.join(getDataFile('mystery_shop_history'), `${id}.json`);
}

function getMysteryShopHistory(accountId) {
  const data = readJsonFile(getHistoryFile(accountId), { records: [] });
  return Array.isArray(data?.records) ? data.records.slice(0, MAX_HISTORY_RECORDS) : [];
}

function appendMysteryShopHistory(accountId, offer, result, source = 'manual') {
  const record = {
    id: `${Date.now()}-${Number(offer?.npcId || 0)}`,
    purchasedAt: Date.now(),
    source: source === 'auto' ? 'auto' : 'manual',
    npcId: Number(offer?.npcId || 0),
    itemId: Number(result?.reward?.itemId || offer?.itemId || 0),
    itemName: String(offer?.itemName || `物品${result?.reward?.itemId || offer?.itemId || 0}`),
    itemImage: offer?.itemImage || '',
    itemCount: Number(result?.reward?.count || offer?.itemCount || 0),
    currencyId: Number(offer?.currencyId || 0),
    currencyName: String(offer?.currencyName || `货币${offer?.currencyId || 0}`),
    price: Number(offer?.price || 0),
    originalPrice: Number(offer?.originalPrice || 0),
    discount: Number(offer?.discount || 0),
  };
  const records = [record, ...getMysteryShopHistory(accountId)].slice(0, MAX_HISTORY_RECORDS);
  writeJsonFileAtomic(getHistoryFile(accountId), { records });
  return record;
}

module.exports = {
  MAX_HISTORY_RECORDS,
  getMysteryShopHistory,
  appendMysteryShopHistory,
};
