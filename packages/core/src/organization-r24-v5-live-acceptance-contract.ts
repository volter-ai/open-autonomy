import { createHash, verify as verifySignature } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import { V5_INPUT_LOCK_PATHS } from "./organization-r24-v5-protocol";
const sha = (v: unknown) =>
    `sha256:${createHash("sha256").update(canonicalSemanticJson(v)).digest("hex")}`,
  dig = (x: unknown) =>
    typeof x === "string" && /^sha256:[a-f0-9]{64}$/.test(x);
export const V5_REQUIRED_LOCKS = V5_INPUT_LOCK_PATHS;
export const V5_NEGATIVE_CONTROLS = [
  "forged-receipt",
  "duplicate-start",
  "duplicate-result",
  "swapped-cell",
  "wrong-native-run",
  "concurrent-candidate",
  "wrong-pid",
  "wrong-command",
  "wrong-challenge",
  "config-drift",
  "living-descendant",
  "missing-kill",
  "meter-forgery",
  "lock-omission",
  "cleanup-leak",
  "manual-assistance",
] as const;
export type V5LiveCell = {
  pairId: string;
  trialId: string;
  replication: number;
  unitId: string;
  substrate: "hermes" | "paperclip";
  order: 0 | 1;
  bindingDigest: string;
  assignmentDigest: string;
  launcherSpecDigest: string;
  inputLockDigest: string;
  challengeDigest: string;
  isolationId: string;
  manualAssistance: "none";
  native: {
    provider: "hermes-kanban" | "paperclip-heartbeat";
    derivation: "verified-hermes-native-v1" | "verified-paperclip-native-v1";
    revisionDigest: string;
    configurationReadbackDigest: string;
    dispatchDigest: string;
    runId: string;
    workId: string;
    pid: number;
    processGroup: number;
    commandDigest: string;
    logDigest: string;
    receiptDigest: string;
    receiptBindingDigest: string;
    configurationChallengeDigest: string;
    receiptChallengeDigest: string;
    commandLauncherDigest: string;
    terminalDigest: string;
    rawEvidence: {
      revision: string;
      configurationReadback: string;
      dispatch: string;
      command: string;
      log: string;
      receipt: string;
      terminal: string;
    };
    concurrentCandidateRunIds: string[];
  };
  attempts: Array<{
    id: string;
    nativeRunId: string;
    startReceiptDigest: string;
    resultReceiptDigest: string | null;
    startedAt: string;
    finishedAt: string;
  }>;
  terminal: {
    status: "success" | "failure" | "timeout";
    exitCode: number | null;
    signal: string | null;
    termAt: string | null;
    killAt: string | null;
    descendantsObserved: number[];
    aliveAfterTerminal: number[];
    reaped: boolean;
    startedAt: string;
    finishedAt: string;
  };
  meters: {
    wall: { value: number; method: string; evidenceDigest: string };
    cpu: { value: number; method: string; evidenceDigest: string };
    maxRss: { value: number; method: string; evidenceDigest: string };
  };
  locks: Array<{
    path: string;
    digest: string;
    application: "enforced" | "irrelevant";
    evidenceDigest: string;
  }>;
  preservation: Array<{
    path: string;
    disposition: "preserved" | "normalized" | "dropped";
    rationale: string;
    evidenceDigest: string;
  }>;
  cleanup: {
    status: "deleted" | "archived";
    evidenceDigest: string;
    unownedStateDigestBefore: string;
    unownedStateDigestAfter: string;
  };
};
export type V5LiveArtifact = {
  schema: "autonomy.r24-v5-live-acceptance.v1";
  plan: {
    seed: string;
    units: string[];
    replications: number;
    assignmentDigest: string;
    launcherDigest: string;
    launcherSpecDigest: string;
    inputLockDigest: string;
    authorization: {
      algorithm: "Ed25519";
      signerKeyId: string;
      signature: string;
    };
    assignments: Array<{
      unitId: string;
      replication: number;
      pairId: string;
      trialId: string;
      first: "hermes" | "paperclip";
      fault: { id: string; digest: string };
    }>;
  };
  cells: V5LiveCell[];
  negativeControls: Array<{
    id: (typeof V5_NEGATIVE_CONTROLS)[number];
    mutationInput: string;
    mutationDigest: string;
    observedRejection: string;
    evidenceRaw: string;
    evidenceDigest: string;
  }>;
  generatedAt: string;
  digest: string;
};
export type V5ProviderDerivation = {
  runId: string;
  workId: string;
  pid: number;
  bindingDigest: string;
  assignmentDigest: string;
  challengeDigest: string;
  launcherDigest: string;
  launcherSpecDigest: string;
  inputLockDigest: string;
  receiptAuthenticated: boolean;
};
export function r24V5PlanAuthorizationDigest(plan: V5LiveArtifact["plan"]) {
  const { authorization: _authorization, ...authorized } = plan;
  return sha(authorized);
}
export function verifyR24V5LiveArtifact(
  a: V5LiveArtifact,
  replayNegative: (
    id: (typeof V5_NEGATIVE_CONTROLS)[number],
    mutationInput: string,
  ) => string,
  deriveNative: (cell: V5LiveCell) => V5ProviderDerivation,
  trust: { signerKeyId: string; publicKeyPem: string },
) {
  if (
    a.schema !== "autonomy.r24-v5-live-acceptance.v1" ||
    !dig(a.plan.assignmentDigest) ||
    !a.plan.seed ||
    !a.plan.units.length ||
    new Set(a.plan.units).size !== a.plan.units.length ||
    a.plan.units.some((x) => !x) ||
    !Number.isSafeInteger(a.plan.replications) ||
    a.plan.replications < 2 ||
    !dig(a.plan.launcherDigest) ||
    !dig(a.plan.launcherSpecDigest) ||
    !dig(a.plan.inputLockDigest) ||
    a.plan.authorization.algorithm !== "Ed25519" ||
    a.plan.authorization.signerKeyId !== trust.signerKeyId ||
    !verifySignature(
      null,
      Buffer.from(r24V5PlanAuthorizationDigest(a.plan)),
      trust.publicKeyPem,
      Buffer.from(a.plan.authorization.signature, "base64"),
    )
  )
    throw Error("invalid matched plan");
  const slots = a.plan.units.flatMap((unitId) =>
    Array.from(
      { length: a.plan.replications },
      (_, replication) => `${unitId}:${replication}`,
    ),
  );
  if (
    a.plan.assignments.length !== slots.length ||
    new Set(a.plan.assignments.map((x) => `${x.unitId}:${x.replication}`))
      .size !== slots.length ||
    slots.some(
      (slot) =>
        !a.plan.assignments.some(
          (x) => `${x.unitId}:${x.replication}` === slot,
        ),
    ) ||
    new Set(a.plan.assignments.map((x) => x.pairId)).size !== slots.length ||
    new Set(a.plan.assignments.map((x) => x.trialId)).size !== slots.length ||
    a.plan.assignmentDigest !==
      sha({ seed: a.plan.seed, assignments: a.plan.assignments })
  )
    throw Error("seeded assignment replay failed");
  const expected = a.plan.units.length * a.plan.replications * 2;
  if (a.cells.length !== expected) throw Error("matched plan cardinality");
  const pairs = new Map<string, V5LiveCell[]>();
  for (const c of a.cells)
    pairs.set(c.pairId, [...(pairs.get(c.pairId) ?? []), c]);
  if (pairs.size !== a.plan.units.length * a.plan.replications)
    throw Error("pair cardinality");
  let hFirst = 0,
    pFirst = 0;
  for (const cs of pairs.values()) {
    if (
      cs.length !== 2 ||
      new Set(cs.map((c) => c.substrate)).size !== 2 ||
      new Set(cs.map((c) => c.order)).size !== 2 ||
      new Set(cs.map((c) => `${c.unitId}:${c.replication}:${c.trialId}`))
        .size !== 1 ||
      new Set(cs.map((c) => c.native.workId)).size !== 1 ||
      new Set(cs.map((c) => c.challengeDigest)).size !== 1
    )
      throw Error("invalid matched pair");
    cs.find((c) => c.order === 0)!.substrate === "hermes" ? hFirst++ : pFirst++;
  }
  if (Math.abs(hFirst - pFirst) > 1)
    throw Error("order not counterbalanced/randomized");
  const isolations = new Set<string>();
  for (const c of a.cells) {
    if (isolations.has(c.isolationId) || !c.isolationId)
      throw Error("cell isolation collision");
    isolations.add(c.isolationId);
    if (c.manualAssistance !== "none") throw Error("manual assistance");
    const n = c.native;
    const derived = deriveNative(c);
    if (
      !derived.receiptAuthenticated ||
      derived.runId !== n.runId ||
      derived.workId !== n.workId ||
      derived.pid !== n.pid ||
      derived.bindingDigest !== c.bindingDigest ||
      derived.assignmentDigest !== c.assignmentDigest ||
      derived.challengeDigest !== c.challengeDigest ||
      derived.launcherDigest !== a.plan.launcherDigest ||
      derived.launcherSpecDigest !== a.plan.launcherSpecDigest ||
      derived.inputLockDigest !== a.plan.inputLockDigest ||
      c.launcherSpecDigest !== a.plan.launcherSpecDigest ||
      c.inputLockDigest !== a.plan.inputLockDigest
    )
      throw Error("provider-native derivation replay failed");
    const planned = a.plan.assignments.find(
      (x) => x.unitId === c.unitId && x.replication === c.replication,
    );
    if (
      !planned ||
      planned.pairId !== c.pairId ||
      planned.trialId !== c.trialId ||
      (c.order === 0) !== (c.substrate === planned.first)
    )
      throw Error("cell inconsistent with seeded plan");
    const exactAssignment = {
      pairId: planned.pairId,
      trialId: planned.trialId,
      unitId: planned.unitId,
      replication: planned.replication,
      fault: planned.fault,
      substrate: c.substrate,
      order: c.order,
    };
    if (c.assignmentDigest !== sha(exactAssignment))
      throw Error("cell assignment differs from authorized plan");
    if (
      n.provider !==
        (c.substrate === "hermes" ? "hermes-kanban" : "paperclip-heartbeat") ||
      n.derivation !==
        (c.substrate === "hermes"
          ? "verified-hermes-native-v1"
          : "verified-paperclip-native-v1") ||
      ![
        n.revisionDigest,
        n.configurationReadbackDigest,
        n.dispatchDigest,
        n.commandDigest,
        n.logDigest,
        n.receiptDigest,
        n.terminalDigest,
        c.bindingDigest,
        c.challengeDigest,
      ].every(dig) ||
      !n.runId ||
      !n.workId ||
      n.pid < 1 ||
      n.processGroup < 1 ||
      n.concurrentCandidateRunIds.length
    )
      throw Error("native provenance");
    if (
      n.receiptBindingDigest !== c.bindingDigest ||
      n.configurationChallengeDigest !== c.challengeDigest ||
      n.receiptChallengeDigest !== c.challengeDigest ||
      n.commandLauncherDigest !== a.plan.launcherDigest
    )
      throw Error("native semantic evidence binding");
    const raw = n.rawEvidence;
    if (
      n.revisionDigest !== sha(raw.revision) ||
      n.configurationReadbackDigest !== sha(raw.configurationReadback) ||
      n.dispatchDigest !== sha(raw.dispatch) ||
      n.commandDigest !== sha(raw.command) ||
      n.logDigest !== sha(raw.log) ||
      n.receiptDigest !== sha(raw.receipt) ||
      n.terminalDigest !== sha(raw.terminal) ||
      !raw.configurationReadback.includes(c.challengeDigest) ||
      !raw.receipt.includes(c.challengeDigest) ||
      !raw.receipt.includes(c.bindingDigest) ||
      !raw.command.includes(a.plan.launcherDigest)
    )
      throw Error("native raw evidence replay failed");
    if (
      c.attempts.length !== 1 ||
      c.attempts[0]!.nativeRunId !== n.runId ||
      ![
        c.attempts[0]!.startReceiptDigest,
        ...(c.attempts[0]!.resultReceiptDigest
          ? [c.attempts[0]!.resultReceiptDigest]
          : []),
      ].every(dig)
    )
      throw Error("exact-one attempt");
    const attempt = c.attempts[0]!,
      started = Date.parse(attempt.startedAt),
      finished = Date.parse(attempt.finishedAt),
      terminalStarted = Date.parse(c.terminal.startedAt),
      terminalFinished = Date.parse(c.terminal.finishedAt);
    if (
      [started, finished, terminalStarted, terminalFinished].some(
        Number.isNaN,
      ) ||
      started > finished ||
      terminalStarted > terminalFinished ||
      started < terminalStarted ||
      finished > terminalFinished
    )
      throw Error("invalid causal timestamps");
    if (
      (c.terminal.status === "success" &&
        (c.terminal.exitCode !== 0 ||
          c.terminal.signal !== null ||
          attempt.resultReceiptDigest === null)) ||
      (c.terminal.status === "failure" &&
        (((c.terminal.exitCode === null || c.terminal.exitCode === 0) &&
          !c.terminal.signal) ||
          attempt.resultReceiptDigest === null))
    )
      throw Error("terminal/result inconsistency");
    if (c.terminal.status === "timeout") {
      if (
        c.attempts[0]!.resultReceiptDigest !== null ||
        c.terminal.signal !== "SIGKILL" ||
        !c.terminal.termAt ||
        !c.terminal.killAt ||
        Number.isNaN(Date.parse(c.terminal.killAt)) ||
        Number.isNaN(Date.parse(c.terminal.termAt)) ||
        Date.parse(c.terminal.killAt) < Date.parse(c.terminal.termAt)
      )
        throw Error("timeout escalation");
    }
    if (
      !c.terminal.reaped ||
      c.terminal.aliveAfterTerminal.length ||
      !c.terminal.descendantsObserved.includes(n.pid)
    )
      throw Error("process tree reaping");
    for (const m of Object.values(c.meters))
      if (
        !Number.isFinite(m.value) ||
        m.value < 0 ||
        !m.method ||
        !dig(m.evidenceDigest)
      )
        throw Error("meter provenance");
    const paths = new Set(c.locks.map((x) => x.path));
    if (
      c.locks.length !== V5_REQUIRED_LOCKS.length ||
      paths.size !== V5_REQUIRED_LOCKS.length ||
      c.locks.some((x) => !V5_REQUIRED_LOCKS.includes(x.path as any)) ||
      V5_REQUIRED_LOCKS.some((x) => !paths.has(x)) ||
      c.locks.some((x) => !dig(x.digest) || !dig(x.evidenceDigest))
    )
      throw Error("lock coverage");
    const sortedInputLocks = c.locks
      .slice()
      .sort((x, y) => x.path.localeCompare(y.path));
    if (
      sha(sortedInputLocks.map(({ path, digest }) => ({ path, digest }))) !==
      a.plan.inputLockDigest
    )
      throw Error("cell input locks differ from authorized plan");
    if (
      c.preservation.length !== V5_REQUIRED_LOCKS.length ||
      new Set(c.preservation.map((x) => x.path)).size !==
        V5_REQUIRED_LOCKS.length ||
      c.preservation.some(
        (x) =>
          !paths.has(x.path) ||
          !dig(x.evidenceDigest) ||
          (x.disposition === "dropped" && !x.rationale),
      )
    )
      throw Error("preservation accounting");
    if (
      !dig(c.cleanup.evidenceDigest) ||
      c.cleanup.unownedStateDigestBefore !==
        c.cleanup.unownedStateDigestAfter ||
      !dig(c.cleanup.unownedStateDigestBefore)
    )
      throw Error("cleanup isolation");
  }
  const controls = new Map(a.negativeControls.map((x) => [x.id, x]));
  if (
    controls.size !== V5_NEGATIVE_CONTROLS.length ||
    V5_NEGATIVE_CONTROLS.some(
      (id) =>
        !controls.get(id) ||
        controls.get(id)!.mutationDigest !==
          sha(controls.get(id)!.mutationInput) ||
        controls.get(id)!.evidenceDigest !==
          sha(controls.get(id)!.evidenceRaw) ||
        !controls.get(id)!.observedRejection ||
        replayNegative(id, controls.get(id)!.mutationInput) !==
          controls.get(id)!.observedRejection,
    )
  )
    throw Error("negative controls incomplete");
  const { digest, ...body } = a;
  if (!dig(digest) || digest !== sha(body))
    throw Error("artifact digest invalid");
  return true;
}
export function r24V5ArtifactDigest(a: Omit<V5LiveArtifact, "digest">) {
  return sha(a);
}
