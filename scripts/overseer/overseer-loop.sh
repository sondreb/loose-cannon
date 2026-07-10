#!/usr/bin/env bash
# Continuous Loose Cannon overseer loop (Git Bash / WSL / Linux / macOS)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

YOLO=0
SLEEP=60
MAX_CYCLES=0
MAX_TURNS=80
SESSION_FILE="$(dirname "$0")/.session-id"
PROMPT_BOOT="$(dirname "$0")/prompts/bootstrap.txt"
PROMPT_CYCLE="$(dirname "$0")/prompts/cycle.txt"
LOG_DIR="$(dirname "$0")/logs"
mkdir -p "$LOG_DIR"

usage() {
  echo "Usage: $0 [--yolo] [--sleep N] [--max-cycles N] [--max-turns N]"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yolo) YOLO=1; shift ;;
    --sleep) SLEEP="${2:?}"; shift 2 ;;
    --max-cycles) MAX_CYCLES="${2:?}"; shift 2 ;;
    --max-turns) MAX_TURNS="${2:?}"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown: $1"; usage ;;
  esac
done

if ! command -v grok >/dev/null 2>&1; then
  echo "grok CLI not found on PATH"
  exit 1
fi

n=0
while true; do
  n=$((n + 1))
  echo "========================================"
  echo "=== Overseer cycle $n starting $(date -Iseconds) ==="
  echo "========================================"

  STAMP=$(date +%Y%m%d-%H%M%S)
  LOG="$LOG_DIR/cycle-$STAMP.log"

  if [[ $n -eq 1 && ! -f "$SESSION_FILE" ]]; then
    PROMPT="$PROMPT_BOOT"
  else
    PROMPT="$PROMPT_CYCLE"
  fi

  ARGS=(--prompt-file "$PROMPT" --cwd "$ROOT" --max-turns "$MAX_TURNS" --output-format json --no-auto-update)
  if [[ $YOLO -eq 1 ]]; then
    ARGS+=(--always-approve)
  fi
  if [[ -f "$SESSION_FILE" ]]; then
    SID=$(tr -d '[:space:]' < "$SESSION_FILE")
    if [[ -n "$SID" ]]; then
      ARGS+=(--resume "$SID")
    fi
  elif [[ $n -gt 1 ]]; then
    ARGS+=(--continue)
  fi

  set +e
  grok "${ARGS[@]}" >"$LOG" 2>"$LOG.err"
  code=$?
  set -e

  if command -v jq >/dev/null 2>&1; then
    sid=$(jq -r '.sessionId // empty' "$LOG" 2>/dev/null || true)
    if [[ -n "${sid:-}" ]]; then
      echo "$sid" >"$SESSION_FILE"
      echo "Session ID saved: $sid"
    fi
    echo "--- agent summary (truncated) ---"
    jq -r '.text // .message // empty' "$LOG" 2>/dev/null | head -c 2000 || true
    echo
  else
    head -c 2000 "$LOG" || true
    echo
  fi

  echo "Cycle $n finished with exit code $code"

  if [[ $MAX_CYCLES -gt 0 && $n -ge $MAX_CYCLES ]]; then
    echo "Reached max-cycles=$MAX_CYCLES. Stopping."
    break
  fi

  echo "Sleeping ${SLEEP}s before next cycle..."
  sleep "$SLEEP"
done

echo "Overseer loop ended after $n cycle(s)."
