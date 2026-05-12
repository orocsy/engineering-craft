#!/bin/bash
# engineering-craft SessionStart fragment
#
# Append this to your ~/.claude/hooks/session-start.sh — the install.sh
# script handles the merge automatically. Don't run this file directly.
#
# What it does:
# 1. Auto-bootstrap engineering-craft on fresh machines (clones from public mirror)
# 2. Refresh the mirror in background if last sync was >24h ago (rate-limited)
# 3. Surface consolidation-due marker if launchd left one

# === engineering-craft auto-bootstrap (idempotent, rate-limited 24h) ==========
SKILL_DIR="$HOME/.claude/skills/engineering-craft"
MIRROR_DIR="$HOME/.claude/external-mirrors/engineering-craft"
LAST_SYNC="$HOME/.claude/lessons-journal/.last-mirror-sync"

if [ ! -d "$SKILL_DIR/categories" ]; then
  if command -v git >/dev/null 2>&1; then
    mkdir -p "$HOME/.claude/skills" "$HOME/.claude/external-mirrors" "$HOME/.claude/lessons-journal"
    echo "[session] engineering-craft missing — bootstrapping from public mirror..."
    if git clone --quiet https://github.com/orocsy/engineering-craft "$SKILL_DIR" 2>/dev/null; then
      RULE_COUNT=$(find "$SKILL_DIR/categories" -name "*.md" -path "*/rules/*" 2>/dev/null | wc -l | tr -d ' ')
      CAT_COUNT=$(ls -d "$SKILL_DIR/categories/"*/ 2>/dev/null | wc -l | tr -d ' ')
      echo "[session] engineering-craft installed: $RULE_COUNT rules across $CAT_COUNT categories"
      touch "$LAST_SYNC"
    else
      echo "[session] WARN: engineering-craft clone failed (offline?) — /dev-pipeline:review STEP 1.5 will degrade"
    fi
  fi
elif [ -d "$MIRROR_DIR/.git" ]; then
  NEEDS_REFRESH=1
  if [ -f "$LAST_SYNC" ]; then
    AGE=$(( $(date +%s) - $(stat -f %m "$LAST_SYNC" 2>/dev/null || stat -c %Y "$LAST_SYNC" 2>/dev/null || echo 0) ))
    [ "$AGE" -lt 86400 ] && NEEDS_REFRESH=0
  fi
  if [ "$NEEDS_REFRESH" -eq 1 ]; then
    ( git -C "$MIRROR_DIR" pull --ff-only origin main >/dev/null 2>&1 && touch "$LAST_SYNC" ) &
  fi
fi

# === Consolidation-due marker surfacing =====================================
LESSONS_MARKER="$HOME/.claude/lessons-journal/.consolidation-due"
if [ -f "$LESSONS_MARKER" ]; then
  ENTRIES=$(grep -E '^entries=' "$LESSONS_MARKER" | cut -d= -f2 || echo "?")
  LINT_ISSUES=$(grep -E '^lint_issues=' "$LESSONS_MARKER" | cut -d= -f2 || echo "?")
  echo "[session] engineering-craft: $ENTRIES journal entries + $LINT_ISSUES lint issues pending — run /dev-pipeline:consolidate-lessons"
fi
