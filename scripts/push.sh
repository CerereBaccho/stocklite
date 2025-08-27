#!/usr/bin/env bash
set -euo pipefail

BRANCH="main"
REPO="https://x-access-token:${GH_PAT}@github.com/CerereBaccho/stocklite.git"

# 1) Git の基本設定（未設定なら）
git config user.name  >/dev/null 2>&1 || git config user.name  "replit-bot"
git config user.email >/dev/null 2>&1 || git config user.email "replit-bot@users.noreply.github.com"

# 2) リモートURLを必ず PAT 版に統一
if git remote | grep -q "^origin$"; then
  git remote set-url origin "$REPO"
else
  git remote add origin "$REPO"
fi

# 3) 先に最新を取り込む（ここが今回のreject対策）
git fetch origin "$BRANCH" || true
# PAT を確実に使わせるため -c で helper を無効化
git -c credential.helper= pull --rebase origin "$BRANCH" || true

# 4) ビルド（必要なら依存解決）
if [ ! -d node_modules ]; then
  npm ci --silent --no-audit --no-fund || npm install
fi
npm run build

# 5) Pages 用の追加ファイル（/dist を公開する運用のまま）
#   ※ Pages の公開フォルダは「/(dist)」のままでOK
touch dist/.nojekyll
date -u +"%Y-%m-%dT%H:%M:%SZ" > dist/build.txt

# 6) コミットメッセージ（ファイルがあればそれを使う）
if [ -f commit-message.txt ]; then
  MSG=$(cat commit-message.txt)
else
  MSG="deploy: publish dist to GitHub Pages"
fi

# 7) 変更をコミット & プッシュ
git add -A
# 変更が無い時は commit をスキップして push だけ
if git diff --cached --quiet; then
  echo "[push.sh] No changes to commit. Pushing anyway (after rebase)…"
else
  git commit -m "$MSG"
fi

git -c credential.helper= push origin "$BRANCH"
echo "[push.sh] Done. Pushed to $BRANCH."