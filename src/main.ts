/* =========================
   src/main.ts  — 2025-09-13
   - type-only import を徹底
   - 未使用の $$ / isPWAStandalone を撤去
   - Item 生成時に必須フィールドを完全付与
   - 閲覧(#/) と 編集(#/edit) をシンプルに切替
   ========================= */

import './style.css';

import type { Item } from './storage/Storage';
import { DEFAULT_CATEGORIES } from './storage/Storage';
import { loadAll, saveItem, removeItem, seedIfEmpty } from './storage/db';
import { nowISO } from './utils/time';
import { initPushIfNeeded } from './push/onesignal';

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

function getCategories(items: Item[]): string[] {
  const set = new Set(DEFAULT_CATEGORIES);
  for (const it of items) set.add(it.category);
  return Array.from(set);
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
  const need = it.qty <= it.threshold;
  const tag = need
    ? el('span', { className: 'tag danger', textContent: '要補充' })
    : null;

  const name = el('div', { className: 'item-name' + (need ? '' : ' no-tag'), textContent: it.name });

  // 数量表示
  const qtyText = el('span', { innerHTML: '個数：<b>' + it.qty + '</b>' });

  // + / - ボタン（1刻み）
  const btnMinus = el('button', { className: 'btn', textContent: '−' });
  const btnPlus  = el('button', { className: 'btn', textContent: '＋' });

  btnMinus.addEventListener('click', async () => {
    const next = Math.max(0, it.qty - 1);
    if (next === it.qty) return;
    const updated: Item = { ...it, qty: next, updatedAt: nowISO() };
    await saveItem(updated);
    await renderList(); // 再描画
  });

  btnPlus.addEventListener('click', async () => {
    const next = it.qty + 1;
    const updated: Item = { ...it, qty: next, updatedAt: nowISO() };
    await saveItem(updated);
    await renderList(); // 再描画
  });

  const row1 = el('div', { className: 'row1' }, tag, name);
  const row2 = el('div', { className: 'row2' },
    el('div', { className: 'qty' }, qtyText),
    el('div', { className: 'actions' }, btnMinus, btnPlus),
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
  const cats = getCategories(all);
  // カテゴリごと・名前順
  for (const cat of cats) {
    const items = all.filter(i => i.category === cat).sort(jaSortByName);
    if (!items.length) continue;

    root.append(
      el('h2', { className: 'cat', textContent: cat }),
    );

    for (const it of items) root.append(renderCard(it));
  }

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
function categorySelect(categories: string[], value: string) {
  const sel = el('select', { className: 'ed-cat' }) as HTMLSelectElement;
  for (const c of categories) sel.append(el('option', { value: c, textContent: c, selected: c === value }));
  sel.append(el('option', { value: '__new', textContent: '＋新規カテゴリ' }));
  const reset = () => { sel.value = categories.includes(value) ? value : categories[0] || ''; };
  sel.addEventListener('change', () => {
    if (sel.value !== '__new') return;
    const name = prompt('カテゴリ名');
    if (name) {
      categories.push(name);
      sel.insertBefore(el('option', { value: name, textContent: name }), sel.lastElementChild!);
      sel.value = name;
    } else {
      reset();
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

function renderEditRow(it: Item, categories: string[]) {
  const nameI = textInput(it.name);
  const catS  = categorySelect(categories, it.category);
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
      category: (catS as HTMLSelectElement).value,
      qty: parseInt((qtyI as HTMLInputElement).value || '0', 10),
      threshold: parseInt((thI as HTMLInputElement).value || '0', 10),
      updatedAt: nowISO(),
    };
    await saveItem(updated);
    await renderEdit();
  });

  btnDel.addEventListener('click', async () => {
    await removeItem(it.id);
    await renderEdit();
  });

  return row;
}

function renderAddRow(categories: string[]) {
  const nameI = textInput('');
  const catS  = categorySelect(categories, categories[0] || '');
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
      category: (catS as HTMLSelectElement).value,
      qty: parseInt((qtyI as HTMLInputElement).value || '0', 10),
      threshold: parseInt((thI as HTMLInputElement).value || '0', 10),
      lastRefillAt: '',
      nextRefillAt: '',
      createdAt: nowISO(),
      updatedAt: nowISO(),
      deleted: false,
      version: 1,
    };
    await saveItem(newItem);

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
  const items = (await Promise.resolve(loadAll())).filter(i => !i.deleted);
  const categories = getCategories(items);
  items.sort((a, b) =>
    a.category === b.category
      ? jaSortByName(a, b)
      : categories.indexOf(a.category) - categories.indexOf(b.category),
  );

  root.append(
    renderEditHeader(),
    el('div', { className: 'edit-panel' },
      el('h3', { className: 'section-title', textContent: '新規追加' }),
      renderAddRow(categories),
      items.length
        ? el('h3', { className: 'section-title', textContent: '既存アイテム' })
        : null,
      items.length
        ? el('div', { className: 'edit-list' }, ...items.map(it => renderEditRow(it, categories)))
        : null,
    ),
  );

  $('#btn-done')?.addEventListener('click', () => { location.hash = ''; });
}

// ---------- ルーティング & 起動 ----------
async function route() {
  if (location.hash === '#/edit') await renderEdit();
  else await renderList();
}

async function main() {
  await initPushIfNeeded(); // OneSignal(v16) 初期化（ボタン操作時許可は各画面側で実装済み前提）
  seedIfEmpty();
  window.addEventListener('hashchange', route);
  await route();
}

main();
