# What may never land in this repository

This catalog is a **public mirror**. Lessons come from real, private work, so every rule is
written generically and every push is checked.

## Never

- Keys, tokens, passwords, webhook secrets, connection strings, or anything shaped like one.
- Email addresses, phone numbers, postal addresses.
- People's names — customers, children, colleagues, the author.
- Project, product, company or client names, and their domains, bundle or account IDs.
- Prices, amounts, plan names tied to a business.
- Absolute paths containing a user name; commit SHAs or branch names from private repos.
- Non-English business conversation (translate the lesson, never the conversation).

Describe incidents the way existing rules do: "a booking service", "a mobile app's sign-up
flow", "a review cycle", "a payment webhook handler".

## How it is enforced

- **Before writing.** The dev-pipeline learning watcher redacts every journal excerpt
  (keys, emails, phones, prices, IPs, provider IDs, user paths, a local private-terms list)
  and keeps the journal outside every repository.
- **Before committing.** Automated and interactive consolidation both run `privacy_lint.py`
  on the diff. In public mode it refuses all of the above plus any domain not on its public
  allowlist, common given names, and CJK text. A hit discards the change.
- **Before pushing.** The learning watcher's installer adds a `pre-push` hook to this
  repository that runs the same lint on every line a push adds, whoever pushes.
  `PRIVACY_LINT_SKIP=1 git push` exists for a line you have personally checked; a line that
  must stay can carry `privacy-lint: allow <why>`.

The lint is a backstop, not a guarantee: a name it has never seen, in plain English, can only
be caught by the local private-terms list or by the reviewer. Read the inbox diff before you
push.
