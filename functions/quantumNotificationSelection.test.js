const test = require('node:test');
const assert = require('node:assert/strict');
const {
  areSameQuantumSectorSelections,
  buildQuantumNotificationSelectionUpdates,
  normalizeQuantumSectorIds,
} = require('../components/quantumNotificationSelection');

test('quantum sector selections are normalized and compared as sets', () => {
  assert.deepEqual(normalizeQuantumSectorIds([' l4 ', 'h4', 'l4', '', null]), ['l4', 'h4']);
  assert.equal(areSameQuantumSectorSelections(['l4', 'h4'], ['h4', 'l4', 'h4']), true);
  assert.equal(areSameQuantumSectorSelections(['l4'], ['l4', 'h4']), false);
});

test('quantum notification selection update adds and removes user leaves atomically', () => {
  const timestamp = { '.sv': 'timestamp' };
  const result = buildQuantumNotificationSelectionUpdates({
    userId: 'user-1',
    currentSectorIds: ['l4', 'h4'],
    nextSectorIds: ['h4', 'j4'],
    createdAt: timestamp,
  });

  assert.deepEqual(result.addedSectorIds, ['j4']);
  assert.deepEqual(result.removedSectorIds, ['l4']);
  assert.deepEqual(result.nextSectorIds, ['h4', 'j4']);
  assert.deepEqual(result.updates, {
    'j4/user-1': {
      userId: 'user-1',
      sectorId: 'j4',
      expectedState: 'blocked',
      createdAt: timestamp,
    },
    'l4/user-1': null,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(result.updates, 'h4/user-1'), false);
});

test('quantum notification selection update supports clearing the full selection', () => {
  const result = buildQuantumNotificationSelectionUpdates({
    userId: 'user-1',
    currentSectorIds: ['l4', 'h4'],
    nextSectorIds: [],
    createdAt: { '.sv': 'timestamp' },
  });

  assert.deepEqual(result.updates, {
    'l4/user-1': null,
    'h4/user-1': null,
  });
});

test('unchanged quantum notification selection produces no writes', () => {
  const result = buildQuantumNotificationSelectionUpdates({
    userId: 'user-1',
    currentSectorIds: ['l4', 'h4'],
    nextSectorIds: ['h4', 'l4', 'l4'],
    createdAt: { '.sv': 'timestamp' },
  });

  assert.deepEqual(result.addedSectorIds, []);
  assert.deepEqual(result.removedSectorIds, []);
  assert.deepEqual(result.updates, {});
});
