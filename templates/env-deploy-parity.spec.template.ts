/**
 * Env-schema/deploy.yml parity test template — fails CI if a production-required env var
 * was added to env.schema.ts but not passed through deploy.yml.
 *
 * Drop into your API project's test suite. Adjust paths if your repo layout differs.
 *
 * For background, see:
 *   ~/.claude/skills/production-defensive-patterns/categories/config-drift/rules/env-deploy-parity-test.md
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('env schema ↔ deploy.yml parity', () => {
  // Adjust these paths to match your monorepo layout
  const projectRoot = join(__dirname, '..', '..', '..', '..', '..');
  const schemaPath = join(projectRoot, 'apps', 'api', 'src', 'config', 'env.schema.ts');
  const deployPath = join(projectRoot, '.github', 'workflows', 'deploy.yml');

  const schemaSrc = readFileSync(schemaPath, 'utf-8');
  const deploySrc = readFileSync(deployPath, 'utf-8');

  /**
   * Find env vars declared production-required by parsing superRefine blocks of
   * the form: `if (data.NODE_ENV === 'production' && !data.VAR_NAME)`.
   */
  const requiredVars = Array.from(
    schemaSrc.matchAll(
      /data\.NODE_ENV\s*===\s*['"]production['"]\s*&&\s*!data\.(\w+)/g,
    ),
    (m) => m[1],
  );

  // Vars that are intentionally NOT passed through deploy.yml (e.g., set by other
  // means like Vercel project env, Terraform, etc.). Keep this list short and
  // reviewed.
  const EXEMPT_FROM_DEPLOY_YML: string[] = [
    // 'EXAMPLE_VAR_SET_BY_TERRAFORM',
  ];

  it('finds at least 3 production-required vars in env.schema.ts (regex sanity)', () => {
    expect(requiredVars.length).toBeGreaterThanOrEqual(3);
  });

  describe.each(requiredVars.filter((v) => !EXEMPT_FROM_DEPLOY_YML.includes(v)))(
    'production-required var %s',
    (varName) => {
      it('has a `-e <VAR>="${{ secrets.<VAR> }}"` line in deploy.yml', () => {
        const pattern = new RegExp(
          // accept single or double quotes; tolerate whitespace inside ${{ }}
          `-e\\s+${varName}\\s*=\\s*["']\\s*\\$\\{\\{\\s*secrets\\.${varName}\\s*\\}\\}\\s*["']`,
        );
        expect(deploySrc).toMatch(pattern);
      });
    },
  );

  // Bonus: also assert that vars in deploy.yml's `-e` list are EITHER required OR
  // commented as optional. Catches dangling pass-throughs after a schema removal.
  describe('deploy.yml `-e VAR` lines reference declared schema vars', () => {
    const passThrough = Array.from(
      deploySrc.matchAll(
        /-e\s+(\w+)\s*=\s*["']\s*\$\{\{\s*secrets\.(\w+)\s*\}\}\s*["']/g,
      ),
      (m) => ({ deployVar: m[1], secretVar: m[2] }),
    );

    // Extract every var from the schema (required AND optional) by finding `z.object({...VARNAME: ...})`
    const declaredVars = Array.from(
      schemaSrc.matchAll(/^\s*([A-Z][A-Z0-9_]+)\s*:\s*z\./gm),
      (m) => m[1],
    );

    it.each(passThrough)(
      'deploy.yml `-e %s=` matches a declared schema var',
      ({ deployVar, secretVar }) => {
        expect(deployVar).toBe(secretVar); // sanity: name matches itself
        expect(declaredVars).toContain(deployVar);
      },
    );
  });
});
