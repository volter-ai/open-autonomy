import { createHash } from 'node:crypto';
import type {
  BuildPort,
  BuildResult,
  Clock,
  CodeHostPort,
  DocumentPort,
  DocumentSnapshot,
  InboundEvent,
  MessagingPort,
  PullRequest,
} from '../ports.ts';

// In-process, deterministic adapters — the zero-server dry-run path used by
// unit tests and CI end-to-end scenarios. Each also exposes a small
// seeding/inspection surface for a scenario harness (seed inbound messages,
// read what was posted, merge a PR "as the developer").

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// ---------------------------------------------------------------------------
export interface SimMessaging extends MessagingPort {
  seedInboundMessage(input: {
    channel: string;
    actorId: string;
    actorType: 'human' | 'automation';
    text: string;
    occurredAt: number;
  }): InboundEvent;
  outbound: Array<{ channel: string; text: string; messageId: string }>;
  uploads: Array<{ channel: string; filename: string; sha256: string; size: number }>;
}

export function simMessaging(clock: Clock): SimMessaging {
  const events: InboundEvent[] = [];
  const files = new Map<string, Uint8Array>();
  let seq = 0;
  const messaging: SimMessaging = {
    outbound: [],
    uploads: [],
    seedInboundMessage(input) {
      seq += 1;
      const event: InboundEvent = {
        eventId: `evt-${seq}`,
        kind: 'message',
        channel: input.channel,
        actorId: input.actorId,
        actorType: input.actorType,
        text: input.text,
        occurredAt: input.occurredAt,
      };
      events.push(event);
      return event;
    },
    async postMessage(msg) {
      seq += 1;
      const messageId = `msg-${seq}`;
      messaging.outbound.push({ channel: msg.channel, text: msg.text, messageId });
      return { messageId, channel: msg.channel };
    },
    async uploadFile(channel, filename, bytes) {
      seq += 1;
      const fileId = `file-${seq}`;
      files.set(fileId, bytes);
      const record = { channel, filename, sha256: sha256Hex(bytes), size: bytes.length };
      messaging.uploads.push(record);
      return { fileId, filename, sha256: record.sha256, size: bytes.length };
    },
    async readEvents(channel, cursor) {
      const from = cursor ? Number(cursor) : 0;
      const now = clock.now();
      // Only events that have "happened" by the (virtual) clock are visible.
      const visible = events.filter((e, idx) => idx >= from && e.channel === channel && e.occurredAt <= now);
      const lastIndex = visible.length > 0 ? events.indexOf(visible.at(-1) as InboundEvent) + 1 : from;
      return { events: visible, cursor: String(Math.max(from, lastIndex)) };
    },
    async fetchFileBytes(fileId) {
      const bytes = files.get(fileId);
      if (!bytes) throw new Error(`unknown file ${fileId}`);
      return bytes;
    },
  };
  return messaging;
}

// ---------------------------------------------------------------------------
export interface SimDocuments extends DocumentPort {
  setDocument(docRef: string, revisionId: string, bytes: Uint8Array): void;
}

