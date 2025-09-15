import test from 'node:test';
import assert from 'node:assert/strict';
import { appendHistory, historyForItem, ensureHistoryNames } from '../src/storage/history.ts';

const createLocalStorage = () => {
  let store = {};
  return {
    getItem: key => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: key => { delete store[key]; },
    clear: () => { store = {}; }
  };
};

globalThis.localStorage = createLocalStorage();

test('ensureHistoryNames fills missing itemName', () => {
  localStorage.clear();
  appendHistory({
    timestamp: '2024-01-01T00:00:00.000Z',
    itemId: 'id1',
    itemName: '',
    delta: 1,
    qtyAfter: 1,
    reason: 'add'
  });

  ensureHistoryNames([{ id: 'id1', name: 'テスト品' }]);
  const hist = historyForItem('id1');
  assert.equal(hist[0].itemName, 'テスト品');
});
