/* =========================
   src/main.ts  — 2025-09-13
   - type-only import を徹底
   - 未使用の $$ / isPWAStandalone を撤去
   - Item 生成時に必須フィールドを完全付与
   - 閲覧(#/) と 編集(#/edit) をシンプルに切替
   ========================= */

import './style.css';

import type { Item } from './storage/Storage';
import { CATEGORIES, addCategory } from './storage/Storage';
import { loadAll, saveItem, removeItem, seedIfEmpty } from './storage/db';
import { nowISO } from './utils/time';
import { initPushIfNeeded } from './push/onesignal';
import { appendHistory, recentHistory, historyForItem, historySince, updateHistoryItemId } from './storage/history';

// ---------- 小ユーティリティ ----------
const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T | null;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, opts);
  for (const c of children) if (c != null) node.append(c as any);
  return node;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // ざっくりフォールバック
  return 'id-' + Math.random().toString(36).slice(2) + '-' + Date.now();
}

function jaSortByName(a: Item, b: Item): number {
  return a.name.localeCompare(b.name, 'ja');
}

// ---------- 閲覧画面 ----------
function renderListHeader() {
  return el('div', { className: 'headerbar' },
    el('div', { className: 'title', textContent: 'StockLite' }),
    el('div', { className: 'header-actions' },
      el('button', { className: 'btn', id: 'btn-to-edit', textContent: '編集' }),
    ),
  );
}

function renderCard(it: Item) {
  if (!it.id) {
    const oldId = it.id || '';
    it.id = uuid();
    it.updatedAt = nowISO();
    saveItem(it);
    updateHistoryItemId(oldId, it.id, it.name);
  }
  const need = it.qty <= it.threshold;
  const tag = need
    ? el('span', { className: 'tag danger', textContent: '要補充' })
    : null;

  const name = el('div', { className: 'item-name' + (need ? '' : ' no-tag'), textContent: it.name });

  // 数量表示
  const qtyText = el('span', { innerHTML: '個数：<b>' + it.qty + '</b>' });

  // + / - / 履歴 ボタン
  const btnMinus = el('button', { className: 'btn', textContent: '−' });
  const btnPlus  = el('button', { className: 'btn', textContent: '＋' });
  const btnHist  = el('button', { className: 'btn hist', textContent: '履歴' });

  btnMinus.addEventListener('click', async () => {
    const next = Math.max(0, it.qty - 1);
    if (next === it.qty) return;
    const updated: Item = { ...it, qty: next, updatedAt: nowISO() };
    await saveItem(updated);
    appendHistory({
      timestamp: nowISO(),
      itemId: it.id,
      itemName: it.name,
      delta: next - it.qty,
      qtyAfter: next,
      reason: 'dec',
    });
    await renderList(); // 再描画
  });

  btnPlus.addEventListener('click', async () => {
    const next = it.qty + 1;
    const updated: Item = { ...it, qty: next, updatedAt: nowISO() };
    await saveItem(updated);
    appendHistory({
      timestamp: nowISO(),
      itemId: it.id,
      itemName: it.name,
      delta: next - it.qty,
      qtyAfter: next,
      reason: 'inc',
    });
    await renderList(); // 再描画
  });

  btnHist.addEventListener('click', () => {
    location.hash = '#/history/' + it.id;
  });

  const row1 = el('div', { className: 'row1' }, tag, name);
  const row2 = el('div', { className: 'row2' },
    el('div', { className: 'qty' }, qtyText),
    el('div', { className: 'actions' }, btnMinus, btnPlus, btnHist),
  );
  const nextRefill = it.nextRefillAt ? it.nextRefillAt.slice(5, 10).replace('-', '/') : '—';
  const row3 = el('div', { className: 'row3', textContent: `次回補充：${nextRefill}` });

  return el('div', { className: 'card' }, row1, row2, row3);
}

async function renderList() {
  const root = $('#app')!;
  root.textContent = '';

  root.append(renderListHeader());

  const all = (await Promise.resolve(loadAll())).filter(i => !i.deleted);
  // カテゴリごと・名前順
  for (const cat of CATEGORIES) {
    const items = all.filter(i => i.category === cat).sort(jaSortByName);
    if (!items.length) continue;

    root.append(
      el('h2', { className: 'cat', textContent: cat }),
    );

    for (const it of items) root.append(renderCard(it));
  }

  const recent = renderRecentHistory();
  if (recent) root.append(recent);

  $('#btn-to-edit')?.addEventListener('click', () => { location.hash = '#/edit'; });
}

