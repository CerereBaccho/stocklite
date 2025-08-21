#!/usr/bin/env bash
set -euo pipefail

# ===== 設定（必要なら Secrets で上書き）=====
: "${GIT_USER:=replit-bot}"
: "${GIT_EMAIL:=replit-bot@users.noreply.github.com}"
: "${GITHUB_USER:=CerereBaccho}"
: "${GITHUB_REPO:=stocklite}"
BRANCH="${1:-main}"
MSG_FILE="commit-message.txt"
# ============================================

# Git ユーザー設定（未設定なら入れる）
git config user.name  "${GIT_USER}"  >/dev/null
git config user.email "${GIT_EMAIL}" >/dev/null

# 変更なしなら終了
if [[ -z "$(git status --porcelain)" ]]; then
  echo "No changes to commit."
  exit 0
fi

# すべてステージ
git add -A

# コミットメッセージ決定
msg=""
if [[ -f "$MSG_FILE" ]]; then
  msg="$(sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' "$MSG_FILE")"
fi
if [[ -z "$msg" ]]; then
  changed="$(git diff --cached --name-status | awk '{print $1 ":" $2}' | tr '\n' ', ' | sed 's/, $//')"
  now="$(date '+%Y-%m-%d %H:%M')"
  msg="chore: update ${now}"
  if [[ -n "$changed" ]]; then
    msg="${msg} — ${changed}"
  fi
fi

# コミット（何も変化してなければ抜ける）
git commit -m "$msg" || { echo "Nothing to commit after stage."; exit 0; }

# ===== PAT の準備 =====
if [[ -z "${GH_PAT:-}" ]]; then
  echo "ERROR: Replit Secrets に GH_PAT がありません。追加してから再実行してください。"
  exit 1
fi

# 既存の origin を保存
ORIG_URL="$(git remote get-url origin 2>/dev/null || true)"
# PAT 埋め込みURLへ“一時的に”切替（ログに出さない）
PAT_URL="https://x-access-token:${GH_PAT}@github.com/${GITHUB_USER}/${GITHUB_REPO}.git"
git remote set-url origin "${PAT_URL}"

# upstream の変更を先に取り込む（衝突時はここで止めて手動解決）
git fetch origin "${BRANCH}" || true
if git rev-parse --verify "origin/${BRANCH}" >/dev/null 2>&1; then
  git pull --rebase origin "${BRANCH}" || true
fi

# push（初回は -u で upstream も設定）
git push -u origin "${BRANCH}"

# origin を元に戻す（PAT が .git に残らないように）
if [[ -n "${ORIG_URL}" ]]; then
  git remote set-url origin "${ORIG_URL}"
else
  git remote set-url origin "https://github.com/${GITHUB_USER}/${GITHUB_REPO}.git"
fi

echo "✅ Pushed with message:"
echo "$msg"