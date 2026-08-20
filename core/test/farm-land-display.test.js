const test = require('node:test');
const assert = require('node:assert/strict');
const { getAllPlants } = require('../src/config/gameConfig');

const {
  buildLandMap,
  getDisplayLandContext,
  getCurrentPhase,
  getQixiDewStatus,
  analyzeLands
} = require('../src/services/farm-land-analyzer');

test('qixi dew field_40 exposes applied state and keeps the server reward value', () => {
  assert.deepEqual(getQixiDewStatus({ field_40: { value_1: 10, value_2: 1 } }), {
    applied: true,
    rewardValue: 10,
    appliedMarker: 1
  });
  assert.equal(getQixiDewStatus({ field_40: { value_1: 10, value_2: 0 } }).applied, false);
  assert.equal(getQixiDewStatus({}).applied, false);
});

test('real pea suffix resolves phase_id 20 to the fifth configured stage', () => {
  const current = getCurrentPhase([
    { phase: 2, phase_id: 20, begin_time: 1785758321 },
    { phase: 6, phase_id: 19, begin_time: 1785764081 }
  ], false, '', 1020008);
  assert.equal(current.server_phase, 2);
  assert.equal(current.phase_record_id, 20);
  assert.equal(current.phase_index, 4);
  assert.equal(current.image_phase, 5);
  assert.equal(current.phaseName, '初熟');
});

test('real star bell suffix uses the first remaining record as current', () => {
  const current = getCurrentPhase([
    { phase: 2, phase_id: 8, begin_time: 1785752268 },
    { phase: 2, phase_id: 12, begin_time: 1785760908 },
    { phase: 2, phase_id: 10, begin_time: 1785769548 },
    { phase: 6, phase_id: 19, begin_time: 1785778188 }
  ], false, '', 1029003);
  assert.equal(current.server_phase, 2);
  assert.equal(current.phase_record_id, 8);
  assert.equal(current.phase_index, 2);
  assert.equal(current.image_phase, 3);
  assert.equal(current.phaseName, '小叶子');
});

test('a mature suffix with one remaining record resolves the final configured stage', () => {
  const current = getCurrentPhase([
    { phase: 6, phase_id: 19, begin_time: 1785764081 }
  ], false, '', 1020008);
  assert.equal(current.server_phase, 6);
  assert.equal(current.phase_index, 5);
  assert.equal(current.image_phase, 6);
  assert.equal(current.phaseName, '成熟');
});

test('morning glory final 盛开 stage is normalized to harvestable maturity', () => {
  const phases = [
    { phase: 2, phase_id: 19, begin_time: 1 }
  ];
  const current = getCurrentPhase(phases, false, '', 1020147);

  assert.equal(current.server_phase, 2);
  assert.equal(current.phase, 6);
  assert.equal(current.phase_index, 5);
  assert.equal(current.phaseName, '盛开');

  const analysis = analyzeLands([{
    id: 9,
    unlocked: true,
    plant: { id: 1020147, name: '牵牛花', phases }
  }]);
  assert.deepEqual(analysis.harvestable, [9]);
  assert.deepEqual(analysis.growing, []);
});

test('final configured stage remains harvestable when detailed phase id is encoded in phase', () => {
  const current = getCurrentPhase([
    { phase: 19, begin_time: 1 }
  ], false, '', 1020147);

  assert.equal(current.server_phase, 19);
  assert.equal(current.phase, 6);
  assert.equal(current.phaseName, '盛开');
});

test('a new activity plant without static growth config still uses protocol maturity', () => {
  const phases = [{ phase: 6, phase_id: 19, begin_time: 1 }];
  const current = getCurrentPhase(phases, false, '', 1060032);

  assert.equal(current.phase, 6);
  assert.equal(current.phaseName, '成熟');
  assert.deepEqual(analyzeLands([{
    id: 10,
    unlocked: true,
    plant: { id: 1060032, name: '金盏花', phases }
  }]).harvestable, [10]);
});

test('every configured plant recognizes all observed mature protocol variants', () => {
  const matureVariants = [
    [{ phase: 6, phase_id: 19, begin_time: 1 }],
    [{ phase: 2, phase_id: 19, begin_time: 1 }],
    [{ phase: 19, begin_time: 1 }]
  ];

  for (const plant of getAllPlants()) {
    for (const phases of matureVariants) {
      assert.equal(
        getCurrentPhase(phases, false, '', plant.id)?.phase,
        6,
        `${plant.name} (${plant.id}) mature variant ${JSON.stringify(phases[0])}`
      );
    }
  }
});

test('2x2 plant display context merges slave lands into the master land', () => {
  const plant = { id: 1001, phases: [{ phase: 1, begin_time: 1 }] };
  const lands = [
    { id: 1, plant, slave_land_ids: [2, 3, 4] },
    { id: 2, master_land_id: 1 },
    { id: 3, master_land_id: 1 },
    { id: 4, master_land_id: 1 }
  ];
  const landMap = buildLandMap(lands);

  const master = getDisplayLandContext(lands[0], landMap);
  assert.equal(master.occupiedByMaster, false);
  assert.equal(master.masterLandId, 1);
  assert.deepEqual(master.occupiedLandIds, [1, 2, 3, 4]);

  for (const slaveLand of lands.slice(1)) {
    const slave = getDisplayLandContext(slaveLand, landMap);
    assert.equal(slave.occupiedByMaster, true);
    assert.equal(slave.masterLandId, 1);
    assert.equal(slave.sourceLand, lands[0]);
    assert.deepEqual(slave.occupiedLandIds, [1, 2, 3, 4]);
  }
});

test('2x2 protocol master keeps all four occupied ids regardless of slave order', () => {
  const plant = { id: 1001, phases: [{ phase: 1, begin_time: 1 }] };
  const lands = [
    { id: 1, master_land_id: 5 },
    { id: 2, master_land_id: 5 },
    { id: 5, plant, slave_land_ids: [6, 1, 2] },
    { id: 6, master_land_id: 5 }
  ];
  const landMap = buildLandMap(lands);
  const master = getDisplayLandContext(lands[2], landMap);

  assert.equal(master.masterLandId, 5);
  assert.deepEqual(master.occupiedLandIds, [5, 6, 1, 2]);
});

test('slave lands are found from the master slave list when master_land_id is absent', () => {
  const plant = { id: 1029003, phases: [{ phase: 1, begin_time: 1 }] };
  const lands = [
    { id: 5, plant, slave_land_ids: [7, 13, 14] },
    { id: 7, plant },
    { id: 13, plant },
    { id: 14, plant }
  ];
  const landMap = buildLandMap(lands);

  for (const slaveLand of lands.slice(1)) {
    const context = getDisplayLandContext(slaveLand, landMap);
    assert.equal(context.occupiedByMaster, true);
    assert.equal(context.masterLandId, 5);
    assert.equal(context.sourceLand, lands[0]);
    assert.deepEqual(context.occupiedLandIds, [5, 7, 13, 14]);
  }
});

test('single-grid plant keeps only its own land id', () => {
  const land = {
    id: 8,
    plant: { id: 1002, phases: [{ phase: 1, begin_time: 1 }] }
  };
  const context = getDisplayLandContext(land, buildLandMap([land]));

  assert.equal(context.occupiedByMaster, false);
  assert.deepEqual(context.occupiedLandIds, [8]);
});
