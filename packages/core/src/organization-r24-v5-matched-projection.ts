import { createHash, createPublicKey, verify } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  V2_METRICS,
  analyzeMatchedV2,
  matchedBenchmarkDigest,
  type V2Cell,
  type V2Measure,
  type V2Metric,
  type V2Result,
} from "./organization-matched-benchmark";
import {
  verifyR24V5LiveArtifact,
  type V5LiveArtifact,
} from "./organization-r24-v5-live-acceptance-contract";

const v5Digest = (value: unknown) =>
  `sha256:${createHash("sha256").update(canonicalSemanticJson(value)).digest("hex")}`;
const fingerprint = (pem: string) =>
  createHash("sha256")
    .update(createPublicKey(pem).export({ type: "spki", format: "der" }))
    .digest("hex");

export type V5PortableEvidence = {
  schema: "autonomy.r24-portable-evidence.v1";
  cellKey: string;
  artifactDigest: string;
  planDigest: string;
  assignmentDigest: string;
  bindingDigest: string;
  cellEvidenceRecordDigest: string;
  nativeRunId: string;
  challengeDigest: string;
  graderPolicyDigest: string;
  outcome: unknown;
  portableTrace: unknown[];
  portableScore: V2Measure;
  signerKeyId: string;
  signature: string;
};
export type V5AccountingEvidence = {
  schema: "autonomy.r24-accounting-evidence.v1";
  cellKey: string;
  artifactDigest: string;
  planDigest: string;
  assignmentDigest: string;
  bindingDigest: string;
  cellEvidenceRecordDigest: string;
  nativeRunId: string;
  challengeDigest: string;
  accountingPolicyDigest: string;
  measures: Record<V2Metric, V2Measure>;
  nativeMeterJoins: {
    wall: string;
    cpu: string;
    maxRss: string;
  };
  signerKeyId: string;
  signature: string;
};
export type V5ProjectionTrust = Parameters<typeof verifyR24V5LiveArtifact>[1] & {
  graderPublicKeys: Record<string, string>;
  accountingPublicKeys: Record<string, string>;
};
export interface V5EvidenceSigner {
  keyId: string;
  sign(digest: string): string;
}
export type V5MatchedBundle = {
  schema: "autonomy.r24-v5-matched-bundle.v1";
  artifact: V5LiveArtifact;
  portableEvidence: V5PortableEvidence[];
  accountingEvidence: V5AccountingEvidence[];
  analysis: V2Result;
  analyzedAt: string;
  digest: string;
};

export function r24V5CellKey(pairId: string, substrate: string) {
  return v5Digest({ pairId, substrate });
}
export function r24V5PortableEvidenceDigest(e: V5PortableEvidence) {
  const { signature: _signature, ...body } = e;
  return v5Digest(body);
}
export function r24V5AccountingEvidenceDigest(e: V5AccountingEvidence) {
  const { signature: _signature, ...body } = e;
  return v5Digest(body);
}

const V2_UNITS: Record<V2Metric, string> = {
  portableScore: "ratio",
  wallTimeMs: "ms",
  cpuMs: "ms",
  memoryByteMs: "byte-ms",
  tokens: "token",
  computeUnits: "compute-unit",
  moneyUsd: "USD",
  humanMinutes: "minute",
};
function validateMeasure(metric: V2Metric, measure: V2Measure) {
  if (!measure || measure.unit !== V2_UNITS[metric] || !measure.provenance)
    return false;
  if (measure.status === "observed")
    return (
      Object.keys(measure).sort().join("\0") ===
        ["status", "value", "unit", "provenance", "raw", "rawDigest"]
          .sort()
          .join("\0") &&
      Number.isFinite(measure.value) &&
      measure.value >= 0 &&
      measure.rawDigest === matchedBenchmarkDigest(measure.raw)
    );
  if (measure.status === "unknown")
    return (
      Object.keys(measure).sort().join("\0") ===
        ["status", "value", "unit", "reason", "provenance"]
          .sort()
          .join("\0") &&
      measure.value === null &&
      Boolean(measure.reason)
    );
  return false;
}

