# An env-delivery step must never replace real secrets with nothing

**Category**: deploy-delivery
**First seen**: 2026-08-01 in `coachflow` (`477f28d`) · sibling of the 2026-07-24 compose-password export (`841bc40`)
**Risk**: P0 — a production-killer with a green checkmark

## The Lesson

A deploy step that writes the host's env file from a CI secret must be gated on
the secret being non-empty. If the secret is unset (first run, migration, typo'd
name), an unconditional write replaces the box's real, working env with an empty
file — and the deploy still shows green until the container restarts and dies.
When the secret is absent, keep the existing file and emit a loud warning naming
the interim mode.

## Why It Happens

CI treats an unset secret as empty string, not an error. Heredoc-writing `""`
into a file is a perfectly successful shell operation.

## The Fix

```yaml
# ❌ Wrong — unset secret → env file becomes empty
- run: cat > ~/app/.env <<'EOF'
    ${{ secrets.APP_ENV }}
    EOF

# ✅ Right — presence computed in preflight, write step gated
- id: check
  run: |
    if [ -n "$APP_ENV" ]; then echo "has_env=true" >> "$GITHUB_OUTPUT";
    else echo "has_env=false" >> "$GITHUB_OUTPUT";
         echo "::warning::APP_ENV unset — keeping the box's existing env file"; fi
- if: steps.check.outputs.has_env == 'true'
  # ...write the file
```

## Examples

- 2026-08-01 (`coachflow:477f28d`) — `COACHFLOW_ENV` made optional during the interim
  era; unset → box file preserved + warning. Same run, the armed secret delivered the
  billing values GitHub→box on the first green chain.
- 2026-07-24 (`coachflow:841bc40`) — compose interpolation needed the DB password as a
  SHELL var read from the box's env file at deploy time, never echoed.

## See also

- `config-drift/four-consumer-rule` — the missing-producer half of the same failure family.
