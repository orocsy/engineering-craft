---
title: The Test Environment Must Be What CI's Install Command Installs
maturity: draft
impact: HIGH
impact-description: |
  In a uv (or Poetry/pdm) workspace, `uv sync` at the root installs only the root project
  and its dependency groups. A member package and the dev dependencies declared inside
  that member are not installed, so `import pkg` fails in CI, or worse, a test path that
  collects nothing exits green. Locally it often works because someone once ran
  `uv sync --all-packages`, and the next `uv run` quietly re-syncs it away.
tags: python, uv, workspace, ci, pytest, monorepo, dependency-groups
applies-to: |
  Python monorepos and workspaces (uv, Poetry, pdm, hatch) where tests run from the
  repository root.
related-rules:
  - validate-responses-against-the-contract-file
historical-incidents:
  - KidsBuddy MIU-B01 (2026-10): the backend's pytest/httpx lived in the backend member's dev group; `uv run pytest` at the root re-synced the env to root-only and failed with ModuleNotFoundError until the member and test tools moved into the root dev group
---

## The rule

Put the package under test and its test tools where the exact install command used by
CI and by `uv run` will see them:

```toml
# root pyproject.toml
[dependency-groups]
dev = ["kidsbuddy-backend", "pytest>=9.1,<10", "httpx2>=2.15,<3"]

[tool.uv.sources]
kidsbuddy-backend = { workspace = true }
```

Then `uv sync --frozen` in CI and `uv run pytest` locally build the same environment.

## Checks

- CI runs the same command a developer runs (`uv run pytest`), not a hand-assembled variant.
- pytest exits 5 when it collects nothing; don't mask that with `|| true`.
