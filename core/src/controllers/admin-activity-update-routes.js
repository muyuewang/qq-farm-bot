const activity = require('../services/activity');
const {
  getActivityUpdateState,
  runActivityUpdateScan,
  startActivityUpdateMonitor,
} = require('../services/activity-update-monitor');
const {
  findSourceAsset,
  resolveActivityCardImages,
  resolveActivityCdnImages,
} = require('../services/activity-cdn-resolver');

function findUnknownActivities(activities, knownIds) {
  const known = new Set((knownIds || []).map(Number));
  return (activities || []).filter(item => {
    const id = Number(item?.id);
    return Number.isFinite(id) && id > 0 && !known.has(id);
  });
}

function registerAdminActivityUpdateRoutes({ app, provider, requireAdminToken }) {
  const knownActivityIds = Object.entries(activity)
    .filter(([key, value]) => key.endsWith('_ACTIVITY_ID') && Number.isFinite(Number(value)))
    .map(([, value]) => Number(value));
  const buildDateProbeIds = (days = 3, slots = 10) => {
    const ids = [];
    const now = new Date();
    for (let offset = 0; offset <= days; offset += 1) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      const prefix = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
      for (let slot = 0; slot < slots; slot += 1) ids.push(Number(`${prefix}${String(slot).padStart(2, '0')}`));
    }
    return ids;
  };
  const scanOnlineActivities = async (knownIds, localReport = null) => {
    const accounts = provider.getAccounts()?.accounts || [];
    const account = accounts.find((item) => {
      if (!item.running || !provider.isAccountRunning(item.id)) return false;
      const status = provider.getStatus(item.id);
      return !!status?.connection?.connected;
    });
    if (!account) {
      return {
        available: false,
        error: '没有已连接账号，暂时无法调用 ActivityService.List',
        activities: [],
        activityWindows: [],
        groups: [],
        unknownActivityIds: [],
      };
    }

    const discovery = await provider.getActivityDiscoverySnapshot(account.id);
    const activities = discovery.activities || [];
    const activityWindows = discovery.activityWindows || [];
    const known = new Set((knownIds || []).map(Number));
    const unknown = findUnknownActivities(activities, knownIds);
    const unknownWindows = findUnknownActivities(activityWindows, knownIds);
    const groups = [];
    for (const item of unknown.slice(0, 20)) {
      try {
        groups.push(await provider.getActivityGroupSnapshot(account.id, item.id, ''));
      } catch (error) {
        groups.push({ id: item.id, title: item.title, error: error.message || String(error) });
      }
    }
    const listedIds = new Set(activities.map(item => Number(item.id)));
    const probeIds = [...new Set([
      ...buildDateProbeIds(),
      ...(localReport?.unknownActivityIds || []).map(Number),
    ])].filter(id => id > 0 && !known.has(id) && !listedIds.has(id));
    const probeGroups = [];
    for (const id of probeIds.slice(0, 50)) {
      try {
        const snapshot = await provider.getActivityGroupSnapshot(account.id, id, '');
        if (Number(snapshot?.id) === id && (snapshot.title || snapshot.children?.length)) {
          probeGroups.push({ ...snapshot, discoverySource: 'GetGroup probe' });
        }
      } catch {
        // 未发布 ID 返回业务错误属于正常探测结果。
      }
    }
    const probeById = new Map(probeGroups.map(item => [Number(item.id), { ...item, children: [...(item.children || [])] }]));
    const probeRoots = [];
    for (const item of probeById.values()) {
      const parent = probeById.get(Number(item.parentId));
      if (parent) {
        if (!parent.children.some(child => Number(child.id) === Number(item.id))) parent.children.push(item);
      } else {
        probeRoots.push(item);
      }
    }
    groups.push(...probeRoots);
    const directoryGroups = [];
    const resolvedGroupIds = new Set(groups.map(item => Number(item?.id)));
    for (const item of activityWindows.slice(0, 60)) {
      const id = Number(item?.id);
      if (!id || resolvedGroupIds.has(id)) continue;
      try {
        const snapshot = await provider.getActivityGroupSnapshot(account.id, id, '');
        if (snapshot?.id) {
          directoryGroups.push(snapshot);
          resolvedGroupIds.add(id);
        }
      } catch {
        // 历史活动可能已无法通过 GetGroup 读取，保留无图卡片回退样式。
      }
    }
    const unknownIds = [...new Set([
      ...unknown.map(item => Number(item.id)),
      ...unknownWindows.map(item => Number(item.id)),
      ...probeRoots.map(item => Number(item.id)),
    ])];
    let officialCardImages = new Map();
    try {
      await resolveActivityCdnImages({ activities, groups, directoryGroups });
      officialCardImages = await resolveActivityCardImages(activityWindows);
    } catch (error) {
      console.warn(`[活动更新] CDN 图片解析失败: ${error.message}`);
    }
    const enrichedActivityWindows = activityWindows.map(item => ({
      ...item,
      imageUrl: officialCardImages.get(Number(item.id))
        || '',
    }));
    return {
      available: true,
      accountName: account.name || account.nick || '在线账号',
      scannedAt: Date.now(),
      activities,
      activityWindows: enrichedActivityWindows,
      groups,
      probes: {
        attempted: probeIds.slice(0, 50).length,
        matched: probeGroups.length,
        activityGroups: probeRoots.length,
      },
      unknownActivityIds: unknownIds,
    };
  };
  startActivityUpdateMonitor({
    knownActivityIds,
    onlineScanner: scanOnlineActivities,
    localScanEnabled: String(process.env.ACTIVITY_LOCAL_SCAN_ENABLED || '').toLowerCase() === 'true',
  });

  app.get('/api/activity/source-asset/:bundle/:filename', (req, res) => {
    const sourceFile = findSourceAsset(req.params.bundle, req.params.filename);
    if (!sourceFile) return res.sendStatus(404);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(sourceFile);
  });

  app.get('/api/activity/update/status', requireAdminToken, (req, res) => {
    res.json({ ok: true, ...getActivityUpdateState() });
  });

  app.get('/api/activity/directory', (req, res) => {
    const state = getActivityUpdateState();
    const online = state.report?.online;
    res.json({
      ok: true,
      scannedAt: online?.scannedAt || state.report?.scannedAt || 0,
      activities: online?.activities || [],
      activityWindows: online?.activityWindows || [],
      groups: online?.groups || [],
      unknownActivityIds: online?.unknownActivityIds || [],
    });
  });

  app.post('/api/activity/update/scan', requireAdminToken, async (req, res) => {
    try {
      const report = await runActivityUpdateScan();
      res.json({ ok: true, report, ...getActivityUpdateState() });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message || '活动更新扫描失败' });
    }
  });
}

module.exports = { findUnknownActivities, registerAdminActivityUpdateRoutes };
