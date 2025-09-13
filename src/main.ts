/* =========================
   src/main.ts
   - import の修正（db.ts から CRUD を取得）
   - 編集UIは前回のまま（ラベル付き）
   ========================= */

import './style.css';

// 型・定数・ユーティリティは Storage.ts から
import { Item, CATEGORIES, isPWAStandalone } from './storage/Storage';

// CRUD は db.ts から
import { loadAll, saveItem, removeItem } from './storage/db';

import { nowISO } from './utils/time';
import { initPushIfNeeded, showLocalTest } from './push/onesignal';

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;
const $$ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll(sel)) as T[];

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

/* ---------- 共通ヘッダ ---------- */
function renderHeader() {
  const header = el('div', { className: 'headerbar' },
    el('div', { className: 'title', textContent: '編集' }),
    el('div', { className: 'header-actions' },
      el('button', { className: 'btn primary', id: 'btn-add-open', textContent: '新規追加' }),
      el('button', { className: 'btn', id: 'btn-done', textContent: '完了' }),
    ),
  );
  return header;
}

/* ---------- フィールド共通ラッパー（ラベル付） ---------- */
function wrapField(label: string, child: HTMLElement, cls: string) {
  return el('div', { className: `field ${cls}` },
    el('div', { className: 'field-label', textContent: label }),
    child
  );
}

/* ---------- 入力部品 ---------- */
function numberInput(value: number, min = 0) {
  const i = el('input', { type: 'number', value: String(value) }) as HTMLInputElement;
  i.min = String(min);
  i.inputMode = 'numeric';
  return i;
}
function textInput(value = '') {
  return el('input', { type: 'text', value }) as HTMLInputElement;
}
function categorySelect(value: Item['category']) {
  const sel = el('select', { className: 'ed-cat' }) as HTMLSelectElement;
  for (const c of CATEGORIES) sel.append(el('option', { value: c, textContent: c, selected: c === value }));
  return sel;
}

/* ---------- 編集行 ---------- */
function renderEditRow(it: Item) {
  const nameI = textInput(it.name);
  const catS  = categorySelect(it.category);
  const qtyI  = numberInput(it.qty, 0);
  const thI   = numberInput(it.threshold, 0);

  const btnSave = el('button', { className: 'btn save', textContent: '保存' });
  const btnDel  = el('button', { className: 'btn danger del', textContent: '削除' });

  const row = el('div', { className: 'edit-row' },
    wrapField('名前', nameI, 'ed-name'),
    wrapField('カテゴリ', catS, 'ed-cat'),
    wrapField('個数', qtyI, 'ed-qty'),
    wrapField('閾値（この数以下で要補充）', thI, 'ed-th'),
    el('div', { className: 'save'  }, btnSave),
    el('div', { className: 'del'   }, btnDel),
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
    await saveItem(updated);
    await renderEdit();
  });

  btnDel.addEventListener('click', async () => {
    await removeItem(it.id);
    await renderEdit();
  });

  return row;
}

/* ---------- 新規追加行 ---------- */
function renderAddRow() {
  const nameI = textInput('');
  const catS  = categorySelect(CATEGORIES[0]);
  const qtyI  = numberInput(0, 0);
  const thI   = numberInput(0, 0);

  const btnAdd   = el('button', { className: 'btn primary', textContent: '追加' });
  const btnClear = el('button', { className: 'btn ghost',   textContent: 'クリア' });

  const row = el('div', { className: 'edit-row add' },
    wrapField('（新規）名前', nameI, 'ed-name'),
    wrapField('カテゴリ',     catS,  'ed-cat'),
    wrapField('個数',         qtyI,  'ed-qty'),
    wrapField('閾値（この数以下で要補充）', thI, 'ed-th'),
    el('div', { className: 'save' }, btnAdd),
    el('div', { className: 'del'  }, btnClear),
  );

  btnAdd.addEventListener('click', async () => {
    const name = (nameI as HTMLInputElement).value.trim();
    if (!name) { (nameI as HTMLInputElement).focus(); return; }

    const newItem: Item = {
      id: crypto.randomUUID(),
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

/* ---------- 編集画面 ---------- */
async function renderEdit() {
  const root = $('#app')!;
  root.textContent = '';

  root.append(
    renderHeader(),
    el('div', { className: 'edit-panel' },
      renderAddRow(),
      el('div', { className: 'edit-list' },
        ...(await loadAll()).map(renderEditRow)
      )
    )
  );

  $('#btn-done')?.addEventListener('click', () => { location.hash = ''; });
  $('#btn-add-open')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ---------- 閲覧画面（既存のまま） ---------- */
async function renderList() {
  // …従来実装…
}

/* ---------- 起動 ---------- */
async function main() {
  await initPushIfNeeded();

  const route = () => {
    if (location.hash === '#/edit') renderEdit();
    else renderList();
  };
  window.addEventListener('hashchange', route);
  route();
}
main();

// デバッグ用
(window as any).testLocal = showLocalTest;