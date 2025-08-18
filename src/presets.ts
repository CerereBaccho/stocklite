import type { Item } from "./storage/Storage";
const now = new Date().toISOString();
const base = (name:string, category:Item["category"], threshold=1):Item => ({
  id: crypto.randomUUID(), name, qty:1, threshold,
  lastRefillAt: now, nextRefillAt: "", updatedAt: now,
  deleted:false, version:1, category
});
export const PRESETS: Item[] = [
  base("トイレットペーパー","キッチン"),
  base("キッチンペーパー","キッチン"),
  base("ラップ","キッチン"),
  base("食器洗剤","キッチン"),
  base("スポンジ","キッチン"),
  base("排水溝ネット","キッチン"),
  base("歯磨き粉","洗面・トイレ"),
  base("シャンプー","洗面・トイレ"),
  base("ボディソープ","洗面・トイレ"),
  base("トイレ用洗剤","洗面・トイレ"),
];