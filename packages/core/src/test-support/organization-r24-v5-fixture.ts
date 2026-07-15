import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "../organization-canonical";
import {
  sealProviderTranscript,
  transcriptRaw,
  transcriptRecord,
  deriveProviderOuterJoin,
  type TranscriptRecord,
} from "../organization-r24-provider-transcripts";
import {
  createV5Binding,
  deriveV5Trace,
  launcherInputDigest,
  signV5Receipt,
  V5_INPUT_LOCK_PATHS,
  type V5LauncherInput,
  type V5NativeTrace,
} from "../organization-r24-v5-protocol";
import type { V5CellRecord } from "../organization-r24-v5-live-runner";

export const V5_FIXTURE_RECEIPT_KEY = "0123456789abcdef0123456789abcdef";
const D = "sha256:" + "a".repeat(64),
  AT = "2026-07-15T00:00:00Z",
  nonce = "b".repeat(64),
  hash = (value: unknown) =>
    `sha256:${createHash("sha256")
      .update(typeof value === "string" ? value : canonicalSemanticJson(value))
      .digest("hex")}`,
  record = (
    label: string,
    kind: "cli" | "http" | "file",
    response: TranscriptRecord["response"],
    sequence: number,
  ) =>
    transcriptRecord(
      { label, kind, request: {}, response },
      sequence,
      AT,
      String(sequence + 2),
    );

function paperclipTranscript(challenge: string, workId: string, pid: number) {
  const head = "90f85a7d11c517b1d09db90dbec97f4de7d96b83",
    tree = "1234567890abcdef1234567890abcdef12345678",
    http = (value: unknown) => ({
      status: 200,
      body: transcriptRaw(JSON.stringify(value)),
    }),
    cli = (value: string) => ({
      exitCode: 0,
      stdout: transcriptRaw(value),
      stderr: transcriptRaw(""),
    }),
    records = [
      record(
        "revision-health",
        "http",
        http({ version: "0.3.1", serverInfo: { git: { fullSha: head } } }),
        0,
      ),
      record("revision-git", "cli", cli(`${head}\n`), 1),
      record("revision-tree", "cli", cli(`${tree}\n`), 2),
      record("revision-dirty", "cli", cli(""), 3),
      record(
        "revision-lock",
        "file",
        { file: transcriptRaw("fixture lock") },
        4,
      ),
      record(
        "config-readback",
        "http",
        http({
          id: "agent-1",
          issueId: workId,
          adapterConfig: {
            env: { OA_R24_CHALLENGE: challenge },
            commandDigest: D,
          },
        }),
        5,
      ),
      record("dispatch", "http", http({ runId: "run-1", issueId: workId }), 6),
      record(
        "runs-readback",
        "http",
        http({
          runs: [
            {
              id: "run-1",
              agentId: "agent-1",
              contextSnapshot: { issueId: workId },
              processPid: pid,
              status: "succeeded",
            },
          ],
        }),
        7,
      ),
      record("run-log", "http", http(`native ${challenge}`), 8),
    ];
  return sealProviderTranscript(
    "paperclip",
    records,
    { wallAt: AT, monotonicNs: "1" },
    { wallAt: "2026-07-15T00:00:05Z", monotonicNs: "20" },
  );
}

function hermesTranscript(challenge: string, workId: string, pid: number) {
  const cli = (value: string) => ({
      exitCode: 0,
      stdout: transcriptRaw(value),
      stderr: transcriptRaw(""),
    }),
    records = [
      record(
        "revision",
        "cli",
        cli("Hermes Agent v0.18.2 upstream 00a36831 local 226e8de8"),
        0,
      ),
      record(
        "revision-executable",
        "file",
        { file: transcriptRaw("pinned hermes executable") },
        1,
      ),
      record(
        "config-readback",
        "cli",
        cli(
          JSON.stringify({
            id: workId,
            assignee: "worker",
            challenge,
            commandDigest: D,
          }),
        ),
        2,
      ),
      record("dispatch", "cli", cli("{}"), 3),
      record(
        "state-readback",
        "cli",
        cli(
          JSON.stringify({
            runs: [{ id: "run-1", task_id: workId, pid, status: "completed" }],
          }),
        ),
        4,
      ),
      record("run-log", "cli", cli(`native ${challenge}`), 5),
      transcriptRecord(
        {
          label: "sqlite-snapshot",
          kind: "file",
          request: { filePath: "/owned/db" },
          response: { file: transcriptRaw("SQLite format 3 fixture") },
        },
        6,
        AT,
        "8",
      ),
    ];
  return sealProviderTranscript(
    "hermes",
    records,
    { wallAt: AT, monotonicNs: "1" },
    { wallAt: "2026-07-15T00:00:05Z", monotonicNs: "20" },
  );
}

