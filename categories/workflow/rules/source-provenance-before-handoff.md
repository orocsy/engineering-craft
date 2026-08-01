---
title: State Source Repository, Hosting Source and Deployed Artifact Separately at Handoff
type: process
maturity: verified
impact: HIGH
impact-description: |
  A working preview can exist while its source is only local, mirrored to a
  hosting-managed private repository, or absent from the user's normal GitHub
  organization. Saying “it is deployed” or “it is in GitHub” without provenance
  leaves ownership, backup, reviewability and future maintenance ambiguous.
tags: git, repository, provenance, hosting, preview, handoff, deployment
applies-to: |
  Generated sites, hosting plugins, preview environments, imported templates,
  code created outside a user's normal repository, and any handoff where the
  user asks where the source code lives.
related-rules:
  - pull-main-before-branching
  - post-merge-deploy-verification
historical-incidents:
  - "Private generated-site session (2026-08-01): a public preview and hosting-managed private source copy existed, but the local Git repository had no remote and was not in the user's organization; repeated 'where is the repo?' questions exposed that deployment status had been reported without a three-part source provenance statement"
last-referenced: 2026-08-01
---

## The incident progression

| Stage | What happened |
|-------|---------------|
| Intent | Build and preview a customer-facing site while keeping source private. |
| Implicit assumption | A successful hosted preview meant the code was in the user's normal GitHub repository. |
| Evidence | The working tree was a standalone local Git repository with no configured remote. The hosting service held a separate private source mirror, and the public URL was only the deployed artifact. |
| Correction | Report all three layers explicitly and do not claim organization ownership until a configured remote and reachable commit prove it. |

## The three-layer statement

Every handoff should answer these separately:

| Layer | Required evidence | Example claim |
|-------|-------------------|---------------|
| Working repository | absolute path, branch, HEAD, dirty/untracked state, remotes | “Local repo on branch main at abc123; no GitHub remote configured.” |
| Hosting source | provider/project, source visibility, version saved versus deployed | “Hosting project has a private managed source copy; version 16 is saved but not public.” |
| Runtime artifact | public/private URL, deployed version, access policy | “The existing public site is still version 15.” |

These can legitimately disagree. A saved hosting version may not be deployed. A
public runtime can point to source the user does not own. A local commit can be
newer than both.

## Required checks

```bash
git rev-parse --show-toplevel
git status --short --branch
git rev-parse HEAD
git remote -v
git log -1 --oneline --decorate
```

Then use the hosting control plane to verify:

- project identifier and provider;
- source repository visibility and owner;
- saved version versus deployed version;
- whether source upload and public deploy are separate actions;
- access controls on preview and source.

Do not print short-lived clone credentials, authenticated remote URLs or hosting
tokens as “evidence.” Redact credentials and report only provider/repository
identity.

## Handoff template

```markdown
Source status
- Local: /absolute/path, branch <branch>, HEAD <sha>, <clean|dirty>
- GitHub: <org/repo + remote> OR “no user-owned remote configured”
- Hosting source: <provider/project>, <private/public>, saved version <n>
- Runtime: <URL>, deployed version <n>, access policy <public/restricted>
- Next ownership action: <none|add remote|transfer repo|deploy saved version>
```

## Verification before claiming “it is in GitHub”

At least one configured remote must name the claimed repository, and the remote
must contain the reported commit:

```bash
git remote get-url origin
git ls-remote origin
git branch -r --contains <sha>
```

If authentication prevents the remote check, say so. Do not upgrade an
assumption into a fact.

## Anti-patterns

- “The URL works, so the source is safely in GitHub.”
- Calling a hosting provider's private mirror the user's organization repo.
- Reporting a saved version as deployed.
- Adding a remote or pushing source merely to make the provenance answer easier;
  publishing source requires explicit authorization.
- Exposing credential-bearing remote URLs in logs or audit documents.
