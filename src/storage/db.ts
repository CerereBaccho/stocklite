// src/storage/db.ts
import type { Item } from './Storage';

const LS_KEY = 'stocklite/items';

const read = (): Item[] => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
  catch { return []; }
};
const write = (items: Item[]) => localStorage.setItem(LS_KEY, JSON.stringify(items));

export const loadAll = (): Item[] => read();

export const saveItem = (it: Item): Item => {
  const items = read();
  const i = items.findIndex(x => x.id === it.id);
  if (i >= 0) items[i] = it; else items.push(it);
  write(items);
  return it;
};

export const removeItem = (id: string) => {
  const items = read();
  const i = items.findIndex(x => x.id === id);
  if (i >= 0) {
    // 論理削除（UIがそれ前提なら）
    items[i].deleted = true;
    items[i].updatedAt = new Date().toISOString();
    write(items);
  }
};