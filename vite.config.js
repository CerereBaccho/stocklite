// vite.config.js
import { defineConfig } from 'vite'

// GitHub Pages (project pages) は /<repo>/ 配下で配信されるので base を必ず設定
export default defineConfig({
  base: '/stocklite/',  // ← リポジトリ名に合わせる
})