function buildFriendVisitPlan({ stealTargets = [], helpTargets = [] } = {}) {
  const byGid = new Map();

  function merge(target, action) {
    const gid = Number(target && target.gid) || 0;
    if (!gid) return;
    const existing = byGid.get(gid) || {
      gid,
      name: target.name || `GID:${gid}`,
      level: Number(target.level) || 0,
      actions: { steal: false, help: false },
    };
    existing.actions[action] = true;
    existing.level = Math.max(existing.level, Number(target.level) || 0);
    existing.hasGuardDog = existing.hasGuardDog || !!target.hasGuardDog;
    byGid.set(gid, existing);
  }

  stealTargets.forEach(target => merge(target, 'steal'));
  helpTargets.forEach(target => merge(target, 'help'));

  return Array.from(byGid.values()).sort((a, b) => {
    const aBoth = Number(a.actions.steal && a.actions.help);
    const bBoth = Number(b.actions.steal && b.actions.help);
    return bBoth - aBoth || b.level - a.level || a.gid - b.gid;
  });
}

module.exports = { buildFriendVisitPlan };
