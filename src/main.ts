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
import Chart from 'chart.js/auto';
import {
  recordHistory,
  queryByItem,
  dailyNetByItem,
  exportItemHistoryCSV,
} from './storage/history';
import type { HistoryEvent } from './storage/history';

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

const HISTORY_PAGE_SIZE = 50;

const focusableSelector = [
  'button',
  '[href]',
  'input',
  'select',
  'textarea',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const getFocusable = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    el => !el.hasAttribute('disabled') && el.tabIndex !== -1 && el.offsetParent !== null,
  );

const slugify = (name: string, fallback: string): string => {
  const ascii = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase();
  return ascii || fallback;
};

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

const toLocalDateKey = (iso: string): string => {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatDayHeading = (dateKey: string): string => {
  const [yStr, mStr, dStr] = dateKey.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) {
    return dateKey.replace(/-/g, '/');
  }
  const weekday = WEEKDAYS_JA[new Date(y, m - 1, d).getDay()] ?? '';
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}/${mm}/${dd}${weekday ? `（${weekday}）` : ''}`;
};

const formatSigned = (value: number): string =>
  value >= 0 ? `＋${value}` : `−${Math.abs(value)}`;

const describeHistoryEvent = (evt: HistoryEvent): string => {
  const stockSpan = `在庫 ${evt.qtyBefore}→${evt.qtyAfter}`;
  const changes = evt.meta?.changes ?? {};
  const changeTexts: string[] = [];
  if (changes.name) changeTexts.push(`名前を変更「${changes.name.before} → ${changes.name.after}」`);
  if (changes.category) changeTexts.push(`カテゴリ ${changes.category.before}→${changes.category.after}`);
  if (changes.threshold)
    changeTexts.push(`しきい値 ${changes.threshold.before}→${changes.threshold.after}`);

  switch (evt.type) {
    case 'inc':
    case 'dec':
      return `${formatSigned(evt.delta)}（${stockSpan}）`;
    case 'edit': {
      const edits: string[] = [];
      if (evt.delta !== 0) edits.push(`（${stockSpan}）`);
      if (changeTexts.length) edits.push(changeTexts.join(' / '));
      if (!edits.length) edits.push(stockSpan);
      return (evt.delta !== 0 ? `${formatSigned(evt.delta)}` : '') + edits.join(' / ');
    }
    case 'create':
      return `作成（${stockSpan}）`;
    case 'delete':
      return `削除（${stockSpan}）`;
    case 'restore':
      return `復元（${stockSpan}）`;
    default:
      return '履歴';
  }
};

const renderHistoryListItem = (evt: HistoryEvent): HTMLLIElement => {
  const row = el('li', { className: 'event-row' });
  row.append(
    el('div', { className: 'event-time', textContent: formatTime(evt.at) }),
    el('div', { className: 'event-desc', textContent: describeHistoryEvent(evt) }),
  );
  return row;
};

type DrawerTab = 'graph' | 'history' | 'csv';

function openItemHistoryDrawer(item: Item) {
  const existing = document.querySelector('.drawer-overlay');
  if (existing) {
    existing.remove();
    document.body.classList.remove('drawer-open');
  }

  const overlay = el('div', { className: 'drawer-overlay' });
  const drawer = el('div', {
    className: 'drawer',
    role: 'dialog',
    ariaModal: 'true',
    ariaLabel: `${item.name}の履歴`,
  });
  overlay.append(drawer);

  const closeBtn = el('button', { className: 'btn ghost drawer-close', type: 'button', textContent: '閉じる' });

  const titleWrap = el('div', { className: 'drawer-title-wrap' },
    el('div', { className: 'drawer-title', textContent: item.name }),
    el('div', { className: 'drawer-sub', textContent: item.category || 'カテゴリなし' }),
  );
  const qtyNow = el('div', { className: 'drawer-qty', innerHTML: `在庫 <b>${item.qty}</b>` });
  const header = el('div', { className: 'drawer-header' }, titleWrap, qtyNow, closeBtn);

  const tabButtons: Record<DrawerTab, HTMLButtonElement> = {
    graph: el('button', { className: 'drawer-tab active', type: 'button', textContent: 'グラフ' }) as HTMLButtonElement,
    history: el('button', { className: 'drawer-tab', type: 'button', textContent: '履歴' }) as HTMLButtonElement,
    csv: el('button', { className: 'drawer-tab', type: 'button', textContent: 'CSV' }) as HTMLButtonElement,
  };

  tabButtons.graph.dataset.tab = 'graph';
  tabButtons.history.dataset.tab = 'history';
  tabButtons.csv.dataset.tab = 'csv';

  const tabs = el('div', { className: 'drawer-tabs' },
    tabButtons.graph,
    tabButtons.history,
    tabButtons.csv,
  );

  const graphPanel = el('div', { className: 'drawer-panel active' }) as HTMLDivElement;
  graphPanel.dataset.panel = 'graph';
  const graphLoading = el('div', { className: 'drawer-loading', textContent: '読み込み中…' });
  const graphEmpty = el('div', { className: 'drawer-empty hide', textContent: '直近90日に変更はありません' });
  const graphCanvas = el('canvas', { className: 'drawer-chart hide' }) as HTMLCanvasElement;
  graphPanel.append(graphLoading, graphEmpty, graphCanvas);

  const historyPanel = el('div', { className: 'drawer-panel' }) as HTMLDivElement;
  historyPanel.dataset.panel = 'history';
  const historyList = el('ul', { className: 'event-list' }) as HTMLUListElement;
  const historyLoading = el('div', { className: 'drawer-loading hide', textContent: '読み込み中…' });
  const historyEmpty = el('div', { className: 'drawer-empty hide', textContent: '履歴はまだありません' });
  const loadMoreBtn = el('button', { className: 'btn ghost load-more hide', type: 'button', textContent: 'さらに読み込む' }) as HTMLButtonElement;
  historyPanel.append(historyList, historyLoading, historyEmpty, loadMoreBtn);

  type HistoryDaySection = {
    container: HTMLLIElement;
    list: HTMLUListElement;
    totalEl: HTMLSpanElement;
    net: number;
  };

  const daySections = new Map<string, HistoryDaySection>();

  const updateDayTotal = (section: HistoryDaySection) => {
    section.totalEl.textContent = `合計 ${formatSigned(section.net)}`;
    section.totalEl.classList.toggle('positive', section.net > 0);
    section.totalEl.classList.toggle('negative', section.net < 0);
  };

  const ensureDaySection = (key: string): HistoryDaySection => {
    let section = daySections.get(key);
    if (!section) {
      const header = el('div', { className: 'event-day-header' });
      const dateEl = el('span', { className: 'event-day-date', textContent: formatDayHeading(key) });
      const totalEl = el('span', { className: 'event-day-total' }) as HTMLSpanElement;
      header.append(dateEl, totalEl);
      const list = el('ul', { className: 'event-day-events' }) as HTMLUListElement;
      const container = el('li', { className: 'event-day' }, header, list) as HTMLLIElement;
      section = { container, list, totalEl, net: 0 };
      updateDayTotal(section);
      daySections.set(key, section);
      historyList.append(container);
    }
    return section;
  };

  const csvPanel = el('div', { className: 'drawer-panel' }) as HTMLDivElement;
  csvPanel.dataset.panel = 'csv';
  csvPanel.append(
    el('p', { className: 'drawer-note', textContent: 'このアイテムの履歴をCSVで保存（過去1年）' }),
    el('button', { className: 'btn primary', type: 'button', textContent: 'CSVを保存' }),
  );

  const panels = el('div', { className: 'drawer-panels' }, graphPanel, historyPanel, csvPanel);
  drawer.append(header, tabs, panels);

  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.body.append(overlay);
  document.body.classList.add('drawer-open');
  requestAnimationFrame(() => overlay.classList.add('open'));

  let destroyed = false;
  let currentTab: DrawerTab = 'graph';
  let graphChart: Chart | null = null;
  let graphLoaded = false;
  let historyCursor: string | null = null;
  let historyLoaded = false;
  let historyLoadingState = false;

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 200);
    document.body.classList.remove('drawer-open');
    drawer.removeEventListener('keydown', onKeyDown);
    overlay.removeEventListener('click', onOverlayClick);
    closeBtn.removeEventListener('click', destroy);
    tabButtons.graph.removeEventListener('click', onTabClick);
    tabButtons.history.removeEventListener('click', onTabClick);
    tabButtons.csv.removeEventListener('click', onTabClick);
    loadMoreBtn.removeEventListener('click', onLoadMore);
    csvButton.removeEventListener('click', onExportCSV);
    graphChart?.destroy();
    if (previousFocus) previousFocus.focus();
  };

  const onOverlayClick = (ev: MouseEvent) => {
    if (ev.target === overlay) destroy();
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      destroy();
      return;
    }
    if (ev.key === 'Tab') {
      const focusable = getFocusable(drawer);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (ev.shiftKey) {
        if (document.activeElement === first || !drawer.contains(document.activeElement)) {
          ev.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    }
  };

  const setActiveTab = (next: DrawerTab) => {
    if (currentTab === next) return;
    currentTab = next;
    for (const [key, btn] of Object.entries(tabButtons) as [DrawerTab, HTMLButtonElement][]) {
      btn.classList.toggle('active', key === next);
      const panel = panels.querySelector<HTMLElement>(`.drawer-panel[data-panel="${key}"]`);
      panel?.classList.toggle('active', key === next);
    }

    if (next === 'graph' && !graphLoaded) void loadGraph();
    if (next === 'history' && !historyLoaded) void loadHistory();
  };

  const onTabClick = (ev: MouseEvent) => {
    const target = ev.currentTarget as HTMLButtonElement;
    const tab = target.dataset.tab as DrawerTab;
    setActiveTab(tab);
  };

  const csvButton = csvPanel.querySelector('button') as HTMLButtonElement;
  const onExportCSV = () => {
    csvButton.disabled = true;
    csvButton.textContent = '書き出し中…';
    const slug = slugify(item.name, item.id.slice(0, 8));
    void exportItemHistoryCSV(item.id, slug).finally(() => {
      csvButton.disabled = false;
      csvButton.textContent = 'CSVを保存';
    });
  };

  const loadGraph = async () => {
    graphLoaded = true;
    try {
      const data = await dailyNetByItem(item.id, { days: 90, tz: 'local' });
      const allZero = data.every(d => d.net === 0);
      graphLoading.classList.add('hide');
      if (allZero) {
        graphEmpty.classList.remove('hide');
        return;
      }
      graphCanvas.classList.remove('hide');
      const labels = data.map(d => d.date);
      const values = data.map(d => d.net);
      graphChart = new Chart(graphCanvas, {
        type: 'line',
        data: { labels, datasets: [{ data: values, borderColor: '#1a73e8', tension: 0.2, fill: false }] },
        options: {
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => `${ctx.label}: ${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y}`,
              },
            },
          },
          scales: { y: { beginAtZero: true } },
        },
      });
    } catch (err) {
      graphLoading.textContent = '読み込みに失敗しました';
      console.error(err);
    }
  };

  const toggleHistoryLoading = (state: boolean) => {
    historyLoadingState = state;
    historyLoading.classList.toggle('hide', !state);
    loadMoreBtn.disabled = state;
    if (state) {
      loadMoreBtn.textContent = '読み込み中…';
    } else {
      loadMoreBtn.textContent = 'さらに読み込む';
    }
  };

  const contributesToNet = (evt: HistoryEvent): boolean =>
    evt.type === 'inc' || evt.type === 'dec' || evt.type === 'edit';

  const loadHistory = async () => {
    if (historyLoadingState) return;
    toggleHistoryLoading(true);
    try {
      const isInitialLoad = !historyLoaded && historyCursor === null;
      if (isInitialLoad) {
        historyEmpty.textContent = '履歴はまだありません';
      }
      const res = await queryByItem(item.id, {
        limit: HISTORY_PAGE_SIZE,
        cursor: historyCursor ?? undefined,
      });

      if (res.events.length > 0) {
        historyEmpty.classList.add('hide');
        for (const evt of res.events) {
          const dayKey = toLocalDateKey(evt.at);
          const section = ensureDaySection(dayKey);
          section.list.append(renderHistoryListItem(evt));
          if (contributesToNet(evt)) {
            section.net += evt.delta;
          }
          updateDayTotal(section);
        }
      } else if (isInitialLoad && daySections.size === 0) {
        historyEmpty.classList.remove('hide');
      }

      historyCursor = res.nextCursor;
      if (historyCursor) {
        loadMoreBtn.classList.remove('hide');
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = 'さらに読み込む';
      } else {
        loadMoreBtn.classList.add('hide');
      }
      historyLoaded = true;
    } catch (err) {
      historyEmpty.classList.remove('hide');
      historyEmpty.textContent = '履歴を読み込めませんでした';
      console.error(err);
    } finally {
      toggleHistoryLoading(false);
    }
  };

  const onLoadMore = () => {
    if (!historyCursor) return;
    void loadHistory();
  };

  overlay.addEventListener('click', onOverlayClick);
  drawer.addEventListener('keydown', onKeyDown);
  closeBtn.addEventListener('click', destroy);
  tabButtons.graph.addEventListener('click', onTabClick);
  tabButtons.history.addEventListener('click', onTabClick);
  tabButtons.csv.addEventListener('click', onTabClick);
  loadMoreBtn.addEventListener('click', onLoadMore);
  csvButton.addEventListener('click', onExportCSV);

  requestAnimationFrame(() => {
    closeBtn.focus();
  });

  void loadGraph();
  void loadHistory();

  return destroy;
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

  const historyBtn = el('button', {
    className: 'btn ghost history-btn',
    type: 'button',
    textContent: '履歴',
    ariaLabel: `${it.name}の履歴`,
  });
  historyBtn.addEventListener('click', () => openItemHistoryDrawer(it));

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
    void recordHistory({
      itemId: it.id,
      type: 'dec',
      delta: -1,
      qtyBefore: it.qty,
      qtyAfter: next,
      name: it.name,
      category: it.category,
    });
    await renderList(); // 再描画
  });

  btnPlus.addEventListener('click', async () => {
    const next = it.qty + 1;
    const updated: Item = { ...it, qty: next, updatedAt: nowISO() };
    await saveItem(updated);
    void recordHistory({
      itemId: it.id,
      type: 'inc',
      delta: 1,
      qtyBefore: it.qty,
      qtyAfter: next,
      name: it.name,
      category: it.category,
    });
    await renderList(); // 再描画
  });

  const titleWrap = el('div', { className: 'item-header' }, name, historyBtn);
  const row1 = el('div', { className: 'row1' }, tag, titleWrap);
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
  // カテゴリごと・名前順
  for (const cat of CATEGORIES) {
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
    if (
      updated.qty !== it.qty ||
      updated.name !== it.name ||
      updated.category !== it.category ||
      updated.threshold !== it.threshold
    ) {
      type ChangeMeta = NonNullable<NonNullable<HistoryEvent['meta']>['changes']>;
      const changeMeta: ChangeMeta = {};
      if (updated.name !== it.name) {
        changeMeta.name = { before: it.name, after: updated.name };
      }
      if (updated.category !== it.category) {
        changeMeta.category = { before: it.category, after: updated.category };
      }
      if (updated.threshold !== it.threshold) {
        changeMeta.threshold = { before: it.threshold, after: updated.threshold };
      }
      const meta = Object.keys(changeMeta).length ? { changes: changeMeta } : undefined;
      void recordHistory({
        itemId: it.id,
        type: 'edit',
        delta: updated.qty - it.qty,
        qtyBefore: it.qty,
        qtyAfter: updated.qty,
        name: updated.name,
        category: updated.category,
        meta,
      });
    }
    await renderEdit();
  });

  btnDel.addEventListener('click', async () => {
    await removeItem(it.id);
    void recordHistory({
      itemId: it.id,
      type: 'delete',
      delta: 0,
      qtyBefore: it.qty,
      qtyAfter: 0,
      name: it.name,
      category: it.category,
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
    void recordHistory({
      itemId: newItem.id,
      type: 'create',
      delta: 0,
      qtyBefore: 0,
      qtyAfter: newItem.qty,
      name: newItem.name,
      category: newItem.category,
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