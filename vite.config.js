import { defineConfig } from 'vite';

export default defineConfig({
  base: '/stocklite/',   // GitHub Pages のサブパス
  build: {
    outDir: 'dist',      // 直接 docs に出力
    emptyOutDir: false,  // 既存の docs を全部消したくない場合は false（そのまま）
  },
});