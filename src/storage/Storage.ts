// src/storage/Storage.ts
const CAT_KEY = 'stocklite/categories';
const DEFAULT_CATEGORIES = ['キッチン', '洗面・トイレ'];

const loadCategories = (): string[] => {
  if (typeof localStorage === 'undefined') return [...DEFAULT_CATEGORIES];
  try {
    const stored = JSON.parse(localStorage.getItem(CAT_KEY) || '[]');
    if (Array.isArray(stored) && stored.length) return stored as string[];
  } catch {
    /* ignore */
  }
  localStorage.setItem(CAT_KEY, JSON.stringify(DEFAULT_CATEGORIES));
  return [...DEFAULT_CATEGORIES];
};

export let CATEGORIES: string[] = loadCategories();

export const addCategory = (c: string) => {
  const name = c.trim();
  if (!name || CATEGORIES.includes(name)) return;
  CATEGORIES.push(name);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(CAT_KEY, JSON.stringify(CATEGORIES));
  }
};

export type Category = string;

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