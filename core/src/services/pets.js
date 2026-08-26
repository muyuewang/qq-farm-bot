const { getItemById, getItemImageById } = require('../config/gameConfig');
const { sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { log, toNum } = require('../utils/utils');
const { getBag, getBagItems } = require('./warehouse');
const { getDogInfo } = require('./dog-skill-gifts');

const PET_IDS = [90001, 90002, 90003, 90011, 90021];
const FOOD_DURATIONS = new Map([[90004, 86400], [90005, 259200], [90006, 432000]]);
const MAX_PROTECT_SECONDS = 30 * 86400;
let commandTail = Promise.resolve();

function serialize(operation) {
  const run = commandTail.then(operation, operation);
  commandTail = run.catch(() => null);
  return run;
}

function num(value) { return Math.max(0, toNum(value)); }
function metadata(id) {
  const item = getItemById(id) || {};
  return { id, name: String(item.name || `宠物#${id}`), desc: String(item.desc || ''), rarity: num(item.rarity), image: getItemImageById(id) };
}

function buildPetSnapshot(reply, bagReply = {}) {
  const currentDogId = num(reply && (reply.current_dog_id ?? reply.currentDogId));
  const rawDogs = Array.isArray(reply && reply.dogs) ? reply.dogs : [];
  const byId = new Map(rawDogs.map(dog => [num(dog.id), dog]));
  const ids = [...PET_IDS, ...rawDogs.map(dog => num(dog.id)).filter(id => id && !PET_IDS.includes(id))];
  const usages = Array.isArray(reply && reply.skill_usages) ? reply.skill_usages : [];
  const dogs = ids.map((id) => {
    const raw = byId.get(id) || {};
    const skillUsage = usages.filter(item => num(item.dog_id) === id).map(item => ({
      skillId: num(item.skill_id), usedCount: num(item.used_count), dailyLimit: num(item.daily_limit)
    }));
    return { ...metadata(id), price: num(raw.price), level: num(raw.level), owned: num(raw.owned) === 1 || id === currentDogId, deployed: id === currentDogId, skillUsage };
  });
  const foodCounts = new Map();
  for (const item of getBagItems(bagReply)) {
    const id = num(item && item.id);
    if (FOOD_DURATIONS.has(id) && item.locked !== true && item.locked !== 1) foodCounts.set(id, (foodCounts.get(id) || 0) + num(item.count));
  }
  const foods = [...FOOD_DURATIONS].map(([id, duration]) => ({ ...metadata(id), duration, days: duration / 86400, count: foodCounts.get(id) || 0 }));
  const protectSeconds = num(reply && reply.protect_time);
  return { dogs, foods, deployedId: currentDogId, foodSeconds: protectSeconds, protectSeconds: Math.max(protectSeconds, num(reply && reply.max_protect_time) || MAX_PROTECT_SECONDS), pendingGiftCount: num(reply && reply.pending_gift_count) };
}

async function getPetOverview() {
  await commandTail.catch(() => null);
  const [reply, bag] = await Promise.all([getDogInfo(), getBag()]);
  return buildPetSnapshot(reply, bag);
}

async function deployDog(dogIdInput) {
  const dogId = num(dogIdInput);
  if (!dogId) throw new Error('请选择要派出的宠物');
  return serialize(async () => {
    const info = await getDogInfo();
    const dog = (info.dogs || []).find(item => num(item.id) === dogId);
    if (!dog || (num(dog.owned) !== 1 && num(info.current_dog_id) !== dogId)) throw new Error('尚未拥有该宠物');
    const payload = types.DeployDogRequest.encode(types.DeployDogRequest.create({ dog_id: dogId })).finish();
    await sendMsgAsync('gamepb.dogpb.DogService', 'DeployDog', payload);
    log('宠物', `已派出${metadata(dogId).name}`, { module: 'pet', event: '派出宠物', result: 'ok', dogId });
    return { ok: true, dogId };
  });
}

async function withdrawDog() {
  return serialize(async () => {
    const payload = types.WithdrawDogRequest.encode(types.WithdrawDogRequest.create({})).finish();
    await sendMsgAsync('gamepb.dogpb.DogService', 'WithdrawDog', payload);
    log('宠物', '已召回宠物', { module: 'pet', event: '召回宠物', result: 'ok' });
    return { ok: true };
  });
}

async function feedDog(foodIdInput, countInput = 1) {
  const foodId = num(foodIdInput);
  const count = Math.max(1, Math.min(99, Math.trunc(num(countInput) || 1)));
  const duration = FOOD_DURATIONS.get(foodId);
  if (!duration) throw new Error('无效的狗粮');
  return serialize(async () => {
    const [info, bag] = await Promise.all([getDogInfo(), getBag()]);
    const available = getBagItems(bag).filter(item => num(item.id) === foodId && item.locked !== true && item.locked !== 1).reduce((sum, item) => sum + num(item.count), 0);
    if (available < count) throw new Error(`狗粮数量不足，当前可用 ${available}`);
    const maximum = num(info.max_protect_time) || MAX_PROTECT_SECONDS;
    if (num(info.protect_time) + duration * count > maximum) throw new Error('喂食后将超过30天上限');
    const payload = types.AddFoodRequest.encode(types.AddFoodRequest.create({ item_id: foodId, count })).finish();
    const { body } = await sendMsgAsync('gamepb.dogpb.DogService', 'AddFood', payload);
    const reply = types.AddFoodReply.decode(body);
    log('宠物', `喂食${metadata(foodId).name} x${count}`, { module: 'pet', event: '喂食宠物', result: 'ok', foodId, count });
    return { ok: true, foodSeconds: num(reply.protect_time) };
  });
}

async function getProtectLogs() {
  const payload = types.GetProtectLogsRequest.encode(types.GetProtectLogsRequest.create({ field_1: 0, count: 100, field_3: 0 })).finish();
  const { body } = await sendMsgAsync('gamepb.dogpb.DogService', 'GetProtectLogs', payload);
  const reply = types.GetProtectLogsReply.decode(body);
  const logs = (reply.logs || []).map((item, index) => ({ id: `${num(item.friend_gid)}-${num(item.timestamp)}-${index}`, friendGid: num(item.friend_gid), friendName: String(item.friend_name || ''), friendAvatar: String(item.friend_avatar || ''), timestamp: num(item.timestamp), stolenCount: num(item.stolen_count), protectedGold: num(item.protected_gold), dogId: num(item.dog_id), dogName: String(item.dog_name || '') }));
  return { logs, total: Math.max(logs.length, num(reply.total)) };
}

module.exports = { PET_IDS, FOOD_DURATIONS, buildPetSnapshot, getPetOverview, deployDog, withdrawDog, feedDog, getProtectLogs };
