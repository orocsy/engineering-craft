---
title: The Test Environment Must Be What CI's Install Command Installs
last-referenced: 2026-10-22
maturity: draft
type: pitfall
impact: HIGH
impact-description: |
  In a uv (or Poetry/pdm) workspace, `uv sync` at the root installs only the root project
  and its dependency groups. A member package and the dev dependencies declared inside
  that member are not installed, so `import pkg` fails in CI; or, if the CI step masks
  pytest's exit code 5 ("no tests collected"), a test path that collects nothing passes. Locally it often works because someone once ran
  `uv sync --all-packages`, and the next `uv run` quietly re-syncs it away.
tags: python, uv, workspace, ci, pytest, monorepo, dependency-groups
applies-to: |
  Python monorepos and workspaces (uv, Poetry, pdm, hatch) where tests run from the
  repository root.
related-rules:
  - run-the-composed-gate-not-your-own
  - skip-is-a-decision-not-a-default
  - validate-responses-against-the-contract-file
historical-incidents:
  - a real incident (2026-10), a new FastAPI service: the backend's pytest/httpx lived in the backend member's dev group; `uv run pytest` at the root re-synced the env to root-only and failed with ModuleNotFoundError until the member and test tools moved into the root dev group
---

## The rule

Put the package under test and its test tools where the exact install command used by
CI and by `uv run` will see them:

```toml
# root pyproject.toml
[dependency-groups]
dev = ["my-backend", "pytest", "httpx"]

[tool.uv.sources]
my-backend = { workspace = true }
```

Then `uv sync --frozen` in CI and `uv run pytest` locally build the same environment.

## Checks

- CI runs the same command a developer runs (`uv run pytest`), not a hand-assembled variant.
- pytest exits 5 when it collects nothing; don't mask that with `|| true`.
