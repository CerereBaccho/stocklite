import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import type { Item, StorageAPI, History } from './Storage';

const DB_NAME = 'stocklite';
const VERSION = 1;

let dbp: Promise<IDBPDatabase<any>>;

function toISO(d = new Date()) { return new Date(d).toISOString(); }

dbp = openDB(DB_NAME, VERSION, {
  upgrade(db) {
    const items = db.createObjectStore('items', { keyPath: 'id' });
    items.createIndex('byCategory', 'category');
    db.createObjectStore('history', { keyPath: ['itemId', 'date'] });
  }
});

export const storage: StorageAPI = {
  async getItems() {
    const db = await dbp;
    return db.getAll('items');
  },

  async upsert(item: Item) {
    const db = await dbp;
    item.updatedAt = toISO();
    await db.put('items', item);
  },

  async adjustQty(id: string, delta: number) {
    const db = await dbp;
    const tx = db.transaction(['items', 'history'], 'readwrite');
    const item = await tx.objectStore('items').get(id) as Item;
    if (!item) return;

    const old = item.qty;
    item.qty = Math.max(0, old + delta);
    if (delta > 0) item.lastRefillAt = toISO();

    // 直近の補充間隔から nextRefillAt を推定（簡易）
    const all = await tx.objectStore('history').getAll() as History[];
    const ts = all
      .filter(h => h.itemId === id && h.type === '補充')
      .map(h => +new Date(h.date))
      .sort((a, b) => b - a);

    if (ts.length >= 2) {
      const gaps: number[] = [];
      for (let i = 0; i < Math.min(3, ts.length - 1); i++) {
        gaps.push(ts[i] - ts[i + 1]);
      }
      const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      item.nextRefillAt = toISO(new Date(Date.now() + avg));
    }

    await tx.objectStore('items').put(item);
    await tx.objectStore('history').put({
      itemId: id,
      date: toISO(),
      delta,
      type: delta > 0 ? '補充' : '消費'
    } as History);

    await tx.done;
  },

  async getHistory(itemId: string, months: number) {
    const db = await dbp;
    const all = await db.getAll('history') as History[];
    const from = new Date(); from.setMonth(from.getMonth() - months);
    return all
      .filter(h => h.itemId === itemId && new Date(h.date) >= from)
      .sort((a, b) => +new Date(a.date) - +new Date(b.date));
  },

  async exportCSV(years = 1) {
    const db = await dbp;
    const all = await db.getAll('history') as History[];
    const from = new Date(); from.setFullYear(from.getFullYear() - years);
    const rows = [['itemId', 'date', 'delta', 'type']];
    all
      .filter(h => new Date(h.date) >= from)
      .forEach(h => rows.push([h.itemId, h.date, String(h.delta), h.type]));
    return rows.map(r => r.join(',')).join('\n');
  }
};

export async function seedIfEmpty(presets: Item[]) {
  const db = await dbp;
  if ((await db.getAllKeys('items')).length > 0) return;
  const tx = db.transaction('items', 'readwrite');
  for (const it of presets) await tx.store.put(it);
  await tx.done;
}