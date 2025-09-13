// ==================== src/storage/db.ts ====================
// Item 型 必須: lastRefillAt, nextRefillAt, updatedAt (string)
//                deleted (boolean), version (number)
// - 未設定の日時は "" で初期化
// - deleted は false で初期化（削除は物理削除でも型は保持）
// - version は 1 で初期化し、更新時は既存を維持
// ===========================================================

import type { Item } from "./Storage";

const DB_NAME = "stocklite";
const STORE = "items";
const VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("by_category_name", ["category", "name"], { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    fn(s).then(res => {
      t.oncomplete = () => resolve(res);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }).catch(reject);
  });
}

function nowISO() { return new Date().toISOString(); }
function uid(): string { return `i_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`; }

async function get(store: IDBObjectStore, id: string): Promise<Item | undefined> {
  return new Promise<Item | undefined>((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as Item | undefined);
    req.onerror = () => reject(req.error);
  });
}
async function getAll(store: IDBObjectStore): Promise<Item[]> {
  return new Promise<Item[]>((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as Item[]);
    req.onerror = () => reject(req.error);
  });
}
function put(store: IDBObjectStore, item: Item): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
function del(store: IDBObjectStore, id: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------- public API ----------
export const storage = {
  async getItems(): Promise<Item[]> {
    return tx("readonly", async (s) => await getAll(s));
  },

  async adjustQty(id: string, delta: number): Promise<void> {
    return tx("readwrite", async (s) => {
      const cur = await get(s, id);
      if (!cur) return;
      const nextQty = Math.max(0, (cur.qty || 0) + (delta || 0));
      const updated: Item = {
        ...cur,
        qty: nextQty,
        updatedAt: nowISO(),
        // version は既存を維持（無ければ 1）
        version: (cur as any).version ?? 1,
        // deleted は既存値を維持（無ければ false）
        deleted: (cur as any).deleted ?? false,
      };
      await put(s, updated);
    });
  },

  async addItem(input: { name: string; category: Item["category"]; qty: number; threshold: number }): Promise<Item> {
    return tx("readwrite", async (s) => {
      const it: Item = {
        id: uid(),
        name: (input.name || "").trim(),
        category: input.category,
        qty: Math.max(0, Math.min(999, input.qty || 0)),
        threshold: Math.max(0, Math.min(999, input.threshold || 0)),
        lastRefillAt: "",   // 未設定は空文字
        nextRefillAt: "",   // 未設定は空文字
        updatedAt: nowISO(),
        deleted: false,     // 型必須
        version: 1,         // 初期版
      };
      await put(s, it);
      return it;
    });
  },

  async updateThreshold(id: string, threshold: number): Promise<void> {
    return tx("readwrite", async (s) => {
      const cur = await get(s, id);
      if (!cur) return;
      const updated: Item = {
        ...cur,
        threshold: Math.max(0, Math.min(999, threshold || 0)),
        updatedAt: nowISO(),
        version: (cur as any).version ?? 1,
        deleted: (cur as any).deleted ?? false,
      };
      await put(s, updated);
    });
  },

  async updateItem(id: string, input: { name: string; category: Item["category"]; qty: number; threshold: number }): Promise<void> {
    return tx("readwrite", async (s) => {
      const cur = await get(s, id);
      if (!cur) return;
      const updated: Item = {
        ...cur,
        name: (input.name || "").trim(),
        category: input.category,
        qty: Math.max(0, Math.min(999, input.qty || 0)),
        threshold: Math.max(0, Math.min(999, input.threshold || 0)),
        updatedAt: nowISO(),
        version: (cur as any).version ?? 1,
        deleted: (cur as any).deleted ?? false,
      };
      await put(s, updated);
    });
  },

  async deleteItem(id: string): Promise<void> {
    return tx("readwrite", async (s) => {
      await del(s, id); // 物理削除
    });
  },
};

// 初期投入（空のときのみ）
export async function seedIfEmpty(presets: Item[]) {
  const items = await storage.getItems();
  if (items.length > 0) return;
  await tx("readwrite", async (s) => {
    for (const p of presets) {
      const filled: Item = {
        id: p.id,
        name: p.name,
        category: p.category,
        qty: p.qty,
        threshold: p.threshold,
        lastRefillAt: p.lastRefillAt ?? "",
        nextRefillAt: p.nextRefillAt ?? "",
        updatedAt: p.updatedAt ?? nowISO(),
        deleted: (p as any).deleted ?? false,
        version: (p as any).version ?? 1,
      };
      await put(s, filled);
    }
    return;
  });
}