// src/storage/Storage.ts
export const CATEGORIES = ['キッチン', '洗面・トイレ'] as const;
export type Category = (typeof CATEGORIES)[number];

export type Item = {
  id: string;
  name: string;
  category: Category;
  qty: number;
  threshold: number;
  lastRefillAt: string;  // ISO
  nextRefillAt: string;  // ISO
  createdAt: string;     // ISO
  updatedAt: string;     // ISO
  deleted: boolean;
  version: number;
};

// PWA スタンドアロン判定（簡易）
export const isPWAStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  const mm = window.matchMedia?.('(display-mode: standalone)')?.matches;
  const iosStandalone = (navigator as any).standalone === true;
  return !!(mm || iosStandalone);
};