function verifySignedEvidence(
  purpose: "portable" | "accounting",
  evidence: V5PortableEvidence | V5AccountingEvidence,
  publicKeys: Record<string, string>,
) {
  const key = publicKeys[evidence.signerKeyId],
    digest =
      purpose === "portable"
        ? r24V5PortableEvidenceDigest(evidence as V5PortableEvidence)
        : r24V5AccountingEvidenceDigest(evidence as V5AccountingEvidence);
  if (
    !key ||
    !verify(
      null,
      Buffer.from(digest),
      key,
      Buffer.from(evidence.signature, "base64"),
    )
  )
    throw Error(`invalid signed ${purpose} evidence`);
  return { key, digest };
}

function nativeMemoryByteMs(native: V5LiveArtifact["cells"][number]) {
  const launched = native.evidenceRecord.attempts.find(
      (attempt) => attempt.kind === "launched",
    )!,
    samples = launched.trace.externalMeter.raw.samples;
  if (!Array.isArray(samples) || samples.length < 2) return Number.NaN;
  let area = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i],
      dt = Number(BigInt(b.monotonicNs) - BigInt(a.monotonicNs)) / 1e6,
      aRss = a.processes.reduce((sum, process) => sum + process.rssKiB, 0) * 1024,
      bRss = b.processes.reduce((sum, process) => sum + process.rssKiB, 0) * 1024;
    if (
      !Number.isFinite(dt) ||
      !Number.isFinite(aRss) ||
      !Number.isFinite(bRss) ||
      aRss < 0 ||
      bRss < 0 ||
      dt < 0
    )
      return Number.NaN;
    area += ((aRss + bRss) / 2) * dt;
  }
  return area;
}

function observedMeasure(
  value: number,
  unit: string,
  provenance: string,
  raw: unknown,
): V2Measure {
  return {
    status: "observed",
    value,
    unit,
    provenance,
    raw,
    rawDigest: matchedBenchmarkDigest(raw),
  };
}

function evidenceBindings(
  artifact: V5LiveArtifact,
  pairId: string,
  substrate: "hermes" | "paperclip",
) {
  const assignment = artifact.plan.assignments.find(
      (candidate) =>
        candidate.pairId === pairId && candidate.substrate === substrate,
    ),
    native = artifact.cells.find(
      (candidate) =>
        candidate.pairId === pairId && candidate.substrate === substrate,
    );
  if (!assignment || !native) throw Error("R24 evidence cell absent");
  return {
    assignment,
    native,
    binding: {
      cellKey: r24V5CellKey(pairId, substrate),
      artifactDigest: artifact.digest,
      planDigest: v5Digest(artifact.plan),
      assignmentDigest: v5Digest(assignment),
      bindingDigest: native.bindingDigest,
      cellEvidenceRecordDigest: v5Digest(native.evidenceRecord),
      nativeRunId: native.native.runId,
      challengeDigest: native.challengeDigest,
    },
  };
}

export function collectSignedV5PortableEvidence(
  artifact: V5LiveArtifact,
  pairId: string,
  substrate: "hermes" | "paperclip",
  input: { outcome: unknown; portableTrace: unknown[]; portableScore: V2Measure },
  signer: V5EvidenceSigner,
): V5PortableEvidence {
  const { native, binding } = evidenceBindings(artifact, pairId, substrate);
  if (
    signer.keyId !== artifact.plan.grader.signerKeyId ||
    !input.portableTrace.length ||
    !validateMeasure("portableScore", input.portableScore) ||
    (native.terminal.status !== "success" &&
      (input.portableScore.status !== "observed" ||
        input.portableScore.value !== 0))
  )
    throw Error("R24 portable grader output invalid");
  const evidence: V5PortableEvidence = {
    schema: "autonomy.r24-portable-evidence.v1",
    ...binding,
    graderPolicyDigest: artifact.plan.grader.policyDigest,
    outcome: structuredClone(input.outcome),
    portableTrace: structuredClone(input.portableTrace),
    portableScore: structuredClone(input.portableScore),
    signerKeyId: signer.keyId,
    signature: "",
  };
  evidence.signature = signer.sign(r24V5PortableEvidenceDigest(evidence));
  if (!evidence.signature) throw Error("R24 portable signature absent");
  return evidence;
}

