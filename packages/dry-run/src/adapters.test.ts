import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitCodeHost, makeGitRepo } from './adapters/git-code-host.ts';
import { sha256Hex, simBuilds, simCodeHost, simDocuments, simMessaging } from './adapters/sim.ts';
import { virtualClock } from './clock.ts';

const T0 = 1_000_000;

describe('sim messaging', () => {
  test('cursor-based reads see only elapsed events, in order, exactly once', async () => {
    const clock = virtualClock(T0);
    const m = simMessaging(clock);
    m.seedInboundMessage({ channel: 'C1', actorId: 'U1', actorType: 'human', text: 'now', occurredAt: T0 });
    m.seedInboundMessage({ channel: 'C1', actorId: 'U1', actorType: 'human', text: 'future', occurredAt: T0 + 100 });

    const first = await m.readEvents('C1');
    expect(first.events.map((e) => e.text)).toEqual(['now']); // the future event is not visible yet
    clock.advance(100);
    const second = await m.readEvents('C1', first.cursor);
    expect(second.events.map((e) => e.text)).toEqual(['future']);
    const third = await m.readEvents('C1', second.cursor);
    expect(third.events).toEqual([]);
  });

  test('uploads record real digests and bytes round-trip', async () => {
    const clock = virtualClock(T0);
    const m = simMessaging(clock);
    const bytes = new TextEncoder().encode('artifact-bytes');
    const uploaded = await m.uploadFile('C1', 'a.bin', bytes);
    expect(uploaded.sha256).toBe(sha256Hex(bytes));
    expect(await m.fetchFileBytes(uploaded.fileId)).toEqual(bytes);
  });
});

describe('sim documents', () => {
  test('snapshots pin exact bytes and revision', async () => {
    const clock = virtualClock(T0);
    const d = simDocuments(clock);
    const bytes = new TextEncoder().encode('%PDF-fake');
    d.setDocument('doc://tasks', 'rev-1', bytes);
    const snap = await d.fetchSnapshot('doc://tasks');
    expect(snap).toMatchObject({ revisionId: 'rev-1', sha256: sha256Hex(bytes), observedAt: T0 });
  });
});

describe('sim builds', () => {
  test('deterministic artifacts per commit; failNextCompletion fails exactly one build', async () => {
    const clock = virtualClock(T0);
    const b = simBuilds(clock, 1000);
    const { buildId } = await b.startBuild('sha-x');
    expect((await b.getBuild(buildId)).status).toBe('running');
    clock.advance(1000);
    const done = await b.getBuild(buildId);
    expect(done.status).toBe('succeeded');

    b.failNextCompletion();
    const doomed = await b.startBuild('sha-x');
    const retry = await b.startBuild('sha-x'); // fail flag consumed by the first
    clock.advance(1000);
    expect((await b.getBuild(doomed.buildId)).status).toBe('failed');
    const retried = await b.getBuild(retry.buildId);
    expect(retried.status).toBe('succeeded');
    expect(retried.artifact?.sha256).toBe(done.artifact?.sha256); // same commit -> same digest
  });
});

describe('sim code host', () => {
  test('merged PRs move the base head and surface changed paths', async () => {
    const host = simCodeHost({ main: 'sha-base' });
    host.createRemoteBranch('candidate', 'sha-base');
    const pr = host.developerOpensPr({ head: 'agent/x', base: 'candidate', title: 'x', paths: ['src/x.ts'] });
    const mergeSha = host.mergePr(pr.number);
    expect(await host.getBranchHead('candidate')).toBe(mergeSha);
    expect((await host.listPullRequests({ base: 'candidate', state: 'closed' }))[0]?.merged).toBe(true);
    expect(await host.listChangedPaths('main', mergeSha)).toEqual(['src/x.ts']);
  });
});

describe('real-git code host', () => {
  test('branch, implement, merge, and diff against actual git', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dryrun-git-'));
    const repo = makeGitRepo(root, 'main');
    const host = gitCodeHost(repo);
    const base = await host.getBranchHead('main');
    await host.createBranch('candidate', base);

    const pr = await host.developerImplements({
      issueBranch: 'agent/demo/ISSUE-1',
      base: 'candidate',
      title: 'implement ISSUE-1',
      path: 'src/feature.ts',
      content: 'export const done = true\n',
    });
    const mergeSha = host.mergePr(pr.number);
    expect(await host.getBranchHead('candidate')).toBe(mergeSha);
    expect(await host.listChangedPaths('main', mergeSha)).toEqual(['src/feature.ts']);
    // A second issue forks from the moved candidate, not the stale base.
    const pr2 = await host.developerImplements({
      issueBranch: 'agent/demo/ISSUE-2',
      base: 'candidate',
      title: 'implement ISSUE-2',
      path: 'src/feature2.ts',
      content: 'export const also = true\n',
    });
    const mergeSha2 = host.mergePr(pr2.number);
    expect((await host.listChangedPaths('main', mergeSha2)).sort()).toEqual(['src/feature.ts', 'src/feature2.ts']);
  });
});
