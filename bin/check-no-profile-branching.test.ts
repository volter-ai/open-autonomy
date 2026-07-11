import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listScaffoldFiles, scanSource } from './check-no-profile-branching';

describe('scanSource — true positives (the anti-pattern)', () => {
  test('if (profile === literal) — equality-comparison, literal on the right', () => {
    const v = scanSource('x.ts', "if (profile === 'self-driving') { doThing(); }");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ literal: 'self-driving', rule: 'equality-comparison', line: 1 });
  });

  test('literal === profile — equality-comparison, literal on the left', () => {
    const v = scanSource('x.ts', "if ('simple-gh' === profile) { doThing(); }");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ literal: 'simple-gh', rule: 'equality-comparison' });
  });

  test('!== is caught too', () => {
    const v = scanSource('x.ts', "if (profile !== 'simple-sdlc') { doThing(); }");
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('equality-comparison');
  });

  test('loose == / != are caught too', () => {
    const v1 = scanSource('x.ts', "if (profile == 'simple-gh-sdlc') { doThing(); }");
    const v2 = scanSource('x.ts', "if (profile != 'simple-gh-sdlc') { doThing(); }");
    expect(v1).toHaveLength(1);
    expect(v2).toHaveLength(1);
  });

  test('ternary — the comparison is caught regardless of the ternary wrapper', () => {
    const v = scanSource('x.ts', "const mode = profile === 'self-driving' ? 'auto-merge' : 'manual-after-review';");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ literal: 'self-driving', rule: 'equality-comparison' });
  });

  test('&& compound condition — the comparison is caught regardless of the && wrapper', () => {
    const v = scanSource('x.ts', "if (hosted && profile === 'self-driving') { doThing(); }");
    expect(v).toHaveLength(1);
  });

  test('|| compound condition — the comparison is caught regardless of the || wrapper', () => {
    const v = scanSource('x.ts', "if (profile === 'simple-gh' || profile === 'simple-gh-sdlc') { doThing(); }");
    expect(v).toHaveLength(2);
    expect(v.map((x) => x.literal).sort()).toEqual(['simple-gh', 'simple-gh-sdlc']);
  });

  test('switch/case — case-clause expression matches a profile literal', () => {
    const v = scanSource(
      'x.ts',
      ["switch (profile) {", "  case 'self-driving':", '    return true;', '  default:', '    return false;', '}'].join('\n'),
    );
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ literal: 'self-driving', rule: 'switch-case', line: 2 });
  });

  test('multiple case clauses each report', () => {
    const v = scanSource(
      'x.ts',
      [
        "switch (profile) {",
        "  case 'simple-gh':",
        "  case 'simple-sdlc':",
        '    return true;',
        '  default:',
        '    return false;',
        '}',
      ].join('\n'),
    );
    expect(v).toHaveLength(2);
  });

  test('nested inside an unrelated function/block — still caught (real recursive traversal)', () => {
    const v = scanSource(
      'x.ts',
      [
        'function outer() {',
        '  if (true) {',
        '    for (const x of items) {',
        "      if (x.profile === 'self-driving') { flag(); }",
        '    }',
        '  }',
        '}',
      ].join('\n'),
    );
    expect(v).toHaveLength(1);
  });
});

describe('scanSource — true negatives (documented carve-outs)', () => {
  test('a literal passed as a function-call argument (DATA VALUE) is not flagged', () => {
    const v = scanSource('x.ts', "const check = eligible(byName, repoFacts, 'self-driving', 'gh-actions');");
    expect(v).toHaveLength(0);
  });

  test('a literal as a returned/constructed object property value is not flagged', () => {
    const v = scanSource('x.ts', "return { profile: 'self-driving', substrate: 'gh-actions' };");
    expect(v).toHaveLength(0);
  });

  test('a literal as a CLI default/fixture-path argument is not flagged', () => {
    const v = scanSource('x.ts', ".option('--profile <name>', 'profile to install', 'simple-gh-sdlc')");
    expect(v).toHaveLength(0);
  });

  test('profiles/${x} path construction (parameterized, no exact-name literal) is not flagged', () => {
    const v = scanSource('x.ts', 'const dir = `profiles/${profileName}`;');
    expect(v).toHaveLength(0);
  });

  test('a literal profile directory PATH (not an exact profile-name literal) is not flagged', () => {
    const v = scanSource('x.ts', "const irPath = 'profiles/self-driving/ir.yml';");
    expect(v).toHaveLength(0); // whole-literal match only: 'profiles/self-driving/ir.yml' !== 'self-driving'
  });

  test('a profile-name literal inside a comment is never flagged — comments are not AST nodes', () => {
    const v = scanSource(
      'x.ts',
      [
        '// the anti-pattern this drift guard forbids:',
        "// if (profile === 'self-driving') { ... }",
        'export const ok = true;',
      ].join('\n'),
    );
    expect(v).toHaveLength(0);
  });

  test('an unrelated string literal is never flagged', () => {
    const v = scanSource('x.ts', "if (color === 'blue') { paint(); }");
    expect(v).toHaveLength(0);
  });

  test('a comparison against a non-profile string that happens to contain a profile name substring is not flagged', () => {
    const v = scanSource('x.ts', "if (label === 'not-self-driving-related') { doThing(); }");
    expect(v).toHaveLength(0);
  });
});

