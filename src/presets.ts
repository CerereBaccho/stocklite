// src/presets.ts
import type { Item } from './storage/Storage';

const STAMP = new Date().toISOString();

const mk = (
  name: string,
  category: Item['category'],
  qty = 0,
  threshold = 1
): Item => ({
  id: `preset-${category}-${name}`,
  name,
  category,
  qty,
  threshold,
  lastRefillAt: '',    // 初期値が未定なら空文字でOK（型は string）
  nextRefillAt: '',
  createdAt: STAMP,    // ← これが必須
  updatedAt: STAMP,
  deleted: false,
  version: 1,
});

export const PRESETS: Item[] = [
  mk('キッチンペーパー', 'キッチン', 1, 1),
  mk('スポンジ', 'キッチン', 0, 1),
  mk('トイレットペーパー', 'キッチン', 0, 1),
  mk('ラップ', 'キッチン', 0, 1),
  mk('食器洗剤', 'キッチン', 0, 1),
  mk('シャンプー', '洗面・トイレ', 0, 1),
  mk('トイレ用洗剤', '洗面・トイレ', 0, 1),
  mk('ボディソープ', '洗面・トイレ', 0, 1),
  mk('歯磨き粉', '洗面・トイレ', 0, 1),
];