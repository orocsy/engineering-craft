#!/usr/bin/env node
/**
 * META-GATE: prove that each contract probe actually detects the defect it claims to.
 *
 * Failure class: "probe asserts the wrong thing". A contract probe that greps a
 * whole FILE for a token cannot distinguish "the call site under test uses POST"
 * from "some other call site in the same file uses POST". It reports PASS for a
 * reason unrelated to its own claim — and because it is green, it is trusted more
 * than an absent check would be. A wrong probe is worse than no probe.
 *
 * The only way to know a probe works is to BREAK the thing it guards and watch it
 * fail. This harness does that: for each (probe, mutation) pair it applies the
 * mutation to a scratch copy, runs the probe, and requires a NON-ZERO exit.
 *
 * The mutations that matter are not "delete the line" — every probe catches that.
 * They are DECOY mutations: move the token the probe greps for to a different call
 * site while breaking the real one. That is the exact shape of the historical bug.
 *
 * Config (JSON):
 * {
 *   "probes": [{
 *     "name": "cloudbase-sdk-contract",
 *     "command": "node scripts/verify-cloudbase-sdk-contract.mjs",
 *     "mutations": [{
 *       "name": "upload verb flipped to PUT, decoy POST added elsewhere",
 *       "file": "packages/media-storage/src/cloudbase.ts",
 *       "edits": [
 *         { "find": "method: 'POST',", "replace": "method: 'PUT',", "count": 1 },
 *         { "find": "async deleteObject(", "replace": "/* method: 'POST' *\/ async deleteObject(", "count": 1 }
 *       ]
 *     }]
 *   }]
 * }
 *
 * Usage: node verify-probe-sensitivity.mjs --config probe-sensitivity.json [--repo .]
 * Exit 0 = every probe detected every mutation. Exit 1 = a probe is blind.
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const args = process.argv.slice(2);
const argOf = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const CONFIG_PATH = argOf('--config', 'probe-sensitivity.json');
const REPO = argOf('--repo', process.cwd());

if (!existsSync(CONFIG_PATH)) {
  console.log(`NOT APPLICABLE — no config at ${CONFIG_PATH}; no probes are registered for mutation testing. Nothing to gate.`);
  process.exit(0);
}
const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

function runProbe(command) {
  try {
    execSync(command, { cwd: REPO, stdio: 'pipe', encoding: 'utf8' });
    return { exitCode: 0 };
  } catch (e) {
    return { exitCode: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/** Apply the edits, returning false when a `find` did not match (a stale mutation). */
function applyEdits(absPath, edits) {
  let text = readFileSync(absPath, 'utf8');
  for (const edit of edits) {
    const occurrences = text.split(edit.find).length - 1;
    const expected = edit.count ?? 1;
    if (occurrences < expected) {
      return { ok: false, reason: `mutation is stale: found ${occurrences} occurrence(s) of ${JSON.stringify(edit.find)}, expected at least ${expected}` };
    }
    let done = 0;
    text = text.split(edit.find).map((part, i, arr) => (i < arr.length - 1 && done++ < expected ? part + edit.replace : part)).join('');
  }
  writeFileSync(absPath, text);
  return { ok: true };
}

function main() {
  const failures = [];
  const passes = [];

  for (const probe of config.probes ?? []) {
    // A probe that is already red tells us nothing about its sensitivity.
    const baseline = runProbe(probe.command);
    if (baseline.exitCode !== 0) {
      failures.push({
        where: probe.name,
        why: `baseline run is already failing (exit ${baseline.exitCode}) — sensitivity cannot be measured until the probe is green on unmutated source`,
      });
      continue;
    }

    for (const mutation of probe.mutations ?? []) {
      const abs = join(REPO, mutation.file);
      if (!existsSync(abs)) {
        failures.push({ where: `${probe.name} / ${mutation.name}`, why: `target file ${mutation.file} does not exist — the mutation no longer describes this repo` });
        continue;
      }
      const backup = `${abs}.probe-sensitivity.bak`;
      copyFileSync(abs, backup);
      try {
        const applied = applyEdits(abs, mutation.edits);
        if (!applied.ok) {
          failures.push({ where: `${probe.name} / ${mutation.name}`, why: applied.reason });
          continue;
        }
        const mutated = runProbe(probe.command);
        if (mutated.exitCode === 0) {
          failures.push({
            where: `${probe.name} / ${mutation.name}`,
            why:
              `the probe still PASSED with the defect injected. It is reporting green for a reason unrelated to its claim — ` +
              `most often a whole-file substring match satisfied by a DIFFERENT call site. Anchor the assertion to the ` +
              `specific construct (extract the function/among the request under test) and re-run.`,
          });
        } else {
          passes.push(`${probe.name} / ${mutation.name} — detected (exit ${mutated.exitCode})`);
        }
      } finally {
        copyFileSync(backup, abs);
        rmSync(backup, { force: true });
      }
    }
  }

  for (const p of passes) console.log(`PASS ${p}`);
  for (const f of failures) console.error(`FAIL ${f.where}\n     ${f.why}`);

  if (!passes.length && !failures.length) {
    console.error('No probes configured — every contract probe should have at least one decoy mutation.');
    process.exit(1);
  }
  if (failures.length) {
    console.error(`\nProbe-sensitivity gate failed (${failures.length} blind probe(s)).`);
    process.exit(1);
  }
  console.log('\nProbe-sensitivity gate passed — every probe failed on its injected defect.');
}

main();
