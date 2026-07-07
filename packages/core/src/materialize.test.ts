import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  materialize,
  missingCopySources,
  missingCopySourcesIn,
  findClobbers,
  findMerges,
  findResurrections,
  validateSkillFrontmatterIn,
} from './materialize';
import type { MergeStrategies } from './materialize';
import type { AutonomyIR, CompileOutput } from './ir';
import { withGeneratedManifest, readGeneratedManifest } from './file-manifest';

function withTmpDir(fn: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'oa-materialize-'));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('missingCopySources / missingCopySourcesIn (BL-15 dev/03 — pre-materialize validation)', () => {
  const out: CompileOutput = {
    generated: { 'a.txt': 'A' },
    copies: [
      { from: 'skills/developer/SKILL.md', to: '.claude/skills/developer/SKILL.md' },
      { from: 'docs/standards/code.md', to: 'docs/standards/code.md' },
    ],
  };

  test('reports every copy source that does not exist, sorted, before any file is written', () => {
    withTmpDir((dir) => {
      // Neither source exists yet — both must be reported, and nothing written (this function never writes).
      const missing = missingCopySourcesIn(out, dir);
      expect(missing).toEqual(['docs/standards/code.md', 'skills/developer/SKILL.md']);
      expect(() => readFileSync(join(dir, 'a.txt'))).toThrow(); // materialize was never called
    });
  });

  test('reports nothing once every source exists', () => {
    withTmpDir((dir) => {
      mkdirSync(join(dir, 'skills/developer'), { recursive: true });
      writeFileSync(join(dir, 'skills/developer/SKILL.md'), '---\nname: developer\n---\n');
      mkdirSync(join(dir, 'docs/standards'), { recursive: true });
      writeFileSync(join(dir, 'docs/standards/code.md'), '# code\n');
      expect(missingCopySourcesIn(out, dir)).toEqual([]);
    });
  });

  test('missingCopySources uses a caller-supplied existence check (dry-run and materialize share it)', () => {
    const alwaysMissing = missingCopySources(out, () => false);
    expect(alwaysMissing).toEqual(['docs/standards/code.md', 'skills/developer/SKILL.md']);
    const alwaysPresent = missingCopySources(out, () => true);
    expect(alwaysPresent).toEqual([]);
  });
});

describe('findClobbers (BL-14 — fresh-compile clobber guard)', () => {
  const out: CompileOutput = {
    generated: { 'README.md': 'NEW README\n' },
    copies: [{ from: 'gitignore', to: '.gitignore' }],
  };
  const readSource = () => '*.log\n';

  test('flags an existing file whose bytes differ', () => {
    withTmpDir((dir) => {
      writeFileSync(join(dir, 'README.md'), "the adopter's OWN readme\n");
      expect(findClobbers(out, dir, readSource)).toEqual(['README.md']);
    });
  });

  test('does not flag a file that does not exist yet (additive-overlay / fresh-dir case)', () => {
    withTmpDir((dir) => {
      expect(findClobbers(out, dir, readSource)).toEqual([]);
    });
  });

  test('does not flag a file whose existing bytes already match (idempotent re-compile)', () => {
    withTmpDir((dir) => {
      writeFileSync(join(dir, 'README.md'), 'NEW README\n');
      writeFileSync(join(dir, '.gitignore'), '*.log\n');
      expect(findClobbers(out, dir, readSource)).toEqual([]);
    });
  });

  test('an additive profile with no colliding resources never clobbers, even over a populated repo', () => {
    // The additive-overlay guarantee (simple-gh-sdlc/simple-sdlc/hello): they carry no README.md/
    // package.json/.gitignore resources, so compiling them can never trip this guard.
    const additiveOut: CompileOutput = { generated: { '.open-autonomy/autonomy.yml': 'schema: x\n' }, copies: [] };
    withTmpDir((dir) => {
      writeFileSync(join(dir, 'README.md'), "the adopter's OWN readme, totally unrelated\n");
      writeFileSync(join(dir, 'package.json'), '{"name":"their-app"}');
      expect(findClobbers(additiveOut, dir, readSource)).toEqual([]);
    });
  });
});