export type V5CellFixtureOptions = {
  substrate?: "hermes" | "paperclip";
  pairId?: string;
  trialId?: string;
  replication?: number;
  assignmentDigest?: string;
  launcherSpecDigest?: string;
  nonce?: string;
  isolationId?: string;
  fault?: { id: string; digest: string };
  receiptKey?: string;
  pid?: number;
  externalMeter?: V5NativeTrace["externalMeter"];
};
export function createV5CellFixture(
  options: V5CellFixtureOptions = {},
): V5CellRecord {
  const substrate = options.substrate ?? "paperclip",
    fixtureNonce = options.nonce ?? nonce,
    cellId = options.isolationId ?? "fixture-cell",
    receiptKey = options.receiptKey ?? V5_FIXTURE_RECEIPT_KEY,
    launcherPid = options.pid ?? 12,
    hermesPid = launcherPid + 1,
    toolPid = launcherPid + 2,
    workId = options.trialId ?? "trial-1",
    providerTranscript =
      substrate === "paperclip"
        ? paperclipTranscript(fixtureNonce, workId, launcherPid)
        : hermesTranscript(fixtureNonce, workId, launcherPid),
    native = deriveProviderOuterJoin(providerTranscript),
    locks = V5_INPUT_LOCK_PATHS.map((path) => ({
      path,
      digest:
        path === "provider-revision"
          ? hash(native.revision)
          : path === "provider-config"
            ? native.configurationDigest
            : path === "provider-command"
              ? native.commandDigest
              : D,
      application: "enforced-by-launcher" as const,
      evidence: `fixture evidence for ${path}`,
    })),
    lockDigest = hash(
      locks
        .slice()
        .sort((a, b) => a.path.localeCompare(b.path))
        .map(({ path, digest }) => ({ path, digest })),
    ),
    binding = createV5Binding(
      {
        pairId: options.pairId ?? "pair-1",
        trialId: workId,
        replication: options.replication ?? 0,
        substrate,
        unitDigest: D,
        organizationDigest: D,
        behaviorDigest: D,
        controlDigest: D,
        workloadDigest: D,
        assignmentDigest: options.assignmentDigest ?? D,
        lockDigest,
        launcherSpecDigest: options.launcherSpecDigest ?? D,
      },
      fixtureNonce,
    ),
    input: V5LauncherInput = {
      originalArgv: ["paperclip", "run", "issue-1"],
      recordedEnv: { SAFE: "1" },
      normalization: {
        grammar: "paperclip-v5-fixture",
        preservation: [
          {
            source: "paperclip run issue-1",
            target: "canonical launcher invocation",
            disposition: "normalized",
            rationale: "test fixture canonicalization",
          },
        ],
      },
      canonicalArgv: ["launcher", "--issue", "issue-1"],
      launcherSpecDigest: options.launcherSpecDigest ?? D,
      secretCommitments: {},
      stackManifestDigest: D,
      pins: {
        launcher: D,
        runtime: D,
        realHermes: D,
        interpreter: D,
        profile: D,
        model: D,
        tools: D,
        skills: D,
        query: D,
      },
      binding,
    },
    receipt = (phase: "start" | "result") =>
      signV5Receipt(
        {
          phase,
          binding,
          inputDigest: launcherInputDigest(input),
          pid: launcherPid,
          processGroup: launcherPid,
          hermesPid,
          hermesProcessGroup: launcherPid,
          workerDigest: D,
          runtimeDigest: D,
          argvDigest: hash(input.canonicalArgv),
          at:
            phase === "start" ? "2026-07-15T00:00:01Z" : "2026-07-15T00:00:02Z",
          monotonicNs: phase === "start" ? "1000000000" : "1003000000",
          ...(phase === "start"
            ? { originalInput: input }
            : { terminal: "success" as const, exitCode: 0 }),
        },
        receiptKey,
      ),
    identities = [
      { pid: launcherPid, role: "launcher" as const, parentPid: 1 },
      { pid: hermesPid, role: "hermes" as const, parentPid: launcherPid },
      { pid: toolPid, role: "tool" as const, parentPid: hermesPid },
    ].map((x) => ({
      ...x,
      pgid: launcherPid,
      startTicks: String(x.pid),
      bootId: "fixture-boot",
      containmentId: cellId,
    })),
    trace: V5NativeTrace = {
      schema: "autonomy.r24-native-trace.v5",
      binding,
      configuration: {
        digest: D,
        rawDigest: D,
        readbackAt: AT,
      },
      dispatch: { digest: D, rawDigest: D, at: AT },
      spawn: { launcherPid, launcherPgid: launcherPid, at: AT },
      outerJoin: {
        challengeDigest: native.challengeDigest,
        configuredAgentId: native.agentId,
        configuredWorkId: native.workId,
        selectedNativeRunId: native.nativeRunId,
        selectedRunAgentId: native.agentId,
        selectedRunWorkId: native.workId,
        selectedRunPid: native.pid,
        concurrentCandidateRunIds: [],
      },
      log: [receipt("start"), receipt("result")]
        .map((x) => `OA_R24_RECEIPT ${JSON.stringify(x)}`)
        .join("\n"),
      terminal: {
        kind: "exited",
        exitCode: 0,
        signal: null,
        at: "2026-07-15T00:00:03Z",
      },
      supervisor: {
        schema: "autonomy.process-tree-supervisor.v2",
        assurance: "ordinary-timeout",
        containment: {
          kind: "provider-supervised-tree",
          id: cellId,
          owner: "provider-supervisor",
          killPrimitive: "provider-tree-kill",
          escapePreventionEvidence: "fixture provider tree observation",
        },
        timeout: { deadlineAt: "2026-07-15T00:00:02Z", graceMs: 1000 },
        supervisor: {
          identity: {
            pid: 1,
            pgid: 1,
            startTicks: "1",
            bootId: "fixture-boot",
            role: "supervisor",
            parentPid: null,
            containmentId: cellId,
          },
          diedAt: null,
        },
        processes: identities,
        groupRelation: "shared",
        observations: [
          {
            at: "2026-07-15T00:00:01Z",
            source: "procfs+provider",
            members: identities,
            populated: true,
            evidenceDigest: D,
          },
        ],
        signals: [
          {
            kind: "TERM",
            at: "2026-07-15T00:00:02Z",
            targetContainmentId: cellId,
            authority: "provider-supervisor",
            evidenceDigest: D,
          },
          {
            kind: "KILL",
            at: "2026-07-15T00:00:03Z",
            targetContainmentId: cellId,
            authority: "provider-supervisor",
            evidenceDigest: D,
          },
        ],
        terminal: identities.map((identity) => ({
          identity,
          at: "2026-07-15T00:00:03Z",
          kind: "signaled" as const,
          status: 9,
          evidenceDigest: D,
        })),
        final: {
          at: "2026-07-15T00:00:04Z",
          populated: false,
          members: [],
          reap: identities.map((identity) => ({
            identity,
            proof: "provider-reaped" as const,
            evidenceDigest: D,
          })),
          evidenceDigest: D,
        },
      },
      descendants: {
        observed: [launcherPid, hermesPid, toolPid],
        aliveAfterTerminal: [],
        reaped: true,
      },
      attempts: [{ id: "native-attempt", status: "exited", rawDigest: D }],
      externalMeter: options.externalMeter ?? {
        wallMs: 3000,
        cpuMs: 2,
        maxRssKiB: 1024,
        method: "fixture meter",
        raw: {
          rootPid: launcherPid,
          clockTicksPerSecond: 1000,
          samples: [
            {
              monotonicNs: "0",
              rootPid: launcherPid,
              processes: [
                {
                  pid: launcherPid,
                  ppid: 1,
                  group: launcherPid,
                  cpuTicks: 10,
                  rssKiB: 512,
                },
              ],
            },
            {
              monotonicNs: "3000000000",
              rootPid: launcherPid,
              processes: [
                {
                  pid: launcherPid,
                  ppid: 1,
                  group: launcherPid,
                  cpuTicks: 12,
                  rssKiB: 1024,
                },
              ],
            },
          ],
        },
      },
      preservation: [
        {
          source: "paperclip run issue-1",
          target: "canonical launcher invocation",
          disposition: "normalized",
          rationale: "test fixture canonicalization",
        },
      ],
    },
    attempt = {
      kind: "launched" as const,
      attemptId: "attempt-1",
      substrate,
      binding,
      startedAt: AT,
      completedAt: "2026-07-15T00:00:04Z",
      providerRunId: native.nativeRunId,
      input,
      trace,
      providerTranscript,
    },
    derived = deriveV5Trace(trace, receiptKey, binding, input),
    sentinel = Buffer.from("foreign fixture sentinel"),
    sentinelRecord = {
      bytesBase64: sentinel.toString("base64"),
      digest: `sha256:${createHash("sha256").update(sentinel).digest("hex")}`,
    },
    faultId = options.fault?.id ?? "none",
    faultDigest = options.fault?.digest ?? D,
    faultInjector = { revision: "fixture-injector-v1", commandDigest: D },
    faultRequest = {
      faultId,
      faultDigest,
      bindingDigest: hash(binding),
      isolationId: cellId,
      targetWorkId: native.workId,
      issuedAt: "2026-07-15T00:00:00.250Z",
    },
    faultRequestDigest = hash(faultRequest),
    faultAcknowledgement = {
      requestDigest: faultRequestDigest,
      acceptedAt: "2026-07-15T00:00:00.500Z",
    },
    faultObservedScope = {
      isolationId: cellId,
      nativeRunId: native.nativeRunId,
      applied: true as const,
      appliedAt: "2026-07-15T00:00:00.750Z",
      evidenceDigest: D,
    };
  return {
    schema: "autonomy.r24-live-cell.v5",
    binding,
    attempts: [attempt],
    selectedAttemptId: attempt.attemptId,
    derived,
    fault: {
      id: faultId,
      digest: faultDigest,
      assignmentDigest: binding.assignmentDigest,
      bindingDigest: hash(binding),
      injectorDigest: hash(faultInjector),
      requestDigest: faultRequestDigest,
      acknowledgementDigest: hash(faultAcknowledgement),
      observedScopeDigest: hash(faultObservedScope),
      raw: {
        injector: faultInjector,
        request: faultRequest,
        acknowledgement: faultAcknowledgement,
        observedScope: faultObservedScope,
      },
    },
    locks: { fields: locks },
    preservation: locks.map(({ path }) => ({
      source: path,
      target: path,
      disposition: "preserved" as const,
      rationale: "fixture preserves the locked input",
    })),
    isolation: {
      ownedScopeIds: [cellId],
      foreignSentinelBefore: sentinelRecord,
      foreignSentinelAfter: { ...sentinelRecord },
    },
    cleanup: {
      actions: [{ ownedId: cellId, action: "delete", rawDigest: D }],
      readbacks: [{ ownedId: cellId, state: "absent", rawDigest: D }],
      residuals: [],
    },
    assistance: {
      manualDuringCell: false,
      automatedOnly: true,
      operatorMinutes: 0,
      provenance: "fixture automation",
    },
  };
}
export function createPaperclipV5CellFixture() {
  return createV5CellFixture({ substrate: "paperclip" });
}
