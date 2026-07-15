import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  verifyProcessTreeSupervisorTrace,
  type ProcessTreeSupervisorTrace,
} from "./organization-process-tree-supervisor-contract";

export type V5Substrate = "hermes" | "paperclip";
export type V5Mode = "success" | "failure" | "timeout";
export const V5_INPUT_LOCK_PATHS = [
  "organization",
  "behavior",
  "control",
  "workload",
  "assignment",
  "fault",
  "repository",
  "worker-harness",
  "launcher",
  "launcher-spec",
  "runtime",
  "hermes-source",
  "python",
  "profile",
  "model",
  "tools",
  "skills",
  "prompt",
  "context",
  "renderer",
  "session-policy",
  "environment",
  "isolation",
  "credential-scope",
  "provider-revision",
  "provider-config",
  "provider-command",
] as const;
export type V5Binding = {
  schema: "autonomy.r24-cell-binding.v5";
  pairId: string;
  trialId: string;
  replication: number;
  substrate: V5Substrate;
  unitDigest: string;
  organizationDigest: string;
  behaviorDigest: string;
  controlDigest: string;
  workloadDigest: string;
  assignmentDigest: string;
  lockDigest: string;
  launcherSpecDigest: string;
  nonce: string;
};
export type V5LockField = {
  path: string;
  digest: string;
  application:
    | "enforced-by-launcher"
    | "enforced-by-hermes"
    | "enforced-by-native-control"
    | "irrelevant-to-minimal-worker"
    | "metadata-only";
  evidence: string;
};
export type V5LauncherInput = {
  originalArgv: string[];
  recordedEnv: Record<string, string>;
  normalization: {
    grammar: string;
    preservation: Array<{
      source: string;
      target: string;
      disposition: string;
      rationale?: string;
    }>;
  };
  canonicalArgv: string[];
  launcherSpecDigest: string;
  secretCommitments: Record<string, string>;
  stackManifestDigest: string;
  pins: {
    launcher: string;
    runtime: string;
    realHermes: string;
    interpreter: string;
    profile: string;
    model: string;
    tools: string;
    skills: string;
    query: string;
  };
  binding: V5Binding;
};
export type V5Receipt = {
  schema: "autonomy.r24-launcher-receipt.v5";
  phase: "start" | "result";
  binding: V5Binding;
  inputDigest: string;
  pid: number;
  processGroup: number;
  hermesPid: number;
  hermesProcessGroup: number;
  workerDigest: string;
  runtimeDigest: string;
  argvDigest: string;
  at: string;
  monotonicNs: string;
  originalInput?: unknown;
  terminal?: "success" | "failure";
  exitCode?: number;
  signal?: string | null;
  error?: string | null;
  mac: string;
};
export type V5NativeTrace = {
  schema: "autonomy.r24-native-trace.v5";
  binding: V5Binding;
  configuration: { digest: string; rawDigest: string; readbackAt: string };
  dispatch: { digest: string; rawDigest: string; at: string };
  spawn: { launcherPid: number; launcherPgid: number; at: string };
  outerJoin: {
    challengeDigest: string;
    configuredAgentId: string | null;
    configuredWorkId: string;
    selectedNativeRunId: string;
    selectedRunAgentId: string | null;
    selectedRunWorkId: string;
    selectedRunPid: number;
    concurrentCandidateRunIds: string[];
  };
  log: string;
  terminal: {
    kind: "exited" | "timed-out" | "signaled" | "setup-failed";
    exitCode: number | null;
    signal: string | null;
    at: string;
  };
  supervisor: ProcessTreeSupervisorTrace;
  descendants: {
    observed: number[];
    aliveAfterTerminal: number[];
    reaped: boolean;
  };
  attempts: Array<{ id: string; status: string; rawDigest: string }>;
  externalMeter: {
    wallMs: number;
    cpuMs: number | null;
    maxRssKiB: number | null;
    method: string;
  };
  preservation: Array<{
    source: string;
    target: string;
    disposition: "preserved" | "normalized" | "dropped";
    rationale: string;
  }>;
};
export type V5Derived = {
  status: "success" | "failure" | "timeout" | "setup-failed";
  receiptCount: { start: number; result: number };
  authenticated: boolean;
  causal: boolean;
  reaped: boolean;
  launcherPid: number | null;
  hermesPid: number | null;
  endToEndWallMs: number;
  workerWallMs: number | null;
  cpuMs: number | null;
  maxRssKiB: number | null;
};
const hash = (v: unknown) =>
  `sha256:${createHash("sha256")
    .update(typeof v === "string" ? v : canonicalSemanticJson(v))
    .digest("hex")}`;
