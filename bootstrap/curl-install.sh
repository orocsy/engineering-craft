#!/usr/bin/env bash
# engineering-craft — curl-pipe-bash entry point
#
# One-liner for fresh-machine setup. Audit before running on shared machines.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/orocsy/engineering-craft/main/bootstrap/curl-install.sh | bash
#
# What it does:
#   1. Clones engineering-craft to ~/.claude/skills/engineering-craft (if missing)
#   2. Hands off to bootstrap/install.sh which does the real work
#
# Env overrides (set BEFORE the curl pipe):
#   curl … | SKIP_DEV_PIPELINE=1 SKIP_SPEC_FORGE=1 bash
#
# Source: github.com/orocsy/engineering-craft/blob/main/bootstrap/curl-install.sh

set -euo pipefail

REPO="${ENGINEERING_CRAFT_REPO:-https://github.com/orocsy/engineering-craft}"
DEST="$HOME/.claude/skills/engineering-craft"

bold()  { printf "\033[1m%s\033[0m\n" "$1"; }
green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1" >&2; }

bold "engineering-craft fresh-machine bootstrap"
echo "  Source repo: $REPO"
echo "  Skill dest:  $DEST"
echo

# ─── Prereqs ────────────────────────────────────────────────────────────────
for tool in git bash; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    red "✗ $tool not found — install it first"
    exit 1
  fi
done

# ─── Clone or refresh engineering-craft ─────────────────────────────────────
if [ -d "$DEST/categories" ]; then
  green "✓ engineering-craft already at $DEST"
  echo "  (refreshing from remote — fast-forward only)"
  if [ -d "$DEST/.git" ]; then
    git -C "$DEST" pull --ff-only origin main 2>&1 | tail -2 || echo "  (refresh failed — continuing with current state)"
  fi
else
  echo "▶ Cloning engineering-craft..."
  mkdir -p "$(dirname "$DEST")"
  git clone "$REPO" "$DEST"
  green "✓ Cloned to $DEST"
fi

# ─── Hand off to install.sh ─────────────────────────────────────────────────
INSTALL="$DEST/bootstrap/install.sh"
if [ ! -x "$INSTALL" ]; then
  red "✗ Expected installer at $INSTALL but it's missing or not executable"
  red "  Did the clone fail? Try: ls $INSTALL"
  exit 1
fi

echo
bold "Handing off to $INSTALL"
echo "  (installs dev-pipeline, spec-forge, hooks, settings, launchd)"
echo
exec bash "$INSTALL"
