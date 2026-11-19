---
title: A Form With No `method` Puts Every Field In the URL When the Script Does Not Run
last-referenced: 2026-08-06
maturity: proven
type: guideline
impact: HIGH
impact-description: |
  HTML's default for a form with no `method` is GET to the current URL. A form authored for
  a JS submit handler is routinely written with no `method` and no `action` — so whenever
  the script fails to run, the browser serialises every field into the query string, where
  it lands in browser history, the `Referer` header sent to third-party assets on the
  destination page, and server access logs.
tags: html, forms, pii, progressive-enhancement, no-js, security, ssr
applies-to: |
  Every `<form>` that reaches the browser as server-rendered markup — `.astro`, `.erb`,
  `.php`, templates, and React/Vue/Svelte components that SSR (including Next.js App Router
  client components, which still render their markup on the server).
related-rules:
  - parse-dont-cast-at-trust-boundaries
  - pii-scrubbing-defense-in-depth
historical-incidents:
  - a real review round: a public enquiry form (name, company, email, phone, free text) had
    `data-endpoint` and no `method`, so the no-JS path was a GET carrying every field
  - a sweep across four repos: 31 of 31 server-rendered forms declared no method, including
    an admin sign-in and a forgot-password form — a no-JS login attempt would place the
    password in the URL
---

## Why it survives review

The defect is an **absence**. There is no wrong attribute to notice — only a missing one,
in a tag that looks complete:

```jsx
// ❌ Reads as finished. Submits GET with everything in the query string when JS is off.
<form onSubmit={handleSubmit} noValidate>
  <input name="email" /><input name="phone" /><textarea name="message" />
</form>
```

```html
<!-- ❌ Same defect, server-rendered. The script attaches by data attribute. -->
<form data-project-form data-endpoint={action} novalidate>
```

Reviewers check what the diff says. Nobody reviews the default the browser will apply.

"JS is disabled" sounds like a rare, theoretical user — but the reachable set is much
wider: the bundle 404s after a bad deploy, a CSP change blocks the script, an extension or
corporate proxy strips it, the CDN serves a stale chunk, or hydration throws before the
handler attaches. In every one of those states the markup is live and submittable.

## Correct

```jsx
// ✅ Declare the degraded behaviour. POST at minimum; a real server action is better.
<form method="post" action="/api/enquiry" onSubmit={handleSubmit} noValidate>
```

Three acceptable resolutions, in descending order of quality:

1. **Progressive enhancement** — `method="post"` plus a server handler at `action`, and the
   JS handler calls `preventDefault()`. The form works with and without script.
2. **`method="post"` alone** — the no-JS submit fails visibly (405/404) instead of silently
   leaking. Pair with a `<noscript>` telling the user what to do.
3. **A recorded exception** — `data-degradation-reviewed="<reason>"` for a form that
   genuinely cannot be reached without script and carries nothing sensitive.

What is never acceptable is leaving the decision to the HTML default.

## The general form

> For every interactive surface, name the state it is in when the JavaScript has not run,
> and decide what it does there. The platform's default is a decision someone made in 1995
> about a different web; inheriting it silently is not a design.

This generalises past forms: links that only work via a click handler, `<dialog>` fallbacks,
anchors with `href="#"`, and buttons outside a form that do nothing without script.

## Tests

```typescript
test('the enquiry form does not submit via GET with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  await page.fill('[name=email]', 'a@example.com');
  const [request] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/enquiry') || r.method() === 'GET'),
    page.click('button[type=submit]'),
  ]);
  expect(request.method()).toBe('POST');
  expect(request.url()).not.toContain('a%40example.com');   // ← the actual leak assertion
});
```

## Executable gate

[`form-degradation.template.mjs`](../../../templates/form-degradation.template.mjs) — fails on
any server-rendered `<form>` with no explicit `method`, and on `method="get"` forms carrying
fields outside a search-parameter allowlist. Scope by rendering directive rather than file
extension: a first cut that excluded every `.tsx` reported a clean bill of health for three
Next.js repos it had never actually looked at.

## See also

- [pii-scrubbing-defense-in-depth](../../observability/rules/pii-scrubbing-defense-in-depth.md) — the same data, one layer down
