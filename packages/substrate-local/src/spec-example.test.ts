// BL-15: docs/SPEC.md#the-ir's canonical profile example must compile verbatim on both substrates. This
// test extracts the EXACT yaml fenced block from the doc (not a hand-copied duplicate that could drift)
// so a future edit that reintroduces `actors:` or a `skills/`-prefixed behavior fails CI, not a
// stranger's first compile. Lives here (not packages/core) because it needs BOTH compilers, and this is
// the one package that already depends on both (@open-autonomy/substrate-github + itself).
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseIr, validateIR, missingCopySourcesIn } from '@open-autonomy/core';
import { compileGithub } from '@open-autonomy/substrate-github';
import { compileLocal } from './emit';

const REPO_ROOT = join(import.meta.dir, '..', '..', '..'); // packages/substrate-local/src -> repo root
const SPEC_PATH = join(REPO_ROOT, 'docs', 'SPEC.md');

/** Extract the first ```yaml fenced block whose content starts with `schema: autonomy.ir.v1` — the one
 *  canonical profile example (docs/SPEC.md#the-ir), distinct from the smaller trigger-params snippet
 *  later in the doc. */
function extractSpecExample(): string {
  const spec = readFileSync(SPEC_PATH, 'utf8');
  const fences = [...spec.matchAll(/```yaml\n([\s\S]*?)```/g)].map((m) => m[1]);
  const example = fences.find((f) => f.startsWith('schema: autonomy.ir.v1'));
  if (!example) throw new Error('docs/SPEC.md: no ```yaml fenced block starting with "schema: autonomy.ir.v1" found');
  return example;
}

describe('docs/SPEC.md#the-ir — the canonical profile example', () => {
  const yamlText = extractSpecExample();

  test('parses and validates clean (agents:, not actors:)', () => {
    const ir = parseIr(yamlText); // throws on any validateIR error — this IS the "compiles" assertion
    expect(validateIR(ir)).toEqual([]);
    expect(Object.keys(ir.agents).sort()).toEqual(['developer', 'maintainer', 'planner', 'reviewer']);
  });

  test('compiles on both substrates with every copy source present (bare behavior names, no skills/ prefix)', () => {
    const ir = parseIr(yamlText);
    const dir = mkdtempSync(join(tmpdir(), 'oa-spec-example-'));
    try {
      // Materialize the minimal source tree the example's copies need: one SKILL.md per agent (frontmatter
      // name === folder, the check:profiles invariant) + the one declared resource.
      for (const [role, agent] of Object.entries(ir.agents)) {
        const skillDir = join(dir, 'skills', agent.behavior);
        mkdirSync(skillDir, { recursive: true });
        writeFileSync(join(skillDir, 'SKILL.md'), `---\nname: ${agent.behavior}\ndescription: test fixture for "${role}"\n---\n\n# ${role}\n`);
      }
      for (const r of ir.resources) {
        mkdirSync(dirname(join(dir, r)), { recursive: true });
        writeFileSync(join(dir, r), `fixture resource: ${r}\n`);
      }

      const gh = compileGithub(ir);
      expect(missingCopySourcesIn(gh, dir)).toEqual([]);
      expect(Object.keys(gh.generated).length).toBeGreaterThan(0);

      const local = compileLocal(ir);
      expect(missingCopySourcesIn(local, dir)).toEqual([]);
      expect(Object.keys(local.generated).length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
