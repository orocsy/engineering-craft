#!/usr/bin/env node
/**
 * GATE: server-rendered forms must declare their no-JS behaviour explicitly.
 *
 * Failure class: "no-JS degradation leak". A `<form>` written for a JS submit
 * handler is usually authored with NO `method` and NO `action`, because the
 * script intercepts `submit` and calls fetch(). The HTML default for a form with
 * no method is **GET to the current URL**, so with JS disabled/broken/blocked the
 * browser serialises every field — name, email, phone, free-text — into the query
 * string, where it lands in browser history, the `Referer` header sent to every
 * third-party asset on the destination page, and server access logs.
 *
 * The defect is INVISIBLE in review precisely because it is an ABSENCE: there is
 * no wrong attribute to notice, only a missing one. That is what makes it a gate
 * rather than a checklist item.
 *
 * Asserts, for every `<form>` in server-rendered markup:
 *   - it declares an explicit `method` (case-insensitive), AND
 *   - if that method is GET, every field name is on the allowlist (search forms
 *     are legitimately GET; PII forms are not).
 *
 * A form may opt out with `data-degradation-reviewed="<reason>"` on the tag.
 *
 * Usage: node verify-form-degradation.mjs [--dir src] [--ext .astro,.html,.vue,.svelte,.erb,.php]
 * Exit 0 = all forms declare intent. Exit 1 = at least one implicit-GET form.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const args = process.argv.slice(2);
const argOf = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const ROOTS = argOf('--dir', 'src').split(',').map((s) => s.trim()).filter(Boolean);
const EXTS = argOf('--ext', '.astro,.html,.htm,.vue,.svelte,.erb,.php,.hbs,.ejs,.twig,.jsx,.tsx').split(',');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', 'coverage', 'out']);

/**
 * Only SERVER-RENDERED markup can degrade: a form that exists in the HTML the
 * browser receives is submittable even when no script runs. A React component
 * marked `'use client'` still SSRs its markup in Next.js App Router, so it is in
 * scope; a component that only ever mounts inside an already-hydrated island is
 * not, because with JS off it never exists. Scope by directive, not by extension:
 * excluding every .tsx (the first cut here) made the gate report a clean bill of
 * health for three Next.js repos it had never actually looked at.
 */
function isClientOnlyIsland(text, file) {
  if (!/\.(t|j)sx$/.test(file)) return false;
  // `client:only` islands (Astro) never render on the server.
  return /\bclient:only\b/.test(text);
}

/** Field names for which a GET form is a legitimate design (no PII in the URL). */
const GET_SAFE_FIELDS = /^(q|query|search|s|page|sort|order|filter|lang|locale|tab|view|per_page|limit|offset)$/i;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    // Tests and mocks render forms that never reach a browser.
    else if (EXTS.includes(extname(p)) && !/\.(test|spec|stories)\.|__mocks__|__tests__/.test(p)) out.push(p);
  }
  return out;
}

/** Extract each `<form ...>` open tag with the line it starts on. */
function findForms(text) {
  const forms = [];
  const re = /<form\b([^>]*)>/gis;
  let m;
  while ((m = re.exec(text)) !== null) {
    forms.push({
      attrs: m[1],
      line: text.slice(0, m.index).split('\n').length,
      index: m.index,
    });
  }
  return forms;
}

/** Field names declared inside this form's element range (to the matching </form>). */
function fieldNamesIn(text, startIndex) {
  const end = text.toLowerCase().indexOf('</form>', startIndex);
  const body = text.slice(startIndex, end === -1 ? text.length : end);
  const names = new Set();
  for (const m of body.matchAll(/\bname\s*=\s*["'{]([^"'}]+)["'}]?/g)) names.add(m[1].trim());
  return [...names];
}

const attr = (attrs, name) => {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']?([^"'\\s>]+)`, 'i'));
  return m ? m[1] : null;
};
const hasAttr = (attrs, name) => new RegExp(`\\b${name}\\b`, 'i').test(attrs);

function main() {
  const present = ROOTS.filter((r) => existsSync(r));
  if (!present.length) { console.log(`NOT APPLICABLE — no directory at ${ROOTS.join(', ')}; nothing to gate.`); process.exit(0); }
  const files = present.flatMap((r) => walk(r));
  const failures = [];
  let checked = 0;

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    if (isClientOnlyIsland(text, file)) continue;
    for (const form of findForms(text)) {
      checked++;
      const where = `${relative(process.cwd(), file)}:${form.line}`;
      if (hasAttr(form.attrs, 'data-degradation-reviewed')) continue;

      // `method="dialog"` is a native modal-close form; it never navigates.
      const method = attr(form.attrs, 'method');
      if (method && method.toLowerCase() === 'dialog') continue;

      if (!method) {
        const jsHook = hasAttr(form.attrs, 'onSubmit') || /\bdata-[a-z-]*(endpoint|action|submit|form)\b/i.test(form.attrs);
        const fields = fieldNamesIn(text, form.index);
        const unsafe = fields.filter((f) => !GET_SAFE_FIELDS.test(f) && !f.startsWith('_'));
        failures.push({
          where,
          why:
            `<form> declares no \`method\`, so with JavaScript disabled the browser submits ` +
            `**GET to the current URL**` +
            (jsHook ? ' — and this form is wired for a JS submit handler, so that path is reachable whenever the script fails to run' : '') +
            (unsafe.length
              ? `. ${unsafe.length} field(s) would be serialised into the query string (history, Referer, access logs): ${unsafe.slice(0, 8).join(', ')}${unsafe.length > 8 ? ', …' : ''}`
              : '.'),
          fix: `add method="post" (and a server action, or a <noscript> notice), or annotate data-degradation-reviewed="<reason>"`,
        });
        continue;
      }

      if (method.toLowerCase() === 'get') {
        const fields = fieldNamesIn(text, form.index);
        const unsafe = fields.filter((f) => !GET_SAFE_FIELDS.test(f) && !f.startsWith('_'));
        if (unsafe.length) {
          failures.push({
            where,
            why: `explicit method="get" with non-search field(s) that land in the URL: ${unsafe.slice(0, 8).join(', ')}${unsafe.length > 8 ? ', …' : ''}`,
            fix: `use method="post", or annotate data-degradation-reviewed="<reason>" if these fields are genuinely non-sensitive`,
          });
        }
      }
    }
  }

  for (const f of failures) console.error(`FAIL ${f.where}\n     ${f.why}\n     fix: ${f.fix}`);
  console.log(`\nChecked ${checked} server-rendered <form> element(s) in ${files.length} file(s).`);
  if (failures.length) {
    console.error(`Form degradation gate failed (${failures.length} form(s) fall back to GET).`);
    process.exit(1);
  }
  console.log('Form degradation gate passed.');
}

main();