export function createV5Binding(
  value: Omit<V5Binding, "schema" | "nonce">,
  nonce = randomBytes(32).toString("hex"),
): V5Binding {
  if (
    !/^[a-f0-9]{64}$/.test(nonce) ||
    !["hermes", "paperclip"].includes(value.substrate) ||
    !value.pairId ||
    !value.trialId ||
    !Number.isSafeInteger(value.replication) ||
    value.replication < 0 ||
    Object.entries(value)
      .filter(([k]) => k.endsWith("Digest"))
      .some(
        ([, v]) => typeof v !== "string" || !/^sha256:[a-f0-9]{64}$/.test(v),
      )
  )
    throw Error("invalid V5 cell binding");
  return { schema: "autonomy.r24-cell-binding.v5", ...value, nonce };
}
export function launcherInputDigest(x: V5LauncherInput) {
  if (
    !x.originalArgv.length ||
    !x.canonicalArgv.length ||
    !x.normalization.grammar ||
    !x.normalization.preservation.length ||
    x.normalization.preservation.some(
      (p) =>
        !p.source ||
        !p.target ||
        !["preserved", "normalized", "dropped"].includes(p.disposition) ||
        !p.rationale,
    ) ||
    !x.pins.tools ||
    !x.pins.skills ||
    x.launcherSpecDigest !== x.binding.launcherSpecDigest ||
    !/^sha256:[a-f0-9]{64}$/.test(x.stackManifestDigest) ||
    Object.values(x.secretCommitments).some(
      (d) => !/^sha256:[a-f0-9]{64}$/.test(d),
    ) ||
    Object.values(x.pins).some((d) => !/^sha256:[a-f0-9]{64}$/.test(d))
  )
    throw Error("incomplete V5 launcher input");
  return hash(x);
}
export function signV5Receipt(
  unsigned: Omit<V5Receipt, "schema" | "mac">,
  key: string,
): V5Receipt {
  if (key.length < 32) throw Error("V5 receipt key too short");
  const body = {
    schema: "autonomy.r24-launcher-receipt.v5" as const,
    ...unsigned,
  };
  return {
    ...body,
    mac: createHmac("sha256", key)
      .update(canonicalSemanticJson(body))
      .digest("hex"),
  };
}
export function verifyV5Receipt(r: V5Receipt, key: string) {
  const { mac, ...body } = r,
    expected = createHmac("sha256", key)
      .update(canonicalSemanticJson(body))
      .digest();
  let got: Buffer;
  try {
    got = Buffer.from(mac, "hex");
  } catch {
    return false;
  }
  return got.length === expected.length && timingSafeEqual(got, expected);
}
export function parseV5Receipts(log: string): V5Receipt[] {
  const out: V5Receipt[] = [];
  for (const line of log.split(/\r?\n/)) {
    if (!line.startsWith("OA_R24_RECEIPT ")) continue;
    const raw = line.slice(15);
    let x: any;
    try {
      x = JSON.parse(raw);
    } catch {
      throw Error("malformed V5 receipt JSON");
    }
    if (x.schema !== "autonomy.r24-launcher-receipt.v5")
      throw Error("wrong V5 receipt schema");
    out.push(x);
  }
  return out;
}
export function deriveV5Trace(
  trace: V5NativeTrace,
  key: string,
  expected: V5Binding,
  input: V5LauncherInput,
): V5Derived {
  if (trace.terminal.kind === "setup-failed")
    throw Error("setup-failed must use the pre-spawn attempt schema");
  if (
    hash(trace.binding) !== hash(expected) ||
    hash(input.binding) !== hash(expected) ||
    input.launcherSpecDigest !== expected.launcherSpecDigest ||
    trace.spawn.launcherPid < 1 ||
    trace.spawn.launcherPgid < 1 ||
    !/^sha256:[a-f0-9]{64}$/.test(trace.configuration.digest) ||
    !/^sha256:[a-f0-9]{64}$/.test(trace.configuration.rawDigest) ||
    !/^sha256:[a-f0-9]{64}$/.test(trace.dispatch.digest) ||
    !/^sha256:[a-f0-9]{64}$/.test(trace.dispatch.rawDigest) ||
    !Number.isFinite(Date.parse(trace.configuration.readbackAt)) ||
    !Number.isFinite(Date.parse(trace.dispatch.at)) ||
    !trace.attempts.length ||
    trace.attempts.some(
      (a) => !a.id || !a.status || !/^sha256:[a-f0-9]{64}$/.test(a.rawDigest),
    ) ||
    !trace.preservation.length ||
    trace.preservation.some((x) => !x.source || !x.target || !x.rationale) ||
    !Number.isFinite(trace.externalMeter.wallMs) ||
    trace.externalMeter.wallMs < 0 ||
    (trace.externalMeter.cpuMs !== null &&
      (!Number.isFinite(trace.externalMeter.cpuMs) ||
        trace.externalMeter.cpuMs < 0)) ||
    (trace.externalMeter.maxRssKiB !== null &&
      (!Number.isFinite(trace.externalMeter.maxRssKiB) ||
        trace.externalMeter.maxRssKiB < 0)) ||
    !trace.externalMeter.method
  )
    throw Error("V5 trace binding/spawn/meter invalid");
  const j = trace.outerJoin;
  if (
    j.challengeDigest !== hash(expected.nonce) ||
    j.configuredWorkId !== j.selectedRunWorkId ||
    j.selectedRunPid !== trace.spawn.launcherPid ||
    j.concurrentCandidateRunIds.length ||
    !j.selectedNativeRunId ||
    (expected.substrate === "paperclip" &&
      (!j.configuredAgentId || j.configuredAgentId !== j.selectedRunAgentId))
  )
    throw Error("V5 outer native causal join ambiguous or invalid");
  const rs = parseV5Receipts(trace.log),
    starts = rs.filter((r) => r.phase === "start"),
    results = rs.filter((r) => r.phase === "result"),
    timeout = trace.terminal.kind === "timed-out";
  if (starts.length !== 1 || results.length !== (timeout ? 0 : 1))
    throw Error(
      "V5 requires exactly one start and exactly one non-timeout result",
    );
  const wantedInput = launcherInputDigest(input),
    all = [...starts, ...results];
  if (
    all.some(
      (r) =>
        !verifyV5Receipt(r, key) ||
        hash(r.binding) !== hash(expected) ||
        r.inputDigest !== wantedInput ||
        r.pid !== trace.spawn.launcherPid ||
        r.processGroup !== trace.spawn.launcherPgid ||
        r.hermesPid < 1 ||
        r.workerDigest !== input.pins.launcher ||
        r.runtimeDigest !== input.pins.runtime ||
        r.argvDigest !== hash(input.canonicalArgv) ||
        !/^\d+$/.test(r.monotonicNs) ||
        (r.phase === "start" && hash(r.originalInput) !== hash(input)),
    )
  )
    throw Error("V5 receipt authentication/binding failed");
  const start = starts[0]!,
    resultReceipt = results[0],
    hermesPid = start.hermesPid;
  if (
    all.some(
      (r) =>
        r.hermesPid !== hermesPid ||
        r.hermesProcessGroup !== start.hermesProcessGroup,
    ) ||
    !trace.descendants.observed.includes(trace.spawn.launcherPid) ||
    !trace.descendants.observed.includes(hermesPid)
  )
    throw Error("V5 launcher/Hermes lineage invalid");
  const supervisor = trace.supervisor;
  verifyProcessTreeSupervisorTrace(supervisor);
  const launcherIdentity = supervisor.processes.find(
      (x) => x.role === "launcher",
    ),
    hermesIdentity = supervisor.processes.find((x) => x.role === "hermes");
  if (
    launcherIdentity?.pid !== trace.spawn.launcherPid ||
    launcherIdentity.pgid !== trace.spawn.launcherPgid ||
    hermesIdentity?.pid !== hermesPid ||
    hermesIdentity.pgid !== start.hermesProcessGroup ||
    Date.parse(supervisor.final.at) < Date.parse(trace.terminal.at)
  )
    throw Error("V5 supervisor lineage differs from receipt/native trace");
  const terminal = trace.terminal,
    status: V5Derived["status"] =
      terminal.kind === "setup-failed"
        ? "setup-failed"
        : terminal.kind === "timed-out"
          ? "timeout"
          : terminal.kind === "exited" && terminal.exitCode === 0
            ? "success"
            : "failure";
  const result = resultReceipt;
  if (
    result &&
    ((status === "success" && result.terminal !== "success") ||
      (status === "failure" && result.terminal !== "failure") ||
      result.exitCode !== terminal.exitCode)
  )
    throw Error("V5 native terminal and worker result disagree");
  const causal =
    Date.parse(trace.spawn.at) <= Date.parse(starts[0]!.at) &&
    Date.parse(starts[0]!.at) <= Date.parse(terminal.at) &&
    (!result ||
      (Date.parse(result.at) >= Date.parse(starts[0]!.at) &&
        Date.parse(result.at) <= Date.parse(terminal.at)));
  if (!causal) throw Error("V5 causal order invalid");
  if (!trace.descendants.reaped || trace.descendants.aliveAfterTerminal.length)
    throw Error("V5 process tree not reaped");
  const workerWallMs = result
    ? Number(BigInt(result.monotonicNs) - BigInt(starts[0]!.monotonicNs)) / 1e6
    : null;
  if (workerWallMs !== null && workerWallMs < 0)
    throw Error("V5 monotonic receipt order invalid");
  return {
    status,
    receiptCount: { start: 1, result: results.length },
    authenticated: true,
    causal,
    reaped: true,
    launcherPid: starts[0]!.pid,
    hermesPid,
    endToEndWallMs: trace.externalMeter.wallMs,
    workerWallMs,
    cpuMs: trace.externalMeter.cpuMs,
    maxRssKiB: trace.externalMeter.maxRssKiB,
  };
}
export function v5ProtocolDigest(v: unknown) {
  return hash(v);
}
