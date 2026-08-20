const { getItemById } = require('../config/gameConfig');
const { sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { toNum } = require('../utils/utils');
const { createModuleLogger } = require('./logger');

const DOG_SKILL_GIFT_ITEM_ID = 101351;
const logger = createModuleLogger('dog');
let pendingClaim = null;

async function getDogInfo() {
  const payload = types.GetDogInfoRequest.encode(types.GetDogInfoRequest.create({})).finish();
  const { body } = await sendMsgAsync('gamepb.dogpb.DogService', 'GetDogInfo', payload);
  return types.GetDogInfoReply.decode(body);
}

async function claimSkillGifts() {
  const payload = types.ClaimSkillGiftsRequest.encode(types.ClaimSkillGiftsRequest.create({})).finish();
  const { body } = await sendMsgAsync('gamepb.dogpb.DogService', 'ClaimSkillGifts', payload);
  return types.ClaimSkillGiftsReply.decode(body);
}

function getPendingGiftCount(reply) {
  return Math.max(0, toNum(reply && (reply.pending_gift_count ?? reply.pendingGiftCount)));
}

async function checkAndClaimDogSkillGifts(pendingCountHint) {
  if (pendingClaim) return pendingClaim;

  const request = (async () => {
    try {
      const hintedCount = Math.max(0, toNum(pendingCountHint));
      const pendingCount = hintedCount > 0 ? hintedCount : getPendingGiftCount(await getDogInfo());
      if (pendingCount <= 0) return { claimed: 0, pending: 0, item: null };

      const reply = await claimSkillGifts();
      const item = reply && reply.item || null;
      const claimed = Math.max(0, toNum(reply && reply.claimed_count)) || Math.max(0, toNum(item && item.count));
      const itemId = toNum(item && item.id);
      const itemName = getItemById(itemId)?.name || (itemId > 0 ? `物品#${itemId}` : '同气连枝礼包');
      if (claimed > 0) logger.info(`拾取${itemName} x${claimed}`, { itemId, count: claimed });
      return { claimed, pending: Math.max(0, pendingCount - claimed), item };
    } catch (error) {
      logger.warn(`拾取同气连枝礼包失败: ${error?.message || error}`);
      return {
        claimed: 0,
        pending: Math.max(0, toNum(pendingCountHint)),
        item: null,
        error: String(error?.message || error)
      };
    }
  })();

  pendingClaim = request;
  try {
    return await request;
  } finally {
    if (pendingClaim === request) pendingClaim = null;
  }
}

module.exports = {
  DOG_SKILL_GIFT_ITEM_ID,
  getDogInfo,
  claimSkillGifts,
  getPendingGiftCount,
  checkAndClaimDogSkillGifts
};