export function simDocuments(clock: Clock): SimDocuments {
  const docs = new Map<string, { revisionId: string; bytes: Uint8Array }>();
  return {
    setDocument(docRef, revisionId, bytes) {
      docs.set(docRef, { revisionId, bytes });
    },
    async fetchSnapshot(docRef): Promise<DocumentSnapshot> {
      const doc = docs.get(docRef);
      if (!doc) throw new Error(`no document at ${docRef}`);
      return {
        docRef,
        revisionId: doc.revisionId,
        bytes: doc.bytes,
        sha256: sha256Hex(doc.bytes),
        observedAt: clock.now(),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Symbolic code host: branches point at synthetic shas; each merged PR adds a
// commit carrying the paths it touched. Faithful enough for gate logic (head
// movement, merged-PR reconciliation, release-diff checks); use the real-git
// adapter (git-code-host.ts) when a scenario needs actual git ground truth.
export interface SimCodeHost extends CodeHostPort {
  createRemoteBranch(branch: string, fromSha: string): void;
  developerOpensPr(input: { head: string; base: string; title: string; paths: string[] }): PullRequest;
  mergePr(number: number): string;
  setBranchHead(branch: string, sha: string): void;
}

export function simCodeHost(seedBranches: Record<string, string>): SimCodeHost {
  const branches = new Map<string, string>(Object.entries(seedBranches));
  const commits = new Map<string, { branch: string; paths: string[] }>();
  const prs: Array<PullRequest & { paths: string[] }> = [];
  let shaSeq = 0;
  const newSha = () => {
    shaSeq += 1;
    return `sha-${String(shaSeq).padStart(4, '0')}`;
  };
  const requireBranch = (branch: string): string => {
    const head = branches.get(branch);
    if (!head) throw new Error(`unknown branch ${branch}`);
    return head;
  };
  return {
    createRemoteBranch(branch, fromSha) {
      branches.set(branch, fromSha);
    },
    setBranchHead(branch, sha) {
      branches.set(branch, sha);
    },
    developerOpensPr(input) {
      const pr: PullRequest & { paths: string[] } = {
        number: prs.length + 1,
        url: `sim://pr/${prs.length + 1}`,
        head: input.head,
        base: input.base,
        title: input.title,
        state: 'open',
        merged: false,
        paths: input.paths,
      };
      prs.push(pr);
      return pr;
    },
    mergePr(number) {
      const pr = prs.find((p) => p.number === number);
      if (!pr || pr.merged) throw new Error(`pr ${number} missing or already merged`);
      const mergeSha = newSha();
      commits.set(mergeSha, { branch: pr.base, paths: pr.paths });
      branches.set(pr.base, mergeSha);
      pr.state = 'closed';
      pr.merged = true;
      pr.mergeCommitSha = mergeSha;
      return mergeSha;
    },
    async getBranchHead(branch) {
      return requireBranch(branch);
    },
    async createBranch(branch, fromSha) {
      branches.set(branch, fromSha);
    },
    async listPullRequests(filter) {
      return prs.filter(
        (p) => p.base === filter.base && (filter.state === 'all' || !filter.state || p.state === filter.state),
      );
    },
    async openPullRequest(input) {
      const pr: PullRequest & { paths: string[] } = {
        number: prs.length + 1,
        url: `sim://pr/${prs.length + 1}`,
        head: input.head,
        base: input.base,
        title: input.title,
        state: 'open',
        merged: false,
        paths: [],
      };
      prs.push(pr);
      return pr;
    },
    async listChangedPaths(base, head) {
      // Diff base..head in the symbolic model: every commit merged onto a
      // non-base branch contributes its touched paths.
      void head;
      const paths = new Set<string>();
      for (const [, commit] of commits) {
        if (commit.branch !== base) for (const p of commit.paths) paths.add(p);
      }
      return [...paths].sort();
    },
  };
}

// ---------------------------------------------------------------------------
// Deterministic build simulator: completes after `durationMs` of (virtual)
// clock time; artifact bytes derive from the commit sha, so the same commit
// always produces the same artifact digest. failNextCompletion() makes exactly
// one build fail when it completes — the flaky-runner regression hook.
export interface SimBuilds extends BuildPort {
  failNextCompletion(): void;
}

export function simBuilds(clock: Clock, durationMs: number): SimBuilds {
  const builds = new Map<string, { commitSha: string; startedAt: number; fail: boolean }>();
  let seq = 0;
  let failNext = false;
  return {
    failNextCompletion() {
      failNext = true;
    },
    async startBuild(commitSha) {
      seq += 1;
      const buildId = `build-${seq}`;
      builds.set(buildId, { commitSha, startedAt: clock.now(), fail: failNext });
      failNext = false;
      return { buildId };
    },
    async getBuild(buildId): Promise<BuildResult> {
      const build = builds.get(buildId);
      if (!build) throw new Error(`unknown build ${buildId}`);
      if (clock.now() - build.startedAt < durationMs) {
        return { buildId, status: 'running', commitSha: build.commitSha };
      }
      if (build.fail) {
        return { buildId, status: 'failed', commitSha: build.commitSha };
      }
      const bytes = new TextEncoder().encode(`ARTIFACT:${build.commitSha}:deterministic`);
      return {
        buildId,
        status: 'succeeded',
        commitSha: build.commitSha,
        artifact: {
          filename: `artifact-${build.commitSha}.bin`,
          sha256: sha256Hex(bytes),
          size: bytes.length,
          bytes,
        },
      };
    },
  };
}
