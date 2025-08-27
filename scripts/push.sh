#!/usr/bin/env bash
set -Eeuo pipefail

# リポジトリ直下に移動（どこから呼んでも安全）
cd "$(dirname "$0")/.."

# Git の安全設定と自動 rebase/autostash
git config --global --add safe.directory "$(pwd)"
git config pull.rebase true
git config rebase.autoStash true

# PAT があれば、常に PAT URL を使う（GH_PAT は Replit Secrets）
if [[ -n "${GH_PAT:-}" ]]; then
  git remote set-url origin "https://x-access-token:${GH_PAT}@github.com/CerereBacchio/stocklite.git"
fi

echo "==> Sync with remote (pull --rebase, autostash)…"
# 未ステージ変更があっても自動で退避して rebase する
git add -A || true
git pull --rebase || true

echo "==> Build (tsc && vite build)…"
npm run build

echo "==> Prepare dist artifacts…"
touch dist/.nojekyll
date -Iseconds > dist/build.txt

echo "==> Commit dist only…"
git add -A dist

MSG_FILE="commit-message.txt"
if [[ -s "$MSG_FILE" ]]; then
  MSG="$(cat "$MSG_FILE")"
else
  MSG="deploy: publish dist to GitHub Pages"
fi

# 変更があるときだけコミット
git diff --cached --quiet || git commit -m "$MSG"

echo "==> Push…"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if ! git push -u origin "$BRANCH"; then
  echo "==> Push rejected; syncing and retrying once…"
  git pull --rebase || true
  git push -u origin "$BRANCH"
fi

echo "✅ Done."