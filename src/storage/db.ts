// src/storage/db.ts
import type { Item } from './Storage';
import { PRESETS } from '../presets';
import { nowISO } from '../utils/time';
import { updateHistoryItemId } from './history';

const LS_KEY = 'stocklite/items';

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID();
  }
  return 'id-' + Math.random().toString(36).slice(2) + '-' + Date.now();
}

const read = (): Item[] => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch {
    return [];
  }
};
const write = (items: Item[]) => localStorage.setItem(LS_KEY, JSON.stringify(items));

export const seedIfEmpty = () => {
  if (read().length === 0) write(PRESETS);
};

const normalize = (it: any): Item => ({
  id: typeof it?.id === 'string' && it.id ? it.id : uuid(),
  name: typeof it?.name === 'string' ? it.name : '',
  category: typeof it?.category === 'string' ? it.category : '',
  qty: typeof it?.qty === 'number' ? it.qty : Number(it?.qty) || 0,
  threshold: typeof it?.threshold === 'number' ? it.threshold : Number(it?.threshold) || 0,
  lastRefillAt: typeof it?.lastRefillAt === 'string' ? it.lastRefillAt : '',
  nextRefillAt: typeof it?.nextRefillAt === 'string' ? it.nextRefillAt : '',
  createdAt: typeof it?.createdAt === 'string' ? it.createdAt : nowISO(),
  updatedAt: typeof it?.updatedAt === 'string' ? it.updatedAt : nowISO(),
  deleted: !!it?.deleted,
  version: typeof it?.version === 'number' ? it.version : 1,
});

export const loadAll = (): Item[] => {
  const raw = read();
  const arr = raw.map(normalize);
  raw.forEach((orig, i) => {
    if (orig.id !== arr[i].id) {
      updateHistoryItemId(orig.id || '', arr[i].id, orig.name || arr[i].name);
    }
  });
  write(arr);
  return arr;
};

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