// ---------- 編集画面 ----------
function renderEditHeader() {
  return el('div', { className: 'headerbar' },
    el('div', { className: 'title', textContent: '編集' }),
    el('div', { className: 'header-actions' },
      el('button', { className: 'btn', id: 'btn-done', textContent: '完了' }),
    ),
  );
}

function numberInput(value: number, min = 0) {
  const i = el('input', { type: 'number', value: String(value) }) as HTMLInputElement;
  i.min = String(min);
  i.inputMode = 'numeric';
  return i;
}
function textInput(value = '') {
  return el('input', { type: 'text', value }) as HTMLInputElement;
}
function populateCategoryOptions(sel: HTMLSelectElement, selected: string) {
  sel.textContent = '';
  for (const c of CATEGORIES) {
    sel.append(el('option', { value: c, textContent: c, selected: c === selected }));
  }
  sel.append(el('option', { value: '__add__', textContent: 'カテゴリを追加…' }));
}
function categorySelect(value: Item['category']) {
  const sel = el('select', { className: 'ed-cat' }) as HTMLSelectElement;
  populateCategoryOptions(sel, value);
  sel.addEventListener('change', () => {
    if (sel.value === '__add__') {
      const name = prompt('新しいカテゴリ名');
      if (name && name.trim()) {
        addCategory(name);
        populateCategoryOptions(sel, name.trim());
        document.querySelectorAll('select.ed-cat').forEach(s => {
          if (s !== sel) populateCategoryOptions(s as HTMLSelectElement, (s as HTMLSelectElement).value);
        });
      } else {
        populateCategoryOptions(sel, value);
      }
    }
  });
  return sel;
}
function fieldWrap(
  label: string,
  child: HTMLElement,
  cls: string,
  note?: string,
) {
  return el(
    'div',
    { className: `field ${cls}` },
    el('div', { className: 'field-label', textContent: label }),
    child,
    note ? el('div', { className: 'field-note', textContent: note }) : null,
  );
}

function renderEditRow(it: Item) {
  const nameI = textInput(it.name);
  const catS  = categorySelect(it.category);
  const qtyI  = numberInput(it.qty, 0);
  const thI   = numberInput(it.threshold, 0);

  const btnSave = el('button', { className: 'btn save', textContent: '保存' });
  const btnDel  = el('button', { className: 'btn danger del', textContent: '削除' });

  const row = el('div', { className: 'edit-row' },
    fieldWrap('名前', nameI, 'ed-name'),
    fieldWrap('カテゴリ', catS, 'ed-cat'),
    fieldWrap('個数', qtyI, 'ed-qty'),
    fieldWrap('閾値', thI, 'ed-th', 'この数以下で要補充'),
    el('div', { className: 'save' }, btnSave),
    el('div', { className: 'del'  }, btnDel),
  );

  btnSave.addEventListener('click', async () => {
    const updated: Item = {
      ...it,
      name: (nameI as HTMLInputElement).value.trim(),
      category: (catS as HTMLSelectElement).value as Item['category'],
      qty: parseInt((qtyI as HTMLInputElement).value || '0', 10),
      threshold: parseInt((thI as HTMLInputElement).value || '0', 10),
      updatedAt: nowISO(),
    };
    addCategory(updated.category);
    await saveItem(updated);
    const delta = updated.qty - it.qty;
    if (delta !== 0) {
      appendHistory({
        timestamp: updated.updatedAt,
        itemId: it.id,
        itemName: updated.name,
        delta,
        qtyAfter: updated.qty,
        reason: 'edit',
      });
    }
    await renderEdit();
  });

  btnDel.addEventListener('click', async () => {
    await removeItem(it.id);
    appendHistory({
      timestamp: nowISO(),
      itemId: it.id,
      itemName: it.name,
      delta: -it.qty,
      qtyAfter: 0,
      reason: 'delete',
    });
    await renderEdit();
  });

  return row;
}

