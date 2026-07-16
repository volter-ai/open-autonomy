import { createHash, createPublicKey } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  matchedBenchmarkDigest,
  V2_METRICS,
  type V2Metric,
  type V2Result,
} from "./organization-matched-benchmark";
import {
  verifyR24V5MatchedBundle,
  r24V5CellKey,
  type V5MatchedBundle,
  type V5ProjectionTrust,
} from "./organization-r24-v5-matched-projection";
const hash = (x: unknown) =>
    createHash("sha256").update(canonicalSemanticJson(x)).digest("hex"),
  v5 = (x: unknown) => `sha256:${hash(x)}`,
  pdig = (x: unknown) =>
    typeof x === "string" && /^sha256:[a-f0-9]{64}$/.test(x);
const dependencyIds = ["R15", "R16", "R21", "R22", "R23"] as const;
export type ClosureSigned<T> = {
  body: T;
  digest: string;
  keyId: string;
  signedAt: string;
  signature: string;
};
export type R24DependencyEvidence = {
  checkpoint: (typeof dependencyIds)[number];
  artifact: unknown;
  artifactDigest: string;
  policyDigest: string;
  verifierId: string;
  role: string;
  keyId: string;
  verifiedAt: string;
  signature: string;
};
export interface R24ExternalClosureTrust extends V5ProjectionTrust {
  closurePublicKeys: Record<string, string>;
  dependencyRegistry: Record<
    (typeof dependencyIds)[number],
    {
      verifierId: string;
      policyDigest: string;
      role: string;
      keyId: string;
      publicKeyPem: string;
    }
  >;
  verifyClosureSignature(
    purpose: "preregistration" | "equivalence" | "triage" | "closure",
    value: ClosureSigned<unknown>,
  ): boolean;
  verifyDependency(value: R24DependencyEvidence): boolean;
}
export type R24DifferenceCategory =
  | "locks"
  | "preservation"
  | "fault"
  | "native"
  | "provider"
  | "attempt"
  | "process"
  | "cleanup"
  | "portable"
  | "accounting"
  | "assistance"
  | "provenance"
  | "missingness";
