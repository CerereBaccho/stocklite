// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/stocklite/',   // ← リポジトリ名
  // build: { outDir: 'dist' } // 明示しなくてもOK（デフォルトが dist）
})