#!/usr/bin/env node
/**
 * GATE: a skipped test must be an explicit, dated, justified decision.
 *
 * Failure class: "skip-instead-of-fail". A suite reports green in three different
 * ways, and only one of them means the code works:
 *   1. the test ran and passed              → coverage
 *   2. the test was hard-disabled           → NO coverage, reads as green
 *   3. the test skipped on a missing        → NO coverage, reads as green, and
 *      precondition (env var, seeded row)     the skip is MORE likely exactly when
 *                                             the environment is broken
 *
 * (3) is the dangerous one: `test.skip(!seedOk, 'account unavailable')` turns "the
 * seeded member account is gone" — a real regression — into a silent pass. The
 * precondition a CI job is SUPPOSED to provide must be an assertion, not a skip.
 *
 * Asserts, for every skip in the suite:
 *   - Hard skips (`test.skip('name', fn)`, `describe.skip`) carry an annotation
 *     comment `@skip-until YYYY-MM-DD — reason` within LOOKBACK lines above, and
 *     the date has not passed.
 *   - Conditional skips (`test.skip(cond, 'msg')`) whose condition reads an env
 *     var listed in `ciProvidedEnv` FAIL: in an environment that is meant to
 *     supply it, absence is a failure, not a reason to skip.
 *   - Every other conditional skip must carry `@skip-when <reason>`.
 *
 * Usage: node verify-skip-policy.mjs [--dir tests] [--config skip-policy.json] [--today YYYY-MM-DD]
 * Config: { "ciProvidedEnv": ["E2E_ADMIN_PASSWORD"], "lookback": 6 }
 * Exit 0 = every skip is an explicit decision. Exit 1 = at least one silent skip.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const args = process.argv.slice(2);
const argOf = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const ROOT = argOf('--dir', 'tests');
const CONFIG_PATH = argOf('--config', '');
const config = CONFIG_PATH && existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) : {};
const CI_PROVIDED_ENV = config.ciProvidedEnv ?? [];
const LOOKBACK = config.lookback ?? 6;
const TODAY = argOf('--today', new Date().toISOString().slice(0, 10));

const EXTS = ['.ts', '.tsx', '.js', '.mjs', '.jsx'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXTS.includes(extname(p))) out.push(p);
  }
  return out;
}

const SKIP_RE = /\b(?:test|it|describe|suite)\s*\.\s*(skip|fixme|todo)\s*\(/;

/** Read the balanced argument list starting at the '(' index. */
function readArgs(text, openParen) {
  let depth = 0, i = openParen, inStr = null, out = '';
  for (; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (c === inStr && text[i - 1] !== '\\') inStr = null; out += c; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; out += c; continue; }
    if (c === '(') { depth++; if (depth === 1) continue; }
    if (c === ')') { depth--; if (depth === 0) break; }
    out += c;
  }
  return out;
}

/** First argument of a call, split at top level. */
function firstArg(argsText) {
  let depth = 0, inStr = null;
  for (let i = 0; i < argsText.length; i++) {
    const c = argsText[i];
    if (inStr) { if (c === inStr && argsText[i - 1] !== '\\') inStr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) return argsText.slice(0, i).trim();
  }
  return argsText.trim();
}

const isStringLiteral = (s) => /^(['"`]).*\1$/s.test(s.trim());

function main() {
  if (!existsSync(ROOT)) { console.error(`No directory at ${ROOT}`); process.exit(1); }
  const files = walk(ROOT);
  const failures = [];
  let total = 0;

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');

    // Exact byte offset of each line start. Computed once rather than by
    // re-joining a slice per hit: an off-by-one here would make the parser read a
    // DIFFERENT call's arguments and classify the wrong skip — the same
    // wrong-match defect this suite exists to catch.
    const lineStart = new Array(lines.length);
    for (let i = 0, acc = 0; i < lines.length; i++) { lineStart[i] = acc; acc += lines[i].length + 1; }

    for (let ln = 0; ln < lines.length; ln++) {
      const m = lines[ln].match(SKIP_RE);
      if (!m) continue;
      total++;

      const absIndex = lineStart[ln] + lines[ln].indexOf(m[0]);
      const openParen = text.indexOf('(', absIndex);
      const argsText = readArgs(text, openParen);
      const arg0 = firstArg(argsText);
      const context = lines.slice(Math.max(0, ln - LOOKBACK), ln).join('\n');
      const where = `${relative(process.cwd(), file)}:${ln + 1}`;

      if (isStringLiteral(arg0)) {
        // Hard skip — the test is disabled outright.
        const until = context.match(/@skip-until\s+(\d{4}-\d{2}-\d{2})/);
        if (!until) {
          failures.push({
            where,
            why: `hard-disabled test ${arg0.slice(0, 60)} — permanently green with zero coverage and no expiry`,
            fix: `add a comment above: // @skip-until YYYY-MM-DD — <why it cannot run yet, and what re-enables it>`,
          });
        } else if (until[1] < TODAY) {
          failures.push({
            where,
            why: `@skip-until ${until[1]} has passed (today ${TODAY}) — the skip outlived its justification`,
            fix: `re-enable the test, or move the date with a fresh reason`,
          });
        }
        continue;
      }

      // Conditional skip — the dangerous shape.
      const envsRead = [...arg0.matchAll(/process\.env\.([A-Z0-9_]+)|env\.([A-Za-z0-9_]+)|\b([A-Z][A-Z0-9_]{3,})\b/g)]
        .map((x) => x[1] || x[2] || x[3])
        .filter(Boolean);
      const ciProvided = envsRead.filter((e) => CI_PROVIDED_ENV.includes(e));

      if (ciProvided.length) {
        failures.push({
          where,
          why:
            `conditional skip on [${ciProvided.join(', ')}], which CI is configured to provide. ` +
            `In the job that supplies it, a missing value is a BROKEN ENVIRONMENT, and this turns it into a silent pass`,
          fix: `assert the precondition instead (fail with a clear message when it is absent in CI), and keep the skip only for local runs`,
        });
        continue;
      }

      if (!/@skip-when\b/.test(context)) {
        failures.push({
          where,
          why:
            `conditional skip \`${arg0.replace(/\s+/g, ' ').slice(0, 80)}\` with no @skip-when annotation — ` +
            `when the predicate is true the suite reports green with no coverage, and nothing records that this is intended`,
          fix: `add a comment above: // @skip-when <the environment in which absence is legitimate, and what covers it instead>`,
        });
      }
    }
  }

  for (const f of failures) console.error(`FAIL ${f.where}\n     ${f.why}\n     fix: ${f.fix}`);
  console.log(`\nChecked ${total} skip site(s) across ${files.length} spec file(s).`);
  if (failures.length) {
    console.error(`Skip-policy gate failed (${failures.length} unjustified skip(s)).`);
    process.exit(1);
  }
  console.log('Skip-policy gate passed.');
}

main();
