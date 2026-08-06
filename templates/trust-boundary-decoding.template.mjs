#!/usr/bin/env node
/**
 * GATE: data crossing a trust boundary is PARSED, never CAST.
 *
 * Failure class: "unvalidated trust-boundary decoding". `const x = await res.json()
 * as Shape` compiles, reads as typed, and is a lie: `as` is an assertion to the
 * compiler, not a check at runtime. Every downstream line then treats unvalidated
 * remote bytes as a known shape, and the first symptom is a `TypeError` on a
 * field the server stopped sending — surfacing far from the boundary that let it
 * in, in a stack that names the consumer rather than the source.
 *
 * The same shape appears for `JSON.parse(...) as T`, `localStorage.getItem() as T`,
 * and `process.env.X as SomeUnion`.
 *
 * Asserts: no `as <Type>` (other than `as unknown`, `as const`, `as any` — which is
 * at least honest, and caught by a different lint) is applied directly to the
 * result of a boundary-crossing expression.
 *
 * Opt out with `// @unvalidated-ok: <reason>` on the line or the line above.
 *
 * Usage: node verify-trust-boundary-decoding.mjs [--dir src] [--config boundaries.json]
 * Exit 0 = every boundary decode is validated. Exit 1 = at least one cast.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const args = process.argv.slice(2);
const argOf = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const ROOTS = argOf('--dir', 'src').split(',');
const CONFIG_PATH = argOf('--config', '');
const config = CONFIG_PATH && existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) : {};

/** Expressions that yield data from outside this program's trust boundary. */
const BOUNDARY_SOURCES = config.boundarySources ?? [
  '\\.json\\s*\\(\\s*\\)',            // fetch/Response .json()
  'JSON\\.parse\\s*\\(',
  '\\.text\\s*\\(\\s*\\)',
  'localStorage\\.getItem\\s*\\(',
  'sessionStorage\\.getItem\\s*\\(',
  'readFileSync\\s*\\([^)]*utf8',
];

const EXTS = ['.ts', '.tsx'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', 'coverage']);
const SKIP_FILE_RE = config.skipFilePattern ? new RegExp(config.skipFilePattern) : /\.(test|spec)\.tsx?$/;

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXTS.includes(extname(p)) && !SKIP_FILE_RE.test(p)) out.push(p);
  }
  return out;
}

/**
 * `as X` applied to a boundary expression, allowing an arbitrary number of
 * balanced parens/brackets between the source call and the assertion:
 *   (await res.json()) as Body
 *   JSON.parse(raw) as Config
 * `as unknown`, `as const` and `as any` are excluded: the first is the CORRECT
 * first step (unknown forces a parse before use), the others are separately linted.
 */
const ASSERTION_RE = new RegExp(
  `(?:${BOUNDARY_SOURCES.join('|')})[\\s\\S]{0,80}?\\bas\\s+(?!unknown\\b|const\\b|any\\b)([A-Za-z_$][\\w$.<>\\[\\]| ]*)`,
);

function main() {
  const files = ROOTS.filter(existsSync).flatMap((r) => walk(r));
  if (!files.length) { console.error(`No .ts/.tsx files under ${ROOTS.join(', ')}`); process.exit(1); }

  const failures = [];
  let scanned = 0;

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    // Scan the whole file once and locate each hit by absolute offset, so the
    // reported line is the line the ASSERTION is on. A sliding two-line window
    // reported the line the window STARTED on, which pointed the reader at a
    // neighbouring statement — a probe that names the wrong location is the same
    // wrong-subject defect this suite exists to catch.
    const globalRe = new RegExp(ASSERTION_RE.source, 'g');
    let m;
    while ((m = globalRe.exec(text)) !== null) {
      const asOffset = m.index + m[0].lastIndexOf('as ');
      const i = text.slice(0, asOffset).split('\n').length - 1;
      scanned++;
      const near = `${lines[i - 1] ?? ''}\n${lines[i]}`;
      if (/@unvalidated-ok/.test(near)) continue;

      failures.push({
        where: `${relative(process.cwd(), file)}:${i + 1}`,
        why:
          `remote/stored data is CAST to \`${m[1].trim()}\` rather than parsed. \`as\` is erased at build time, so nothing ` +
          `checks the value at runtime: if the producer drops or renames a field, the failure surfaces later, in a consumer, ` +
          `as a TypeError on a value the types promised was present.`,
        fix: `decode into \`unknown\` and validate at the boundary (zod/valibot schema, or a hand-written type guard) — or annotate // @unvalidated-ok: <reason>`,
        snippet: lines[i].trim().slice(0, 120),
      });
    }
  }

  for (const f of failures) console.error(`FAIL ${f.where}\n     ${f.snippet}\n     ${f.why}\n     fix: ${f.fix}`);
  console.log(`\nScanned ${files.length} file(s); ${scanned} boundary decode(s) with a type assertion.`);
  if (failures.length) {
    console.error(`Trust-boundary decoding gate failed (${failures.length} unvalidated cast(s)).`);
    process.exit(1);
  }
  console.log('Trust-boundary decoding gate passed.');
}

main();