export type R24Difference = {
  id: string;
  pairId: string;
  category: R24DifferenceCategory;
  path: string;
  hermes: unknown;
  paperclip: unknown;
};
export type R24PreregistrationBody = {
  planDigest: string;
  designDigest: string;
  authorizedBefore: string;
  minimumIndependentUnits: number;
  minimumRepetitions: number;
  minimumFaultStrata: number;
  requiredMetrics: V2Metric[];
  requireCompletePairs: true;
  requireOrderSensitivity: true;
  requireLeaveUnitOut: true;
  requireLeaveFaultOut: true;
};
export type R24ExternalCampaign = {
  schema: "autonomy.r24-external-closure.v2";
  closureClaim: true;
  bundle: V5MatchedBundle;
  bundleDigest: string;
  preregistration: ClosureSigned<R24PreregistrationBody>;
  equivalence: Array<
    ClosureSigned<{
      pairId: string;
      path: string;
      hermesDigest: string;
      paperclipDigest: string;
      equivalent: true;
      evidenceDigest: string;
    }>
  >;
  triage: Array<
    ClosureSigned<{
      differenceId: string;
      disposition: "explained-inherent" | "expected-substrate";
      rationale: string;
      evidenceDigests: string[];
    }>
  >;
  dependencies: R24DependencyEvidence[];
  generatedAt: string;
  signerKeyId: string;
  digest: string;
  signature: string;
};
export type R24ClosureResult = {
  closed: true;
  studyConclusion: "conclusive" | "inconclusive";
  bundleDigest: string;
  pairs: number;
  differences: number;
};
const preregistrationKeys = [
  "authorizedBefore",
  "designDigest",
  "minimumFaultStrata",
  "minimumIndependentUnits",
  "minimumRepetitions",
  "planDigest",
  "requiredMetrics",
  "requireCompletePairs",
  "requireLeaveFaultOut",
  "requireLeaveUnitOut",
  "requireOrderSensitivity",
] as const;
export function validateR24PreregistrationBody(
  value: unknown,
): asserts value is R24PreregistrationBody {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("preregistration body is not an object");
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).sort().join("\0") !==
      [...preregistrationKeys].sort().join("\0") ||
    !pdig(body.planDigest) ||
    typeof body.designDigest !== "string" ||
    !body.designDigest ||
    typeof body.authorizedBefore !== "string" ||
    !Number.isFinite(Date.parse(body.authorizedBefore)) ||
    !Number.isSafeInteger(body.minimumIndependentUnits) ||
    (body.minimumIndependentUnits as number) < 2 ||
    !Number.isSafeInteger(body.minimumRepetitions) ||
    (body.minimumRepetitions as number) < 2 ||
    !Number.isSafeInteger(body.minimumFaultStrata) ||
    (body.minimumFaultStrata as number) < 2 ||
    !Array.isArray(body.requiredMetrics) ||
    body.requiredMetrics.some((x) => typeof x !== "string") ||
    new Set(body.requiredMetrics).size !== V2_METRICS.length ||
    V2_METRICS.some((x) => !(body.requiredMetrics as unknown[]).includes(x)) ||
    body.requireCompletePairs !== true ||
    body.requireOrderSensitivity !== true ||
    body.requireLeaveUnitOut !== true ||
    body.requireLeaveFaultOut !== true
  )
    throw Error("preregistration body schema invalid");
}
export function validateR24CompleteStudyPredicate(
  analysis: V2Result,
  minimums: {
    independentUnits: number;
    repetitions: number;
    faultStrata: number;
  },
) {
  const units = new Set(analysis.assignments.map((x) => x.unitId)),
    reps = new Set(analysis.assignments.map((x) => x.replication)),
    faults = new Set(analysis.assignments.map((x) => x.fault.id)),
    estimates = new Map(analysis.estimates.map((x) => [x.metric, x]));
  if (
    !Number.isSafeInteger(minimums.independentUnits) ||
    minimums.independentUnits < 2 ||
    !Number.isSafeInteger(minimums.repetitions) ||
    minimums.repetitions < 2 ||
    !Number.isSafeInteger(minimums.faultStrata) ||
    minimums.faultStrata < 2 ||
    units.size < minimums.independentUnits ||
    reps.size < minimums.repetitions ||
    faults.size < minimums.faultStrata
  )
    throw Error("complete study design minimum unmet");
  for (const metric of V2_METRICS) {
    const e = estimates.get(metric);
    if (
      !e ||
      e.missingness.excludedPairs !== 0 ||
      e.missingness.completePairs !== analysis.cells.length / 2 ||
      e.conclusion === "insufficient" ||
      !e.simultaneousInterval ||
      e.orderSensitivity.hermesFirstMean === null ||
      e.orderSensitivity.paperclipFirstMean === null ||
      e.leaveUnitOut.length !== units.size ||
      e.leaveUnitOut.some((x) => x.meanDifference === null) ||
      e.leaveFaultOut.length !== faults.size ||
      e.leaveFaultOut.some((x) => x.meanDifference === null)
    )
      throw Error("analysis incomplete, insufficient, or sensitivity-invalid");
  }
  const primary = estimates.get(analysis.design.primaryEndpoint)!;
  return {
    conclusion:
      primary.conclusion === "inconclusive"
        ? ("inconclusive" as const)
        : ("conclusive" as const),
    units,
    reps,
    faults,
    estimates,
  };
}
function signed<T>(
  x: ClosureSigned<T>,
  purpose: Parameters<R24ExternalClosureTrust["verifyClosureSignature"]>[0],
  trust: R24ExternalClosureTrust,
) {
  if (
    x.digest !== v5(x.body) ||
    !x.keyId ||
    !Number.isFinite(Date.parse(x.signedAt)) ||
    !x.signature ||
    !trust.verifyClosureSignature(purpose, x as ClosureSigned<unknown>)
  )
    throw Error(`${purpose} signature invalid`);
}
const fingerprint = (pem: string) =>
  createHash("sha256")
    .update(createPublicKey(pem).export({ type: "spki", format: "der" }))
    .digest("hex");
