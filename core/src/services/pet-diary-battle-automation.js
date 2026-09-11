// Per-worker state. Reuse the shared friend list; treasure previews must be live.
function createPetDiaryBattleAutomation({ getPet, getFriends, getFriend, operate,
    enabled, excluded, now, pause, report, budgetMs = 30000 }) {
    let lastGid = '';
    let running = false;
    let nextRunAt = 0;
    const challengeIds = ['80101', '80102', '80103'];
    const available = (pet, id) => pet.balances?.some(item => String(item.id) === id
        && item.known !== false && Number(item.count) > 0);
    const ready = pet => enabled() && pet?.active === true
        && now() >= pet.startTime && now() <= pet.endTime
        && pet.hunt?.canPlunder === true && pet.battleCount < pet.battleLimit
        && challengeIds.some(id => available(pet, id));

    return async function run() {
        if (running || !enabled() || now() < nextRunAt) return;
        running = true;
        nextRunAt = now() + 5 * 60 * 1000;
        let scanned = 0;
        let battles = 0;
        try {
            let pet = await getPet();
            if (!ready(pet)) {
                const bag = pet?.balances || [];
                const book = bag.filter(item => ['80101', '80102', '80103'].includes(String(item.id))
                    && Number(item.count) > 0);
                report('自动夺宝本轮跳过', {
                    scanned,
                    battles,
                    active: pet?.active === true,
                    canPlunder: pet?.hunt?.canPlunder === true,
                    battleCount: pet?.battleCount,
                    battleLimit: pet?.battleLimit,
                    challengeBooks: book.map(item => `${item.id}x${item.count}`).join(',') || 'none',
                    inWindow: pet ? now() >= pet.startTime && now() <= pet.endTime : false,
                });
                return;
            }
            const friends = [...new Map((await getFriends()).map(f => [String(f.gid), f])).values()];
            if (!friends.length) {
                report('好友缓存为空，等待共享好友列表下次刷新', { scanned, battles });
                return;
            }
            const start = (friends.findIndex(f => String(f.gid) === lastGid) + 1) % friends.length;
            const deadline = now() + budgetMs;
            for (let offset = 0; offset < friends.length && now() < deadline; offset++) {
                if (!ready(pet)) break;
                const gid = String(friends[(start + offset) % friends.length].gid);
                lastGid = gid;
                if (!/^[1-9]\d*$/.test(gid) || excluded(gid)) continue;
                await pause();
                if (!ready(pet)) break;
                let friend;
                try {
                    friend = await getFriend(gid);
                    scanned++;
                } catch (error) {
                    // Abort this round on network/protocol failures, rather than flooding retries.
                    report(`查询好友宝藏失败：${error.message}`, { scanned, battles, error: true });
                    break;
                }
                if (!ready(pet) || excluded(gid) || String(friend.gid) !== gid) continue;
                let target;
                let challengeId;
                for (const id of challengeIds) {
                    if (!available(pet, id)) continue;
                    target = friend.treasures?.find(t => t.status === 2 && t.endTime > now()
                        && t.previews?.some(p => String(p.challengeId) === id && p.canStart === true));
                    if (target) { challengeId = id; break; }
                }
                if (!target) continue;
                // The shared action re-reads limits, inventory and target under its mutation lock.
                // Never retry an uncertain mutation in this round; next run starts with a fresh snapshot.
                const result = await operate('battle', { gid, treasureId: target.id, challengeId });
                battles++;
                if (!result?.snapshot) break;
                pet = result.snapshot;
            }
            report('好友夺宝巡查完成', { scanned, battles });
        } catch (error) {
            report(`自动好友夺宝停止本轮：${error.message}`, { scanned, battles, error: true });
        } finally {
            running = false;
        }
    };
}

module.exports = { createPetDiaryBattleAutomation };
