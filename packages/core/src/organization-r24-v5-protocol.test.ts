import { describe, expect, test } from "bun:test";
import {
  createV5Binding,
  deriveV5Trace,
  launcherInputDigest,
  signV5Receipt,
  type V5LauncherInput,
  type V5NativeTrace,
} from "./organization-r24-v5-protocol";
const key = "0123456789abcdef0123456789abcdef",
  d = "sha256:" + "a".repeat(64),
  binding = createV5Binding(
    {
      pairId: "pair",
      trialId: "trial",
      replication: 0,
      substrate: "hermes",
      unitDigest: d,
      organizationDigest: d,
      behaviorDigest: d,
      controlDigest: d,
      workloadDigest: d,
      assignmentDigest: d,
      lockDigest: d,
      launcherSpecDigest: d,
    },
    "b".repeat(64),
  ),
  input: V5LauncherInput = {
    originalArgv: ["native", "task"],
    recordedEnv: { SAFE: "1" },
    secretCommitments: {},
    stackManifestDigest: d,
    launcherSpecDigest: d,
    normalization: {
      grammar: "fixture",
      preservation: [
        {
          source: "native",
          target: "canonical",
          disposition: "normalized",
          rationale: "fixture",
        },
      ],
    },
    canonicalArgv: ["hermes", "-p", "worker", "chat", "-q", "canonical"],
    pins: {
      launcher: d,
      runtime: d,
      realHermes: d,
      interpreter: d,
      profile: d,
      model: d,
      tools: d,
      skills: d,
      query: d,
    },
    binding,
  };
