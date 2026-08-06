#!/usr/bin/env node
/**
 * GATE: every dispatchable action declares, in a registry, whether it needs a
 *       single-winner claim — and if it does, the code must actually have one.
 *
 * Failure class: "atomic state transition missing on a sibling of a path that has
 * one". The concurrency rule was known; a sibling action in the SAME FILE already
 * implemented the CAS claim correctly; the new action shipped without one anyway.
 *
 * Why the existing defense missed it: every prose rule and review checklist is
 * consulted against THE DIFF. A rule triggered by field-name vocabulary
 * (`consumedAt`, `usedAt`, `spent`) cannot fire on a handler whose one-shot
 * transition is spelled `status: pending -> active`, and a rule consulted only for
 * newly-written lines never re-examines the surface the new code joins.
 *
 * The cure is an EXHAUSTIVE REGISTRY rather than a diff-scoped question. This gate
 * enumerates every action the dispatcher can route to — inherited ones included —
 * and requires each to be classified. Adding an action without classifying it
 * breaks the build; classifying it as claimed without writing a claim breaks the
 * build. Nobody has to remember to ask.
 *
 * Config (JSON):
 * {
 *   "dispatcher": { "file": "apps/functions/admin/src/handler.ts",
 *                   "casePattern": "case '([A-Za-z0-9_]+)':" },
 *   "registry":   "apps/functions/admin/src/action-claims.json",
 *   "claimPrimitives": ["incrementField(", "updateMany({", "FOR UPDATE"]
 * }
 *
 * Registry shape:
 * { "claimed":   { "completeUpload": "incrementField(images, completeClaim)" },
 *   "unclaimed": { "listImages": "read-only" } }
 *
 * Usage: node verify-mutation-claim-registry.mjs --config claim-registry.json
 * Exit 0 = every action classified and every claimed action has a claim.
 */
import { readFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const argOf = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const CONFIG_PATH = argOf('--config', 'claim-registry.json');
if (!existsSync(CONFIG_PATH)) {
  console.log(`NOT APPLICABLE — no config at ${CONFIG_PATH}; this repo has not adopted the family registry. Nothing to gate.`);
  process.exit(0);
}
const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

const CLAIM_PRIMITIVES = config.claimPrimitives ?? ['incrementField(', 'updateMany(', 'FOR UPDATE'];

/** Body of a named function declaration, or null. */
function functionBody(text, fnName) {
  const declIdx = text.search(new RegExp(`(?:async\\s+)?function\\s+${fnName}\\s*\\(`));
  if (declIdx === -1) return null;
  const open = text.indexOf('{', declIdx);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) return text.slice(open, i + 1); }
  }
  return text.slice(open);
}

/**
 * Body of the function a `case 'x': ... xAction(...)` routes to, PLUS the bodies of
 * the functions it calls, to CALL_DEPTH levels.
 *
 * Without the transitive walk this gate would report "no claim" for any handler
 * that delegates its CAS to a helper — a false accusation, and the same
 * wrong-scope mistake the gate exists to prevent. The depth is bounded and the
 * reach is reported, so a reader can see exactly what was searched.
 */
