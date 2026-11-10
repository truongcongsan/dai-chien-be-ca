#!/usr/bin/env bash
# Sinh asset bằng Codex theo asset-specs/<spec>.md; chạy lại an toàn (bỏ qua ảnh đã có).
# Dùng: scripts/gen-assets.sh spec1 spec2 ...
set -uo pipefail
cd "$(dirname "$0")/.."
LOG=assets/logs; mkdir -p "$LOG"
REPO=$(pwd)
CODEX=${CODEX:-$(command -v codex || echo /Applications/ChatGPT.app/Contents/Resources/codex)}
expected() { grep -oE '^\| ([a-z0-9-]+) \|' "asset-specs/$1.md" | awk '{print $2}' | grep -v assetId; }
category() { grep -oE 'assets/raw/[a-z]+/' "asset-specs/$1.md" | head -1; }
missing() { local dir; dir=$(category "$1"); for id in $(expected "$1"); do [ -s "$dir$id.png" ] || echo "$id"; done; }
run_spec() {
  local spec=$1 attempt=0
  mkdir -p "$(category "$spec")"
  while [ -n "$(missing "$spec")" ] && [ $attempt -lt 4 ]; do
    attempt=$((attempt + 1))
    echo "[$(date +%H:%M)] codex $spec lần $attempt, còn: $(missing "$spec" | tr '\n' ' ')"
    "$CODEX" exec -C "$REPO" -s workspace-write --skip-git-repo-check \
      "Đọc AGENTS.md, asset-specs/style-guide.md và asset-specs/$spec.md. Sinh các ảnh còn thiếu sau bằng công cụ tạo ảnh của bạn (mỗi asset một ảnh riêng), lưu đúng đường dẫn output: $(missing "$spec" | tr '\n' ' '). Chỉ ghi vào assets/raw/." \
      >"$LOG/$spec-$attempt.log" 2>&1
    if grep -qiE "usage limit|too many requests|429|limit reached" "$LOG/$spec-$attempt.log"; then
      echo "[$(date +%H:%M)] $spec: hết quota, chờ 10 phút"; sleep 600
    fi
  done
  echo "[$(date +%H:%M)] $spec xong, còn thiếu: $(missing "$spec" | tr '\n' ' ')"
}
for spec in "$@"; do run_spec "$spec" & done
wait
