export type Item = {
  id: string; name: string; qty: number; threshold: number;
  lastRefillAt: string; nextRefillAt: string; updatedAt: string;
  deleted: boolean; version: number; category: "キッチン" | "洗面・トイレ";
};
export type History = { itemId: string; date: string; delta: number; type: "補充"|"消費" };

export interface StorageAPI {
  getItems(): Promise<Item[]>;
  upsert(item: Item): Promise<void>;
  adjustQty(id: string, delta: number): Promise<void>;
  getHistory(itemId: string, months: number): Promise<History[]>;
  exportCSV(years?: number): Promise<string>;
}