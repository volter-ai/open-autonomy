// TB.3 acceptance tests — packages/local-runner-cli/src/signal-sets.ts. Run via `bun run check:core`
// (`bun test packages/*/src/*.test.ts`), cwd = repo root — same convention as imm-signals.test.ts /
// board-readiness.test.ts.
//
// Fixtures mirror the REAL four profiles' setup-pack.yml facts (as of TS.1/TP.1-4, PRs #142-#146) exactly
// — codeHost/targets/direction_spec.mode/maturity_signals.m3_tool/extra_rungs — so these unit tests are a
// faithful proxy for "run signalSetFor against the real packs" (also proven live in the PR body's real-run
// transcript, which loads the actual `profiles/*/setup-pack.yml` files via `getSetupPack`).
import { describe, expect, test } from 'bun:test';
import { IMM_SIGNAL_IDS, signalSetFor, type SignalSetPack } from './signal-sets.ts';

// --- fixtures — one per real profile, values copied straight from profiles/<name>/setup-pack.yml + ir.yml

const simpleSdlcPack: SignalSetPack = {
  codeHost: 'local-git',
  targets: ['local'],
  direction_spec: { mode: 'operator' },
  maturity_signals: { m3_tool: 'doctor' },
  extra_rungs: [],
};

const simpleGhPack: SignalSetPack = {
  codeHost: 'github',
  targets: ['local'],
  direction_spec: { mode: 'operator' },
  maturity_signals: { m3_tool: 'doctor' },
  extra_rungs: [],
};

const simpleGhSdlcPack: SignalSetPack = {
  codeHost: 'github',
  targets: ['gh-actions', 'local'],
  direction_spec: { mode: 'operator' },
  maturity_signals: { m3_tool: 'doctor' },
  extra_rungs: [],
};

const selfDrivingPack: SignalSetPack = {
  codeHost: 'github',
  targets: ['gh-actions', 'local'],
  direction_spec: { mode: 'documents.roles' },
  maturity_signals: { m3_tool: 'gh-preflight' },
  extra_rungs: ['proxy-ready', 'direction-present', 'human-seam-wired'],
};

describe('signalSetFor — IMM_SIGNAL_IDS sanity', () => {
  test('the frozen TB.1 id set is exactly A1-A6,A8,A10,A11-A14 (12 ids)', () => {
    expect([...IMM_SIGNAL_IDS].sort()).toEqual(['A1', 'A10', 'A11', 'A12', 'A13', 'A14', 'A2', 'A3', 'A4', 'A5', 'A6', 'A8'].sort());
  });
});