export function collectSignedV5AccountingEvidence(
  artifact: V5LiveArtifact,
  pairId: string,
  substrate: "hermes" | "paperclip",
  portableScore: V2Measure,
  economic: Pick<
    Record<V2Metric, V2Measure>,
    "tokens" | "computeUnits" | "moneyUsd"
  >,
  signer: V5EvidenceSigner,
): V5AccountingEvidence {
  const { native, binding } = evidenceBindings(artifact, pairId, substrate),
    launched = native.evidenceRecord.attempts.find(
      (attempt) => attempt.kind === "launched",
    )!,
    memoryRaw = { samples: launched.trace.externalMeter.raw.samples },
    measures: Record<V2Metric, V2Measure> = {
      portableScore: structuredClone(portableScore),
      wallTimeMs: observedMeasure(
        native.meters.wall.value,
        "ms",
        "authenticated-native-procfs-meter",
        native.meters.wall,
      ),
      cpuMs: observedMeasure(
        native.meters.cpu.value,
        "ms",
        "authenticated-native-procfs-meter",
        native.meters.cpu,
      ),
      memoryByteMs: observedMeasure(
        nativeMemoryByteMs(native),
        "byte-ms",
        "authenticated-native-procfs-integration",
        memoryRaw,
      ),
      tokens: structuredClone(economic.tokens),
      computeUnits: structuredClone(economic.computeUnits),
      moneyUsd: structuredClone(economic.moneyUsd),
      humanMinutes: observedMeasure(
        0,
        "minute",
        "signed-assistance-ledger",
        native.evidenceRecord.assistance,
      ),
    };
  if (
    signer.keyId !== artifact.plan.accounting.signerKeyId ||
    V2_METRICS.some((metric) => !validateMeasure(metric, measures[metric]))
  )
    throw Error("R24 accounting collector output invalid");
  const evidence: V5AccountingEvidence = {
    schema: "autonomy.r24-accounting-evidence.v1",
    ...binding,
    accountingPolicyDigest: artifact.plan.accounting.policyDigest,
    measures,
    nativeMeterJoins: {
      wall: v5Digest(native.meters.wall),
      cpu: v5Digest(native.meters.cpu),
      maxRss: v5Digest(native.meters.maxRss),
    },
    signerKeyId: signer.keyId,
    signature: "",
  };
  evidence.signature = signer.sign(r24V5AccountingEvidenceDigest(evidence));
  if (!evidence.signature) throw Error("R24 accounting signature absent");
  return evidence;
}

