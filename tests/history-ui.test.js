import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { appendHistory } from '../src/storage/history.ts';

// test that history view resolves item name and shows graph

test('renderHistory shows item name and graph', async () => {
  const dom = new JSDOM('<!DOCTYPE html><div id="app"></div>', { url: 'https://local.test' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;

  // dynamic import after env setup so main() does not run
  const { renderHistory } = await import('../src/main.ts');

  // prepare history with known item
  const iso = new Date().toISOString();
  appendHistory({
    timestamp: iso,
    itemId: 'id1',
    itemName: 'テスト品',
    delta: 1,
    qtyAfter: 1,
    reason: 'add',
  });

  await renderHistory('id1');

  const title = dom.window.document.querySelector('.title')?.textContent;
  assert.equal(title, 'テスト品の履歴');
  const canvas = dom.window.document.querySelector('canvas');
  assert.ok(canvas, 'canvas should exist for graph');

  dom.window.close();
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.localStorage;
});