describe('signalSetFor — simple-sdlc (local-git, local only, operator direction, no extra rungs)', () => {
  const set = signalSetFor(simpleSdlcPack, 'local');

  test('no GitHub rungs at all — A12/A13 both skipped', () => {
    expect(set.applicable).not.toContain('A12');
    expect(set.applicable).not.toContain('A13');
    const ids = set.skipped.map((s) => s.id);
    expect(ids).toContain('A12');
    expect(ids).toContain('A13');
  });

  test('skip reasons cite codeHost=local-git', () => {
    for (const id of ['A12', 'A13']) {
      const s = set.skipped.find((x) => x.id === id)!;
      expect(s.reason).toContain("codeHost='local-git'");
      expect(s.reason).toContain('not-applicable');
    }
  });

  test('doctor (A8/A10) IS present — its only target is local', () => {
    expect(set.applicable).toContain('A8');
    expect(set.applicable).toContain('A10');
  });

  test('no vision/direction rung leaks in — extra_rungs is empty for this profile', () => {
    expect(set.applicable).not.toContain('direction-present');
    expect(set.skipped.map((s) => s.id)).not.toContain('direction-present');
  });

  test('universal signals present', () => {
    for (const id of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A11', 'A14']) expect(set.applicable).toContain(id);
  });
});

describe('signalSetFor — simple-gh (github codeHost, local-only target, operator direction)', () => {
  const set = signalSetFor(simpleGhPack, 'local');

  test('includes A12/A13 (codeHost=github) even though its only target is local', () => {
    expect(set.applicable).toContain('A12');
    expect(set.applicable).toContain('A13');
    expect(set.skipped.map((s) => s.id)).not.toContain('A12');
    expect(set.skipped.map((s) => s.id)).not.toContain('A13');
  });

  test('doctor still applies (target=local)', () => {
    expect(set.applicable).toContain('A8');
    expect(set.applicable).toContain('A10');
  });
});

describe('signalSetFor — simple-gh-sdlc, both targets (codeHost=github, operator direction)', () => {
  test('local target: A12/A13 present AND doctor present', () => {
    const set = signalSetFor(simpleGhSdlcPack, 'local');
    expect(set.applicable).toContain('A12');
    expect(set.applicable).toContain('A13');
    expect(set.applicable).toContain('A8');
    expect(set.applicable).toContain('A10');
  });

  test('gh-actions target: A12/A13 present, doctor SKIPPED with a cited reason', () => {
    const set = signalSetFor(simpleGhSdlcPack, 'gh-actions');
    expect(set.applicable).toContain('A12');
    expect(set.applicable).toContain('A13');
    expect(set.applicable).not.toContain('A8');
    expect(set.applicable).not.toContain('A10');
    const a8 = set.skipped.find((s) => s.id === 'A8')!;
    const a10 = set.skipped.find((s) => s.id === 'A10')!;
    expect(a8.reason).toContain("m3_tool='doctor'"); // this pack's own primary tool is 'doctor' (local)
    expect(a8.reason).toContain('gh-actions');
    expect(a10.reason).toContain('no persistent local process');
  });
});

describe('signalSetFor — self-driving, both targets (codeHost=github, documents.roles direction, extra rungs)', () => {
  test('hosted (gh-actions): no doctor signals; skip cites m3_tool=gh-preflight + targets', () => {
    const set = signalSetFor(selfDrivingPack, 'gh-actions');
    expect(set.applicable).not.toContain('A8');
    expect(set.applicable).not.toContain('A10');
    const a8 = set.skipped.find((s) => s.id === 'A8')!;
    expect(a8.reason).toContain("m3_tool='gh-preflight'");
    expect(a8.reason).toContain('pack.targets=[gh-actions, local]');
    // still on GitHub — gh-preflight/protection apply
    expect(set.applicable).toContain('A12');
    expect(set.applicable).toContain('A13');
  });

  test('local target: doctor IS present, alongside A12/A13', () => {
    const set = signalSetFor(selfDrivingPack, 'local');
    expect(set.applicable).toContain('A8');
    expect(set.applicable).toContain('A10');
    expect(set.applicable).toContain('A12');
    expect(set.applicable).toContain('A13');
    expect(set.skipped.map((s) => s.id)).not.toContain('A8');
    expect(set.skipped.map((s) => s.id)).not.toContain('A10');
  });

  test('extra_rungs (proxy-ready, direction-present, human-seam-wired) all pass through — direction_spec.mode is documents.roles', () => {
    const set = signalSetFor(selfDrivingPack, 'local');
    expect(set.applicable).toContain('proxy-ready');
    expect(set.applicable).toContain('direction-present');
    expect(set.applicable).toContain('human-seam-wired');
    expect(set.skipped.map((s) => s.id)).not.toContain('direction-present');
  });

  test('extra_rungs are consistent across both targets (they are profile-level, not target-level facts)', () => {
    const local = signalSetFor(selfDrivingPack, 'local');
    const hosted = signalSetFor(selfDrivingPack, 'gh-actions');
    for (const rung of ['proxy-ready', 'direction-present', 'human-seam-wired']) {
      expect(local.applicable).toContain(rung);
      expect(hosted.applicable).toContain(rung);
    }
  });
});

describe('signalSetFor — direction-rung gating (synthetic: a direction-named rung on a non-documents.roles pack)', () => {
  // No shipped profile currently has this combination (only self-driving carries a direction-tagged extra
  // rung, and only self-driving's direction_spec.mode is 'documents.roles') — this proves the GENERIC gate
  // itself (never a profile-name branch) by constructing the contradictory case directly.
  const contradictoryPack: SignalSetPack = {
    codeHost: 'github',
    targets: ['local'],
    direction_spec: { mode: 'operator' }, // NOT documents.roles
    maturity_signals: { m3_tool: 'doctor' },
    extra_rungs: ['direction-present'], // but a direction rung is (incorrectly) declared anyway
  };

  test('the direction rung is skipped, cited by direction_spec.mode, rather than silently included', () => {
    const set = signalSetFor(contradictoryPack, 'local');
    expect(set.applicable).not.toContain('direction-present');
    const s = set.skipped.find((x) => x.id === 'direction-present')!;
    expect(s).toBeDefined();
    expect(s.reason).toContain("direction_spec.mode='operator'");
    expect(s.reason).toContain('documents.roles');
  });

  test('a non-direction rung on the same pack still passes through unconditionally', () => {
    const packWithOtherRung: SignalSetPack = { ...contradictoryPack, extra_rungs: ['proxy-ready'] };
    const set = signalSetFor(packWithOtherRung, 'local');
    expect(set.applicable).toContain('proxy-ready');
  });
});

describe('signalSetFor — invalid target', () => {
  test('throws when target is not one of the pack\'s own declared targets', () => {
    expect(() => signalSetFor(simpleSdlcPack, 'gh-actions')).toThrow(/not one of this pack's declared targets/);
  });
});
