#!/usr/bin/env bash
set -euo pipefail

echo "==> Sync with remote (pull --rebase, autostash)…"
git -c rebase.autoStash=true pull --rebase || true

echo "==> Build (vite → outDir=docs)…"
npm run build

echo "==> Prepare docs artifacts…"
date -u +"%Y-%m-%dT%H:%M:%SZ" > docs/build.txt
touch docs/.nojekyll

echo "==> Commit docs only…"
COMMIT_MSG_FILE="commit-message.txt"
if [ ! -s "$COMMIT_MSG_FILE" ]; then
  echo "deploy: publish docs to GitHub Pages" > "$COMMIT_MSG_FILE"
fi
git add -A docs
# 変更がない場合はスキップ
if git diff --cached --quiet; then
  echo "no changes in docs; skip commit/push."
  exit 0
fi
git commit -F "$COMMIT_MSG_FILE"

echo "==> Push…"
if git push -u origin main; then
  echo "push success."
  exit 0
fi

echo "==> Push rejected; syncing and retrying once…"
git -c rebase.autoStash=true pull --rebase
git push -u origin main
echo "done."