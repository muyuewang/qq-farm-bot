const { sendMsgAsync } = require('../utils/network');
const { types } = require('../utils/proto');
const { toNum } = require('../utils/utils');

const DEFAULT_RECHARGE_SOURCE = 'MallUI';

async function getRechargeInfo(source = DEFAULT_RECHARGE_SOURCE) {
  const payload = types.GetRechargeInfoRequest.encode(
    types.GetRechargeInfoRequest.create({ source: String(source || DEFAULT_RECHARGE_SOURCE) })
  ).finish();
  const { body } = await sendMsgAsync('gamepb.paypb.PayService', 'GetRechargeInfo', payload);
  return types.GetRechargeInfoReply.decode(body);
}

async function getDiamondBalance() {
  const reply = await getRechargeInfo();
  const infos = Array.isArray(reply && reply.recharge_infos) ? reply.recharge_infos : [];
  return Math.max(0, toNum(infos[0] && infos[0].balance));
}

module.exports = { DEFAULT_RECHARGE_SOURCE, getRechargeInfo, getDiamondBalance };
