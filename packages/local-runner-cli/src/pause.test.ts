import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DRAIN_NOTE, isPaused, pause, pausedMarkerPath, pausedMessage, pauseReasonText, resume } from './pause.ts';

function tmpRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'oa-pause-'));
  mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
  return dir;
}

describe('the conventional paused marker — declared job fence, CLI is ergonomics only', () => {
  test('isPaused is false when no marker exists', () => {
    const dir = tmpRepo();
    try {
      expect(isPaused(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('oa pause touches the marker (creates it) — never deletes as an agent action', () => {
    const dir = tmpRepo();
    try {
      const r = pause({ cwd: dir });
      expect(r.alreadyPaused).toBe(false);
      expect(existsSync(pausedMarkerPath(dir))).toBe(true);
      expect(isPaused(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('oa pause is idempotent: pausing an already-paused install preserves the existing reason unless a new one is given', () => {
    const dir = tmpRepo();
    try {
      writeFileSync(pausedMarkerPath(dir), 'operator note: paused for maintenance\n');
      const r = pause({ cwd: dir });
      expect(r.alreadyPaused).toBe(true);
      expect(readFileSync(pausedMarkerPath(dir), 'utf8')).toContain('maintenance'); // preserved, not clobbered
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('oa pause <reason> overwrites with the new reason even if already paused', () => {
    const dir = tmpRepo();
    try {
      pause({ cwd: dir });
      pause({ cwd: dir, reason: 'operator: rotating credentials' });
      expect(readFileSync(pausedMarkerPath(dir), 'utf8')).toContain('rotating credentials');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('oa resume removes the marker — this IS the operator act (a human ran the CLI), same authority as `rm .open-autonomy/paused`', () => {
    const dir = tmpRepo();
    try {
      pause({ cwd: dir });
      const r = resume({ cwd: dir });
      expect(r.wasPaused).toBe(true);
      expect(existsSync(pausedMarkerPath(dir))).toBe(false);
      expect(isPaused(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('oa resume on an already-unpaused install is a safe no-op', () => {
    const dir = tmpRepo();
    try {
      const r = resume({ cwd: dir });
      expect(r.wasPaused).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('pausedMessage names the exact unpause command and the marker path', () => {
    const dir = tmpRepo();
    try {
      const msg = pausedMessage(dir);
      expect(msg).toContain('CONVENTIONAL FENCE PRESENT');
      expect(msg).toContain('oa resume');
      expect(msg).toContain(pausedMarkerPath(dir));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('pauseReasonText reads the marker content; null when unpaused', () => {
    const dir = tmpRepo();
    try {
      expect(pauseReasonText(dir)).toBeNull();
      pause({ cwd: dir, reason: 'testing' });
      expect(pauseReasonText(dir)).toContain('testing');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('DRAIN_NOTE documents drain-not-kill semantics', () => {
    expect(DRAIN_NOTE).toContain('drain');
    expect(DRAIN_NOTE.toLowerCase()).toContain('never kills an in-flight job');
  });
});