function flatten(value: unknown, prefix: string, out: Map<string, unknown>) {
  if (value === null || typeof value !== "object") {
    out.set(prefix, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((x, i) => flatten(x, `${prefix}[${i}]`, out));
    if (!value.length) out.set(`${prefix}.length`, 0);
    return;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  if (!entries.length) out.set(`${prefix}.empty`, true);
  for (const [k, x] of entries) flatten(x, prefix ? `${prefix}.${k}` : k, out);
}
function addCategory(
  rows: R24Difference[],
  pairId: string,
  category: R24DifferenceCategory,
  h: unknown,
  p: unknown,
) {
  const hm = new Map<string, unknown>(),
    pm = new Map<string, unknown>();
  flatten(h, "", hm);
  flatten(p, "", pm);
  for (const path of [...new Set([...hm.keys(), ...pm.keys()])].sort()) {
    const hermes = hm.has(path) ? hm.get(path) : { missing: true },
      paperclip = pm.has(path) ? pm.get(path) : { missing: true };
    if (hash(hermes) !== hash(paperclip)) {
      const body = { pairId, category, path, hermes, paperclip };
      rows.push({ id: hash(body), ...body });
    }
  }
}
function keyRoles(
  bundle: V5MatchedBundle,
  c: R24ExternalCampaign,
  trust: R24ExternalClosureTrust,
) {
  const a = bundle.artifact,
    sourceByRole = new Map<string, Set<string>>();
  for (const binding of a.plan.bindings)
    for (const [role, key] of Object.entries(binding.sourceKeyIds)) {
      const keys = sourceByRole.get(role) ?? new Set<string>();
      keys.add(key);
      sourceByRole.set(role, keys);
    }
  if ([...sourceByRole.values()].some((keys) => keys.size !== 1))
    throw Error("source custody role changes key within campaign");
  const equivalenceKeys = new Set(c.equivalence.map((x) => x.keyId)),
    triageKeys = new Set(c.triage.map((x) => x.keyId));
  if (equivalenceKeys.size !== 1 || triageKeys.size !== 1)
    throw Error("equivalence or triage authority is not singular");
  return [
    { role: "plan", pem: trust.publicKeyPem },
    { role: "result", pem: trust.resultPublicKeyPem },
    { role: "grader", pem: trust.graderPublicKeys[a.plan.grader.signerKeyId] },
    {
      role: "accounting",
      pem: trust.accountingPublicKeys[a.plan.accounting.signerKeyId],
    },
    { role: "closure", pem: trust.closurePublicKeys[c.signerKeyId] },
    {
      role: "preregistration",
      pem: trust.closurePublicKeys[c.preregistration.keyId],
    },
    {
      role: "equivalence",
      pem: trust.closurePublicKeys[[...equivalenceKeys][0]!],
    },
    { role: "triage", pem: trust.closurePublicKeys[[...triageKeys][0]!] },
    ...[...sourceByRole].map(([role, keys]) => ({
      role: `source:${role}`,
      pem: trust.sourcePublicKeys[[...keys][0]!],
    })),
    ...c.dependencies.map((x) => ({
      role: `dependency:${x.checkpoint}:${x.role}`,
      pem: trust.dependencyRegistry[x.checkpoint].publicKeyPem,
    })),
  ];
}
export function deriveR24DifferenceInventory(bundle: V5MatchedBundle) {
  const rows: R24Difference[] = [], artifact = bundle.artifact, pairs = new Map<string, typeof artifact.cells>();
  for (const cell of artifact.cells) pairs.set(cell.pairId, [...(pairs.get(cell.pairId) ?? []), cell]);
  for (const [pairId, xs] of pairs) {
    const h = xs.find((x) => x.substrate === "hermes")!, p = xs.find((x) => x.substrate === "paperclip")!,
      ha = artifact.plan.assignments.find((x) => x.pairId === pairId && x.substrate === "hermes")!, pa = artifact.plan.assignments.find((x) => x.pairId === pairId && x.substrate === "paperclip")!,
      hp = bundle.portableEvidence.find((x) => x.cellKey === r24V5CellKey(pairId, "hermes"))!, pp = bundle.portableEvidence.find((x) => x.cellKey === r24V5CellKey(pairId, "paperclip"))!,
      hc = bundle.accountingEvidence.find((x) => x.cellKey === r24V5CellKey(pairId, "hermes"))!, pc = bundle.accountingEvidence.find((x) => x.cellKey === r24V5CellKey(pairId, "paperclip"))!;
    if (![h, p, ha, pa, hp, pp, hc, pc].every(Boolean)) throw Error("R24 difference inventory pair incomplete");
    addCategory(rows, pairId, "locks", Object.fromEntries(h.locks.map((x) => [x.path, x])), Object.fromEntries(p.locks.map((x) => [x.path, x])));
    addCategory(rows, pairId, "preservation", { summary: h.preservation, source: h.evidenceRecord.preservation, sourceLocks: h.evidenceRecord.locks }, { summary: p.preservation, source: p.evidenceRecord.preservation, sourceLocks: p.evidenceRecord.locks });
    addCategory(rows, pairId, "fault", { assignment: ha.fault, cell: h.fault, source: h.evidenceRecord.fault }, { assignment: pa.fault, cell: p.fault, source: p.evidenceRecord.fault });
    addCategory(rows, pairId, "native", h.native, p.native);
    addCategory(rows, pairId, "provider", h.evidenceRecord.attempts.map((x) => x.kind === "launched" ? x.providerTranscript : null), p.evidenceRecord.attempts.map((x) => x.kind === "launched" ? x.providerTranscript : null));
    addCategory(rows, pairId, "attempt", h.evidenceRecord.attempts, p.evidenceRecord.attempts);
    addCategory(rows, pairId, "process", { terminal: h.terminal, supervisor: h.evidenceRecord.attempts.map((x) => x.kind === "launched" ? x.trace.supervisor : null) }, { terminal: p.terminal, supervisor: p.evidenceRecord.attempts.map((x) => x.kind === "launched" ? x.trace.supervisor : null) });
    addCategory(rows, pairId, "cleanup", { summary: h.cleanup, source: h.evidenceRecord.cleanup, isolation: h.evidenceRecord.isolation }, { summary: p.cleanup, source: p.evidenceRecord.cleanup, isolation: p.evidenceRecord.isolation });
    addCategory(rows, pairId, "portable", hp, pp); addCategory(rows, pairId, "accounting", hc, pc); addCategory(rows, pairId, "assistance", h.evidenceRecord.assistance, p.evidenceRecord.assistance);
    addCategory(rows, pairId, "provenance", Object.fromEntries(Object.entries(hc.measures).map(([k, v]) => [k, v.provenance])), Object.fromEntries(Object.entries(pc.measures).map(([k, v]) => [k, v.provenance])));
    addCategory(rows, pairId, "missingness", Object.fromEntries(Object.entries(hc.measures).map(([k, v]) => [k, v.status])), Object.fromEntries(Object.entries(pc.measures).map(([k, v]) => [k, v.status])));
  }
  return rows;
}
export function verifyR24ExternalClosure(
  c: R24ExternalCampaign,
  trust: R24ExternalClosureTrust,
): R24ClosureResult {
  const { digest, signature, signerKeyId, ...body } = c;
  if (
    c.schema !== "autonomy.r24-external-closure.v2" ||
    c.closureClaim !== true ||
    !Number.isFinite(Date.parse(c.generatedAt)) ||
    digest !== v5(body) ||
    !signature ||
    !signerKeyId ||
    !trust.verifyClosureSignature("closure", {
      body,
      digest,
      keyId: signerKeyId,
      signedAt: c.generatedAt,
      signature,
    })
  )
    throw Error("closure envelope invalid");
  if (c.bundleDigest !== c.bundle.digest)
    throw Error("matched bundle reference digest mismatch");
  const analysis = verifyR24V5MatchedBundle(c.bundle, trust);
  if (
    matchedBenchmarkDigest(analysis) !==
    matchedBenchmarkDigest(c.bundle.analysis)
  )
    throw Error("verified analysis mismatch");
  signed(c.preregistration, "preregistration", trust);
  validateR24PreregistrationBody(c.preregistration.body);
  c.equivalence.forEach((x) => signed(x, "equivalence", trust));
  c.triage.forEach((x) => signed(x, "triage", trust));
  const artifact = c.bundle.artifact,
    planDigest = v5(artifact.plan),
    designDigest = matchedBenchmarkDigest(artifact.plan.design),
    pre = c.preregistration.body;
  if (
    pre.planDigest !== planDigest ||
    pre.designDigest !== designDigest ||
    !Number.isFinite(Date.parse(pre.authorizedBefore)) ||
    Date.parse(c.generatedAt) < Date.parse(c.bundle.analyzedAt) ||
    Date.parse(pre.authorizedBefore) > Date.parse(artifact.plan.authorizedAt) ||
    Date.parse(c.preregistration.body.authorizedBefore) >
      Date.parse(c.generatedAt) ||
    Date.parse(c.preregistration.signedAt) >
      Date.parse(artifact.plan.authorizedAt) ||
    [...c.equivalence, ...c.triage].some(
      (x) =>
        Date.parse(x.signedAt) < Date.parse(c.bundle.analyzedAt) ||
        Date.parse(x.signedAt) > Date.parse(c.generatedAt),
    )
  )
    throw Error("preregistration is not bound before authorized plan");
  const study = validateR24CompleteStudyPredicate(analysis, {
    independentUnits: pre.minimumIndependentUnits,
    repetitions: pre.minimumRepetitions,
    faultStrata: pre.minimumFaultStrata,
  });
  const roles = keyRoles(c.bundle, c, trust),
    roleNames = new Set(roles.map((x) => x.role)),
    fingerprints = roles.map((x) => {
      if (!x.pem) throw Error(`public key unresolved for ${x.role}`);
      return fingerprint(x.pem);
    });
  if (
    roleNames.size !== roles.length ||
    new Set(fingerprints).size !== roles.length
  )
    throw Error("global role/key separation failed");
  const depMap = new Map(c.dependencies.map((x) => [x.checkpoint, x]));
  if (
    depMap.size !== dependencyIds.length ||
    dependencyIds.some((id) => !depMap.has(id)) ||
    c.dependencies.some((x) => {
      const registered = trust.dependencyRegistry[x.checkpoint];
      return (
        !dependencyIds.includes(x.checkpoint) ||
        !registered ||
        x.verifierId !== registered.verifierId ||
        x.policyDigest !== registered.policyDigest ||
        x.role !== registered.role ||
        x.keyId !== registered.keyId ||
        !pdig(x.artifactDigest) ||
        hash(x.artifact) !== x.artifactDigest.slice(7) ||
        !pdig(x.policyDigest) ||
        !x.verifierId ||
        !x.role ||
        !x.keyId ||
        !Number.isFinite(Date.parse(x.verifiedAt)) ||
        Date.parse(x.verifiedAt) > Date.parse(c.generatedAt) ||
        Date.parse(x.verifiedAt) > Date.parse(artifact.generatedAt) ||
        Date.parse(x.verifiedAt) > Date.parse(c.bundle.analyzedAt) ||
        !x.signature ||
        !trust.verifyDependency(x)
      );
    })
  )
    throw Error("dependency closure replay failed");
  const rows: R24Difference[] = [],
    pairs = new Map<string, typeof artifact.cells>();
  for (const cell of artifact.cells)
    pairs.set(cell.pairId, [...(pairs.get(cell.pairId) ?? []), cell]);
  for (const [pairId, xs] of pairs) {
    const h = xs.find((x) => x.substrate === "hermes")!,
      p = xs.find((x) => x.substrate === "paperclip")!,
      ha = artifact.plan.assignments.find(
        (x) => x.pairId === pairId && x.substrate === "hermes",
      )!,
      pa = artifact.plan.assignments.find(
        (x) => x.pairId === pairId && x.substrate === "paperclip",
      )!,
      hp = c.bundle.portableEvidence.find(
        (x) => x.cellKey === r24V5CellKey(pairId, "hermes"),
      )!,
      pp = c.bundle.portableEvidence.find(
        (x) => x.cellKey === r24V5CellKey(pairId, "paperclip"),
      )!,
      hc = c.bundle.accountingEvidence.find(
        (x) => x.cellKey === r24V5CellKey(pairId, "hermes"),
      )!,
      pc = c.bundle.accountingEvidence.find(
        (x) => x.cellKey === r24V5CellKey(pairId, "paperclip"),
      )!;
    const variantPaths = [
      "isolation",
      "credential-scope",
      "provider-revision",
      "provider-config",
      "provider-command",
    ];
    for (const lock of h.locks)
      if (
        !variantPaths.includes(lock.path) &&
        hash(lock) !== hash(p.locks.find((x) => x.path === lock.path))
      )
        throw Error("portable lock class differs within matched pair");
    for (const path of variantPaths) {
      const hd = h.locks.find((x) => x.path === path)?.digest,
        pd = p.locks.find((x) => x.path === path)?.digest,
        witness = c.equivalence.filter(
          (x) => x.body.pairId === pairId && x.body.path === path,
        );
      if (
        !hd ||
        !pd ||
        witness.length !== 1 ||
        witness[0]!.body.hermesDigest !== hd ||
        witness[0]!.body.paperclipDigest !== pd ||
        !pdig(witness[0]!.body.evidenceDigest)
      )
        throw Error("substrate-specific lock equivalence is not exact");
    }
    addCategory(
      rows,
      pairId,
      "locks",
      Object.fromEntries(h.locks.map((x) => [x.path, x])),
      Object.fromEntries(p.locks.map((x) => [x.path, x])),
    );
    addCategory(
      rows,
      pairId,
      "preservation",
      {
        summary: h.preservation,
        source: h.evidenceRecord.preservation,
        sourceLocks: h.evidenceRecord.locks,
      },
      {
        summary: p.preservation,
        source: p.evidenceRecord.preservation,
        sourceLocks: p.evidenceRecord.locks,
      },
    );
    addCategory(
      rows,
      pairId,
      "fault",
      { assignment: ha.fault, cell: h.fault, source: h.evidenceRecord.fault },
      { assignment: pa.fault, cell: p.fault, source: p.evidenceRecord.fault },
    );
    addCategory(rows, pairId, "native", h.native, p.native);
    addCategory(
      rows,
      pairId,
      "provider",
      h.evidenceRecord.attempts.map((x) =>
        x.kind === "launched" ? x.providerTranscript : null,
      ),
      p.evidenceRecord.attempts.map((x) =>
        x.kind === "launched" ? x.providerTranscript : null,
      ),
    );
    addCategory(
      rows,
      pairId,
      "attempt",
      h.evidenceRecord.attempts,
      p.evidenceRecord.attempts,
    );
    addCategory(
      rows,
      pairId,
      "process",
      {
        terminal: h.terminal,
        supervisor: h.evidenceRecord.attempts.map((x) =>
          x.kind === "launched" ? x.trace.supervisor : null,
        ),
      },
      {
        terminal: p.terminal,
        supervisor: p.evidenceRecord.attempts.map((x) =>
          x.kind === "launched" ? x.trace.supervisor : null,
        ),
      },
    );
    addCategory(
      rows,
      pairId,
      "cleanup",
      {
        summary: h.cleanup,
        source: h.evidenceRecord.cleanup,
        isolation: h.evidenceRecord.isolation,
      },
      {
        summary: p.cleanup,
        source: p.evidenceRecord.cleanup,
        isolation: p.evidenceRecord.isolation,
      },
    );
    addCategory(rows, pairId, "portable", hp, pp);
    addCategory(rows, pairId, "accounting", hc, pc);
    addCategory(
      rows,
      pairId,
      "assistance",
      h.evidenceRecord.assistance,
      p.evidenceRecord.assistance,
    );
    addCategory(
      rows,
      pairId,
      "provenance",
      Object.fromEntries(
        Object.entries(hc.measures).map(([k, v]) => [k, v.provenance]),
      ),
      Object.fromEntries(
        Object.entries(pc.measures).map(([k, v]) => [k, v.provenance]),
      ),
    );
    addCategory(
      rows,
      pairId,
      "missingness",
      Object.fromEntries(
        Object.entries(hc.measures).map(([k, v]) => [k, v.status]),
      ),
      Object.fromEntries(
        Object.entries(pc.measures).map(([k, v]) => [k, v.status]),
      ),
    );
  }
  const expectedEquivalence = pairs.size * 5;
  const canonicalRows = deriveR24DifferenceInventory(c.bundle);
  if (canonicalSemanticJson(canonicalRows) !== canonicalSemanticJson(rows)) throw Error("R24 difference inventory derivation drift");
  if (c.equivalence.length !== expectedEquivalence)
    throw Error("surplus or missing equivalence witness");
  const triage = new Map(c.triage.map((x) => [x.body.differenceId, x.body]));
  if (
    triage.size !== c.triage.length ||
    rows.some((x) => !triage.has(x.id)) ||
    c.triage.some(
      (x) =>
        !rows.some((r) => r.id === x.body.differenceId) ||
        !["explained-inherent", "expected-substrate"].includes(
          x.body.disposition,
        ) ||
        !x.body.rationale ||
        !x.body.evidenceDigests.length ||
        x.body.evidenceDigests.some((d) => !pdig(d)),
    )
  )
    throw Error("exhaustive difference inventory is not exactly triaged");
  return {
    closed: true,
    studyConclusion: study.conclusion,
    bundleDigest: c.bundle.digest,
    pairs: pairs.size,
    differences: rows.length,
  };
}
