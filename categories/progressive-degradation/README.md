# Progressive Degradation

**When this category bites**: the feature was designed for the hydrated, scripted,
everything-loaded state, and the degraded state is whatever the platform does by default —
which is frequently wrong and occasionally a security defect.

**Source incident**: a public enquiry form carried `data-endpoint` and no `method`. HTML's
default for a form with no method is GET to the current URL, so with JavaScript disabled
every field — name, company, email, phone, free text — went into the query string. A sweep
across four repos then found 31 of 31 server-rendered forms with the same absence,
including an admin sign-in and a forgot-password form.

## The bedrock rule

**Name the state your surface is in when the script has not run, and decide what happens
there.** The platform's default is a decision someone else made about a different web;
inheriting it silently is not a design.

"JavaScript disabled" is not the only way to reach that state, and it is not the most
likely one. The reachable set includes: the bundle 404s after a bad deploy, a CSP change
blocks the script, an extension or corporate proxy strips it, the CDN serves a stale chunk,
hydration throws before handlers attach, or the user is on a slow link and acts during the
gap. In every one of those, server-rendered markup is live and interactive.

## Rules in this category

| Rule | Impact | Trigger |
|------|--------|---------|
| [form-without-method-submits-get](rules/form-without-method-submits-get.md) | HIGH | Any `<form>` in server-rendered markup — including SSR'd React/Vue/Svelte components |

## Templates

- [form-degradation.template.mjs](../../templates/form-degradation.template.mjs)

## Anti-patterns

- "Nobody disables JavaScript" → the failure modes that reach this state are mostly *your* deploys, not the user's settings
- "The handler calls preventDefault, so the native submit never happens" → only once the handler is attached
- "It's a client component, it can't render without JS" → in Next.js App Router a client component still SSRs its markup; in Astro only `client:only` truly doesn't
- "We'll add a `<noscript>` later" → the leak is in the markup that already shipped

## Checklist for any interactive surface

- [ ] What does this do with no script? Say it in one sentence.
- [ ] Is that behaviour DECLARED (attribute, server action, `<noscript>`) or INHERITED from a default?
- [ ] If it degrades to a network request, what does that request carry, and where does that land (history, `Referer`, access logs)?
- [ ] Is there a test that exercises the surface with `javaScriptEnabled: false`?
