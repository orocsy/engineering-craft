# Fresh-machine setup — handoff doc

> Run this on any new device (Mac) to get the full **engineering-craft + dev-pipeline + spec-forge** stack working in Claude Code. End-to-end takes ~3 minutes.

## TL;DR (just gimme the commands)

```bash
# 1. Clone engineering-craft (the only public, cloneable-without-auth repo)
git clone https://github.com/orocsy/engineering-craft ~/.claude/skills/engineering-craft

# 2. Run the bootstrap installer
bash ~/.claude/skills/engineering-craft/bootstrap/install.sh

# 3. Open Claude Code in any project
claude
# → SessionStart hook confirms engineering-craft is present
# → /dev-pipeline:* commands are now available
```

That's it. The install script is idempotent — re-running is safe.

## What gets installed

| Component | Where | Why |
|-----------|-------|-----|
| **engineering-craft skill** | `~/.claude/skills/engineering-craft/` | 43 production-defensive rules across 14 categories; auto-loaded on diff-keyword match |
| **engineering-craft mirror clone** | `~/.claude/external-mirrors/engineering-craft/` | Read-write clone for `/dev-pipeline:consolidate-lessons` to push refined rules to public mirror |
| **dev-pipeline plugin** | `~/.claude/plugins/marketplaces/local/plugins/dev-pipeline/` | All `/dev-pipeline:*` slash commands, agents, internal skills |
| **spec-forge** | `~/Desktop/projects/spec-forge/` | Used by `/dev-pipeline:scaffold-from-prd` to generate new projects from JSON specs |
| **post-codex-fix-extract-lesson hook** | `~/.claude/hooks/post-codex-fix-extract-lesson.sh` | PostToolUse(Bash) — journals review-fix commits |
| **session-start hook (fragment)** | `~/.claude/hooks/session-start.sh` | Auto-bootstrap engineering-craft each session; surface consolidation reminders |
| **settings.json** | `~/.claude/settings.json` | Hook registrations (merged, doesn't clobber existing) |
| **launchd consolidation reminder** | `~/Library/LaunchAgents/com.engineering-craft.consolidation-reminder.plist` | Fires every 2 days; writes marker if journal has new entries |

## Prerequisites

| Tool | Required? | Why |
|------|-----------|-----|
| `git` | Required | Cloning all three repos |
| `jq` | Required | Merging settings.json without clobbering |
| `gh` (GitHub CLI) | Optional | Setting GitHub Secrets, repo operations from in-Claude |
| `python3` | Optional | Lint script (`scripts/lint.py`); required for the consolidation flow |
| `openssl` | Optional | Generating secrets for env config |

If `git` or `jq` is missing, install:
```bash
brew install git jq           # macOS via Homebrew
apt-get install git jq        # Ubuntu/Debian
```

## SSH access

The `dev-pipeline` and `spec-forge` repos are private (`git@github.com:orocsy/...`). Make sure your new machine has an SSH key registered with GitHub:

```bash
# Check existing key
ls ~/.ssh/id_*.pub

# If no key, generate
ssh-keygen -t ed25519 -C "your-email@example.com"

# Add to GitHub
gh auth login    # OR manually copy ~/.ssh/id_ed25519.pub to github.com/settings/keys

# Test
ssh -T git@github.com
```

If you'd rather use HTTPS + a personal access token, override the bootstrap defaults:

```bash
DEV_PIPELINE_REPO=https://github.com/orocsy/dev-pipeline.git \
SPEC_FORGE_REPO=https://github.com/orocsy/spec-forge.git \
bash ~/.claude/skills/engineering-craft/bootstrap/install.sh
```

## Variations

### Skip dev-pipeline (just want engineering-craft as a knowledge base)

```bash
SKIP_DEV_PIPELINE=1 bash ~/.claude/skills/engineering-craft/bootstrap/install.sh
```

### Skip spec-forge (don't need scaffold-from-prd)

```bash
SKIP_SPEC_FORGE=1 bash ~/.claude/skills/engineering-craft/bootstrap/install.sh
```

### Custom spec-forge location

```bash
SPEC_FORGE_DIR=~/code/spec-forge bash ~/.claude/skills/engineering-craft/bootstrap/install.sh
```

## Verifying the install

```bash
# 1. SessionStart hook works
bash ~/.claude/hooks/session-start.sh
# Expected: "[session] branch: ..." plus possible engineering-craft messages

# 2. Lint pass clean
python3 ~/.claude/skills/engineering-craft/scripts/lint.py
# Expected: "Lint clean. No action needed."

# 3. launchd job loaded
launchctl list | grep engineering-craft
# Expected: "-  0  com.engineering-craft.consolidation-reminder"

# 4. Hook is registered
jq '.hooks.PostToolUse[] | select(.matcher == "Bash")' ~/.claude/settings.json
# Expected: shows post-codex-fix-extract-lesson.sh entry

# 5. dev-pipeline plugin discoverable
ls ~/.claude/plugins/marketplaces/local/plugins/dev-pipeline/commands/ | head -5
# Expected: detect.md, init.md, pipeline.md, ...
```

## What's NOT in the bootstrap (deliberately)

These are personal / per-user and shouldn't be auto-copied:

- **`~/.claude/CLAUDE.md`** — your personal Agent Directives (Senior Dev Override, Forced Verification, etc.). Each user picks their own; copy from your old machine if you want them.
- **Other skills under `~/.claude/skills/`** — `nodejs-testing`, `vercel-react-best-practices`, etc. Each is from its own marketplace; install separately.
- **Personal git config** — `git config --global` settings, SSH keys, etc.
- **macOS app preferences** — terminal, IDE, window manager, etc.

## Setting up a NEW project after bootstrap

```bash
mkdir my-new-project && cd my-new-project
git init

# Generate a project-level CLAUDE.md from template
mkdir -p .claude
cp ~/.claude/skills/engineering-craft/bootstrap/templates/project-CLAUDE.md .claude/CLAUDE.md
# Open .claude/CLAUDE.md and fill in the {{PLACEHOLDERS}}

# Initialize dev-pipeline structure
claude
> /dev-pipeline:init
# Detects stack, creates .claude/, installs git hooks, ensures engineering-craft present
```

## Updating engineering-craft on this machine

The SessionStart hook auto-pulls the public mirror in the background every 24h. To force-pull:

```bash
git -C ~/.claude/external-mirrors/engineering-craft pull --ff-only origin main
rsync -a --exclude='.git/' --exclude='.public-mirror-config' --exclude='scripts/' \
  ~/.claude/external-mirrors/engineering-craft/ \
  ~/.claude/skills/engineering-craft/
```

## Updating dev-pipeline plugin

```bash
git -C ~/.claude/plugins/marketplaces/local/plugins/dev-pipeline pull --ff-only origin main
# Restart Claude Code session for plugin commands to reload
```

## Uninstalling

If you ever want to start clean:

```bash
launchctl unload ~/Library/LaunchAgents/com.engineering-craft.consolidation-reminder.plist
rm ~/Library/LaunchAgents/com.engineering-craft.consolidation-reminder.plist
rm -rf ~/.claude/skills/engineering-craft
rm -rf ~/.claude/external-mirrors/engineering-craft
rm -rf ~/.claude/plugins/marketplaces/local/plugins/dev-pipeline
rm -rf ~/Desktop/projects/spec-forge
rm ~/.claude/hooks/post-codex-fix-extract-lesson.sh
# Edit ~/.claude/hooks/session-start.sh to remove the engineering-craft fragment
# Edit ~/.claude/settings.json to remove the hook registrations
```

## Troubleshooting

### "git: Permission denied (publickey)" on dev-pipeline / spec-forge

You don't have SSH access to those private repos. Use HTTPS + token (see "SSH access" above) OR ask the repo owner to grant access OR `SKIP_*` the missing repo.

### "engineering-craft not present — bootstrapping..." on every session

The SessionStart hook can't find the skill at `~/.claude/skills/engineering-craft/`. Check:
- Is the directory there? `ls ~/.claude/skills/engineering-craft/SKILL.md`
- Did the clone fail? Re-run `bash ~/.claude/skills/engineering-craft/bootstrap/install.sh`

### "/dev-pipeline:* commands not appearing"

Plugin auto-discovery scans `~/.claude/plugins/marketplaces/*/plugins/*/`. Verify:
- `ls ~/.claude/plugins/marketplaces/local/plugins/dev-pipeline/commands/` shows files
- Restart Claude Code (Cmd-Q + reopen) — plugins are scanned on startup

### Lint reports issues after a clean install

Open an issue / PR in `engineering-craft`. Lint should be clean on a fresh checkout.

### "launchctl list | grep engineering-craft" returns nothing

```bash
launchctl load -w ~/Library/LaunchAgents/com.engineering-craft.consolidation-reminder.plist
launchctl list | grep engineering-craft   # retry
```

If the load fails, check the plist syntax: `plutil -lint ~/Library/LaunchAgents/com.engineering-craft.consolidation-reminder.plist`.

---

**Bootstrap script source**: `~/.claude/skills/engineering-craft/bootstrap/install.sh`
**Public mirror**: https://github.com/orocsy/engineering-craft
**Issues**: https://github.com/orocsy/engineering-craft/issues
