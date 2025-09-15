// src/storage/history.ts
export type HistoryEntry = {
  timestamp: string; // ISO
  itemId: string;
  itemName: string;
  delta: number;
  qtyAfter: number;
  reason: 'inc' | 'dec' | 'edit' | 'add' | 'delete';
};

const LS_KEY = 'stocklite/history';

const normalize = (e: any): HistoryEntry => ({
  timestamp: typeof e?.timestamp === 'string' ? e.timestamp : new Date().toISOString(),
  itemId: typeof e?.itemId === 'string' ? e.itemId : '',
  itemName: typeof e?.itemName === 'string' ? e.itemName : '',
  delta: typeof e?.delta === 'number' ? e.delta : Number(e?.delta) || 0,
  qtyAfter: typeof e?.qtyAfter === 'number' ? e.qtyAfter : Number(e?.qtyAfter) || 0,
  reason: (e?.reason as HistoryEntry['reason']) || 'edit',
});

const read = (): HistoryEntry[] => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const arr = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    if (Array.isArray(arr)) return arr.map(normalize);
  } catch {
    /* ignore */
  }
  return [];
};

const write = (arr: HistoryEntry[]) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
  }
};

export const updateHistoryItemId = (oldId: string, newId: string, name?: string) => {
  const arr = read();
  let changed = false;
  for (const e of arr) {
    if (
      e.itemId === oldId ||
      (oldId === '' && !e.itemId && name && e.itemName === name)
    ) {
      e.itemId = newId;
      if (name) e.itemName = name;
      changed = true;
    }
  }
  if (changed) write(arr);
};

export const appendHistory = (entry: HistoryEntry) => {
  const all = read();
  all.push(entry);
  write(all);
};

export const recentHistory = (limit = 10): HistoryEntry[] => {
  const all = read();
  return all.slice(-limit).reverse();
};

export const historyForItem = (itemId: string, since?: string): HistoryEntry[] => {
  return read().filter(e => e.itemId === itemId && (!since || e.timestamp >= since));
};

export const historySince = (iso: string): HistoryEntry[] => {
  return read().filter(e => e.timestamp >= iso);
};

export const pruneBefore = (iso: string) => {
  const arr = read().filter(e => e.timestamp >= iso);
  write(arr);
};