describe('scanSource — documented known gaps (honest false negatives)', () => {
  test('KNOWN GAP: an object-literal key equal to a profile name (branch-table pattern) is not flagged', () => {
    // Behaviorally equivalent to a switch, but not a "conditional" per the task's literal definition — the
    // checker's header comment documents this as an accepted gap; this test pins that documented behavior
    // rather than silently letting it change.
    const v = scanSource('x.ts', "const table = { 'self-driving': autoMergeConfig, 'simple-gh': manualConfig };");
    expect(v).toHaveLength(0);
  });

  test('KNOWN GAP: Array.includes(profile) membership check is not flagged', () => {
    const v = scanSource('x.ts', "if (['self-driving', 'simple-gh'].includes(profile)) { doThing(); }");
    expect(v).toHaveLength(0);
  });
});

describe('listScaffoldFiles — enumerates the real designated set off disk', () => {
  const mkfile = (root: string, rel: string, body = '') => {
    const p = join(root, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, body);
  };

  test('picks up the fixed core files, local-runner-cli/src/*.ts (non-recursive), and the named bin/ files', () => {
    const root = mkdtempSync(join(tmpdir(), 'no-profile-branching-'));
    try {
      mkfile(root, 'packages/core/src/setup-pack.ts');
      mkfile(root, 'packages/core/src/recommend.ts');
      mkfile(root, 'packages/core/src/ir.ts'); // NOT designated — must be excluded
      mkfile(root, 'packages/local-runner-cli/src/maturity.ts');
      mkfile(root, 'packages/local-runner-cli/src/maturity.test.ts'); // excluded: test file
      mkfile(root, 'packages/local-runner-cli/src/termfleet-ambient.d.ts'); // excluded: ambient types
      mkfile(root, 'packages/local-runner-cli/src/bin/oa.ts'); // excluded: not top-level src/*.ts (glob is non-recursive)
      mkfile(root, 'bin/install-detect.ts');
      mkfile(root, 'bin/install-detect.test.ts'); // excluded: test file
      mkfile(root, 'bin/install-select.ts');
      mkfile(root, 'bin/recommend-profile.ts');
      mkfile(root, 'bin/ensure-ci-workflow.ts');
      mkfile(root, 'bin/check-setup-pack.ts');
      mkfile(root, 'bin/autonomy-compile.ts'); // NOT designated — must be excluded

      const files = listScaffoldFiles(root).map((f) => f.slice(root.length + 1)).sort();
      expect(files).toEqual(
        [
          'bin/check-setup-pack.ts',
          'bin/ensure-ci-workflow.ts',
          'bin/install-detect.ts',
          'bin/install-select.ts',
          'bin/recommend-profile.ts',
          'packages/core/src/recommend.ts',
          'packages/core/src/setup-pack.ts',
          'packages/local-runner-cli/src/maturity.ts',
        ].sort(),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('tolerates a missing bin/install-select.ts (unmerged-PR future scope, not an error)', () => {
    const root = mkdtempSync(join(tmpdir(), 'no-profile-branching-'));
    try {
      mkfile(root, 'packages/core/src/setup-pack.ts');
      mkfile(root, 'packages/core/src/recommend.ts');
      const files = listScaffoldFiles(root);
      expect(files).toHaveLength(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
