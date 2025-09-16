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

type ChangeMeta = NonNullable<NonNullable<HistoryEvent['meta']>['changes']>;

const buildChangeMeta = (before: Item, after: Item): ChangeMeta | undefined => {
  const changes: ChangeMeta = {};
  let hasChanges = false;
  if (before.name !== after.name) {
    changes.name = { before: before.name, after: after.name };
    hasChanges = true;
  }
  if (before.category !== after.category) {
    changes.category = { before: before.category, after: after.category };
    hasChanges = true;
  }
  if (before.threshold !== after.threshold) {
    changes.threshold = { before: before.threshold, after: after.threshold };
    hasChanges = true;
  }
  return hasChanges ? changes : undefined;
};

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

const setupViewportUnit = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const supportsDynamicViewport =
    typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('height: 100dvh');

  const displayModeQuery =
    typeof window.matchMedia === 'function'
      ? window.matchMedia(
          '(display-mode: fullscreen), (display-mode: standalone), (display-mode: minimal-ui), (display-mode: window-controls-overlay)',
        )
      : null;
  const nav = navigator as Navigator & { standalone?: boolean };

  const shouldExtendViewport = () =>
    !supportsDynamicViewport || Boolean(displayModeQuery?.matches || nav?.standalone);

  let extendViewport = shouldExtendViewport();
  let rafId = 0;
  let lastApplied = 0;

  const readViewportHeight = () => {
    const { documentElement } = document;
    const heights: number[] = [window.innerHeight, documentElement?.clientHeight ?? 0];
    const viewport = window.visualViewport;
    if (extendViewport && viewport) {
      const vvHeight = Math.round(viewport.height);
      if (vvHeight > 0) heights.push(vvHeight);
      if (typeof viewport.offsetTop === 'number') {
        const vvWithOffsets = Math.round(viewport.height + viewport.offsetTop);
        if (vvWithOffsets > 0) heights.push(vvWithOffsets);
      }
    }
    const validHeights = heights.filter(h => Number.isFinite(h) && h > 0);
    if (!validHeights.length) {
      return 0;
    }
    return Math.max(...validHeights);
  };

  const applyViewportHeight = () => {
    rafId = 0;
    extendViewport = shouldExtendViewport();
    const nextHeight = readViewportHeight();
    if (nextHeight && nextHeight !== lastApplied) {
      lastApplied = nextHeight;
      document.documentElement.style.setProperty('--app-viewport', `${nextHeight}px`);
    }
  };

  const queueViewportHeight = () => {
    if (rafId) {
      return;
    }
    rafId = window.requestAnimationFrame(applyViewportHeight);
  };

  applyViewportHeight();

  const events: (keyof WindowEventMap)[] = ['resize', 'orientationchange', 'pageshow'];
  for (const evt of events) {
    window.addEventListener(evt, queueViewportHeight);
  }

  const visualViewport = window.visualViewport;
  visualViewport?.addEventListener('resize', queueViewportHeight);
  visualViewport?.addEventListener('scroll', queueViewportHeight);

  if (displayModeQuery) {
    const onDisplayModeChange = () => queueViewportHeight();
    if (typeof displayModeQuery.addEventListener === 'function') {
      displayModeQuery.addEventListener('change', onDisplayModeChange);
    } else if (typeof displayModeQuery.addListener === 'function') {
      displayModeQuery.addListener(onDisplayModeChange);
    }
  }
};

setupViewportUnit();

