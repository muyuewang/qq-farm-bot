/**
 * 标准化账号引用（取数组第一个元素或直接转字符串）
 * @param {*} ref - 账号引用（字符串/数组/数字）
 * @returns {string} 标准化后的账号标识
 */
function normalizeAccountRef(ref) {
  if (ref === undefined || ref === null) return '';
  if (Array.isArray(ref)) return normalizeAccountRef(ref[0]);
  return String(ref).trim();
}

/**
 * 构建账号查找键集合（从 id/uin/qq 字段）
 * @param {object} account - 账号对象
 * @returns {Set<string>} 可用于匹配的键集合
 */
function buildAccountKeys(account) {
  const keys = new Set();
  const addKey = (val) => {
    const k = normalizeAccountRef(val);
    if (k) keys.add(k);
  };
  addKey(account && account.id);
  addKey(account && account.uin);
  addKey(account && account.qq);
  return keys;
}

/**
 * 按引用查找账号
 * @param {Array<object>} accountList - 账号列表
 * @param {*} ref - 账号引用（id/uin/qq）
 * @returns {object | null} 匹配的账号对象
 */
function findAccountByRef(accountList, ref) {
  const target = normalizeAccountRef(ref);
  if (!target) return null;
  const list = Array.isArray(accountList) ? accountList : [];
  for (const account of list) {
    if (!account || typeof account !== 'object') continue;
    const keys = buildAccountKeys(account);
    if (keys.has(target)) return account;
  }
  return null;
}

/**
 * 按引用解析账号 ID
 * @param {Array<object>} accountList - 账号列表
 * @param {*} ref - 账号引用
 * @returns {string} 账号 ID 字符串
 */
function resolveAccountId(accountList, ref) {
  const account = findAccountByRef(accountList, ref);
  if (!account) return '';
  return normalizeAccountRef(account.id);
}

module.exports = {
  normalizeAccountRef,
  findAccountByRef,
  resolveAccountId
};