describe('findClobbers + findMerges + materialize with a merge strategy (OA-10c)', () => {
  const out: CompileOutput = { generated: { 'settings.json': '{"a":1}' }, copies: [] };
  const readSource = () => 'unused'; // this describe's `out` has no `copies`, so readSource is never invoked
  // A trivial "always mergeable" strategy: succeeds whenever the existing bytes parse as JSON.
  const jsonMergeStrategies: MergeStrategies = {
    'settings.json': {
      merge(existing, generated) {
        try {
          const e = JSON.parse(existing);
          const g = JSON.parse(generated);
          return { content: JSON.stringify({ ...e, ...g }), note: 'merged keys' };
        } catch {
          return undefined;
        }
      },
    },
  };

  test('a path with a SUCCESSFUL merge strategy is NOT a clobber', () => {
    withTmpDir((dir) => {
      writeFileSync(join(dir, 'settings.json'), '{"b":2}');
      expect(findClobbers(out, dir, readSource, jsonMergeStrategies)).toEqual([]);
    });
  });

  test('a path with an UNMERGEABLE existing file (invalid JSON) IS still a clobber — falls back to refusal', () => {
    withTmpDir((dir) => {
      writeFileSync(join(dir, 'settings.json'), 'not json at all');
      expect(findClobbers(out, dir, readSource, jsonMergeStrategies)).toEqual(['settings.json']);
    });
  });

  test('revert the exemption (no strategy passed): the SAME collision reverts to an ordinary clobber', () => {
    // Tamper probe: calling findClobbers WITHOUT the merge strategy map must treat the path as a plain
    // byte-differ clobber — proves the merge-skip behavior is what the strategy argument adds, not some
    // unconditional exemption for this path name.
    withTmpDir((dir) => {
      writeFileSync(join(dir, 'settings.json'), '{"b":2}');
      expect(findClobbers(out, dir, readSource)).toEqual(['settings.json']);
    });
  });

  test('findMerges reports the merge with its note, computed BEFORE materialize writes', () => {
    withTmpDir((dir) => {
      writeFileSync(join(dir, 'settings.json'), '{"b":2}');
      expect(findMerges(out, dir, readSource, jsonMergeStrategies)).toEqual([{ path: 'settings.json', note: 'merged keys' }]);
    });
  });

  test('findMerges reports nothing for a fresh path (no existing file) or an unmergeable one', () => {
    withTmpDir((dir) => {
      expect(findMerges(out, dir, readSource, jsonMergeStrategies)).toEqual([]); // nothing on disk yet
      writeFileSync(join(dir, 'settings.json'), 'not json');
      expect(findMerges(out, dir, readSource, jsonMergeStrategies)).toEqual([]); // unmergeable
    });
  });

  test('materialize actually WRITES the merged content, not the raw generated bytes', () => {
    withTmpDir((dir) => {
      writeFileSync(join(dir, 'settings.json'), '{"b":2}');
      materialize(out, dir, readSource, jsonMergeStrategies);
      expect(JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'))).toEqual({ b: 2, a: 1 });
    });
  });

  test('materialize with an unmergeable existing file falls through to a plain overwrite (matches --force semantics)', () => {
    withTmpDir((dir) => {
      writeFileSync(join(dir, 'settings.json'), 'not json');
      materialize(out, dir, readSource, jsonMergeStrategies);
      expect(readFileSync(join(dir, 'settings.json'), 'utf8')).toBe('{"a":1}'); // raw generated content
    });
  });
});

describe('findResurrections (OA-10 — the deletion-resurrection guard)', () => {
  const out: CompileOutput = { generated: { 'scripts/agent.ts': 'v2\n' }, copies: [] };

  test('flags a path listed in the prior manifest, absent on disk, and produced again by this compile', () => {
    withTmpDir((dir) => {
      // No file at scripts/agent.ts — the operator deleted it since the last install.
      expect(findResurrections(out, dir, ['scripts/agent.ts'])).toEqual(['scripts/agent.ts']);
    });
  });

  test('does NOT flag a path that is still present on disk (nothing to resurrect)', () => {
    withTmpDir((dir) => {
      mkdirSync(join(dir, 'scripts'), { recursive: true });
      writeFileSync(join(dir, 'scripts/agent.ts'), 'v1 — still here\n');
      expect(findResurrections(out, dir, ['scripts/agent.ts'])).toEqual([]);
    });
  });

  test('does NOT flag a path the prior manifest lists but this compile no longer produces (that is prune\'s job, not this guard\'s)', () => {
    withTmpDir((dir) => {
      expect(findResurrections(out, dir, ['scripts/retired-agent.ts'])).toEqual([]);
    });
  });

  test('does NOT flag a path this compile produces that was simply never in the prior manifest (a brand-new file, not a deletion)', () => {
    withTmpDir((dir) => {
      expect(findResurrections(out, dir, [])).toEqual([]);
    });
  });

  // --- The OA-07 coordination: .open-autonomy/paused must NEVER be flagged or resurrected -------------
  //
  // These are TAMPER PROBES, not just regression pins: they construct the worst case directly (the
  // marker somehow ends up in BOTH the prior manifest AND this compile's output — which real compileLocal
  // never does, see substrate-local/src/emit.ts) so the exemption is proven by the guard's OWN logic, not
  // by an accident of what one substrate happens to produce.
  //   - Revert the `isInstallOwned` filter in findResurrections -> this test goes RED.
  //   - Revert findResurrections entirely (no guard at all) -> the "flags a deleted path" test above goes RED.
  describe("the OA-07 exemption: '.open-autonomy/paused' is never flagged, even in the adversarial case", () => {
    test('paused IS in the prior manifest AND IS produced by this compile, but is ABSENT on disk -> still not flagged', () => {
      const withPaused: CompileOutput = { generated: { '.open-autonomy/paused': 'PAUSED\n' }, copies: [] };
      withTmpDir((dir) => {
        // Deliberately the adversarial case: a real compileLocal would never put '.open-autonomy/paused'
        // in the prior manifest (see file-manifest.ts / emit.ts's withGeneratedManifest ordering) — this
        // test bypasses that by hand-crafting the manifest to prove the EXEMPTION itself, not just the
        // absence-from-manifest side effect.
        expect(findResurrections(withPaused, dir, ['.open-autonomy/paused'])).toEqual([]);
      });
    });

    test('a real compileLocal-shaped manifest (paused excluded, per withGeneratedManifest) plus the marker deleted: recompile output is clean', () => {
      // Exercise the REAL manifest-building path (withGeneratedManifest), not a hand-crafted one, to prove
      // paused is doubly safe: excluded from the manifest by construction AND exempted by isInstallOwned.
      const compiled = withGeneratedManifest({ generated: { 'scripts/agent.ts': 'v2\n' }, copies: [] });
      compiled.generated['.open-autonomy/paused'] = 'PAUSED — operator has not unpaused yet\n'; // added AFTER the manifest is computed, like compileLocal does
      withTmpDir((dir) => {
        mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
        writeFileSync(join(dir, '.open-autonomy/generated.json'), compiled.generated['.open-autonomy/generated.json']);
        // Operator writes scripts/agent.ts (so it's not itself a "deletion"), then unpauses:
        mkdirSync(join(dir, 'scripts'), { recursive: true });
        writeFileSync(join(dir, 'scripts/agent.ts'), 'v1\n');
        // '.open-autonomy/paused' was never written to disk in this scenario (fresh install already unpaused,
        // or the operator rm'd it) — either way it must never appear in findResurrections' output.
        const prior = readGeneratedManifest(dir);
        expect(prior).not.toContain('.open-autonomy/paused'); // the manifest-exclusion half (belt)
        expect(findResurrections(compiled, dir, prior)).toEqual([]); // the isInstallOwned half (suspenders)
      });
    });
  });
});

describe('materialize / generated.json regression pin (AC-6 — manifest lists every written path)', () => {
  test('the sorted written list from materialize equals the sorted files[] the manifest records', () => {
    const baseOut: CompileOutput = {
      generated: { 'a.txt': 'A', 'nested/b.txt': 'B' },
      copies: [{ from: 'src/c.txt', to: 'nested/c.txt' }],
    };
    const compiled = withGeneratedManifest(baseOut);
    withTmpDir((dir) => {
      const written = materialize(compiled, dir, () => 'C');
      const manifest = JSON.parse(readFileSync(join(dir, '.open-autonomy/generated.json'), 'utf8')) as { files: string[] };
      expect([...manifest.files].sort()).toEqual([...written].sort());
      // Every path the manifest claims to have written must actually exist on disk.
      for (const f of manifest.files) expect(existsSync(join(dir, f))).toBe(true);
    });
  });
});

describe('validateSkillFrontmatterIn (BL-22 dev/03 — SKILL.md name==folder, external profiles too)', () => {
  const ir: AutonomyIR = {
    schema: 'autonomy.ir.v1',
    targets: ['local'],
    agents: {
      dev: { behavior: 'developer', capabilities: ['tasks:converse'], triggers: [{ cron: '0 0 * * *' }] },
      sweep: { behavior: 'scripts/sweep.ts', capabilities: ['tasks:converse'], triggers: [{ cron: '0 0 * * *' }] },
    },
    policy: { box: {} },
    resources: [],
  };

  test('rejects a SKILL.md whose frontmatter name differs from its folder', () => {
    withTmpDir((dir) => {
      mkdirSync(join(dir, 'skills/developer'), { recursive: true });
      writeFileSync(join(dir, 'skills/developer/SKILL.md'), '---\nname: dev-worker\n---\n');
      const errs = validateSkillFrontmatterIn(ir, dir);
      expect(errs.some((e) => e.includes('developer') && e.includes('dev-worker'))).toBe(true);
    });
  });

  test('accepts a matching frontmatter name and skips script behaviors entirely', () => {
    withTmpDir((dir) => {
      mkdirSync(join(dir, 'skills/developer'), { recursive: true });
      writeFileSync(join(dir, 'skills/developer/SKILL.md'), '---\nname: developer\n---\n');
      // `sweep`'s behavior is a script (scripts/sweep.ts) — it has no SKILL.md and must not be checked.
      expect(validateSkillFrontmatterIn(ir, dir)).toEqual([]);
    });
  });

  test('skips a missing SKILL.md (missingCopySourcesIn reports that failure separately)', () => {
    withTmpDir((dir) => {
      expect(validateSkillFrontmatterIn(ir, dir)).toEqual([]);
    });
  });
});

describe('materialize', () => {
  test('writes generated + copied files, sorted', () => {
    withTmpDir((dir) => {
      const out: CompileOutput = { generated: { 'b.txt': 'B' }, copies: [{ from: 'src/a.txt', to: 'a.txt' }] };
      const written = materialize(out, dir, () => 'A');
      expect(written).toEqual(['a.txt', 'b.txt']);
      expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('A');
      expect(readFileSync(join(dir, 'b.txt'), 'utf8')).toBe('B');
    });
  });
});