function handlerBodyFor(text, action, callDepth = 2) {
  const routed = text.match(new RegExp(`case\\s+['"]${action}['"]\\s*:[\\s\\S]{0,200}?([A-Za-z0-9_]+)\\s*\\(`));
  const fnName = routed?.[1];
  if (!fnName) return null;
  const root = functionBody(text, fnName);
  if (root === null) return null;

  const seen = new Set([fnName]);
  let frontier = [root];
  let combined = root;
  for (let d = 0; d < callDepth; d++) {
    const next = [];
    for (const body of frontier) {
      for (const m of body.matchAll(/\b([a-z][A-Za-z0-9_]*)\s*\(/g)) {
        const callee = m[1];
        if (seen.has(callee)) continue;
        const calleeBody = functionBody(text, callee);
        if (calleeBody === null) continue;
        seen.add(callee);
        next.push(calleeBody);
        combined += `\n${calleeBody}`;
      }
    }
    if (!next.length) break;
    frontier = next;
  }
  return { fnName, body: combined, reached: [...seen] };
}

function main() {
  const dispatcherPath = config.dispatcher?.file;
  if (!dispatcherPath || !existsSync(dispatcherPath)) {
    console.error(`Dispatcher file not found: ${dispatcherPath}`);
    process.exit(1);
  }
  const text = readFileSync(dispatcherPath, 'utf8');
  const caseRe = new RegExp(config.dispatcher.casePattern ?? "case '([A-Za-z0-9_]+)':", 'g');
  const actions = [...new Set([...text.matchAll(caseRe)].map((m) => m[1]))];

  if (!existsSync(config.registry)) {
    console.error(`FAIL registry missing: ${config.registry}`);
    console.error(`     ${actions.length} dispatchable action(s) exist with no concurrency classification at all.`);
    console.error(`     Create it with every action under "claimed" or "unclaimed": ${actions.join(', ')}`);
    process.exit(1);
  }
  const registry = JSON.parse(readFileSync(config.registry, 'utf8'));
  const claimed = registry.claimed ?? {};
  const unclaimed = registry.unclaimed ?? {};

  const failures = [];

  for (const action of actions) {
    const inClaimed = Object.hasOwn(claimed, action);
    const inUnclaimed = Object.hasOwn(unclaimed, action);

    if (!inClaimed && !inUnclaimed) {
      failures.push({
        where: `${dispatcherPath} → ${action}`,
        why:
          `dispatchable action is not classified in ${config.registry}. Two concurrent callers can reach it; ` +
          `nothing on record says whether that is safe.`,
        fix: `add "${action}" to "claimed" (with the primitive that makes it single-winner) or to "unclaimed" (with why concurrency is harmless)`,
      });
      continue;
    }
    if (inClaimed && inUnclaimed) {
      failures.push({ where: `${dispatcherPath} → ${action}`, why: `classified as BOTH claimed and unclaimed`, fix: `pick one` });
      continue;
    }
    if (inClaimed) {
      const handler = handlerBodyFor(text, action);
      if (!handler) {
        failures.push({ where: `${dispatcherPath} → ${action}`, why: `declared claimed but its handler function could not be located`, fix: `check the dispatcher pattern in the config` });
        continue;
      }
      const hasPrimitive = CLAIM_PRIMITIVES.some((p) => handler.body.includes(p));
      if (!hasPrimitive) {
        failures.push({
          where: `${dispatcherPath} → ${action} (${handler.fnName})`,
          why:
            `registry declares a single-winner claim, but none of [${CLAIM_PRIMITIVES.join(', ')}] appears anywhere in ` +
            `${handler.reached.length} function(s) reachable from the handler (${handler.reached.slice(0, 6).join(', ')}${handler.reached.length > 6 ? ', …' : ''}). ` +
            `The registry is documentation that has drifted from the code — the worst state, because it reads as verified.`,
          fix: `implement the atomic claim, or move the action to "unclaimed" with an honest reason`,
        });
      }
    }
  }

  // Registry entries for actions that no longer exist: stale docs are a finding too.
  for (const stale of [...Object.keys(claimed), ...Object.keys(unclaimed)].filter((a) => !actions.includes(a))) {
    failures.push({
      where: `${config.registry} → ${stale}`,
      why: `registry classifies an action the dispatcher no longer routes — the classification is unverifiable and misleads the next reader`,
      fix: `delete the entry, or restore the action`,
    });
  }

  console.log(`Dispatchable actions: ${actions.length} (claimed ${Object.keys(claimed).length}, unclaimed ${Object.keys(unclaimed).length})`);
  for (const f of failures) console.error(`FAIL ${f.where}\n     ${f.why}\n     fix: ${f.fix}`);
  if (failures.length) {
    console.error(`\nMutation-claim registry gate failed (${failures.length} issue(s)).`);
    process.exit(1);
  }
  console.log('Mutation-claim registry gate passed.');
}

main();
