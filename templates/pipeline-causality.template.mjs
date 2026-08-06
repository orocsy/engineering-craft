#!/usr/bin/env node
/**
 * GATE: deploy jobs must be CAUSAL DESCENDANTS of the job that proves the build.
 *
 * Failure class: "causally-ungated pipeline". Two workflows triggered by the same
 * event (`on: push`) run CONCURRENTLY. A green CI run and a deploy are then merely
 * CORRELATED — the deploy neither waits for CI nor inherits its verdict, so a red
 * CI still ships. The mistake is invisible in review because both files look right
 * in isolation; only the JOIN between them is wrong.
 *
 * What this asserts, for every job that touches a deployment target
 * (`environment:` set, or a step whose `run` matches DEPLOY_STEP_RE):
 *
 *   1. Either the job runs the proof steps ITSELF (all of PROOF_STEPS appear in
 *      its own `run` lines), or
 *   2. it declares `needs:` on a same-workflow job that does, or
 *   3. its workflow is triggered by `workflow_run` on the proving workflow AND
 *      guards on `conclusion == 'success'`.
 *
 * Anything else is a correlation, not a causal gate, and fails.
 *
 * Usage:  node verify-pipeline-causality.mjs [--dir .github/workflows] [--config gate.json]
 * Config: { "proofSteps": ["pnpm test"], "deployStepPattern": "deploy|release|publish" }
 *
 * Exit 0 = every deploy job is causally gated. Exit 1 = at least one is not.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const args = process.argv.slice(2);
const argOf = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

const DIR = argOf('--dir', '.github/workflows');
const CONFIG_PATH = argOf('--config', '');
const config = CONFIG_PATH && existsSync(CONFIG_PATH)
  ? JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
  : {};

/** Commands that constitute "the build is proven". Override per repo. */
const PROOF_STEPS = config.proofSteps ?? ['test'];
/** How to recognise a step that mutates a deployment target. */
const DEPLOY_STEP_RE = new RegExp(config.deployStepPattern ?? '\\bdeploy\\b|\\brelease\\b|\\bpublish\\b', 'i');
/**
 * Commands that contain a deploy word but do NOT mutate a shared target:
 * `prisma migrate deploy` against an ephemeral service-container DB is the common
 * one, and flagging it trains people to ignore this gate. Override per repo.
 */
const DEPLOY_FALSE_FRIEND_RE = new RegExp(
  config.deployStepExcludePattern ?? 'prisma\\s+migrate\\s+deploy|playwright\\s+install|--with-deps|\\bdeploy(ment)?s?\\b\\s*[:=]\\s*(false|0)',
  'i',
);

/**
 * Minimal indentation-driven YAML reader. Deliberately dependency-free: this gate
 * has to run in a bare CI step before `install`. It reads only the four shapes it
 * needs (on:, jobs:, needs:, environment:, steps[].run) and is tolerant of the
 * rest of the document.
 */
