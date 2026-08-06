#!/usr/bin/env node
/**
 * GATE: a controlled input that does async work must expose that work upward.
 *
 * Failure class: "parent-child async coordination". The controlled-input contract
 * — `{ value, onChange }` — was designed for SYNCHRONOUS edits: the parent hands
 * down a value, the child hands back the next one, and at every instant the
 * parent's copy is the truth. A child that performs async work (upload, geocode,
 * validate-remote) breaks that invariant: between "user acted" and "onChange
 * fired" there is a THIRD state — in flight — that the contract has no channel
 * for. The parent's Save button therefore cannot know it should wait, and commits
 * a snapshot that silently omits whatever had not resolved yet.
 *
 * The parent is not obviously wrong (its own `submitting` flag is handled), and
 * the child is not obviously wrong (it does resolve, eventually). Only the SEAM
 * is wrong, which is why it survives review of either file alone.
 *
 * Asserts, for every component whose props include a `value`+`onChange` pair:
 *   if its body performs async work (await / .then / async handler), it must also
 *   declare a busy channel — a prop matching BUSY_PROP_RE (`busy`, `pending`,
 *   `onBusyChange`, `onPendingChange`, `isUploading`, …).
 *
 * Opt out with `// @async-child-reviewed: <reason>` above the component.
 *
 * Usage: node verify-async-child-busy-contract.mjs [--dir src] [--config busy.json]
 * Exit 0 = every async controlled input reports busy. Exit 1 = a silent one exists.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const args = process.argv.slice(2);
const argOf = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const ROOT = argOf('--dir', 'src');
const CONFIG_PATH = argOf('--config', '');
const config = CONFIG_PATH && existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) : {};

const BUSY_PROP_RE = new RegExp(
  config.busyPropPattern ?? '\\b(busy|pending|inFlight|isUploading|uploading|loading|onBusy|onPending|onInFlight|onBusyChange|onPendingChange)\\b',
  'i',
);
const EXTS = ['.tsx', '.jsx', '.vue', '.svelte'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', 'coverage']);

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXTS.includes(extname(p)) && !/\.(test|spec)\./.test(p)) out.push(p);
  }
  return out;
}

/** Read a balanced block starting at the opening delimiter index. */
function readBlock(text, openIdx, open, close) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) { depth--; if (depth === 0) return text.slice(openIdx, i + 1); }
  }
  return text.slice(openIdx);
}

/**
 * Find prop-type declarations: `interface Props {...}`, `type Props = {...}`, and
 * inline destructured params `({ value, onChange }: {...})`.
 */
function findPropShapes(text) {
  const shapes = [];
  for (const m of text.matchAll(/\b(?:interface|type)\s+([A-Za-z0-9_]*Props[A-Za-z0-9_]*)\s*(?:=\s*)?\{/g)) {
    const open = text.indexOf('{', m.index + m[0].length - 1);
    shapes.push({ name: m[1], body: readBlock(text, open, '{', '}'), index: m.index });
  }
  return shapes;
}

/** Does this text perform asynchronous work (not counting type positions)? */
function hasAsyncWork(text) {
  return /\bawait\s+/.test(text) || /\.then\s*\(/.test(text) || /\basync\s*(?:function|\()/.test(text);
}

/** The component function that consumes a given Props type. */
function componentUsing(text, propsName) {
  const re = new RegExp(`(?:function|const)\\s+([A-Z][A-Za-z0-9_]*)[^\\n]*?:\\s*${propsName}\\b`, 's');
  const m = text.match(re);
  return m ? m[1] : null;
}

function main() {
  if (!existsSync(ROOT)) { console.error(`No directory at ${ROOT}`); process.exit(1); }
  const files = walk(ROOT);
  const failures = [];
  let checked = 0;

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    if (/@async-child-reviewed/.test(text)) continue;

    for (const shape of findPropShapes(text)) {
      const hasValue = /(^|[\s{;,])value\s*[?:]/m.test(shape.body);
      const hasOnChange = /(^|[\s{;,])on[A-Z][A-Za-z0-9_]*\s*[?:]\s*\(/m.test(shape.body);
      if (!hasValue || !hasOnChange) continue;

      checked++;
      if (BUSY_PROP_RE.test(shape.body)) continue;
      if (!hasAsyncWork(text)) continue;

      const line = text.slice(0, shape.index).split('\n').length;
      const comp = componentUsing(text, shape.name) ?? '(component)';
      const awaited = [...text.matchAll(/\bawait\s+([A-Za-z0-9_.]+)\s*\(/g)].map((x) => x[1]);
      const uniqueAwaited = [...new Set(awaited)].slice(0, 4);

      failures.push({
        where: `${relative(process.cwd(), file)}:${line}`,
        why:
          `\`${shape.name}\` is a controlled-input contract (value + onChange) with no busy channel, but ${comp} performs ` +
          `async work${uniqueAwaited.length ? ` (awaits ${uniqueAwaited.join(', ')})` : ''}. A parent can only see values that have ` +
          `ALREADY resolved, so a Save issued while work is in flight commits a partial value and reports success.`,
        fix:
          `add a busy channel to ${shape.name} (e.g. \`onBusyChange?: (busy: boolean) => void\`), drive it from the in-flight ` +
          `set, and gate the parent's submit control on it — plus a test that starts an unresolved operation and asserts Save is disabled`,
      });
    }
  }

  for (const f of failures) console.error(`FAIL ${f.where}\n     ${f.why}\n     fix: ${f.fix}`);
  console.log(`\nChecked ${checked} controlled-input component(s) across ${files.length} file(s).`);
  if (failures.length) {
    console.error(`Async-child busy-contract gate failed (${failures.length} component(s) hide in-flight work).`);
    process.exit(1);
  }
  console.log('Async-child busy-contract gate passed.');
}

main();
