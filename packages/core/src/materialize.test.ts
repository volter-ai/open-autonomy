import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { materialize, missingCopySources, missingCopySourcesIn, findClobbers } from './materialize';
import type { CompileOutput } from './ir';

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