function parseWorkflow(text) {
  const lines = text.split('\n');
  const indentOf = (l) => l.match(/^ */)[0].length;

  const wf = { name: null, triggers: [], workflowRun: null, jobs: {} };
  let section = null;          // 'on' | 'jobs' | null
  let sectionIndent = 0;
  let currentJob = null;
  let jobIndent = 0;
  let inSteps = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const ind = indentOf(raw);
    const line = raw.trim();

    if (ind === 0) {
      const key = line.split(':')[0];
      section = key === 'on' || key === 'jobs' ? key : null;
      sectionIndent = 0;
      currentJob = null;
      inSteps = false;
      if (key === 'name') wf.name = line.slice(line.indexOf(':') + 1).trim();
      continue;
    }

    if (section === 'on') {
      if (ind === 2 && line.endsWith(':')) {
        const trig = line.slice(0, -1).trim();
        wf.triggers.push(trig);
        if (trig === 'workflow_run') wf.workflowRun = { workflows: [], types: [] };
      } else if (wf.workflowRun && ind >= 4) {
        const m = line.match(/^(workflows|types):\s*(.*)$/);
        if (m && m[2]) {
          const inline = m[2].replace(/[[\]]/g, '').split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
          wf.workflowRun[m[1]].push(...inline.filter(Boolean));
        } else if (line.startsWith('- ')) {
          // belongs to whichever of workflows/types was last opened
          const prev = lines.slice(0, i).reverse().find((l) => /^\s*(workflows|types):\s*$/.test(l));
          const key = prev ? prev.trim().split(':')[0] : 'workflows';
          wf.workflowRun[key].push(line.slice(2).trim().replace(/^["']|["']$/g, ''));
        }
      }
      continue;
    }

    if (section === 'jobs') {
      if (ind === 2 && line.endsWith(':')) {
        currentJob = line.slice(0, -1).trim();
        jobIndent = ind;
        inSteps = false;
        wf.jobs[currentJob] = { needs: [], environment: null, runs: [], ifs: [] };
        continue;
      }
      if (!currentJob) continue;

      if (ind === jobIndent + 2) inSteps = line.startsWith('steps:');

      const job = wf.jobs[currentJob];
      const needsInline = line.match(/^needs:\s*(.+)$/);
      if (needsInline && ind === jobIndent + 2) {
        job.needs.push(
          ...needsInline[1].replace(/[[\]]/g, '').split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean),
        );
      } else if (/^needs:\s*$/.test(line) && ind === jobIndent + 2) {
        for (let j = i + 1; j < lines.length && lines[j].trim().startsWith('- '); j++) {
          job.needs.push(lines[j].trim().slice(2).trim());
        }
      }
      if (ind === jobIndent + 2) {
        const envM = line.match(/^environment:\s*(.*)$/);
        if (envM) job.environment = envM[1].trim() || '(block)';
        const ifM = line.match(/^if:\s*(.*)$/);
        if (ifM) job.ifs.push(ifM[1]);
      }
      if (inSteps || ind > jobIndent + 2) {
        const runM = line.match(/^(?:- )?run:\s*(.*)$/);
        if (runM) {
          let body = runM[1];
          if (body === '|' || body === '>' || body === '|-' || body === '>-') {
            const blockIndent = indentOf(lines[i + 1] ?? '');
            const collected = [];
            for (let j = i + 1; j < lines.length && (indentOf(lines[j]) >= blockIndent || !lines[j].trim()); j++) {
              collected.push(lines[j].trim());
            }
            body = collected.join('\n');
          }
          job.runs.push(body);
          const ifPrev = lines[i - 1]?.trim().match(/^if:\s*(.*)$/);
          if (ifPrev) job.ifs.push(ifPrev[1]);
        }
      }
    }
  }
  return wf;
}

/**
 * Match a proof command as a WHOLE command, not as a substring.
 *
 * This gate's first draft used `run.includes('pnpm test')` and passed on a repo
 * whose deploy job runs only `pnpm test:e2e:public` — the needle matched a
 * DIFFERENT command that merely shares a prefix. That is the same defect class
 * this suite exists to catch (a probe satisfied by the wrong match), so the
 * matcher is anchored: the command must be followed by end-of-line, whitespace,
 * or a shell separator — never by `:`/`-`/word characters that would extend it
 * into a different script name.
 */
function runsCommand(runBody, command) {
  const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[\\n;&|(]|&&|\\|\\|)\\s*${escaped}(?=$|[\\s;&|)]|$)`, 'm').test(runBody);
}

const jobProves = (job) => PROOF_STEPS.every((p) => job.runs.some((r) => runsCommand(r, p)));

/**
 * A job is gated as a DEPLOY when it actually runs a deploy-shaped command.
 * `environment:` alone is reported but not failed — an env binding grants secret
 * access (worth surfacing) without necessarily mutating a shared target, and a
 * gate that cries wolf on every E2E job gets switched off.
 */
const isDeployStep = (r) => DEPLOY_STEP_RE.test(r) && !DEPLOY_FALSE_FRIEND_RE.test(r);
const jobDeploys = (job) => job.runs.some(isDeployStep);
const jobIsEnvOnly = (job) => job.environment !== null && !jobDeploys(job);

function main() {
  if (!existsSync(DIR)) {
    console.error(`No workflow directory at ${DIR}`);
    process.exit(1);
  }
  const files = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f));
  const workflows = files.map((f) => ({ file: f, ...parseWorkflow(readFileSync(join(DIR, f), 'utf8')) }));

  const provingWorkflows = workflows.filter((w) => Object.values(w.jobs).some(jobProves));
  const failures = [];
  const passes = [];
  const warnings = [];

  for (const wf of workflows) {
    for (const [name, job] of Object.entries(wf.jobs)) {
      if (jobIsEnvOnly(job) && !jobProves(job)) {
        warnings.push(
          `${wf.file}:${name} — binds \`environment: ${job.environment}\` (secret access) but runs no deploy-shaped step; not gated, not failed.`,
        );
      }
      if (!jobDeploys(job)) continue;

      // (1) the deploy job proves the build itself
      if (jobProves(job)) {
        passes.push(`${wf.file}:${name} — runs the proof steps in-job`);
        continue;
      }
      // (2) TRANSITIVELY needs: a same-workflow job that proves it.
      //
      // A direct-only check reports a false positive on every correctly-chained
      // pipeline (validate → build → deploy → verify), and a gate that cries wolf
      // gets switched off — which is how a repo ends up with no gate at all. Walk
      // the whole `needs:` closure.
      const proverInClosure = (() => {
        const seen = new Set([name]);
        const queue = [...job.needs];
        while (queue.length) {
          const n = queue.shift();
          if (seen.has(n)) continue;
          seen.add(n);
          const dep = wf.jobs[n];
          if (!dep) continue;
          if (jobProves(dep)) return n;
          queue.push(...dep.needs);
        }
        return null;
      })();
      if (proverInClosure) {
        passes.push(
          `${wf.file}:${name} — needs: reaches proving job \`${proverInClosure}\`${job.needs.includes(proverInClosure) ? '' : ' (transitively)'}`,
        );
        continue;
      }
      // (3) triggered by workflow_run on a proving workflow AND guarded on success
      if (wf.workflowRun) {
        const namesProving = provingWorkflows.map((w) => w.name).filter(Boolean);
        const linked = wf.workflowRun.workflows.some((w) => namesProving.includes(w));
        const guarded = job.ifs.some((c) => /conclusion\s*==\s*'success'|conclusion\s*==\s*"success"/.test(c));
        if (linked && guarded) {
          passes.push(`${wf.file}:${name} — workflow_run on a proving workflow + success guard`);
          continue;
        }
        failures.push({
          where: `${wf.file}:${name}`,
          why: linked
            ? `workflow_run is linked but no job-level guard on \`github.event.workflow_run.conclusion == 'success'\` — a FAILED upstream run still triggers this deploy`
            : `workflow_run does not name a workflow that runs [${PROOF_STEPS.join(', ')}]`,
        });
        continue;
      }

      const missing = PROOF_STEPS.filter((p) => !job.runs.some((r) => runsCommand(r, p)));
      // Only a workflow that shares a TRIGGER with this one is evidence of the
      // "concurrent, not causal" shape; naming an unrelated workflow would be a
      // confident-sounding claim the evidence does not support.
      const concurrentSiblings = provingWorkflows
        .filter((w) => w.file !== wf.file && w.triggers.some((t) => wf.triggers.includes(t)))
        .map((w) => `${w.file} (shared trigger: ${w.triggers.filter((t) => wf.triggers.includes(t)).join(', ')})`);
      failures.push({
        where: `${wf.file}:${name}`,
        why:
          `deploy job (trigger: ${wf.triggers.join(', ') || 'unknown'}) neither runs [${missing.join(', ')}] itself ` +
          `nor reaches, through needs:/workflow_run, anything that does` +
          (concurrentSiblings.length
            ? `. ${concurrentSiblings.join('; ')} runs the proof on the SAME trigger — that is concurrency, not ` +
              `causality: both start from one event, and this job never observes the other's verdict.`
            : `. Nothing in this repo proves the build before this job mutates its target.`),
      });
    }
  }

  for (const p of passes) console.log(`PASS ${p}`);
  for (const w of warnings) console.log(`WARN ${w}`);
  for (const f of failures) console.error(`FAIL ${f.where}\n     ${f.why}`);

  if (!passes.length && !failures.length) {
    console.log('No deploy jobs found — nothing to gate.');
    return;
  }
  if (failures.length) {
    console.error(`\nPipeline causality gate failed (${failures.length} ungated deploy job(s)).`);
    process.exit(1);
  }
  console.log('\nPipeline causality gate passed.');
}

main();
