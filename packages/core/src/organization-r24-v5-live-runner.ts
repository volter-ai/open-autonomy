import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  deriveV5Trace,
  parseV5Receipts,
  type V5Binding,
  type V5Derived,
  type V5LauncherInput,
  type V5LockField,
  type V5NativeTrace,
  type V5Substrate,
  V5_INPUT_LOCK_PATHS,
} from "./organization-r24-v5-protocol";
import {
  deriveProviderOuterJoin,
  type ProviderTranscript,
} from "./organization-r24-provider-transcripts";
const sha = (v: unknown) =>
  `sha256:${createHash("sha256")
    .update(typeof v === "string" ? v : canonicalSemanticJson(v))
    .digest("hex")}`;
const iso = (v: string) => Number.isFinite(Date.parse(v));
export type V5PaperclipOuter = {
  provider: "paperclip";
  requestAt: string;
  configReadbackAt: string;
  configReadback: {
    agentId: string;
    command: string;
    args: string[];
    challengeDigest: string;
  };
  issue: { id: string; assigneeAgentId: string; createdAt: string };
  candidateRuns: Array<{
    id: string;
    agentId: string;
    issueId: string;
    createdAt: string;
    processPid: number | null;
    status: string;
  }>;
  selectedRunId: string | null;
  adapterInvoke: null | {
    runId: string;
    agentId: string;
    command: string;
    args: string[];
    challengeDigest: string;
    at: string;
  };
  linkedIssueIds: string[];
  logChallengeDigest: string | null;
};
export type V5HermesOuter = {
  provider: "hermes";
  requestAt: string;
  configReadbackAt: string;
  taskReadback: {
    id: string;
    assignee: string;
    bodyChallengeDigest: string;
    maxRuntimeSeconds: number;
  };
  dispatch: { at: string; taskId: string; spawnedPid: number | null };
  runs: Array<{
    id: string;
    taskId: string;
    pid: number | null;
    outcome: string;
    createdAt: string;
  }>;
  selectedRunId: string | null;
  logChallengeDigest: string | null;
};
export type V5OuterEvidence = V5PaperclipOuter | V5HermesOuter;
export type V5SetupFailedAttempt = {
  kind: "setup-failed";
  attemptId: string;
  substrate: V5Substrate;
  binding: V5Binding;
  startedAt: string;
  completedAt: string;
  providerRunId: string;
  rawError: unknown;
  configurationReadback: unknown;
  spawnObserved: false;
  receiptLines: [];
  meter: { wallMs: number; cpuMs: null; maxRssKiB: null; provenance: string };
  outer: V5OuterEvidence;
};
export type V5LaunchedAttempt = {
  kind: "launched";
  attemptId: string;
  substrate: V5Substrate;
  binding: V5Binding;
  startedAt: string;
  completedAt: string;
  providerRunId: string;
  input: V5LauncherInput;
  trace: V5NativeTrace;
  providerTranscript: ProviderTranscript;
};
export type V5Attempt = V5SetupFailedAttempt | V5LaunchedAttempt;
export const V5_NORMATIVE_LOCK_PATHS = V5_INPUT_LOCK_PATHS;
export type V5CellRecord = {
  schema: "autonomy.r24-live-cell.v5";
  binding: V5Binding;
  attempts: V5Attempt[];
  selectedAttemptId: string;
  derived: V5Derived;
  fault: {
    id: string;
    digest: string;
    assignmentDigest: string;
    bindingDigest: string;
    injectorDigest: string;
    requestDigest: string;
    acknowledgementDigest: string;
    observedScopeDigest: string;
    raw: {
      injector: { revision: string; commandDigest: string };
      request: {
        faultId: string;
        faultDigest: string;
        bindingDigest: string;
        isolationId: string;
        targetWorkId: string;
        issuedAt: string;
      };
      acknowledgement: { requestDigest: string; acceptedAt: string };
      observedScope: {
        isolationId: string;
        nativeRunId: string;
        applied: true;
        appliedAt: string;
        evidenceDigest: string;
      };
    };
  };
  locks: {
    fields: V5LockField[];
  };
  preservation: Array<{
    source: string;
    target: string;
    disposition: "preserved" | "normalized" | "dropped";
    rationale: string;
  }>;
  isolation: {
    ownedScopeIds: string[];
    foreignSentinelBefore: { bytesBase64: string; digest: string };
    foreignSentinelAfter: { bytesBase64: string; digest: string };
  };
  cleanup: {
    actions: Array<{ ownedId: string; action: string; rawDigest: string }>;
    readbacks: Array<{
      ownedId: string;
      state: "absent" | "archived";
      rawDigest: string;
    }>;
    residuals: string[];
  };
  assistance: {
    manualDuringCell: false;
    automatedOnly: true;
    operatorMinutes: 0;
    provenance: string;
  };
  sourceCustody?: Record<
    "provider" | "supervisor" | "meter" | "fault" | "cleanup" | "assistance",
    { keyId: string; sourceDigest: string; signature: string }
  >;
};
function outerProjection(o: V5OuterEvidence, b: V5Binding) {
  if (o.provider === "paperclip") {
    const r = o.candidateRuns.find((x) => x.id === o.selectedRunId)!;
    return {
      challengeDigest: sha(b.nonce),
      configuredAgentId: o.configReadback.agentId,
      configuredWorkId: o.issue.id,
      selectedNativeRunId: o.selectedRunId!,
      selectedRunAgentId: r.agentId,
      selectedRunWorkId: r.issueId,
      selectedRunPid: r.processPid!,
      concurrentCandidateRunIds: [],
    };
  }
  const r = o.runs.find((x) => x.id === o.selectedRunId)!;
  return {
    challengeDigest: sha(b.nonce),
    configuredAgentId: null,
    configuredWorkId: o.taskReadback.id,
    selectedNativeRunId: o.selectedRunId!,
    selectedRunAgentId: null,
    selectedRunWorkId: r.taskId,
    selectedRunPid: r.pid!,
    concurrentCandidateRunIds: [],
  };
}
function validateOuter(
  o: V5OuterEvidence,
  b: V5Binding,
  spawnPid: number | null,
  providerRunId: string,
) {
  if (
    !iso(o.requestAt) ||
    !iso(o.configReadbackAt) ||
    Date.parse(o.configReadbackAt) < Date.parse(o.requestAt)
  )
    throw Error("V5 outer evidence freshness invalid");
  const challenge = sha(b.nonce);
  if (o.provider === "paperclip") {
    const selected = o.candidateRuns.filter((r) => r.id === o.selectedRunId),
      eligible = o.candidateRuns.filter(
        (r) =>
          r.agentId === o.configReadback.agentId &&
          r.issueId === o.issue.id &&
          Date.parse(r.createdAt) >= Date.parse(o.requestAt),
      ),
      invokeOk =
        spawnPid === null
          ? o.adapterInvoke === null && o.logChallengeDigest === null
          : o.adapterInvoke?.runId === providerRunId &&
            o.adapterInvoke.agentId === o.configReadback.agentId &&
            o.adapterInvoke.command === o.configReadback.command &&
            sha(o.adapterInvoke.args) === sha(o.configReadback.args) &&
            o.adapterInvoke.challengeDigest === challenge &&
            iso(o.adapterInvoke.at) &&
            o.logChallengeDigest === challenge;
    if (
      o.configReadback.challengeDigest !== challenge ||
      o.issue.assigneeAgentId !== o.configReadback.agentId ||
      o.selectedRunId !== providerRunId ||
      selected.length !== 1 ||
      eligible.length !== 1 ||
      selected[0] !== eligible[0] ||
      !invokeOk ||
      o.linkedIssueIds.length !== 1 ||
      o.linkedIssueIds[0] !== o.issue.id ||
      selected[0]!.processPid !== spawnPid
    )
      throw Error("V5 Paperclip outer causal join invalid or ambiguous");
  } else {
    const selected = o.runs.filter((r) => r.id === o.selectedRunId),
      eligible = o.runs.filter(
        (r) =>
          r.taskId === o.taskReadback.id &&
          Date.parse(r.createdAt) >= Date.parse(o.requestAt),
      );
    if (
      o.taskReadback.bodyChallengeDigest !== challenge ||
      o.dispatch.taskId !== o.taskReadback.id ||
      !iso(o.dispatch.at) ||
      o.selectedRunId !== providerRunId ||
      selected.length !== 1 ||
      eligible.length !== 1 ||
      selected[0] !== eligible[0] ||
      (spawnPid === null
        ? o.logChallengeDigest !== null
        : o.logChallengeDigest !== challenge) ||
      o.dispatch.spawnedPid !== spawnPid ||
      selected[0]!.pid !== spawnPid
    )
      throw Error("V5 Hermes outer causal join invalid or ambiguous");
  }
}
export function validateV5Attempt(a: V5Attempt, key: string): V5Derived | null {
  if (
    a.substrate !== a.binding.substrate ||
    !a.attemptId ||
    !iso(a.startedAt) ||
    !iso(a.completedAt) ||
    Date.parse(a.completedAt) < Date.parse(a.startedAt) ||
    !a.providerRunId
  )
    throw Error("V5 attempt envelope invalid");
  if (a.kind === "setup-failed") {
    if (
      a.spawnObserved !== false ||
      a.receiptLines.length ||
      !Number.isFinite(a.meter.wallMs) ||
      a.meter.wallMs < 0 ||
      !a.meter.provenance ||
      a.meter.cpuMs !== null ||
      a.meter.maxRssKiB !== null
    )
      throw Error("V5 setup-failed semantics invalid");
    validateOuter(a.outer, a.binding, null, a.providerRunId);
    return null;
  }
  const native = deriveProviderOuterJoin(a.providerTranscript),
    projected = {
      challengeDigest: native.challengeDigest,
      configuredAgentId: native.agentId,
      configuredWorkId: native.workId,
      selectedNativeRunId: native.nativeRunId,
      selectedRunAgentId: native.agentId,
      selectedRunWorkId: native.workId,
      selectedRunPid: native.pid,
      concurrentCandidateRunIds: [],
    };
  if (
    native.provider !== a.substrate ||
    native.nativeRunId !== a.providerRunId ||
    native.pid !== a.trace.spawn.launcherPid ||
    sha(a.trace.outerJoin) !== sha(projected)
  )
    throw Error(
      "V5 trace join differs from raw provider transcript derivation",
    );
  return deriveV5Trace(a.trace, key, a.binding, a.input);
}
export function validateV5Cell(c: V5CellRecord, key: string) {
  if (
    c.schema !== "autonomy.r24-live-cell.v5" ||
    !c.attempts.length ||
    new Set(c.attempts.map((a) => a.attemptId)).size !== c.attempts.length ||
    c.attempts.some((a) => sha(a.binding) !== sha(c.binding)) ||
    c.attempts.filter((a) => a.kind === "launched").length !== 1
  )
    throw Error("V5 cell attempt history invalid");
  const derived = c.attempts.map(
      (a) => [a.attemptId, validateV5Attempt(a, key)] as const,
    ),
    selected = derived.find((x) => x[0] === c.selectedAttemptId);
  if (!selected || !selected[1] || sha(selected[1]) !== sha(c.derived))
    throw Error(
      "V5 selected attempt is absent, setup-failed, or caller-derived",
    );
  if (
    !c.fault.id ||
    c.fault.assignmentDigest !== c.binding.assignmentDigest ||
    c.fault.bindingDigest !== sha(c.binding) ||
    c.fault.injectorDigest !== sha(c.fault.raw.injector) ||
    c.fault.requestDigest !== sha(c.fault.raw.request) ||
    c.fault.acknowledgementDigest !== sha(c.fault.raw.acknowledgement) ||
    c.fault.observedScopeDigest !== sha(c.fault.raw.observedScope) ||
    c.fault.raw.request.faultId !== c.fault.id ||
    c.fault.raw.request.faultDigest !== c.fault.digest ||
    c.fault.raw.request.bindingDigest !== sha(c.binding) ||
    !Number.isFinite(Date.parse(c.fault.raw.request.issuedAt)) ||
    !c.isolation.ownedScopeIds.includes(c.fault.raw.request.isolationId) ||
    c.fault.raw.acknowledgement.requestDigest !== c.fault.requestDigest ||
    !Number.isFinite(Date.parse(c.fault.raw.acknowledgement.acceptedAt)) ||
    c.fault.raw.observedScope.isolationId !== c.fault.raw.request.isolationId ||
    c.fault.raw.observedScope.applied !== true ||
    !Number.isFinite(Date.parse(c.fault.raw.observedScope.appliedAt)) ||
    !/^sha256:[a-f0-9]{64}$/.test(c.fault.raw.observedScope.evidenceDigest) ||
    ![
      c.fault.digest,
      c.fault.injectorDigest,
      c.fault.requestDigest,
      c.fault.acknowledgementDigest,
      c.fault.observedScopeDigest,
    ].every((x) => /^sha256:[a-f0-9]{64}$/.test(x))
  )
    throw Error("V5 fault injection evidence invalid or unbound");
  const requiredPaths: readonly string[] = V5_NORMATIVE_LOCK_PATHS,
    byPath = new Map(c.locks.fields.map((x) => [x.path, x])),
    preserved = new Map(c.preservation.map((x) => [x.source, x]));
  if (
    byPath.size !== c.locks.fields.length ||
    preserved.size !== c.preservation.length ||
    requiredPaths.some(
      (p) =>
        !byPath.get(p)?.digest || !byPath.get(p)?.evidence || !preserved.has(p),
    ) ||
    c.locks.fields.some((x) => !requiredPaths.includes(x.path)) ||
    c.preservation.some((x) => !requiredPaths.includes(x.source))
  )
    throw Error(
      "V5 lock/preservation coverage incomplete, duplicate, or surplus",
    );
  const launched = c.attempts.find(
      (a): a is V5LaunchedAttempt => a.kind === "launched",
    )!,
    native = deriveProviderOuterJoin(launched.providerTranscript),
    providerExpected: Record<string, string> = {
      "provider-revision": sha(native.revision),
      "provider-config": native.configurationDigest,
      "provider-command": native.commandDigest,
    },
    sortedLocks = c.locks.fields
      .slice()
      .sort((a, b) => a.path.localeCompare(b.path));
  if (
    c.fault.raw.request.targetWorkId !== native.workId ||
    c.fault.raw.observedScope.nativeRunId !== native.nativeRunId ||
    Date.parse(c.fault.raw.request.issuedAt) < Date.parse(launched.startedAt) ||
    Date.parse(c.fault.raw.request.issuedAt) <
      Date.parse(launched.trace.dispatch.at) ||
    Date.parse(c.fault.raw.acknowledgement.acceptedAt) <
      Date.parse(c.fault.raw.request.issuedAt) ||
    Date.parse(c.fault.raw.observedScope.appliedAt) <
      Date.parse(c.fault.raw.acknowledgement.acceptedAt) ||
    Date.parse(c.fault.raw.observedScope.appliedAt) >
      Date.parse(launched.trace.terminal.at) ||
    Date.parse(c.fault.raw.observedScope.appliedAt) >
      Date.parse(launched.completedAt) ||
    Object.entries(providerExpected).some(
      ([p, d]) => byPath.get(p)?.digest !== d,
    ) ||
    native.commandDigest !== launched.input.pins.launcher ||
    c.binding.lockDigest !==
      sha(sortedLocks.map(({ path, digest }) => ({ path, digest }))) ||
    c.locks.fields.some((x) => !/^sha256:[a-f0-9]{64}$/.test(x.digest))
  )
    throw Error("V5 locks are not bound to provider/input/binding evidence");
  const decode = (x: { bytesBase64: string; digest: string }) => {
      const b = Buffer.from(x.bytesBase64, "base64");
      return `sha256:${createHash("sha256").update(b).digest("hex")}` ===
        x.digest
        ? b
        : null;
    },
    sentinelBefore = decode(c.isolation.foreignSentinelBefore),
    sentinelAfter = decode(c.isolation.foreignSentinelAfter);
  if (
    !c.preservation.length ||
    c.preservation.some((x) => !x.source || !x.target || !x.rationale) ||
    !c.isolation.ownedScopeIds.length ||
    new Set(c.isolation.ownedScopeIds).size !==
      c.isolation.ownedScopeIds.length ||
    !sentinelBefore ||
    !sentinelAfter ||
    !sentinelBefore.equals(sentinelAfter) ||
    !c.cleanup.actions.length ||
    !c.cleanup.readbacks.length ||
    c.cleanup.residuals.length !== 0 ||
    c.isolation.ownedScopeIds.some(
      (id) =>
        c.cleanup.actions.filter(
          (x) => x.ownedId === id && /^sha256:[a-f0-9]{64}$/.test(x.rawDigest),
        ).length !== 1 ||
        c.cleanup.readbacks.filter(
          (x) =>
            x.ownedId === id &&
            (x.state === "absent" || x.state === "archived") &&
            /^sha256:[a-f0-9]{64}$/.test(x.rawDigest),
        ).length !== 1,
    ) ||
    c.cleanup.actions.some(
      (x) => !c.isolation.ownedScopeIds.includes(x.ownedId),
    ) ||
    c.cleanup.readbacks.some(
      (x) => !c.isolation.ownedScopeIds.includes(x.ownedId),
    ) ||
    c.assistance.manualDuringCell !== false ||
    !c.assistance.automatedOnly ||
    c.assistance.operatorMinutes !== 0 ||
    !c.assistance.provenance
  )
    throw Error(
      "V5 preservation/isolation/cleanup/assistance evidence invalid",
    );
  return structuredClone(c.derived);
}
export function deriveV5ProviderFromRecord(c: V5CellRecord, key: string) {
  const derived = validateV5Cell(c, key),
    launched = c.attempts.find(
      (a): a is V5LaunchedAttempt => a.kind === "launched",
    )!,
    native = deriveProviderOuterJoin(launched.providerTranscript),
    receipts = parseV5Receipts(launched.trace.log),
    start = receipts.find((r) => r.phase === "start")!,
    result = receipts.find((r) => r.phase === "result") ?? null;
  const providerTerminal = native.terminal.trim().toLowerCase(),
    terminalMap: Record<string, "success" | "failure" | "timeout"> =
      native.provider === "hermes"
        ? {
            completed: "success",
            failed: "failure",
            error: "failure",
            cancelled: "failure",
            killed: "failure",
            timeout: "timeout",
            timed_out: "timeout",
          }
        : {
            succeeded: "success",
            failed: "failure",
            cancelled: "failure",
            timeout: "timeout",
            timed_out: "timeout",
          },
    normalizedProviderTerminal = terminalMap[providerTerminal] ?? null;
  if (
    !normalizedProviderTerminal ||
    normalizedProviderTerminal !== derived.status
  )
    throw Error(
      "provider terminal disagrees with authenticated launcher terminal",
    );
  return {
    runId: native.nativeRunId,
    workId: native.workId,
    pid: native.pid,
    bindingDigest: sha(c.binding),
    assignmentDigest: c.binding.assignmentDigest,
    challengeDigest: sha(c.binding.nonce),
    launcherDigest: launched.input.pins.launcher,
    launcherSpecDigest: c.binding.launcherSpecDigest,
    inputLockDigest: c.binding.lockDigest,
    receiptAuthenticated: derived.authenticated,
    provider: native.provider,
    revisionDigest: sha(native.revision),
    configurationDigest: native.configurationDigest,
    dispatchDigest: launched.trace.dispatch.rawDigest,
    commandDigest: native.commandDigest,
    logDigest: native.logDigest,
    terminalDigest: sha(native.terminal),
    receiptDigest: sha(receipts),
    processGroup: launched.trace.spawn.launcherPgid,
    attempt: {
      id: launched.attemptId,
      nativeRunId: native.nativeRunId,
      startReceiptDigest: sha(start),
      resultReceiptDigest: result ? sha(result) : null,
      startedAt: start.at,
      finishedAt: result?.at ?? launched.trace.terminal.at,
    },
    status: derived.status,
    terminal: launched.trace.terminal,
    descendants: launched.trace.descendants,
    meter: launched.trace.externalMeter,
    termAt:
      launched.trace.supervisor.signals.find((x) => x.kind === "TERM")?.at ??
      null,
    killAt:
      launched.trace.supervisor.signals.find((x) => x.kind === "KILL")?.at ??
      null,
  };
}
type Proc = {
  pid: number;
  ppid: number;
  group: number;
  cpuTicks: number;
  rssKiB: number;
};
function proc(pid: number): Proc | null {
  try {
    const s = readFileSync(`/proc/${pid}/stat`, "utf8"),
      i = s.lastIndexOf(")"),
      head = s.slice(0, s.indexOf(" ")),
      f = s.slice(i + 2).split(" ");
    return {
      pid: Number(head),
      ppid: Number(f[1]),
      group: Number(f[2]),
      cpuTicks: Number(f[11]) + Number(f[12]),
      rssKiB: Number(f[21]) * 4,
    };
  } catch {
    return null;
  }
}
export function snapshotProcessTree(rootPid: number) {
  const all = readdirSync("/proc")
      .filter((x) => /^\d+$/.test(x))
      .map((x) => proc(Number(x)))
      .filter((x): x is Proc => !!x),
    ids = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of all)
      if (ids.has(p.ppid) && !ids.has(p.pid)) {
        ids.add(p.pid);
        changed = true;
      }
  }
  const ps = all.filter((p) => ids.has(p.pid));
  return {
    at: new Date().toISOString(),
    monotonicNs: process.hrtime.bigint().toString(),
    rootPid,
    processes: ps,
    cpuTicks: ps.reduce((n, p) => n + p.cpuTicks, 0),
    rssKiB: ps.reduce((n, p) => n + p.rssKiB, 0),
    maxRssKiB: Math.max(0, ...ps.map((p) => p.rssKiB)),
  };
}
export class V5ProcessTreeMeter {
  private samples: ReturnType<typeof snapshotProcessTree>[] = [];
  constructor(
    readonly rootPid: number,
    readonly clockTicksPerSecond = 100,
  ) {
    if (
      !Number.isSafeInteger(rootPid) ||
      rootPid < 1 ||
      !Number.isFinite(clockTicksPerSecond) ||
      clockTicksPerSecond < 1
    )
      throw Error("V5 meter config invalid");
    this.sample();
  }
  sample() {
    const x = snapshotProcessTree(this.rootPid);
    this.samples.push(x);
    return x;
  }
  result() {
    if (this.samples.length < 2)
      throw Error("V5 meter needs start/end samples");
    const a = this.samples[0]!,
      z = this.samples.at(-1)!,
      wallMs = Number(BigInt(z.monotonicNs) - BigInt(a.monotonicNs)) / 1e6,
      cpuMs =
        ((Math.max(...this.samples.map((x) => x.cpuTicks)) - a.cpuTicks) *
          1000) /
        this.clockTicksPerSecond,
      maxRssKiB = Math.max(...this.samples.map((x) => x.maxRssKiB));
    if (wallMs < 0 || cpuMs < 0 || maxRssKiB < 0)
      throw Error("V5 meter values invalid");
    return {
      wallMs,
      cpuMs,
      maxRssKiB,
      method:
        "linux-/proc process-tree sampled meter; CPU is sampled lower bound",
      raw: {
        rootPid: this.rootPid,
        clockTicksPerSecond: this.clockTicksPerSecond,
        samples: this.samples.map((sample) => ({
          monotonicNs: sample.monotonicNs,
          rootPid: sample.rootPid,
          processes: structuredClone(sample.processes),
        })),
      },
    };
  }
}
