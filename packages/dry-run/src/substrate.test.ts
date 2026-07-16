import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { virtualClock } from './clock.ts';
import { assertDryRunConfig, EgressBlockedError, installEgressGuard, isLoopbackUrl } from './guard.ts';
import { openLedger } from './ledger.ts';

describe('virtual clock', () => {
  test('advances deterministically and refuses to move backwards', () => {
    const clock = virtualClock(1_000_000);
    expect(clock.now()).toBe(1_000_000);
    clock.advance(30 * 60 * 1000);
    expect(clock.now()).toBe(1_000_000 + 30 * 60 * 1000);
    expect(() => clock.advance(-1)).toThrow(/backwards/);
    expect(() => clock.set(0)).toThrow(/backwards/);
  });
});

describe('action ledger', () => {
  test('appends durable entries and reloads them with a stable seq', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dryrun-ledger-'));
    const clock = virtualClock(42);
    const path = join(dir, 'ledger.jsonl');
    const ledger = openLedger(path, () => clock.now());
    ledger.append('messaging', 'postMessage', { channel: 'C1', text: 'hello' });
    clock.advance(10);
    ledger.append('builds', 'startBuild', { commitSha: 'abc' });

    const reopened = openLedger(path, () => clock.now());
    const entries = reopened.entries();
    expect(entries.length).toBe(2);
    expect(entries[0]).toMatchObject({ seq: 1, at: 42, port: 'messaging', action: 'postMessage' });
    expect(entries[1]).toMatchObject({ seq: 2, at: 52, port: 'builds', action: 'startBuild' });

    reopened.append('messaging', 'postMessage', { channel: 'C1', text: 'again' });
    expect(reopened.entries().at(-1)?.seq).toBe(3);
  });
});

describe('dry-run guard', () => {
  test('classifies loopback vs external urls', () => {
    expect(isLoopbackUrl('http://127.0.0.1:18201/api/auth.test')).toBe(true);
    expect(isLoopbackUrl('http://localhost:3300/')).toBe(true);
    expect(isLoopbackUrl('https://slack.com/api/chat.postMessage')).toBe(false);
    expect(isLoopbackUrl('https://api.github.com/repos/x/y')).toBe(false);
    expect(isLoopbackUrl('not a url')).toBe(false);
  });

  test('refuses non-loopback endpoints and real-looking credentials at startup', () => {
    expect(() => assertDryRunConfig({ endpoints: { slack: 'https://slack.com/api' }, credentials: {} })).toThrow(
      /not loopback/,
    );
    expect(() =>
      assertDryRunConfig({
        endpoints: { slack: 'http://127.0.0.1:18201/api' },
        credentials: { slackToken: 'xoxb-2914-real-looking' },
      }),
    ).toThrow(/conspicuously fake/);
    expect(() =>
      assertDryRunConfig({
        endpoints: { slack: 'http://127.0.0.1:18201/api', github: 'http://localhost:18202' },
        credentials: { slackToken: 'fake-slack-token', githubToken: 'twin-gh' },
      }),
    ).not.toThrow();
  });

  describe('fetch egress blocking', () => {
    let guard: ReturnType<typeof installEgressGuard> | undefined;
    afterEach(() => guard?.uninstall());

    test('blocks external fetch, records it, and allows loopback through', async () => {
      guard = installEgressGuard();
      expect(fetch('https://slack.com/api/chat.postMessage')).rejects.toThrow(EgressBlockedError);
      expect(guard.blocked).toEqual(['https://slack.com/api/chat.postMessage']);
      // Loopback passes the guard; a connection error is fine — the point is
      // that it was permitted to attempt, not that something listens there.
      await fetch('http://127.0.0.1:1/none').catch(() => undefined);
      expect(guard.allowed).toEqual(['http://127.0.0.1:1/none']);
    });

    test('uninstall restores the original fetch', () => {
      const original = globalThis.fetch;
      guard = installEgressGuard();
      expect(globalThis.fetch).not.toBe(original);
      guard.uninstall();
      expect(globalThis.fetch).toBe(original);
    });
  });
});
