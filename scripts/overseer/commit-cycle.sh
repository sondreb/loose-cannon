#!/usr/bin/env bash
# After an overseer cycle: commit all worktree changes and push to origin.
# Usage: commit-cycle.sh [cycle_number] [--skip-push]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

CYCLE="${1:-0}"
SKIP_PUSH=0
for a in "$@"; do
  [[ "$a" == "--skip-push" ]] && SKIP_PUSH=1
done

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "commit-cycle: not a git repo — skip."
  exit 0
fi

if [[ -z "$(git status --porcelain)" ]]; then
  echo "commit-cycle: working tree clean — nothing to commit."
  exit 0
fi

echo "commit-cycle: changes detected:"
git status --short

# Message from latest OVERSEER_LOG entry
SUBJECT=""
BODY=""
LOG="docs/OVERSEER_LOG.md"
if [[ -f "$LOG" ]]; then
  # Only parse real entries (skip Template section)
  HEADER=$(awk '
    /^## Entries/{e=1; next}
    e && /^### /{sub(/^### /,""); print; exit}
  ' "$LOG")
  if [[ "$HEADER" =~ cycle[[:space:]]+[0-9]+[[:space:]]*\((.+)\) ]]; then
    SUBJECT="${BASH_REMATCH[1]}"
  elif [[ "$HEADER" =~ [—–-][[:space:]]*(.+) ]]; then
    SUBJECT="${BASH_REMATCH[1]}"
  else
    SUBJECT="$HEADER"
  fi
  FOCUS=$(awk '
    /^## Entries/{e=1; next}
    e && /^- Focus:/{sub(/^- Focus: */,""); print; exit}
  ' "$LOG")
  if [[ -n "$FOCUS" ]]; then
    if [[ -z "$SUBJECT" || ${#SUBJECT} -lt 12 || "$SUBJECT" =~ ^[0-9]{4}- ]]; then
      SUBJECT="$FOCUS"
    fi
    BODY+="Focus: $FOCUS"$'\n'
  fi
  while IFS= read -r line; do
    BODY+="$line"$'\n'
  done < <(awk '
    /^## Entries/{e=1; next}
    e && /^### /{if(seen++)exit; next}
    seen && /^  - /{print; if(++n>=6) exit}
  ' "$LOG")
  NEXT=$(awk '
    /^## Entries/{e=1; next}
    e && /^- Next:/{sub(/^- Next: */,""); print; exit}
  ' "$LOG")
  [[ -n "$NEXT" ]] && BODY+="Next: $NEXT"$'\n'
fi

if [[ -z "$SUBJECT" ]]; then
  SUBJECT="cycle complete"
fi
SUBJECT=$(echo "$SUBJECT" | tr -s '[:space:]' ' ' | sed 's/^ //;s/ $//')
if [[ ${#SUBJECT} -gt 72 ]]; then
  SUBJECT="${SUBJECT:0:69}..."
fi

if [[ "$CYCLE" -gt 0 ]]; then
  FULL="overseer cycle ${CYCLE}: ${SUBJECT}"
else
  FULL="overseer: ${SUBJECT}"
fi
if [[ ${#FULL} -gt 100 ]]; then
  FULL="${FULL:0:97}..."
fi

BODY+=$'\n'"Automated commit after overseer cycle."

echo "commit-cycle: subject: $FULL"

git add -A
if [[ -z "$(git diff --cached --name-only)" ]]; then
  echo "commit-cycle: nothing staged after git add — skip."
  exit 0
fi

git commit -m "$FULL" -m "$BODY"
echo "commit-cycle: committed."

if [[ "$SKIP_PUSH" -eq 1 ]]; then
  echo "commit-cycle: --skip-push — not pushing."
  exit 0
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "commit-cycle: pushing to origin/$BRANCH ..."
git push -u origin HEAD
echo "commit-cycle: push OK."