export function analyzeVerifiedR24V5Artifact(
  artifact: V5LiveArtifact,
  portableEvidence: V5PortableEvidence[],
  accountingEvidence: V5AccountingEvidence[],
  trust: V5ProjectionTrust,
  createdAt: string,
): V2Result {
  verifyR24V5LiveArtifact(artifact, trust);
  const reservedFingerprints = new Set([
      fingerprint(trust.publicKeyPem),
      fingerprint(trust.resultPublicKeyPem),
      ...Object.values(trust.sourcePublicKeys).map(fingerprint),
    ]),
    graderFingerprints = new Set(
      Object.values(trust.graderPublicKeys).map(fingerprint),
    ),
    accountingFingerprints = new Set(
      Object.values(trust.accountingPublicKeys).map(fingerprint),
    );
  if (
    Date.parse(createdAt) < Date.parse(artifact.generatedAt) ||
    !graderFingerprints.size ||
    !accountingFingerprints.size ||
    [...graderFingerprints].some(
      (key) => reservedFingerprints.has(key) || accountingFingerprints.has(key),
    ) ||
    [...accountingFingerprints].some((key) => reservedFingerprints.has(key)) ||
    portableEvidence.length !== artifact.cells.length ||
    accountingEvidence.length !== artifact.cells.length
  )
    throw Error("projected evidence cardinality mismatch");
  const cells: V2Cell[] = artifact.plan.assignments.map((assignment) => {
    const cellKey = r24V5CellKey(assignment.pairId, assignment.substrate),
      native = artifact.cells.find(
        (cell) =>
          cell.pairId === assignment.pairId &&
          cell.substrate === assignment.substrate,
      ),
      portable = portableEvidence.filter((x) => x.cellKey === cellKey),
      accounting = accountingEvidence.filter((x) => x.cellKey === cellKey);
    if (!native || portable.length !== 1 || accounting.length !== 1)
      throw Error("projected evidence exact cell join failed");
    const p = portable[0]!,
      a = accounting[0]!,
      ps = verifySignedEvidence("portable", p, trust.graderPublicKeys),
      as = verifySignedEvidence("accounting", a, trust.accountingPublicKeys),
      planDigest = v5Digest(artifact.plan),
      assignmentDigest = v5Digest(assignment),
      cellEvidenceRecordDigest = v5Digest(native.evidenceRecord),
      binding = {
        artifactDigest: artifact.digest,
        planDigest,
        assignmentDigest,
        bindingDigest: native.bindingDigest,
        cellEvidenceRecordDigest,
        nativeRunId: native.native.runId,
        challengeDigest: native.challengeDigest,
      };
    if (
      matchedBenchmarkDigest(
        Object.fromEntries(Object.keys(binding).map((key) => [key, (p as any)[key]])),
      ) !== matchedBenchmarkDigest(binding) ||
      p.graderPolicyDigest !== artifact.plan.grader.policyDigest ||
      p.signerKeyId !== artifact.plan.grader.signerKeyId ||
      fingerprint(ps.key) !== artifact.plan.grader.publicKeyFingerprint ||
      a.accountingPolicyDigest !== artifact.plan.accounting.policyDigest ||
      a.signerKeyId !== artifact.plan.accounting.signerKeyId ||
      fingerprint(as.key) !== artifact.plan.accounting.publicKeyFingerprint ||
      matchedBenchmarkDigest(
        Object.fromEntries(Object.keys(binding).map((key) => [key, (a as any)[key]])),
      ) !== matchedBenchmarkDigest(binding) ||
      Object.keys(p).sort().join("\0") !==
        [
          "schema", "cellKey", "artifactDigest", "planDigest",
          "assignmentDigest", "bindingDigest", "cellEvidenceRecordDigest",
          "nativeRunId", "challengeDigest", "outcome", "portableTrace",
          "portableScore", "graderPolicyDigest", "signerKeyId", "signature",
        ].sort().join("\0") ||
      Object.keys(a).sort().join("\0") !==
        [
          "schema", "cellKey", "artifactDigest", "planDigest",
          "assignmentDigest", "bindingDigest", "cellEvidenceRecordDigest",
          "nativeRunId", "challengeDigest", "measures", "nativeMeterJoins",
          "accountingPolicyDigest", "signerKeyId", "signature",
        ].sort().join("\0") ||
      p.schema !== "autonomy.r24-portable-evidence.v1" ||
      a.schema !== "autonomy.r24-accounting-evidence.v1" ||
      !p.portableTrace.length ||
      !validateMeasure("portableScore", p.portableScore) ||
      V2_METRICS.some((metric) => !validateMeasure(metric, a.measures[metric])) ||
      matchedBenchmarkDigest(p.portableScore) !==
        matchedBenchmarkDigest(a.measures.portableScore)
    )
      throw Error("projected evidence independence or provenance invalid");
    const wall = a.measures.wallTimeMs,
      cpu = a.measures.cpuMs,
      memory = a.measures.memoryByteMs,
      human = a.measures.humanMinutes;
    if (
      wall.status !== "observed" ||
      wall.value !== native.meters.wall.value ||
      matchedBenchmarkDigest(wall.raw) !== matchedBenchmarkDigest(native.meters.wall) ||
      cpu.status !== "observed" ||
      cpu.value !== native.meters.cpu.value ||
      matchedBenchmarkDigest(cpu.raw) !== matchedBenchmarkDigest(native.meters.cpu) ||
      a.nativeMeterJoins.wall !== v5Digest(native.meters.wall) ||
      a.nativeMeterJoins.cpu !== v5Digest(native.meters.cpu) ||
      a.nativeMeterJoins.maxRss !== v5Digest(native.meters.maxRss) ||
      memory.status !== "observed" ||
      memory.value !== nativeMemoryByteMs(native) ||
      matchedBenchmarkDigest(memory.raw) !==
        matchedBenchmarkDigest({
          samples: (
            native.evidenceRecord.attempts.find(
              (attempt) => attempt.kind === "launched",
            )!
          ).trace.externalMeter.raw.samples,
        }) ||
      (human.status !== "observed" || human.value !== 0) ||
      (native.terminal.status !== "success" &&
        (p.portableScore.status !== "observed" ||
          p.portableScore.value !== 0))
    )
      throw Error("projected evidence conflicts with native evidence");
    const providerEvidence = {
      schema: "autonomy.r24-v5-projected-provider-evidence.v1",
      artifactDigest: artifact.digest,
      planDigest: v5Digest(artifact.plan),
      assignmentDigest: v5Digest(assignment),
      bindingDigest: native.bindingDigest,
      cellEvidenceRecordDigest: v5Digest(native.evidenceRecord),
      portableEvidenceDigest: ps.digest,
      accountingEvidenceDigest: as.digest,
      nativeStatusDigest: v5Digest(native.terminal),
      meterJoinDigest: v5Digest({
        wall: native.meters.wall,
        cpu: native.meters.cpu,
        maxRss: native.meters.maxRss,
      }),
    };
    return {
      assignment: structuredClone(assignment),
      status: native.terminal.status,
      measures: structuredClone(a.measures),
      providerEvidence,
      providerEvidenceDigest: matchedBenchmarkDigest(providerEvidence),
      startedAt: native.terminal.startedAt,
      completedAt: native.terminal.finishedAt,
    };
  });
  return analyzeMatchedV2(
    artifact.plan.design,
    artifact.plan.assignments,
    cells,
    (cell) => ({ accepted: true, digest: matchedBenchmarkDigest(cell.providerEvidence) }),
    createdAt,
  );
}

