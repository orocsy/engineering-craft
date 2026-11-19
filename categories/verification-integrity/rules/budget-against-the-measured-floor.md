---
title: Set a Bundle Budget Against the Measured Framework Floor, and Measure the Right Scripts
last-referenced: 2026-11-12
maturity: draft
type: pattern
impact: MEDIUM
impact-description: |
  A spec set first-load JavaScript for a home page at 120 kB gzip. Measured: React 19 and
  Next 16 alone were about 132 kB, and the site's own code was one 10.5 kB chunk. The
  planned fix (lazy-load a dialog) would have saved 2–3 kB, so the target could never be
  met. A first enforcement test then reported 168 kB because it counted route prefetches
  fetched after the load event; the build also listed a 38.5 kB polyfill chunk that
  carries `noModule`, so modern browsers never download it.
tags: performance, bundle, budget, javascript, nextjs, prefetch, noModule, lighthouse
applies-to: |
  Setting, chasing or enforcing a JavaScript (or CSS, image) size budget.
related-rules:
  - probe-must-fail-on-injected-defect
historical-incidents:
  - a real incident (November 2026): an unreachable 120 kB first-load budget; first measurement counted prefetches
---

## The lesson

A budget below what the framework itself ships is a check that can never pass; teams then
"optimise" the few kilobytes they own and conclude the budget is noise. Measure an empty page
on the same framework first, budget the app's own code on top of that floor, and enforce the
total in CI. Measure the right population: first-load JS is the module scripts the HTML names.
`noModule` polyfills never load in a modern browser, and prefetches fetched after load are for
the next navigation.

## The fix

```ts
// ❌ Wrong: counts everything that arrives before network idle (includes prefetches)
page.on("response", (r) => r.request().resourceType() === "script" && sizes.push(gz(await r.body())));
await page.goto("/"); await page.waitForLoadState("networkidle");

// ✅ Right: the module scripts the page itself names, gzipped
const html = await (await page.request.get("/")).text();
const srcs = [...html.matchAll(/<script\b(?![^>]*\bnoModule)[^>]*\bsrc="([^"]+\.js)"/g)].map((m) => m[1]);
const total = (await Promise.all(srcs.map(async (s) => gzipSync(await (await page.request.get(s)).body()).length))).reduce((a, b) => a + b, 0);
expect(total / 1024).toBeLessThanOrEqual(BUDGET_KB); // floor + the app's own allowance
```

Pair it with a check that the expensive thing (a payment SDK, a chart library) never loads on
that page at all.
