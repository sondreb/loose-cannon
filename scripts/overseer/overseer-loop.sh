#!/usr/bin/env bash
# Continuous Loose Cannon overseer loop (Git Bash / WSL / Linux / macOS)
#
# Ctrl+C behavior:
# - During idle sleep: stop immediately.
# - During an active cycle (1st): request stop after the cycle finishes (do not kill the run).
# - During an active cycle (2nd): force-kill the active grok process and exit.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

YOLO=0
SLEEP=60
MAX_CYCLES=0
MAX_TURNS=80
NO_PUSH=0
NO_COMMIT=0
SESSION_FILE="$(dirname "$0")/.session-id"
PROMPT_BOOT="$(dirname "$0")/prompts/bootstrap.txt"
PROMPT_CYCLE="$(dirname "$0")/prompts/cycle.txt"
LOG_DIR="$(dirname "$0")/logs"
COMMIT_SCRIPT="$(dirname "$0")/commit-cycle.sh"
mkdir -p "$LOG_DIR"

CYCLE_RUNNING=0
STOP_REQUESTED=0
CHILD_PID=""

usage() {
  echo "Usage: $0 [--yolo] [--sleep N] [--max-cycles N] [--max-turns N] [--no-push] [--no-commit]"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yolo) YOLO=1; shift ;;
    --sleep) SLEEP="${2:?}"; shift 2 ;;
    --max-cycles) MAX_CYCLES="${2:?}"; shift 2 ;;
    --max-turns) MAX_TURNS="${2:?}"; shift 2 ;;
    --no-push) NO_PUSH=1; shift ;;
    --no-commit) NO_COMMIT=1; shift ;;
    -h|--help) usage ;;
    *) echo "Unknown: $1"; usage ;;
  esac
done

if ! command -v grok >/dev/null 2>&1; then
  echo "grok CLI not found on PATH"
  exit 1
fi

force_stop_child() {
  local pid="${CHILD_PID:-}"
  [[ -z "$pid" ]] && return 0
  # With setsid, pid is session/process-group leader — kill the group first.
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  # Brief grace period, then hard kill.
  local i
  for i in 1 2 3 4 5; do
    if ! kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    sleep 0.1
  done
  kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
}

on_int() {
  if [[ "$CYCLE_RUNNING" -eq 1 ]]; then
    if [[ "$STOP_REQUESTED" -eq 1 ]]; then
      echo ""
      echo "Second Ctrl+C — force-stopping the active cycle..."
      force_stop_child
      exit 130
    fi
    echo ""
    echo "Ctrl+C noted — finishing this cycle (not killing the active run). Loop will stop afterward."
    echo "Press Ctrl+C again to force-stop now."
    STOP_REQUESTED=1
  else
    echo ""
    echo "Ctrl+C during idle — stopping now."
    # If a background sleep is running, drop it.
    if [[ -n "${SLEEP_PID:-}" ]] && kill -0 "$SLEEP_PID" 2>/dev/null; then
      kill "$SLEEP_PID" 2>/dev/null || true
    fi
    exit 130
  fi
}
trap on_int INT

echo "Loose Cannon overseer loop"
echo "  Yolo:         $YOLO"
echo "  Sleep:        ${SLEEP}s"
echo "  MaxCycles:    $(if [[ $MAX_CYCLES -eq 0 ]]; then echo unlimited; else echo "$MAX_CYCLES"; fi)"
echo "  MaxTurns:     $MAX_TURNS"
echo "  Ctrl+C idle:  stop immediately"
echo "  Ctrl+C busy:  finish current cycle, then stop"
echo "  Ctrl+C x2:    force-kill active cycle and exit"
echo ""

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
    SID=$(tr -d '[:space:]' <"$SESSION_FILE")
    if [[ -n "$SID" ]]; then
      ARGS+=(--resume "$SID")
    fi
  elif [[ $n -gt 1 ]]; then
    ARGS+=(--continue)
  fi

  CYCLE_RUNNING=1
  set +e
  # New session so Ctrl+C to this terminal does not deliver SIGINT to grok.
  # Parent trap still runs (shell remains in the foreground process group via wait).
  if command -v setsid >/dev/null 2>&1; then
    setsid grok "${ARGS[@]}" >"$LOG" 2>"$LOG.err" &
    CHILD_PID=$!
    wait "$CHILD_PID"
    code=$?
  else
    # Fallback: ignore INT in a subshell that runs grok in the foreground.
    # (SIGINT may still reach grok on some platforms without setsid.)
    (
      trap '' INT
      exec grok "${ARGS[@]}" >"$LOG" 2>"$LOG.err"
    ) &
    CHILD_PID=$!
    wait "$CHILD_PID"
    code=$?
  fi
  set -e
  CHILD_PID=""
  CYCLE_RUNNING=0

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

  # Commit + push after cycle (skip force-kill mid-run)
  if [[ "$NO_COMMIT" -eq 0 && "$code" -ne 130 ]]; then
    echo "--- git publish (cycle $n) ---"
    set +e
    if [[ "$NO_PUSH" -eq 1 ]]; then
      bash "$COMMIT_SCRIPT" "$n" --skip-push
    else
      bash "$COMMIT_SCRIPT" "$n"
    fi
    set -e
  fi

  if [[ "$STOP_REQUESTED" -eq 1 ]]; then
    echo "Stop was requested during the cycle — exiting without starting another."
    break
  fi

  if [[ $MAX_CYCLES -gt 0 && $n -ge $MAX_CYCLES ]]; then
    echo "Reached max-cycles=$MAX_CYCLES. Stopping."
    break
  fi

  echo "Sleeping ${SLEEP}s before next cycle (Ctrl+C stops immediately)..."
  set +e
  sleep "$SLEEP" &
  SLEEP_PID=$!
  wait "$SLEEP_PID"
  sleep_rc=$?
  set -e
  SLEEP_PID=""
  # sleep interrupted or stop requested
  if [[ "$STOP_REQUESTED" -eq 1 || $sleep_rc -ne 0 ]]; then
    if [[ "$STOP_REQUESTED" -eq 1 ]]; then
      break
    fi
    # Unexpected sleep failure — continue rather than wedging the loop.
  fi
done

echo "Overseer loop ended after $n cycle(s)."