function renderAddRow() {
  const nameI = textInput('');
  const catS  = categorySelect(CATEGORIES[0]);
  const qtyI  = numberInput(0, 0);
  const thI   = numberInput(1, 0);

  const btnAdd   = el('button', { className: 'btn primary', textContent: '追加' });
  const btnClear = el('button', { className: 'btn ghost',   textContent: 'クリア' });

  const row = el('div', { className: 'edit-row add' },
    fieldWrap('（新規）名前', nameI, 'ed-name'),
    fieldWrap('カテゴリ',     catS,  'ed-cat'),
    fieldWrap('個数',         qtyI,  'ed-qty'),
    fieldWrap('閾値',         thI,  'ed-th', 'この数以下で要補充'),
    el('div', { className: 'save' }, btnAdd),
    el('div', { className: 'del'  }, btnClear),
  );

  btnAdd.addEventListener('click', async () => {
    const name = (nameI as HTMLInputElement).value.trim();
    if (!name) { (nameI as HTMLInputElement).focus(); return; }

    const newItem: Item = {
      id: uuid(),
      name,
      category: (catS as HTMLSelectElement).value as Item['category'],
      qty: parseInt((qtyI as HTMLInputElement).value || '0', 10),
      threshold: parseInt((thI as HTMLInputElement).value || '0', 10),
      lastRefillAt: '',
      nextRefillAt: '',
      createdAt: nowISO(),
      updatedAt: nowISO(),
      deleted: false,
      version: 1,
    };
    addCategory(newItem.category);
    await saveItem(newItem);
    appendHistory({
      timestamp: newItem.createdAt,
      itemId: newItem.id,
      itemName: newItem.name,
      delta: newItem.qty,
      qtyAfter: newItem.qty,
      reason: 'add',
    });

    (nameI as HTMLInputElement).value = '';
    (qtyI  as HTMLInputElement).value = '0';
    (thI   as HTMLInputElement).value = '0';
    await renderEdit();
  });

  btnClear.addEventListener('click', () => {
    (nameI as HTMLInputElement).value = '';
    (qtyI  as HTMLInputElement).value = '0';
    (thI   as HTMLInputElement).value = '0';
  });

  return row;
}

async function renderEdit() {
  const root = $('#app')!;
  root.textContent = '';
  const items = (await Promise.resolve(loadAll()))
    .filter(i => !i.deleted)
    .sort((a, b) =>
      a.category === b.category
        ? jaSortByName(a, b)
        : CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category),
    );

  root.append(
    renderEditHeader(),
    el('div', { className: 'edit-panel' },
      el('h3', { className: 'section-title', textContent: '新規追加' }),
      renderAddRow(),
      items.length
        ? el('h3', { className: 'section-title', textContent: '既存アイテム' })
        : null,
      items.length
        ? el('div', { className: 'edit-list' }, ...items.map(renderEditRow))
        : null,
    ),
  );

  $('#btn-done')?.addEventListener('click', () => { location.hash = ''; });
}

function renderRecentHistory() {
  const rec = recentHistory(100);
  const map = new Map<string, { day: string; itemName: string; delta: number; qtyAfter: number }>();
  const order: string[] = [];
  for (const e of rec) {
    const day = e.timestamp.slice(0, 10);
    const key = day + '|' + e.itemId;
    if (!map.has(key)) {
      map.set(key, { day, itemName: e.itemName, delta: e.delta, qtyAfter: e.qtyAfter });
      order.push(key);
    } else {
      const g = map.get(key)!;
      g.delta += e.delta;
      g.qtyAfter = e.qtyAfter;
    }
  }
  const groups = order.slice(0, 10).map(k => map.get(k)!);
  if (!groups.length) return null;
  const items = groups.map(g =>
    el('li', {},
      el('span', { className: 'dt', textContent: g.day.slice(5) }),
      el('span', { className: 'ev', textContent: `${g.itemName} (${g.delta > 0 ? '+' : ''}${g.delta} → ${g.qtyAfter})` })
    )
  );
  return el('div', { className: 'recent' },
    el('h2', { className: 'cat', textContent: '最近の変更' }),
    el('ul', { className: 'hist-list' }, ...items),
  );
}

function renderHistoryHeader(name: string) {
  return el('div', { className: 'headerbar' },
    el('div', { className: 'title', textContent: `${name}の履歴` }),
    el('div', { className: 'header-actions' },
      el('button', { className: 'btn', id: 'btn-csv', textContent: 'CSVエクスポート' }),
      el('button', { className: 'btn', id: 'btn-back', textContent: '戻る' }),
    ),
  );
}

