// vite.config.js 〈フル置換〉
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/stocklite/',          // ← ここが超重要（/リポ名/）
  build: {
    outDir: 'docs',             // ← GitHub Pages の公開フォルダに合わせる
    emptyOutDir: true
  }
});