export function finalizeVerifiedR24V5Bundle(
  artifact: V5LiveArtifact,
  portableEvidence: V5PortableEvidence[],
  accountingEvidence: V5AccountingEvidence[],
  trust: V5ProjectionTrust,
  analyzedAt: string,
): V5MatchedBundle {
  const analysis = analyzeVerifiedR24V5Artifact(
      artifact,
      portableEvidence,
      accountingEvidence,
      trust,
      analyzedAt,
    ),
    body = {
      schema: "autonomy.r24-v5-matched-bundle.v1" as const,
      artifact: structuredClone(artifact),
      portableEvidence: structuredClone(portableEvidence),
      accountingEvidence: structuredClone(accountingEvidence),
      analysis,
      analyzedAt,
    };
  return { ...body, digest: v5Digest(body) };
}

export function verifyR24V5MatchedBundle(
  bundle: V5MatchedBundle,
  trust: V5ProjectionTrust,
) {
  if (
    bundle.schema !== "autonomy.r24-v5-matched-bundle.v1" ||
    Object.keys(bundle).sort().join("\0") !==
      [
        "schema",
        "artifact",
        "portableEvidence",
        "accountingEvidence",
        "analysis",
        "analyzedAt",
        "digest",
      ]
        .sort()
        .join("\0")
  )
    throw Error("R24 matched bundle envelope invalid");
  const { digest, ...body } = bundle;
  if (digest !== v5Digest(body)) throw Error("R24 matched bundle digest invalid");
  const analysis = analyzeVerifiedR24V5Artifact(
    bundle.artifact,
    bundle.portableEvidence,
    bundle.accountingEvidence,
    trust,
    bundle.analyzedAt,
  );
  if (matchedBenchmarkDigest(analysis) !== matchedBenchmarkDigest(bundle.analysis))
    throw Error("R24 matched bundle analysis replay mismatch");
  return structuredClone(analysis);
}