const deriveDailyQtySeries = (
  series: { net: number }[],
  latestQty: number,
): number[] => {
  const qtyValues = new Array<number>(series.length);
  let runningQty = latestQty;
  for (let i = series.length - 1; i >= 0; i--) {
    qtyValues[i] = runningQty;
    runningQty -= series[i]?.net ?? 0;
  }
  return qtyValues;
};

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
      const netSeries = await dailyNetByItem(item.id, { days: 90, tz: 'local' });
      const allZero = netSeries.every(d => d.net === 0);
      graphLoading.classList.add('hide');
      if (allZero) {
        graphEmpty.classList.remove('hide');
        return;
      }
      graphCanvas.classList.remove('hide');
      const labels = netSeries.map(d => d.date);
      const values = deriveDailyQtySeries(netSeries, item.qty);
      graphChart = new Chart(graphCanvas, {
        type: 'line',
        data: { labels, datasets: [{ data: values, borderColor: '#1a73e8', tension: 0.2, fill: false }] },
        options: {
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const net = netSeries[ctx.dataIndex]?.net ?? 0;
                  const deltaText = net === 0 ? '' : `（前日比${net > 0 ? '+' : ''}${net}）`;
                  return `${ctx.label}: ${ctx.parsed.y}個${deltaText}`;
                },
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
      el('button', { className: 'btn primary', id: 'btn-save-all', textContent: '一括保存' }),
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

  const btnDel  = el('button', { className: 'btn danger', textContent: '削除' });

  const row = el('div', { className: 'edit-row' },
    fieldWrap('名前', nameI, 'ed-name'),
    fieldWrap('カテゴリ', catS, 'ed-cat'),
    fieldWrap('個数', qtyI, 'ed-qty'),
    fieldWrap('閾値', thI, 'ed-th', 'この数以下で要補充'),
    el('div', { className: 'ed-actions' }, btnDel),
  );

  row.dataset.itemId = it.id;

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
    el('div', { className: 'ed-actions' }, btnAdd, btnClear),
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

  const btnSaveAll = $('#btn-save-all') as HTMLButtonElement | null;
  if (btnSaveAll) {
    btnSaveAll.disabled = items.length === 0;
    btnSaveAll.addEventListener('click', async () => {
      if (btnSaveAll.disabled) return;

      const itemMap = new Map(items.map(it => [it.id, it]));
      const rows = Array.from(root.querySelectorAll<HTMLDivElement>('.edit-row[data-item-id]'));
      const updates: { original: Item; updated: Item; changeMeta?: ChangeMeta }[] = [];

      for (const row of rows) {
        const id = row.dataset.itemId;
        if (!id) continue;
        const original = itemMap.get(id);
        if (!original) continue;

        const nameEl = row.querySelector<HTMLInputElement>('.ed-name input');
        const catEl = row.querySelector<HTMLSelectElement>('.ed-cat select');
        const qtyEl = row.querySelector<HTMLInputElement>('.ed-qty input');
        const thEl = row.querySelector<HTMLInputElement>('.ed-th input');
        if (!nameEl || !catEl || !qtyEl || !thEl) continue;

        const qtyParsed = parseInt(qtyEl.value || '0', 10);
        const thresholdParsed = parseInt(thEl.value || '0', 10);
        const updated: Item = {
          ...original,
          name: nameEl.value.trim(),
          category: catEl.value as Item['category'],
          qty: Number.isNaN(qtyParsed) ? 0 : qtyParsed,
          threshold: Number.isNaN(thresholdParsed) ? 0 : thresholdParsed,
          updatedAt: nowISO(),
        };

        const changed =
          updated.name !== original.name ||
          updated.category !== original.category ||
          updated.qty !== original.qty ||
          updated.threshold !== original.threshold;

        if (!changed) continue;

        const changeMeta = buildChangeMeta(original, updated);
        updates.push({ original, updated, changeMeta });
      }

      if (!updates.length) {
        location.hash = '';
        return;
      }

      const originalLabel = btnSaveAll.textContent ?? '';
      const restoreButtonState = () => {
        if (!btnSaveAll.isConnected) return;
        btnSaveAll.textContent = originalLabel;
        btnSaveAll.disabled = false;
      };

      btnSaveAll.disabled = true;
      btnSaveAll.textContent = '保存中…';

      try {
        for (const { original, updated, changeMeta } of updates) {
          addCategory(updated.category);
          await saveItem(updated);
          const meta = changeMeta ? { changes: changeMeta } : undefined;
          void recordHistory({
            itemId: original.id,
            type: 'edit',
            delta: updated.qty - original.qty,
            qtyBefore: original.qty,
            qtyAfter: updated.qty,
            name: updated.name,
            category: updated.category,
            meta,
          });
        }
      } catch (err) {
        console.error(err);
        alert('保存に失敗しました');
        restoreButtonState();
        return;
      }

      restoreButtonState();
      location.hash = '';
    });
  }

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