function drawLine(canvas: HTMLCanvasElement, data: number[], min: number, max: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const range = max - min || 1;
  const stepX = w / (data.length - 1);
  ctx.beginPath();
  data.forEach((q, i) => {
    const x = i * stepX;
    const y = h - ((q - min) / range) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#000';
  ctx.stroke();
}

async function renderHistory(id: string) {
  const root = $('#app')!;
  root.textContent = '';

  const items = await Promise.resolve(loadAll());
  let it = items.find(x => x.id === id);
  let allHist = historyForItem(id);

  if (!it && allHist.length) {
    const last = allHist[allHist.length - 1];
    const named = items.find(i => i.name === last.itemName);
    if (named) {
      updateHistoryItemId(id, named.id, named.name);
      id = named.id;
      it = named;
      allHist = historyForItem(id);
    } else {
      it = {
        id,
        name: last.itemName || '不明なアイテム',
        category: '',
        qty: last.qtyAfter,
        threshold: 0,
        lastRefillAt: '',
        nextRefillAt: '',
        createdAt: last.timestamp,
        updatedAt: last.timestamp,
        deleted: false,
        version: 1,
      };
    }
  }

  if (!it && !allHist.length) {
    const blanks = historyForItem('');
    const match = blanks.find(b => items.some(i => i.name === b.itemName));
    if (match) {
      const target = items.find(i => i.name === match.itemName)!;
      updateHistoryItemId('', target.id, target.name);
      it = target;
      allHist = historyForItem(target.id);
    }
  }

  if (!it) { root.textContent = 'アイテムが見つかりません'; return; }

  root.append(renderHistoryHeader(it.name));

  const DAY = 86400000;
  const start = new Date(Date.now() - 89 * DAY);
  const hist = allHist.filter(h => h.timestamp >= start.toISOString());
  const deltaSum = hist.reduce((s, e) => s + e.delta, 0);
  let qty = it.qty - deltaSum;

  const dayMap = new Map<string, number>();
  for (const h of hist) {
    const day = h.timestamp.slice(0, 10);
    dayMap.set(day, (dayMap.get(day) || 0) + h.delta);
  }

  const data: number[] = [];
  for (let i = 0; i < 90; i++) {
    const day = new Date(start.getTime() + i * DAY).toISOString().slice(0, 10);
    qty += dayMap.get(day) || 0;
    data.push(qty);
  }

  const min = Math.min(...data);
  const max = Math.max(...data);

  const canvas = el('canvas', { width: 320, height: 160 }) as HTMLCanvasElement;
  drawLine(canvas, data, min, max);
  const chart = el('div', { className: 'hist-chart' }, canvas);
  const stats = el('div', { className: 'hist-stats', textContent: `現在:${it.qty} / 最小:${min} / 最大:${max}` });

  const groups: { day: string; delta: number; qtyAfter: number }[] = [];
  for (let i = allHist.length - 1; i >= 0; i--) {
    const e = allHist[i];
    const day = e.timestamp.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.delta += e.delta;
      last.qtyAfter = e.qtyAfter;
    } else {
      groups.push({ day, delta: e.delta, qtyAfter: e.qtyAfter });
    }
  }
  const listItems = groups.slice(0, 10).map(g =>
    el('li', {},
      el('span', { className: 'dt', textContent: g.day.slice(5) }),
      el('span', { className: 'ev', textContent: `${g.delta > 0 ? '+' : ''}${g.delta} → ${g.qtyAfter}` }),
    )
  );
  const list = el('ul', { className: 'hist-list' }, ...listItems);

  root.append(chart, stats, list);

  $('#btn-back')?.addEventListener('click', () => { location.hash = ''; });
  $('#btn-csv')?.addEventListener('click', () => {
    const oneYear = new Date(Date.now() - 365 * DAY).toISOString();
    const entries = historySince(oneYear);
    const header = 'timestamp,itemName,itemId,delta,qtyAfter,reason';
    const esc = (v: any) => '"' + String(v).replace(/"/g, '""') + '"';
    const lines = entries.map(e => [e.timestamp, e.itemName, e.itemId, e.delta, e.qtyAfter, e.reason].map(esc).join(','));
    const csv = '\uFEFF' + [header, ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    a.href = URL.createObjectURL(blob);
    a.download = `stocklite_history_${yyyy}${mm}${dd}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

// ---------- ルーティング & 起動 ----------
async function route() {
  if (location.hash === '#/edit') await renderEdit();
  else if (location.hash.startsWith('#/history/')) await renderHistory(location.hash.slice(10));
  else await renderList();
}

async function main() {
  await initPushIfNeeded(); // OneSignal(v16) 初期化（ボタン操作時許可は各画面側で実装済み前提）
  seedIfEmpty();
  window.addEventListener('hashchange', route);
  await route();
}

main();
