const test = require('node:test');
const assert = require('node:assert/strict');

const { select2x2Reservations } = require('../src/services/planting-service');

function growingLand(id, matureAt) {
  return {
    id,
    unlocked: true,
    plant: {
      id: 1,
      season: 1,
      phases: [{ phase: 6, begin_time: matureAt }],
    },
  };
}

test('keeps an existing 2x2 reservation while its lands are cleared one by one', () => {
  const groupA = { key: '1-2-5-6', masterLandId: 5, landIds: [5, 6, 1, 2] };
  const groupB = { key: '3-4-7-8', masterLandId: 7, landIds: [7, 8, 3, 4] };

  const firstLands = [
    growingLand(1, 100),
    growingLand(2, 100),
    growingLand(5, 100),
    growingLand(6, 100),
    growingLand(3, 200),
    growingLand(4, 200),
    growingLand(7, 200),
    growingLand(8, 200),
  ];
  const first = select2x2Reservations([groupA, groupB], [], 1, firstLands);
  assert.deepEqual(first.map(group => group.key), [groupA.key]);

  // A 的一块地刚刚空出；即使 B 此时预计更早整体清空，也不能改换预留区，
  // 否则地块 1 会被后续普通种植流程立即塞入单格种子。
  const secondLands = [
    { id: 1, unlocked: true },
    growingLand(2, 300),
    growingLand(5, 300),
    growingLand(6, 300),
    growingLand(3, 150),
    growingLand(4, 150),
    growingLand(7, 150),
    growingLand(8, 150),
  ];
  const second = select2x2Reservations([groupA, groupB], [1], 1, secondLands);

  assert.deepEqual(second.map(group => group.key), [groupA.key]);
  assert.ok(second[0].landIds.includes(1));
});

test('prefers a 2x2 group with three empty lands over an earlier but less-cleared group', () => {
  const almostReady = { key: '9-10-13-14', masterLandId: 13, landIds: [13, 14, 9, 10] };
  const earlier = { key: '3-4-7-8', masterLandId: 7, landIds: [7, 8, 3, 4] };
  const lands = [
    { id: 10, unlocked: true },
    { id: 13, unlocked: true },
    { id: 14, unlocked: true },
    growingLand(9, 300),
    { id: 3, unlocked: true },
    growingLand(4, 100),
    growingLand(7, 100),
    growingLand(8, 100),
  ];

  const selected = select2x2Reservations(
    [earlier, almostReady],
    [3, 10, 13, 14],
    1,
    lands,
  );

  assert.deepEqual(selected.map(group => group.key), [almostReady.key]);
});

test('prefers the earlier land group when adjacent groups clear at nearly the same time', () => {
  select2x2Reservations([], [], 0, []);
  const upper = { key: '3-4-7-8', masterLandId: 7, landIds: [7, 8, 3, 4] };
  const lower = { key: '7-8-11-12', masterLandId: 11, landIds: [11, 12, 7, 8] };
  const now = Math.floor(Date.now() / 1000);
  const lands = [
    growingLand(3, now + 106),
    growingLand(4, now + 106),
    growingLand(7, now + 100),
    growingLand(8, now + 100),
    growingLand(11, now + 100),
    growingLand(12, now + 100),
  ];

  const selected = select2x2Reservations([lower, upper], [], 1, lands);

  assert.deepEqual(selected.map(group => group.key), [upper.key]);
});

test('still prefers a materially earlier clearing group over the earlier land ids', () => {
  select2x2Reservations([], [], 0, []);
  const upper = { key: '3-4-7-8', masterLandId: 7, landIds: [7, 8, 3, 4] };
  const lower = { key: '7-8-11-12', masterLandId: 11, landIds: [11, 12, 7, 8] };
  const now = Math.floor(Date.now() / 1000);
  const lands = [
    growingLand(3, now + 200),
    growingLand(4, now + 200),
    growingLand(7, now + 100),
    growingLand(8, now + 100),
    growingLand(11, now + 100),
    growingLand(12, now + 100),
  ];

  const selected = select2x2Reservations([upper, lower], [], 1, lands);

  assert.deepEqual(selected.map(group => group.key), [lower.key]);
});

test('a nearly cleared group supersedes an older reservation with less clearing progress', () => {
  const oldReservation = { key: '1-2-5-6', masterLandId: 5, landIds: [5, 6, 1, 2] };
  const almostReady = { key: '9-10-13-14', masterLandId: 13, landIds: [13, 14, 9, 10] };

  select2x2Reservations(
    [oldReservation],
    [1],
    1,
    [
      { id: 1, unlocked: true },
      growingLand(2, 100),
      growingLand(5, 100),
      growingLand(6, 100),
    ],
  );

  const selected = select2x2Reservations(
    [oldReservation, almostReady],
    [1, 10, 13, 14],
    1,
    [
      { id: 1, unlocked: true },
      growingLand(2, 100),
      growingLand(5, 100),
      growingLand(6, 100),
      growingLand(9, 200),
      { id: 10, unlocked: true },
      { id: 13, unlocked: true },
      { id: 14, unlocked: true },
    ],
  );

  assert.deepEqual(selected.map(group => group.key), [almostReady.key]);
});
