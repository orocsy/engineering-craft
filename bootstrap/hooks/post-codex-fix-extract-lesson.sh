#!/usr/bin/env bash
# post-codex-fix-extract-lesson.sh
#
# PostToolUse hook on Bash: when a `git commit` runs whose message mentions
# Codex / review / address review feedback, append a structured entry to
# the lessons journal. The journal is jsonl — append-only, fast.
#
# A separate consolidation step (`/dev-pipeline:consolidate-lessons`)
# periodically reads the journal and updates the engineering-craft
# skill with curated rules, then pushes to the public learnings mirror at
# github.com/orocsy/engineering-craft.
#
# Why journal+consolidate instead of directly updating the skill on every
# commit:
#   - Hook must be fast (<100ms) and deterministic — no LLM call.
#   - Raw data preserved for later analysis even after consolidation prunes.
#   - Skill stays small (curated rules only) — large journal stays out of
#     context window unless explicitly loaded.

set -euo pipefail

JOURNAL_DIR="${HOME}/.claude/lessons-journal"
mkdir -p "$JOURNAL_DIR"
JOURNAL="${JOURNAL_DIR}/codex-fixes.jsonl"

# Read tool input from stdin (JSON-encoded by Claude Code)
INPUT="$(cat)"

# Bail fast if not a git commit command
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null)
if [[ -z "$COMMAND" ]] || ! echo "$COMMAND" | grep -qE 'git[[:space:]]+commit'; then
  exit 0
fi

# Extract commit message — could be -m "..." or HEREDOC. Look for both.
MSG=$(echo "$COMMAND" | grep -oE -- '-m [^"]*"[^"]*"' | head -1 | sed -E 's/^-m[[:space:]]*"//; s/"[[:space:]]*$//' || true)
if [[ -z "$MSG" ]]; then
  # HEREDOC pattern: capture between EOF markers
  MSG=$(echo "$COMMAND" | sed -nE '/<<.?EOF.?/,/^EOF/p' | sed '1d;$d' | head -3 || true)
fi

# Filter: only commits that look like review fixes
if ! echo "$MSG" | grep -qiE '(codex|review|address|race|p1|p2|cve|security fix|toctou|cas)'; then
  exit 0
fi

# Get the just-committed SHA from the tool output
OUTPUT=$(echo "$INPUT" | jq -r '.tool_output // ""' 2>/dev/null)
SHA=$(echo "$OUTPUT" | grep -oE '\[[a-z/-]+ [0-9a-f]{7}\]' | grep -oE '[0-9a-f]{7}' | head -1 || true)
[[ -z "$SHA" ]] && SHA="unknown"

# Capture diff stat for context (which files + line counts)
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
DIFF_STAT=""
if [[ -n "$REPO_ROOT" && "$SHA" != "unknown" ]]; then
  DIFF_STAT=$(cd "$REPO_ROOT" && git show --stat --format= "$SHA" 2>/dev/null | head -10 | tr '\n' ' ' | sed 's/  */ /g' || true)
fi

# Tag the bug class by keyword scanning the commit message
CLASS="other"
if echo "$MSG" | grep -qiE 'race|toctou|concurrent|cas|atomic'; then CLASS="concurrency"
elif echo "$MSG" | grep -qiE 'enumeration|timing|oracle|leak'; then CLASS="enumeration-safety"
elif echo "$MSG" | grep -qiE 'env|secret|deploy.yml|config'; then CLASS="config-drift"
elif echo "$MSG" | grep -qiE 'tenant|isolation|cross-tenant'; then CLASS="tenant-isolation"
elif echo "$MSG" | grep -qiE 'auth|jwt|token|password'; then CLASS="auth-correctness"
elif echo "$MSG" | grep -qiE 'validation|schema|format'; then CLASS="validation"
fi

# Append jsonl entry. Single line, jq-safe.
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PROJECT=$(basename "$REPO_ROOT" 2>/dev/null || echo "unknown")
SUMMARY=$(echo "$MSG" | head -1 | tr -d '"' | head -c 200)

jq -n -c \
  --arg ts "$TIMESTAMP" \
  --arg sha "$SHA" \
  --arg project "$PROJECT" \
  --arg class "$CLASS" \
  --arg summary "$SUMMARY" \
  --arg files "$DIFF_STAT" \
  '{ts: $ts, sha: $sha, project: $project, class: $class, summary: $summary, files: $files}' \
  >> "$JOURNAL"

# Soft size guard — warn if journal exceeds 500 entries (time to consolidate)
LINE_COUNT=$(wc -l < "$JOURNAL" 2>/dev/null | tr -d ' ')
if [[ "$LINE_COUNT" -gt 500 ]]; then
  echo "[lessons-journal] $LINE_COUNT entries — consider running /dev-pipeline:consolidate-lessons" >&2
fi

exit 0