function fixture(kind: "exited" | "timed-out" = "exited") {
  const start = signV5Receipt(
      {
        phase: "start",
        binding,
        inputDigest: launcherInputDigest(input),
        pid: 12,
        processGroup: 12,
        hermesPid: 20,
        hermesProcessGroup: 12,
        workerDigest: d,
        runtimeDigest: d,
        argvDigest: awaitDigest(input.canonicalArgv),
        at: "2026-07-15T00:00:01Z",
        monotonicNs: "1000000000",
        originalInput: input,
      },
      key,
    ),
    lines = [`OA_R24_RECEIPT ${JSON.stringify(start)}`];
  if (kind !== "timed-out") {
    const result = signV5Receipt(
      {
        phase: "result",
        binding,
        inputDigest: launcherInputDigest(input),
        pid: 12,
        processGroup: 12,
        hermesPid: 20,
        hermesProcessGroup: 12,
        workerDigest: d,
        runtimeDigest: d,
        argvDigest: awaitDigest(input.canonicalArgv),
        at: "2026-07-15T00:00:02Z",
        monotonicNs: "1003500000",
        terminal: "success",
        exitCode: 0,
      },
      key,
    );
    lines.push(`OA_R24_RECEIPT ${JSON.stringify(result)}`);
  }
  return {
    schema: "autonomy.r24-native-trace.v5",
    binding,
    configuration: {
      digest: d,
      rawDigest: d,
      readbackAt: "2026-07-15T00:00:00Z",
    },
    dispatch: { digest: d, rawDigest: d, at: "2026-07-15T00:00:00Z" },
    spawn: { launcherPid: 12, launcherPgid: 12, at: "2026-07-15T00:00:00Z" },
    outerJoin: {
      challengeDigest: rawDigest(binding.nonce),
      configuredAgentId: null,
      configuredWorkId: "work",
      selectedNativeRunId: "run",
      selectedRunAgentId: null,
      selectedRunWorkId: "work",
      selectedRunPid: 12,
      concurrentCandidateRunIds: [],
    },
    log: lines.join("\n"),
    terminal: {
      kind,
      exitCode: kind === "exited" ? 0 : null,
      signal: kind === "timed-out" ? "SIGTERM" : null,
      at: "2026-07-15T00:00:03Z",
    },
    supervisor: {
      schema: "autonomy.process-tree-supervisor.v2",
      assurance: "ordinary-timeout",
      containment: {
        kind: "provider-supervised-tree",
        id: "cell",
        owner: "provider-supervisor",
        killPrimitive: "provider-tree-kill",
        escapePreventionEvidence: "native provider process tree",
      },
      timeout: { deadlineAt: "2026-07-15T00:00:02Z", graceMs: 100 },
      supervisor: {
        identity: {
          pid: 1,
          pgid: 1,
          startTicks: "1",
          bootId: "boot",
          role: "supervisor",
          parentPid: null,
          containmentId: "cell",
        },
        diedAt: null,
      },
      processes: [
        {
          pid: 12,
          pgid: 12,
          startTicks: "12",
          bootId: "boot",
          role: "launcher",
          parentPid: 1,
          containmentId: "cell",
        },
        {
          pid: 20,
          pgid: 12,
          startTicks: "20",
          bootId: "boot",
          role: "hermes",
          parentPid: 12,
          containmentId: "cell",
        },
        {
          pid: 30,
          pgid: 12,
          startTicks: "30",
          bootId: "boot",
          role: "tool",
          parentPid: 20,
          containmentId: "cell",
        },
      ],
      groupRelation: "shared",
      observations: [
        {
          at: "2026-07-15T00:00:01Z",
          source: "procfs+provider",
          members: [
            {
              pid: 12,
              pgid: 12,
              startTicks: "12",
              bootId: "boot",
              role: "launcher",
              parentPid: 1,
              containmentId: "cell",
            },
            {
              pid: 20,
              pgid: 12,
              startTicks: "20",
              bootId: "boot",
              role: "hermes",
              parentPid: 12,
              containmentId: "cell",
            },
            {
              pid: 30,
              pgid: 12,
              startTicks: "30",
              bootId: "boot",
              role: "tool",
              parentPid: 20,
              containmentId: "cell",
            },
          ],
          populated: true,
          evidenceDigest: d,
        },
      ],
      signals: [
        {
          kind: "TERM",
          at: "2026-07-15T00:00:02Z",
          targetContainmentId: "cell",
          authority: "provider-supervisor",
          evidenceDigest: d,
        },
        {
          kind: "KILL",
          at: "2026-07-15T00:00:03Z",
          targetContainmentId: "cell",
          authority: "provider-supervisor",
          evidenceDigest: d,
        },
      ],
      terminal: [12, 20, 30].map((pid, i) => ({
        identity: [
          {
            pid: 12,
            pgid: 12,
            startTicks: "12",
            bootId: "boot",
            role: "launcher",
            parentPid: 1,
            containmentId: "cell",
          },
          {
            pid: 20,
            pgid: 12,
            startTicks: "20",
            bootId: "boot",
            role: "hermes",
            parentPid: 12,
            containmentId: "cell",
          },
          {
            pid: 30,
            pgid: 12,
            startTicks: "30",
            bootId: "boot",
            role: "tool",
            parentPid: 20,
            containmentId: "cell",
          },
        ][i]!,
        at: "2026-07-15T00:00:03Z",
        kind: "signaled",
        status: 9,
        evidenceDigest: d,
      })),
      final: {
        at: "2026-07-15T00:00:04Z",
        populated: false,
        members: [],
        reap: [12, 20, 30].map((pid, i) => ({
          identity: [
            {
              pid: 12,
              pgid: 12,
              startTicks: "12",
              bootId: "boot",
              role: "launcher",
              parentPid: 1,
              containmentId: "cell",
            },
            {
              pid: 20,
              pgid: 12,
              startTicks: "20",
              bootId: "boot",
              role: "hermes",
              parentPid: 12,
              containmentId: "cell",
            },
            {
              pid: 30,
              pgid: 12,
              startTicks: "30",
              bootId: "boot",
              role: "tool",
              parentPid: 20,
              containmentId: "cell",
            },
          ][i]!,
          proof: "provider-reaped",
          evidenceDigest: d,
        })),
        evidenceDigest: d,
      },
    },
    descendants: { observed: [12, 20], aliveAfterTerminal: [], reaped: true },
    attempts: [{ id: "attempt", status: kind, rawDigest: d }],
    externalMeter: {
      wallMs: 3000,
      cpuMs: 2,
      maxRssKiB: 1024,
      method: "fixture",
      raw: {
        rootPid: 12,
        clockTicksPerSecond: 1000,
        samples: [
          {
            monotonicNs: "0",
            rootPid: 12,
            processes: [
              { pid: 12, ppid: 1, group: 12, cpuTicks: 10, rssKiB: 512 },
            ],
          },
          {
            monotonicNs: "3000000000",
            rootPid: 12,
            processes: [
              { pid: 12, ppid: 1, group: 12, cpuTicks: 12, rssKiB: 1024 },
            ],
          },
        ],
      },
    },
    preservation: [
      {
        source: "native",
        target: "canonical",
        disposition: "normalized",
        rationale: "fixture",
      },
    ],
  } as V5NativeTrace;
}
function awaitDigest(v: unknown) {
  const { createHash } = require("node:crypto");
  const { canonicalSemanticJson } = require("./organization-canonical");
  return `sha256:${createHash("sha256").update(canonicalSemanticJson(v)).digest("hex")}`;
}
function rawDigest(v: string) {
  const { createHash } = require("node:crypto");
  return `sha256:${createHash("sha256").update(v).digest("hex")}`;
}
describe("R24 V5 authenticated causal replay", () => {
  test("derives success only from native terminal cross-checked with exact signed receipts", () => {
    expect(deriveV5Trace(fixture(), key, binding, input)).toMatchObject({
      status: "success",
      authenticated: true,
      causal: true,
      reaped: true,
      workerWallMs: 3.5,
      receiptCount: { start: 1, result: 1 },
    });
  });
  test("timeout requires authenticated start, no result, native kill and reaped tree", () => {
    expect(
      deriveV5Trace(fixture("timed-out"), key, binding, input),
    ).toMatchObject({
      status: "timeout",
      workerWallMs: null,
      receiptCount: { result: 0 },
    });
    const missingTerm = fixture("timed-out");
    missingTerm.supervisor.signals = [];
    expect(() => deriveV5Trace(missingTerm, key, binding, input)).toThrow();
  });
  test("rejects duplicate/forged receipt, PID mismatch, swapped or ambiguous outer run, living descendant and terminal disagreement", () => {
    for (const mutate of [
      (x: V5NativeTrace) => (x.log += "\n" + x.log),
      (x: V5NativeTrace) => (x.log = x.log.replace(/\"mac\":\"./, '"mac":"0')),
      (x: V5NativeTrace) => (x.spawn.launcherPid = 13),
      (x: V5NativeTrace) => (x.outerJoin.selectedRunWorkId = "swapped"),
      (x: V5NativeTrace) => (x.outerJoin.concurrentCandidateRunIds = ["other"]),
      (x: V5NativeTrace) => (x.descendants.aliveAfterTerminal = [99]),
      (x: V5NativeTrace) => (x.terminal.exitCode = 17),
      (x: V5NativeTrace) => (x.supervisor.final.populated = true as false),
      (x: V5NativeTrace) =>
        (x.supervisor.processes.find((p) => p.role === "hermes")!.pid = 21),
      (x: V5NativeTrace) => (x.descendants.observed = [12]),
      (x: V5NativeTrace) => (x.terminal.at = "2026-07-15T00:00:01.500Z"),
      (x: V5NativeTrace) => (x.configuration.rawDigest = "caller-assertion"),
      (x: V5NativeTrace) => (x.attempts = []),
      (x: V5NativeTrace) => (x.externalMeter.cpuMs = Number.NaN),
    ]) {
      const x = fixture();
      mutate(x);
      expect(() => deriveV5Trace(x, key, binding, input)).toThrow();
    }
  });
});
