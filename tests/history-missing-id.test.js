import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { appendHistory } from '../src/storage/history.ts';

// verify renderHistory links blank itemId entries by name

test('renderHistory links history with blank itemId by name', async () => {
  const dom = new JSDOM('<!DOCTYPE html><div id="app"></div>', { url: 'https://local.test' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;

  // prepare item stored without corresponding history id
  const item = {
    id: 'id2',
    name: 'テスト品',
    category: '',
    qty: 2,
    threshold: 0,
    lastRefillAt: '',
    nextRefillAt: '',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    deleted: false,
    version: 1,
  };
  dom.window.localStorage.setItem('stocklite/items', JSON.stringify([item]));

  // history entry with blank itemId but matching name
  appendHistory({
    timestamp: '2024-01-02T00:00:00.000Z',
    itemId: '',
    itemName: 'テスト品',
    delta: -1,
    qtyAfter: 1,
    reason: 'dec',
  });

  const { renderHistory } = await import('../src/main.ts');
  await renderHistory('id2');

  const title = dom.window.document.querySelector('.title')?.textContent;
  assert.equal(title, 'テスト品の履歴');
  const canvas = dom.window.document.querySelector('canvas');
  assert.ok(canvas, 'canvas should exist for graph');

  dom.window.close();
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.localStorage;
});
