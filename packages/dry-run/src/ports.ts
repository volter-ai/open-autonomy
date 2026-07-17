// The external-operations boundary for hermetic (dry-run) autonomy workflows.
//
// A workflow that talks to the outside world (messaging, documents, a code
// host, builds, the clock) depends on these PORT contracts, never on vendor
// SDKs directly. "Dry-run" vs "live" is then a dependency configuration — the
// same workflow implementation wired to different adapter sets:
//
//   sim adapters   — in-process, deterministic, zero servers (CI's e2e path)
//   twin adapters  — the same contracts over loopback HTTP against local
//                    vendor twins (rehearses live call shapes hermetically)
//   live adapters  — real credentials, same contracts
//
// This is deliberately NOT a workflow engine: the consumer owns its state
// machine and policy. The substrate owns time, side-effect capture, and the
// fail-closed hermetic guarantee (see guard.ts).

export type Mode = 'dry-run' | 'live';

// ---------------------------------------------------------------------------
// Clock — every time-dependent rule reads this, never Date.now(). Tests drive
// the virtual clock; no test sleeps through a quiet window or poll interval.
export interface Clock {
  now(): number;
}

export interface VirtualClock extends Clock {
  advance(ms: number): void;
  set(epochMs: number): void;
}

// ---------------------------------------------------------------------------
// Messaging (channel-shaped: Slack and friends) — announcements, artifact
// delivery, and inbound human activity. Human attestations (approvals) ride
// ordinary messages because messages carry strong per-author identity.
export interface OutboundMessage {
  channel: string;
  text: string;
  threadTs?: string;
}

export interface PostedMessage {
  messageId: string;
  channel: string;
}

export interface UploadedFile {
  fileId: string;
  filename: string;
  sha256: string;
  size: number;
}

export interface InboundEvent {
  eventId: string;
  kind: 'message' | 'file';
  channel: string;
  actorId: string;
  actorType: 'human' | 'automation';
  text: string;
  threadTs?: string;
  fileId?: string;
  filename?: string;
  occurredAt: number;
}

export interface MessagingPort {
  postMessage(msg: OutboundMessage): Promise<PostedMessage>;
  uploadFile(
    channel: string,
    filename: string,
    bytes: Uint8Array,
    opts?: { title?: string; threadTs?: string },
  ): Promise<UploadedFile>;
  /** Cursor-based pull: events strictly after the cursor, oldest first. */
  readEvents(channel: string, cursor?: string): Promise<{ events: InboundEvent[]; cursor: string }>;
  fetchFileBytes(fileId: string): Promise<Uint8Array>;
}

// ---------------------------------------------------------------------------
// Documents — upstream inputs (task docs, feedback docs). A workflow never
// edits them; it snapshots exact bytes per observed revision.
export interface DocumentSnapshot {
  docRef: string;
  revisionId: string;
  bytes: Uint8Array;
  sha256: string;
  observedAt: number;
}

export interface DocumentPort {
  fetchSnapshot(docRef: string): Promise<DocumentSnapshot>;
}

// ---------------------------------------------------------------------------
// Code host — branches and pull requests. Actual git contents live in real
// repositories (local bare repos in dry-run); PR/review state lives with the
// host. This split matches live mode (git CLI + REST API).
export interface PullRequest {
  number: number;
  url: string;
  head: string;
  base: string;
  title: string;
  state: 'open' | 'closed';
  merged: boolean;
  mergeCommitSha?: string;
}

export interface CodeHostPort {
  getBranchHead(branch: string): Promise<string>;
  createBranch(branch: string, fromSha: string): Promise<void>;
  listPullRequests(filter: { base: string; state?: 'open' | 'closed' | 'all' }): Promise<PullRequest[]>;
  openPullRequest(input: { head: string; base: string; title: string; body: string }): Promise<PullRequest>;
  /** File paths changed between base and head — release gates use this to
   *  prove private material never leaks into an outbound PR. */
  listChangedPaths(base: string, head: string): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Builds — produce an artifact for an exact commit.
export interface BuildArtifact {
  filename: string;
  sha256: string;
  size: number;
  bytes: Uint8Array;
}

export interface BuildResult {
  buildId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  commitSha: string;
  artifact?: BuildArtifact;
}

export interface BuildPort {
  startBuild(commitSha: string): Promise<{ buildId: string }>;
  getBuild(buildId: string): Promise<BuildResult>;
}

// ---------------------------------------------------------------------------
export interface Ports {
  clock: Clock;
  messaging: MessagingPort;
  documents: DocumentPort;
  codeHost: CodeHostPort;
  builds: BuildPort;
}
