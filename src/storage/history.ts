import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type HistoryEventType = 'inc' | 'dec' | 'edit' | 'create' | 'delete' | 'restore';

export interface HistoryEvent {
  id: string;
  itemId: string;
  type: HistoryEventType;
  delta: number;
  qtyBefore: number;
  qtyAfter: number;
  name: string;
  category: string;
  at: string; // ISO8601
  meta?: { source?: 'user' | 'migration' | 'sync' };
}

interface HistDB extends DBSchema {
  ItemHistory: {
    key: string;
    value: HistoryEvent;
    indexes: {
      byItemAt: [string, string];
      byAt: string;
    };
  };
}

const DB_NAME = 'stocklite-history';
const STORE = 'ItemHistory';

const dbPromise = openDB<HistDB>(DB_NAME, 1, {
  upgrade(db) {
    const store = db.createObjectStore(STORE, { keyPath: 'id' });
    store.createIndex('byItemAt', ['itemId', 'at']);
    store.createIndex('byAt', 'at');
  },
});

const genId = (): string =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : 'h-' + Math.random().toString(36).slice(2) + '-' + Date.now();

export const recordHistory = async (
  evt: Omit<HistoryEvent, 'id' | 'at'> & { at?: string }
): Promise<void> => {
  const db = await dbPromise;
  const full: HistoryEvent = { ...evt, id: genId(), at: evt.at ?? new Date().toISOString() };
  try {
    await db.add(STORE, full);
    void prune(db);
  } catch {
    /* ignore */
  }
};

async function prune(db?: IDBPDatabase<HistDB>) {
  const database = db ?? (await dbPromise);
  const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const tx = database.transaction(STORE, 'readwrite');
  const idx = tx.store.index('byAt');
  for await (const cursor of idx.iterate(IDBKeyRange.upperBound(cutoff, true))) {
    await cursor.delete();
  }
  await tx.done;

  const count = await database.count(STORE);
  if (count > 5000) {
    const excess = count - 5000;
    const tx2 = database.transaction(STORE, 'readwrite');
    const idx2 = tx2.store.index('byAt');
    let removed = 0;
    for await (const cursor of idx2.iterate()) {
      await cursor.delete();
      removed++;
      if (removed >= excess) break;
    }
    await tx2.done;
  }
}

export const getDailyNet = async (
  days: number
): Promise<{ date: string; value: number }[]> => {
  const db = await dbPromise;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const events = await db.getAllFromIndex(
    STORE,
    'byAt',
    IDBKeyRange.lowerBound(start.toISOString())
  );
  const map = new Map<string, number>();
  for (const e of events) {
    const d = new Date(e.at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
    map.set(key, (map.get(key) ?? 0) + e.delta);
  }
  const out: { date: string; value: number }[] = [];
  const cur = new Date(start);
  for (let i = 0; i < days; i++) {
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(
      cur.getDate()
    ).padStart(2, '0')}`;
    out.push({ date: key, value: map.get(key) ?? 0 });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
};

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

export const exportHistoryCSV = async (): Promise<void> => {
  const db = await dbPromise;
  const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const events = await db.getAllFromIndex(
    STORE,
    'byAt',
    IDBKeyRange.lowerBound(cutoff)
  );
  events.sort((a, b) => a.at.localeCompare(b.at));
  const lines = events.map(e =>
    [
      e.at,
      e.itemId,
      csvEscape(e.name),
      csvEscape(e.category),
      e.type,
      String(e.delta),
      String(e.qtyBefore),
      String(e.qtyAfter),
    ].join(',')
  );
  const bom = '\ufeff';
  const header = 'timestamp,itemId,name,category,type,delta,qty_before,qty_after';
  const csv = bom + [header, ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const now = new Date();
  const fn = `stocklite-history-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}.csv`;
  a.href = url;
  a.download = fn;
  a.click();
  URL.revokeObjectURL(url);
};

export const clearHistory = async (): Promise<void> => {
  const db = await dbPromise;
  await db.clear(STORE);
};
