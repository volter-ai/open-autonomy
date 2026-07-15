import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import { V5_INPUT_LOCK_PATHS } from "./organization-r24-v5-protocol";
import {
  deriveV5ProviderFromRecord,
  type V5CellRecord,
} from "./organization-r24-v5-live-runner";
const sha = (v: unknown) =>
    `sha256:${createHash("sha256").update(canonicalSemanticJson(v)).digest("hex")}`,
  dig = (x: unknown) =>
    typeof x === "string" && /^sha256:[a-f0-9]{64}$/.test(x);
const keyFingerprint = (pem: string) =>
  createHash("sha256")
    .update(createPublicKey(pem).export({ type: "spki", format: "der" }))
    .digest("hex");
export const V5_REQUIRED_LOCKS = V5_INPUT_LOCK_PATHS;
export const V5_SOURCE_ROLES = [
  "provider",
  "supervisor",
  "meter",
  "fault",
  "cleanup",
  "assistance",
] as const;
export type V5SourceRole = (typeof V5_SOURCE_ROLES)[number];
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
  receiptKeyId: string;
  evidenceRecord: V5CellRecord;
  isolationId: string;
  manualAssistance: "none";
  fault: {
    id: string;
    digest: string;
    injectorDigest: string;
    requestDigest: string;
    acknowledgementDigest: string;
    observedScopeDigest: string;
  };
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
    schema: "autonomy.r24-authorized-plan.v1";
    campaignDigest: string;
    authorizedAt: string;
    notAfter: string;
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
    bindings: Array<{
      pairId: string;
      substrate: "hermes" | "paperclip";
      bindingDigest: string;
      receiptKeyId: string;
      receiptKeyCommitment: string;
      assignmentDigest: string;
      launcherSpecDigest: string;
      inputLockDigest: string;
      challengeDigest: string;
      sourceKeyIds: Record<V5SourceRole, string>;
    }>;
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
    basePairId: string;
    baseSubstrate: "hermes" | "paperclip";
    mutatedRecordDigest: string;
  }>;
  generatedAt: string;
  resultAuthorization: {
    algorithm: "Ed25519";
    signerKeyId: string;
    signature: string;
  };
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
export function r24V5ResultAuthorizationDigest(a: V5LiveArtifact) {
  const { digest: _digest, resultAuthorization: _authorization, ...body } = a;
  return sha(body);
}
export function r24V5SourceCustodyDigest(
  role: V5SourceRole,
  bindingDigest: string,
  sourceDigest: string,
) {
  return sha({
    schema: "autonomy.r24-source-custody.v1",
    role,
    bindingDigest,
    sourceDigest,
  });
}
export function r24V5PlannedIdentity(
  campaignDigest: string,
  seed: string,
  unitId: string,
  replication: number,
  fault: { id: string; digest: string },
) {
  const pairId = sha({ campaignDigest, seed, unitId, replication }),
    trialId = sha({ pairId, fault }),
    unitBit = Number.parseInt(sha({ seed, unitId }).at(-1)!, 16) % 2;
  return {
    pairId,
    trialId,
    first:
      (replication + unitBit) % 2 === 0
        ? ("hermes" as const)
        : ("paperclip" as const),
  };
}
export function applyCanonicalV5NegativeMutation(
  id: (typeof V5_NEGATIVE_CONTROLS)[number],
  source: V5CellRecord,
) {
  const x = structuredClone(source),
    launched = x.attempts.find((a) => a.kind === "launched");
  if (!launched) throw Error("negative control requires launched attempt");
  const lines = launched.trace.log.split(/\r?\n/),
    start = lines.find((line) => line.includes('"phase":"start"')),
    result = lines.find((line) => line.includes('"phase":"result"')),
    otherDigest = "sha256:" + "b".repeat(64);
  switch (id) {
    case "forged-receipt":
      launched.trace.log = launched.trace.log.replace(/"mac":"./, '"mac":"0');
      break;
    case "duplicate-start":
      if (!start) throw Error("start receipt absent");
      launched.trace.log += `\n${start}`;
      break;
    case "duplicate-result":
      if (!result) throw Error("result receipt absent");
      launched.trace.log += `\n${result}`;
      break;
    case "swapped-cell":
      x.binding.substrate =
        x.binding.substrate === "hermes" ? "paperclip" : "hermes";
      break;
    case "wrong-native-run":
      launched.trace.outerJoin.selectedNativeRunId = "wrong-native-run";
      break;
    case "concurrent-candidate":
      launched.trace.outerJoin.concurrentCandidateRunIds.push("other-run");
      break;
    case "wrong-pid":
      launched.trace.outerJoin.selectedRunPid++;
      break;
    case "wrong-command":
      launched.input.pins.launcher = otherDigest;
      break;
    case "wrong-challenge":
      launched.trace.outerJoin.challengeDigest = otherDigest;
      break;
    case "config-drift": {
      const lock = x.locks.fields.find(
        (field) => field.path === "provider-config",
      );
      if (!lock) throw Error("provider config lock absent");
      lock.digest = otherDigest;
      break;
    }
    case "living-descendant":
      launched.trace.descendants.aliveAfterTerminal.push(999999);
      break;
    case "missing-kill":
      launched.trace.supervisor.signals =
        launched.trace.supervisor.signals.filter(
          (signal) => signal.kind !== "KILL",
        );
      break;
    case "meter-forgery":
      launched.trace.externalMeter.wallMs = -1;
      break;
    case "lock-omission":
      x.locks.fields.pop();
      break;
    case "cleanup-leak":
      x.cleanup.residuals.push("owned scope remains live");
      break;
    case "manual-assistance":
      (x.assistance as any).manualDuringCell = true;
      break;
  }
  return x;
}
export function projectV5LiveCellFromRecord(
  record: V5CellRecord,
  assignment: {
    unitId: string;
    replication: number;
    pairId: string;
    trialId: string;
    substrate: "hermes" | "paperclip";
    order: 0 | 1;
    fault: { id: string; digest: string };
  },
  receiptKeyId: string,
  receiptKey: string,
): V5LiveCell {
  const derived = deriveV5ProviderFromRecord(record, receiptKey);
  if (derived.meter.cpuMs === null || derived.meter.maxRssKiB === null)
    throw Error("launched live cell lacks complete canonical evidence");
  const bindingDigest = sha(record.binding),
    isolationId = sha(record.isolation.ownedScopeIds),
    locks = record.locks.fields.map((field) => ({
      path: field.path,
      digest: field.digest,
      application:
        field.application === "irrelevant-to-minimal-worker"
          ? ("irrelevant" as const)
          : ("enforced" as const),
      evidenceDigest: sha(field.evidence),
    })),
    preservation = record.preservation.map((entry) => ({
      path: entry.source,
      disposition: entry.disposition,
      rationale: entry.rationale,
      evidenceDigest: sha(entry),
    }));
  return {
    ...assignment,
    bindingDigest,
    assignmentDigest: record.binding.assignmentDigest,
    launcherSpecDigest: record.binding.launcherSpecDigest,
    inputLockDigest: record.binding.lockDigest,
    challengeDigest: derived.challengeDigest,
    receiptKeyId,
    evidenceRecord: structuredClone(record),
    isolationId,
    manualAssistance: "none",
    fault: {
      id: record.fault.id,
      digest: record.fault.digest,
      injectorDigest: record.fault.injectorDigest,
      requestDigest: record.fault.requestDigest,
      acknowledgementDigest: record.fault.acknowledgementDigest,
      observedScopeDigest: record.fault.observedScopeDigest,
    },
    native: {
      provider:
        derived.provider === "hermes" ? "hermes-kanban" : "paperclip-heartbeat",
      derivation:
        derived.provider === "hermes"
          ? "verified-hermes-native-v1"
          : "verified-paperclip-native-v1",
      revisionDigest: derived.revisionDigest,
      configurationReadbackDigest: derived.configurationDigest,
      dispatchDigest: derived.dispatchDigest,
      runId: derived.runId,
      workId: derived.workId,
      pid: derived.pid,
      processGroup: derived.processGroup,
      commandDigest: derived.commandDigest,
      logDigest: derived.logDigest,
      receiptDigest: derived.receiptDigest,
      receiptBindingDigest: bindingDigest,
      configurationChallengeDigest: derived.challengeDigest,
      receiptChallengeDigest: derived.challengeDigest,
      commandLauncherDigest: derived.launcherDigest,
      terminalDigest: derived.terminalDigest,
      concurrentCandidateRunIds: [],
    },
    attempts: [structuredClone(derived.attempt)],
    terminal: {
      status: derived.status,
      exitCode: derived.terminal.exitCode,
      signal: derived.terminal.signal,
      termAt: derived.termAt,
      killAt: derived.killAt,
      descendantsObserved: structuredClone(derived.descendants.observed),
      aliveAfterTerminal: structuredClone(
        derived.descendants.aliveAfterTerminal,
      ),
      reaped: derived.descendants.reaped,
      startedAt: derived.attempt.startedAt,
      finishedAt: derived.terminal.at,
    },
    meters: {
      wall: {
        value: derived.meter.wallMs,
        method: derived.meter.method,
        evidenceDigest: sha({ meter: "wall", value: derived.meter.wallMs }),
      },
      cpu: {
        value: derived.meter.cpuMs,
        method: derived.meter.method,
        evidenceDigest: sha({ meter: "cpu", value: derived.meter.cpuMs }),
      },
      maxRss: {
        value: derived.meter.maxRssKiB,
        method: derived.meter.method,
        evidenceDigest: sha({
          meter: "max-rss",
          value: derived.meter.maxRssKiB,
        }),
      },
    },
    locks,
    preservation,
    cleanup: {
      status: record.cleanup.readbacks.every((x) => x.state === "archived")
        ? "archived"
        : "deleted",
      evidenceDigest: sha(record.cleanup),
      unownedStateDigestBefore: record.isolation.foreignSentinelBefore.digest,
      unownedStateDigestAfter: record.isolation.foreignSentinelAfter.digest,
    },
  };
}
export function verifyR24V5LiveArtifact(
  a: V5LiveArtifact,
  trust: {
    signerKeyId: string;
    publicKeyPem: string;
    resultSignerKeyId: string;
    resultPublicKeyPem: string;
    sourcePublicKeys: Record<string, string>;
    resolveReceiptKey(keyId: string): string;
  },
) {
  if (
    a.schema !== "autonomy.r24-v5-live-acceptance.v1" ||
    a.plan.schema !== "autonomy.r24-authorized-plan.v1" ||
    !dig(a.plan.campaignDigest) ||
    Object.keys(a.plan).sort().join("\0") !==
      [
        "schema",
        "campaignDigest",
        "authorizedAt",
        "notAfter",
        "seed",
        "units",
        "replications",
        "assignmentDigest",
        "launcherDigest",
        "launcherSpecDigest",
        "inputLockDigest",
        "authorization",
        "bindings",
        "assignments",
      ]
        .sort()
        .join("\0") ||
    !Number.isFinite(Date.parse(a.plan.authorizedAt)) ||
    !Number.isFinite(Date.parse(a.plan.notAfter)) ||
    !Number.isFinite(Date.parse(a.generatedAt)) ||
    Date.parse(a.plan.authorizedAt) >= Date.parse(a.plan.notAfter) ||
    Date.parse(a.generatedAt) < Date.parse(a.plan.authorizedAt) ||
    Date.parse(a.generatedAt) > Date.parse(a.plan.notAfter) ||
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
  if (
    a.resultAuthorization.algorithm !== "Ed25519" ||
    a.resultAuthorization.signerKeyId !== trust.resultSignerKeyId ||
    trust.resultSignerKeyId === trust.signerKeyId ||
    keyFingerprint(trust.resultPublicKeyPem) ===
      keyFingerprint(trust.publicKeyPem) ||
    !verifySignature(
      null,
      Buffer.from(r24V5ResultAuthorizationDigest(a)),
      trust.resultPublicKeyPem,
      Buffer.from(a.resultAuthorization.signature, "base64"),
    )
  )
    throw Error("invalid independent result authorization");
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
    a.plan.assignments.some((x) => {
      const expected = r24V5PlannedIdentity(
        a.plan.campaignDigest,
        a.plan.seed,
        x.unitId,
        x.replication,
        x.fault,
      );
      return (
        x.pairId !== expected.pairId ||
        x.trialId !== expected.trialId ||
        x.first !== expected.first
      );
    }) ||
    a.plan.assignmentDigest !==
      sha({ seed: a.plan.seed, assignments: a.plan.assignments })
  )
    throw Error("seeded assignment replay failed");
  const expected = a.plan.units.length * a.plan.replications * 2;
  if (
    a.cells.length !== expected ||
    a.plan.bindings.length !== expected ||
    new Set(a.plan.bindings.map((x) => `${x.pairId}:${x.substrate}`)).size !==
      expected ||
    new Set(a.plan.bindings.map((x) => x.bindingDigest)).size !== expected ||
    new Set(a.plan.bindings.map((x) => x.receiptKeyId)).size !== expected ||
    new Set(a.plan.bindings.map((x) => x.receiptKeyCommitment)).size !==
      expected ||
    new Set(a.plan.bindings.map((x) => x.challengeDigest)).size !==
      expected / 2 ||
    a.plan.assignments.some((assignment) => {
      const bindings = a.plan.bindings.filter(
        (binding) => binding.pairId === assignment.pairId,
      );
      return (
        bindings.length !== 2 ||
        new Set(bindings.map((x) => x.substrate)).size !== 2 ||
        new Set(bindings.map((x) => x.challengeDigest)).size !== 1
      );
    }) ||
    a.plan.bindings.some(
      (x) =>
        !x.receiptKeyId ||
        V5_SOURCE_ROLES.some((role) => !x.sourceKeyIds[role]) ||
        new Set(V5_SOURCE_ROLES.map((role) => x.sourceKeyIds[role])).size !==
          V5_SOURCE_ROLES.length ||
        ![
          x.bindingDigest,
          x.assignmentDigest,
          x.launcherSpecDigest,
          x.inputLockDigest,
          x.challengeDigest,
          x.receiptKeyCommitment,
        ].every(dig),
    ) ||
    a.plan.inputLockDigest !==
      sha(
        a.plan.bindings
          .map(({ pairId, substrate, inputLockDigest }) => ({
            pairId,
            substrate,
            inputLockDigest,
          }))
          .sort((x, y) =>
            `${x.pairId}:${x.substrate}`.localeCompare(
              `${y.pairId}:${y.substrate}`,
            ),
          ),
      )
  )
    throw Error("matched plan cardinality");
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
    const n = c.native,
      receiptKey = trust.resolveReceiptKey(c.receiptKeyId),
      authorizedBinding = a.plan.bindings.find(
        (x) => x.pairId === c.pairId && x.substrate === c.substrate,
      ),
      derived = deriveV5ProviderFromRecord(c.evidenceRecord, receiptKey);
    if (
      !authorizedBinding ||
      authorizedBinding.bindingDigest !== c.bindingDigest ||
      authorizedBinding.receiptKeyId !== c.receiptKeyId ||
      authorizedBinding.receiptKeyCommitment !== sha({ receiptKey }) ||
      authorizedBinding.assignmentDigest !== c.assignmentDigest ||
      authorizedBinding.launcherSpecDigest !== c.launcherSpecDigest ||
      authorizedBinding.inputLockDigest !== c.inputLockDigest ||
      authorizedBinding.challengeDigest !== c.challengeDigest ||
      !derived.receiptAuthenticated ||
      derived.runId !== n.runId ||
      derived.workId !== n.workId ||
      derived.workId !== c.trialId ||
      derived.pid !== n.pid ||
      derived.bindingDigest !== c.bindingDigest ||
      derived.assignmentDigest !== c.assignmentDigest ||
      derived.challengeDigest !== c.challengeDigest ||
      derived.launcherDigest !== a.plan.launcherDigest ||
      derived.launcherSpecDigest !== a.plan.launcherSpecDigest ||
      derived.inputLockDigest !== authorizedBinding.inputLockDigest ||
      c.launcherSpecDigest !== a.plan.launcherSpecDigest ||
      c.inputLockDigest !== authorizedBinding.inputLockDigest
    )
      throw Error("provider-native derivation replay failed");
    const launchedRecord = c.evidenceRecord.attempts.find(
        (attempt) => attempt.kind === "launched",
      )!,
      sourceValues: Record<V5SourceRole, unknown> = {
        provider: launchedRecord.providerTranscript,
        supervisor: launchedRecord.trace.supervisor,
        meter: launchedRecord.trace.externalMeter,
        fault: c.evidenceRecord.fault,
        cleanup: {
          isolation: c.evidenceRecord.isolation,
          cleanup: c.evidenceRecord.cleanup,
        },
        assistance: c.evidenceRecord.assistance,
      };
    if (!c.evidenceRecord.sourceCustody)
      throw Error("independent source custody absent");
    const authorityKeys = V5_SOURCE_ROLES.map(
        (role) => trust.sourcePublicKeys[authorizedBinding.sourceKeyIds[role]],
      ),
      authorityFingerprints = authorityKeys.map((key) =>
        key ? keyFingerprint(key) : "",
      ),
      reservedFingerprints = new Set([
        keyFingerprint(trust.publicKeyPem),
        keyFingerprint(trust.resultPublicKeyPem),
      ]);
    if (
      authorityKeys.some((key) => !key) ||
      new Set(authorityFingerprints).size !== V5_SOURCE_ROLES.length ||
      authorityFingerprints.some((fingerprint) =>
        reservedFingerprints.has(fingerprint),
      )
    )
      throw Error("source custody roles are not independently keyed");
    for (const role of V5_SOURCE_ROLES) {
      const custody = c.evidenceRecord.sourceCustody[role],
        expectedKeyId = authorizedBinding.sourceKeyIds[role],
        publicKey = trust.sourcePublicKeys[expectedKeyId],
        sourceDigest = sha(sourceValues[role]);
      if (
        !custody ||
        custody.keyId !== expectedKeyId ||
        custody.sourceDigest !== sourceDigest ||
        !publicKey ||
        !verifySignature(
          null,
          Buffer.from(
            r24V5SourceCustodyDigest(role, c.bindingDigest, sourceDigest),
          ),
          publicKey,
          Buffer.from(custody.signature, "base64"),
        )
      )
        throw Error(`independent ${role} source custody invalid`);
    }
    const expectedProvider =
      derived.provider === "hermes" ? "hermes-kanban" : "paperclip-heartbeat";
    if (
      n.provider !== expectedProvider ||
      n.revisionDigest !== derived.revisionDigest ||
      n.configurationReadbackDigest !== derived.configurationDigest ||
      n.dispatchDigest !== derived.dispatchDigest ||
      n.commandDigest !== derived.commandDigest ||
      n.logDigest !== derived.logDigest ||
      n.terminalDigest !== derived.terminalDigest ||
      n.receiptDigest !== derived.receiptDigest ||
      n.processGroup !== derived.processGroup ||
      c.attempts.length !== 1 ||
      sha(c.attempts[0]) !== sha(derived.attempt) ||
      c.terminal.status !== derived.status ||
      c.terminal.exitCode !== derived.terminal.exitCode ||
      c.terminal.signal !== derived.terminal.signal ||
      c.terminal.termAt !== derived.termAt ||
      c.terminal.killAt !== derived.killAt ||
      c.terminal.reaped !== derived.descendants.reaped ||
      sha(c.terminal.descendantsObserved) !==
        sha(derived.descendants.observed) ||
      sha(c.terminal.aliveAfterTerminal) !==
        sha(derived.descendants.aliveAfterTerminal) ||
      c.meters.wall.value !== derived.meter.wallMs ||
      c.meters.cpu.value !== derived.meter.cpuMs ||
      c.meters.maxRss.value !== derived.meter.maxRssKiB
    )
      throw Error("submitted live summary differs from canonical raw record");
    const record = c.evidenceRecord,
      expectedLocks = record.locks.fields
        .map((field) => ({
          path: field.path,
          digest: field.digest,
          application:
            field.application === "irrelevant-to-minimal-worker"
              ? ("irrelevant" as const)
              : ("enforced" as const),
          evidenceDigest: sha(field.evidence),
        }))
        .sort((x, y) => x.path.localeCompare(y.path)),
      submittedLocks = c.locks
        .slice()
        .sort((x, y) => x.path.localeCompare(y.path)),
      expectedPreservation = record.preservation
        .map((entry) => ({
          path: entry.source,
          disposition: entry.disposition,
          rationale: entry.rationale,
          evidenceDigest: sha(entry),
        }))
        .sort((x, y) => x.path.localeCompare(y.path)),
      submittedPreservation = c.preservation
        .slice()
        .sort((x, y) => x.path.localeCompare(y.path));
    if (
      sha(submittedLocks) !== sha(expectedLocks) ||
      sha(submittedPreservation) !== sha(expectedPreservation) ||
      c.cleanup.evidenceDigest !== sha(record.cleanup) ||
      c.cleanup.unownedStateDigestBefore !==
        record.isolation.foreignSentinelBefore.digest ||
      c.cleanup.unownedStateDigestAfter !==
        record.isolation.foreignSentinelAfter.digest ||
      c.manualAssistance !==
        (record.assistance.manualDuringCell === false &&
        record.assistance.automatedOnly &&
        record.assistance.operatorMinutes === 0
          ? "none"
          : ("invalid" as any))
    )
      throw Error("live lock/cleanup/assistance summary is not record-derived");
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
      c.evidenceRecord.fault.id !== planned.fault.id ||
      c.evidenceRecord.fault.digest !== planned.fault.digest
    )
      throw Error("observed fault differs from authorized assignment");
    const canonicalCell = projectV5LiveCellFromRecord(
      c.evidenceRecord,
      {
        pairId: planned.pairId,
        trialId: planned.trialId,
        unitId: planned.unitId,
        replication: planned.replication,
        substrate: c.substrate,
        order: c.order,
        fault: planned.fault,
      },
      c.receiptKeyId,
      receiptKey,
    );
    if (sha(c) !== sha(canonicalCell))
      throw Error("submitted live cell is not the canonical record projection");
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
      c.inputLockDigest
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
    V5_NEGATIVE_CONTROLS.some((id) => !controls.get(id))
  )
    throw Error("negative controls incomplete");
  for (const id of V5_NEGATIVE_CONTROLS) {
    const control = controls.get(id)!,
      base = a.cells.find(
        (c) =>
          c.pairId === control.basePairId &&
          c.substrate === control.baseSubstrate,
      );
    if (!base) throw Error("negative control base cell absent");
    const mutated = applyCanonicalV5NegativeMutation(id, base.evidenceRecord);
    if (sha(mutated) !== control.mutatedRecordDigest)
      throw Error("negative control mutation digest mismatch");
    let rejected = false;
    try {
      deriveV5ProviderFromRecord(
        mutated,
        trust.resolveReceiptKey(base.receiptKeyId),
      );
    } catch {
      rejected = true;
    }
    if (!rejected) throw Error(`negative control accepted: ${id}`);
  }
  const { digest, ...body } = a;
  if (!dig(digest) || digest !== sha(body))
    throw Error("artifact digest invalid");
  return true;
}
export function r24V5ArtifactDigest(a: Omit<V5LiveArtifact, "digest">) {
  return sha(a);
}
