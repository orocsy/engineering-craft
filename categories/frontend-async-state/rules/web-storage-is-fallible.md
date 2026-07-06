---
title: Web Storage Access Is Fallible — Embedded Webviews Throw, So Guard and Fail Toward the Safe Behaviour
maturity: verified
impact: HIGH
impact-description: |
  In-app webviews (WeChat, Instagram, some privacy modes) can deny Web Storage
  so that window.sessionStorage ACCESS ITSELF throws SecurityError. An
  unguarded read inside a mount effect crashed the effect and suppressed an
  "open in browser" guide — for exactly the webview users the guide existed
  to help. The failure disables the feature precisely in its target
  environment.
tags: sessionStorage, localStorage, webview, wechat, frontend, resilience
applies-to: |
  Any direct window.sessionStorage / window.localStorage access in code that
  can run inside an embedded webview or strict-privacy browser context —
  especially features TARGETED at webview users.
related-rules:
  - orphan-promise-and-stale-closure
historical-incidents:
  - a real incident: an unguarded sessionStorage read in a mount effect threw SecurityError inside the in-app webview, crashing the effect and hiding the open-in-browser guide from the exact users it targeted
---

## The trap

Web Storage failures come in two shapes, and most code guards only the first:

1. Quota/write errors (`setItem` throws) — commonly known.
2. **Access errors — `window.sessionStorage` GETTER throws** (SecurityError)
   when the embedding context denies storage. No property read survives; even
   `typeof window.sessionStorage` can throw in some engines.

The cruel irony pattern: features built FOR webview users (open-in-browser
guides, in-app warnings) are the code most likely to run where storage is
blocked — an unguarded read disables the feature exactly where it matters.

## The rule

Wrap every read/write in a helper, and choose the fallback by asking "which
default is SAFE when storage is unavailable?" — for a dismissible guide,
blocked read = "not dismissed" (SHOW the guide); blocked write = remember the
dismissal in memory for this mount only.

```ts
function readGuideDismissed(): boolean {
  try { return window.sessionStorage.getItem(KEY) === '1'; }
  catch { return false; }            // can't read → show the guide (safe default)
}
function persistGuideDismissed(): void {
  try { window.sessionStorage.setItem(KEY, '1'); }
  catch { /* in-memory dismissal only — acceptable degradation */ }
}
```

## Tests

Both storage-blocked paths deserve explicit cases:
- Getter throws on read → component renders as "not dismissed".
- Write throws on dismiss → component stays dismissed for the mount, no crash.

## Anti-patterns

- `if (typeof window !== 'undefined') sessionStorage.getItem(...)` — SSR-safe
  but not webview-safe; the getter still throws.
- Guarding writes but not reads.
- Picking the fallback mechanically instead of by safety direction — a blocked
  read of "user consented?" must default to NOT consented; a blocked read of
  "guide dismissed?" must default to NOT dismissed. Same helper shape,
  opposite defaults, chosen per feature.
