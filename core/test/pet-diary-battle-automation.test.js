const test = require('node:test');
const assert = require('node:assert/strict');
const { createPetDiaryBattleAutomation } = require('../src/services/pet-diary-battle-automation');
function fixture(overrides = {}) {
    let time = 1000;
    let on = true;
    let pet = { active: true, startTime: 0, endTime: 10000000, hunt: { canPlunder: true },
        battleCount: 0, battleLimit: 20, balances: [{ id: '80101', count: '20', known: true }] };
    const scans = [], actions = [], reports = [];
    const deps = {
        getPet: async () => pet,
        getFriends: async () => Array.from({ length: 10 }, (_, i) => ({ gid: i + 1 })),
        getFriend: async gid => { scans.push(gid); return { gid, treasures: [{ id: `t${gid}`, status: 2,
            endTime: 9999999, previews: [{ challengeId: '80101', canStart: true }] }] }; },
        operate: async (action, params) => {
            actions.push({ action, ...params });
            pet = { ...pet, battleCount: pet.battleCount + 1 };
            return { snapshot: pet };
        },
        enabled: () => on, excluded: () => false, now: () => time,
        pause: async () => { time += 400; }, report: (...args) => reports.push(args), ...overrides,
    };
    return { run: createPetDiaryBattleAutomation(deps), scans, actions, reports,
        setPet: change => { pet = { ...pet, ...change }; }, disable: () => { on = false; },
        advance: ms => { time += ms; } };
}
test('traverses shared friend list beyond six, deduplicates and excludes targets', async () => {
    const f = fixture({ getFriends: async () => [1, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(gid => ({ gid })),
        excluded: gid => gid === '2' });
    await f.run();
    assert.equal(f.actions.length, 9);
    assert.ok(f.actions.every(a => a.challengeId === '80101' && a.action === 'battle' && a.gid !== '2'));
    await f.run();
    assert.equal(f.actions.length, 9, 'same-round triggers share cooldown');
});
test('time budget resumes after last checked friend on next round', async () => {
    const f = fixture({ budgetMs: 700 });
    await f.run();
    assert.deepEqual(f.scans, ['1', '2']);
    f.advance(300000);
    await f.run();
    assert.deepEqual(f.scans, ['1', '2', '3', '4']);
});
test('disabled, inactive, invalid time, exhausted limit and no challenge books do not scan', async () => {
    for (const patch of [{ active: false }, { startTime: 1001 }, { endTime: 999 },
        { endTime: undefined }, { battleCount: 20 }, { hunt: { canPlunder: false } },
        { balances: [{ id: '80103', count: '0' }] }, { balances: [{ id: '80101', count: '3', known: false }] }]) {
        const f = fixture(); f.setPet(patch); await f.run(); assert.equal(f.scans.length, 0);
    }
    const f = fixture(); f.disable(); await f.run(); assert.equal(f.scans.length, 0);
});
test('fresh response limit stops further queries', async () => {
    const f = fixture(); f.setPet({ battleCount: 19 }); await f.run(); assert.equal(f.actions.length, 1);
});
test('off toggle or expiry during query prevents action', async () => {
    for (const expire of [false, true]) {
        const f = fixture({ getFriend: async gid => {
            if (expire) f.advance(10000000); else f.disable();
            return { gid, treasures: [{ id: 't', status: 2, endTime: 99999999,
                previews: [{ challengeId: '80101', canStart: true }] }] };
        } });
        await f.run(); assert.equal(f.actions.length, 0);
    }
});
test('unavailable preview, expired treasure and mismatched response cannot battle', async () => {
    for (const change of [{ status: 1 }, { endTime: 1 }, { previews: [{ challengeId: '80103', canStart: true }] },
        { previews: [{ challengeId: '80101', canStart: false }] }]) {
        const f = fixture({ getFriend: async gid => ({ gid, treasures: [{ id: 't', status: 2, endTime: 9999999,
            previews: [{ challengeId: '80101', canStart: true }], ...change }] }) });
        await f.run(); assert.equal(f.actions.length, 0);
    }
});
test('uncertain mutation stops round and next round refreshes account state', async () => {
    let writes = 0;
    const f = fixture({ operate: async () => { writes++; throw Error('timeout'); } });
    await f.run(); assert.equal(writes, 1);
    assert.ok(f.reports.some(([message]) => message.includes('timeout')));
    f.advance(300000); f.setPet({ battleCount: 20 }); await f.run(); assert.equal(writes, 1);
});
test('concurrent triggers share one run', async () => {
    const f = fixture(); await Promise.all([f.run(), f.run()]); assert.equal(f.actions.length, 10);
});
test('empty shared cache is re-read next interval', async () => {
    let reads = 0;
    const f = fixture({ getFriends: async () => { reads++; return []; } });
    await f.run(); f.advance(300000); await f.run(); assert.equal(reads, 2);
});


test('uses owned intermediate and advanced books, preferring lower tiers with valid previews', async () => {
    for (const ids of [['80101', '80102', '80103'], ['80102', '80103'], ['80103']]) {
        const f = fixture({ getFriend: async gid => ({ gid, treasures: [{ id: 't', status: 2,
            endTime: 9999999, previews: ['80103', '80102', '80101'].map(challengeId => ({ challengeId, canStart: true })) }] }) });
        f.setPet({ balances: ids.map(id => ({ id, count: '2', known: true })) });
        await f.run();
        assert.equal(f.actions[0].challengeId, ids[0]);
    }
    const f = fixture({ getFriend: async gid => ({ gid, treasures: [{ id: 't', status: 2,
        endTime: 9999999, previews: [{ challengeId: '80101', canStart: false }, { challengeId: '80103', canStart: true }] }] }) });
    f.setPet({ balances: ['80101', '80103'].map(id => ({ id, count: '2' })) });
    await f.run(); assert.equal(f.actions[0].challengeId, '80103');
});
