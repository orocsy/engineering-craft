#!/usr/bin/env node
/**
 * GATE: a knowledge base's INDEX is its firing mechanism — keep it total.
 *
 * Failure class: a rule that is written but unreachable. This catalog routes by
 * index: you read INDEX.md, it sends you to a category README, the README sends
 * you to a rule. A rule absent from that chain is undiscoverable no matter how
 * well it is written, and a broken relative link is the same defect one level
 * down. Both are silent — nothing errors, the rule simply never fires.
 *
 * Found in practice: a sibling catalog had 13 numbered failure modes and an Index
 * listing 10. Modes 11-13 had been appended without an index row and were
 * unreachable for as long as they had existed.
 *
 * Asserts:
 *   1. every `categories/<cat>/rules/*.md` has a row in its category README
 *   2. every category has a README, and appears in INDEX.md
 *   3. every relative link in every .md resolves on disk
 *   4. every rule has the required frontmatter keys
 *   5. every `templates/*` referenced by a rule exists (and, optionally, that every
 *      template is referenced by at least one rule — an orphan template is a gate
 *      nobody runs)
 *
 * Usage: node catalog-integrity.template.mjs [--root .] [--strict-templates]
 * Exit 0 = the index is total. Exit 1 = something is written but unreachable.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, normalize } from 'node:path';

const args = process.argv.slice(2);
const argOf = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const ROOT = argOf('--root', process.cwd());
const STRICT_TEMPLATES = args.includes('--strict-templates');
const STRICT_FRONTMATTER = args.includes('--strict-frontmatter');
/**
 * Directories of authoring TEMPLATES, whose links contain `{{PLACEHOLDER}}` segments
 * that are meant to be substituted and cannot resolve on disk. Checking them
 * produces confident-looking failures about files that were never supposed to
 * exist, which is how a gate earns its way onto the ignore list.
 */
const LINK_EXCLUDE_DIRS = (argOf('--link-exclude', 'bootstrap')).split(',').filter(Boolean);

const REQUIRED_FRONTMATTER = ['title', 'maturity', 'impact', 'applies-to'];
const GENERATED_MARKER = /GENERATED\s+—?\s*DO NOT EDIT/i;

const failures = [];
const warnings = [];
const fail = (where, why, fix) => failures.push({ where, why, fix });
const warn = (where, why, fix) => warnings.push({ where, why, fix });

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === '.git' || e === 'node_modules') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const rel = (p) => relative(ROOT, p);
const allFiles = walk(ROOT);
const mdFiles = allFiles.filter((f) => f.endsWith('.md'));

// ---- 1 + 2: every rule reachable from its README; every category in INDEX.md ----
const indexPath = join(ROOT, 'INDEX.md');
if (!existsSync(indexPath)) fail('INDEX.md', 'the catalog has no index at all', 'create INDEX.md');
const indexText = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : '';

const categoriesDir = join(ROOT, 'categories');
if (existsSync(categoriesDir)) {
  for (const cat of readdirSync(categoriesDir)) {
    const catDir = join(categoriesDir, cat);
    if (!statSync(catDir).isDirectory()) continue;

    const readmePath = join(catDir, 'README.md');
    if (!existsSync(readmePath)) {
      fail(`categories/${cat}`, 'category has no README — nothing routes into it', 'add README.md with a rules table');
      continue;
    }
    const readme = readFileSync(readmePath, 'utf8');
    const generated = GENERATED_MARKER.test(readme);

    if (!indexText.includes(cat)) {
      fail(`categories/${cat}`, 'category is absent from INDEX.md — the top of the routing chain does not know it exists', 'add a row to the categories-at-a-glance table');
    }

    const rulesDir = join(catDir, 'rules');
    if (!existsSync(rulesDir)) continue;
    for (const ruleFile of readdirSync(rulesDir).filter((f) => f.endsWith('.md'))) {
      const slug = ruleFile.replace(/\.md$/, '');
      if (!generated && !readme.includes(ruleFile) && !readme.includes(slug)) {
        fail(
          `categories/${cat}/rules/${ruleFile}`,
          'rule is not listed in its category README — it is written but unreachable by the documented reading path',
          `add a row to categories/${cat}/README.md`,
        );
      }

      // ---- 4: frontmatter completeness ----
      const text = readFileSync(join(rulesDir, ruleFile), 'utf8');
      // Frontmatter is WARN by default: a rule listed in its README is already
      // reachable, so missing frontmatter is a schema inconsistency rather than an
      // unreachable rule. Pass --strict-frontmatter to make it fatal.
      const emit = STRICT_FRONTMATTER ? fail : warn;
      const fm = text.startsWith('---') ? text.slice(3, text.indexOf('\n---', 3)) : '';
      if (!fm) {
        emit(`categories/${cat}/rules/${ruleFile}`, 'no YAML frontmatter — no machine-readable `applies-to` trigger', 'add the standard frontmatter block');
      } else {
        for (const key of REQUIRED_FRONTMATTER) {
          if (!new RegExp(`^${key}:`, 'm').test(fm)) {
            emit(`categories/${cat}/rules/${ruleFile}`, `frontmatter is missing \`${key}\``, `add \`${key}:\` — ${key === 'applies-to' ? 'this is the trigger; without it the rule can only be found through its README row' : 'required by the catalog schema'}`);
          }
        }
      }
    }
  }
}

// ---- 3: relative links resolve ----
const LINK_RE = /\[([^\]]+)\]\((?!https?:\/\/|#|mailto:)([^)#\s]+\.(?:md|mjs|ts|tsx|json|sh))(#[^)]*)?\)/g;
const referencedTemplates = new Set();
for (const file of mdFiles) {
  if (LINK_EXCLUDE_DIRS.some((d) => rel(file).startsWith(`${d}/`))) continue;
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(LINK_RE)) {
    const target = m[2];
    const resolved = normalize(join(dirname(file), target));
    if (!existsSync(resolved)) {
      fail(rel(file), `broken relative link → \`${target}\``, 'fix the path (rule files sit at categories/<cat>/rules/, so templates are ../../../templates/)');
    } else if (resolved.includes(`${ROOT}/templates/`) || relative(ROOT, resolved).startsWith('templates/')) {
      referencedTemplates.add(relative(ROOT, resolved));
    }
  }
}

// ---- 5: orphan templates ----
const templatesDir = join(ROOT, 'templates');
if (STRICT_TEMPLATES && existsSync(templatesDir)) {
  for (const t of readdirSync(templatesDir)) {
    const key = `templates/${t}`;
    if (!referencedTemplates.has(key)) {
      fail(key, 'template is referenced by no rule — a gate nobody is told to run', 'link it from the rule it enforces, or delete it');
    }
  }
}

for (const w of warnings) console.log(`WARN ${w.where}\n     ${w.why}\n     fix: ${w.fix}`);
for (const f of failures) console.error(`FAIL ${f.where}\n     ${f.why}\n     fix: ${f.fix}`);
console.log(`\nChecked ${mdFiles.length} markdown file(s); ${warnings.length} warning(s).`);
if (failures.length) {
  console.error(`Catalog integrity gate failed (${failures.length} unreachable or broken item(s)).`);
  process.exit(1);
}
console.log('Catalog integrity gate passed — every rule is reachable and every link resolves.');
