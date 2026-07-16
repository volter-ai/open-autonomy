import { createHash, createPublicKey, verify } from "node:crypto";
import { canonicalSemanticJson } from "@open-autonomy/core";
type D = `sha256:${string}`;
type Role = "proposer" | "evaluator" | "approver" | "deployer" | "auditor";
type Sig = {
  authority: string;
  keyId: string;
  publicKeyPem: string;
  signature: string;
};
export const R28_EXTERNAL_PHASES = [
  "observation",
  "measurement",
  "twin-update",
  "proposal",
  "static-formal-checks",
  "independent-benchmark",
  "preregistration",
  "human-approval",
  "signed-deployment",
  "canary",
  "monitoring",
  "evaluation",
  "promotion-or-rollback",
  "durable-decision-memory",
  "effect-prepare",
  "effect-delivery",
  "effect-ack",
  "storage-before-write",
  "storage-after-fsync",
  "storage-after-rename",
] as const;
export type R28RoleGrant = {
  role: Role;
  identity: string;
  keyId: string;
  publicKeyPem: string;
  issuedAt: string;
  expiresAt: string;
  revoked: false;
  grantDigest: D;
  authority: string;
  signature: string;
};
export type R28Proposal = {
  id: string;
  outcome: "accepted" | "rejected" | "rolled-back";
  claim: "causal" | "prediction";
  patch: {
    digest: D;
    resultStateDigest: D;
    paths: string[];
    operations: number;
  };
  preregistration: {
    digest: D;
    metric: string;
    unit: string;
    population: string;
    estimand: string;
    minimumImprovement: number;
    guardrailsDigest: D;
  };
  checks: {
    digest: D;
    patchDigest: D;
    compile: true;
    conform: true;
    formal: true;
    inheritedObligationsDigest: D;
  };
  benchmark: { digest: D; patchDigest: D; authority: string; passed: boolean };
  deployment?: {
    digest: D;
    patchDigest: D;
    approvalDigest: D;
    effectId: string;
  };
  canary?: { digest: D; r27Digest: D; patchDigest: D };
  decision: {
    digest: D;
    preregistrationDigest: D;
    measuredImprovement: number;
    confidenceInterval: [number, number];
    safetyRegressions: number;
    automatic: boolean;
  };
  effects: Array<{
    id: string;
    kind: "deploy" | "promote" | "rollback";
    status: "acknowledged";
    patchDigest: D;
    receiptDigest: D;
  }>;
  protectedControlsAfter: Record<string, D>;
  accounting: {
    spend: number;
    operations: number;
    changedPaths: number;
    receiptDigest: D;
  };
  attestations: Array<{
    stage:
      | "proposal"
      | "preregistration"
      | "checks"
      | "benchmark"
      | "approval"
      | "deployment"
      | "canary"
      | "decision";
    role: Role;
    identity: string;
    payloadDigest: D;
    signedAt: string;
    signature: string;
  }>;
};
export type R28ExternalCampaign = {
  schema: "open-autonomy.bench-r28-external-campaign.v1";
  closureClaim: false;
  campaignId: string;
  generatedAt: string;
  dependencies: Array<{
    checkpoint: string;
    artifactId: string;
    digest: D;
    registryDigest: D;
  }>;
  repository: {
    remoteDigest: D;
    baselineHead: D;
    finalHead: D;
    cleanTreeDigest: D;
  };
  bounds: {
    digest: D;
    proposalCount: number;
    spend: number;
    operations: number;
    changedPaths: number;
    maximumObservationGapMs: number;
  };
  protectedControls: Record<
    | "constitution"
    | "grader"
    | "authorityCeiling"
    | "evidence"
    | "pause"
    | "rollback",
    D
  >;
  roleGrants: R28RoleGrant[];
  heartbeats: Array<{
    sequence: number;
    observedAt: string;
    head: D;
    collectorId: string;
    bootId: string;
    processId: string;
    evidenceDigest: D;
    signature: string;
  }>;
  crashes: Array<{
    phase: (typeof R28_EXTERNAL_PHASES)[number];
    beforeBootId: string;
    afterBootId: string;
    beforeProcessId: string;
    afterProcessId: string;
    storageGenerationBefore: number;
    storageGenerationAfter: number;
    effectId?: string;
    receiptDigest: D;
    authority: string;
    keyId: string;
    publicKeyPem: string;
    signature: string;
  }>;
  proposals: R28Proposal[];
  attacks: {
    forgedApproval: {
      inputDigest: D;
      rejectionDigest: D;
      authority: string;
      signature: string;
    };
    compromisedWorker: {
      inputDigest: D;
      rejectionDigest: D;
      authority: string;
      signature: string;
    };
  };
  pause: {
    requestDigest: D;
    safeStateDigest: D;
    rollbackEffects: string[];
    authority: string;
    signature: string;
  };
  audit: Array<{
    sequence: number;
    at: string;
    proposalId: string;
    event: string;
    artifactDigest: D;
    effectId?: string;
    previousDigest?: D;
    digest: D;
    authority: string;
    signature: string;
  }>;
  residuals: [];
  validator: {
    identity: string;
    keyId: string;
    publicKeyPem: string;
    signedAt: string;
    signature: string;
  };
};
export interface R28ExternalTrust {
  dependency(
    checkpoint: string,
    artifactId: string,
    digest: D,
    registryDigest: D,
  ): boolean;
  repository(r: R28ExternalCampaign["repository"]): boolean;
  roleGrant(g: R28RoleGrant): boolean;
  collector(id: string, body: unknown, signature: string): boolean;
  crash(body: unknown, signature: string): boolean;
  accounting(p: R28Proposal["accounting"], campaignId: string): boolean;
  protectedControls(
    d: (typeof CONTROL_KEYS)[number] extends never
      ? never
      : R28ExternalCampaign["protectedControls"],
  ): boolean;
  r27Canary(digest: D, proposalId: string): boolean;
  attack(
    kind: "forgedApproval" | "compromisedWorker",
    body: unknown,
    signature: string,
  ): boolean;
  pause(body: unknown, signature: string): boolean;
  validator(identity: string, keyId: string, pem: string): boolean;
}
const CONTROL_KEYS = [
    "constitution",
    "grader",
    "authorityCeiling",
    "evidence",
    "pause",
    "rollback",
  ] as const,
  SHA = /^sha256:[0-9a-f]{64}$/,
  DAY = 864e5,
  MIN = 90 * DAY;
const h = (x: unknown): D =>
    `sha256:${createHash("sha256").update(canonicalSemanticJson(x)).digest("hex")}`,
  dt = (x: string) => Date.parse(x),
  fin = (x: unknown): x is number =>
    typeof x === "number" && Number.isFinite(x),
  nat = (x: unknown) => Number.isSafeInteger(x) && (x as number) >= 0,
  non = (x: unknown) => typeof x === "string" && x.length > 0;
function signature(body: unknown, pem: string, s: string) {
  try {
    return (
      createPublicKey(pem).asymmetricKeyType === "ed25519" &&
      verify(
        null,
        Buffer.from(canonicalSemanticJson(body)),
        pem,
        Buffer.from(s, "base64"),
      )
    );
  } catch {
    return false;
  }
}
function without<T extends Record<string, unknown>>(x: T, key: string) {
  const y = { ...x };
  delete y[key];
  return y;
}
function exact(v: unknown, ks: string[], n: string) {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).sort().join("\0") !== [...ks].sort().join("\0")
  )
    throw Error(`${n} schema invalid`);
}
function schemas(c: R28ExternalCampaign) {
  for (const d of c.dependencies)
    exact(
      d,
      ["checkpoint", "artifactId", "digest", "registryDigest"],
      "dependency",
    );
  exact(
    c.repository,
    ["remoteDigest", "baselineHead", "finalHead", "cleanTreeDigest"],
    "repository",
  );
  exact(
    c.bounds,
    [
      "digest",
      "proposalCount",
      "spend",
      "operations",
      "changedPaths",
      "maximumObservationGapMs",
    ],
    "bounds",
  );
  for (const g of c.roleGrants)
    exact(
      g,
      [
        "role",
        "identity",
        "keyId",
        "publicKeyPem",
        "issuedAt",
        "expiresAt",
        "revoked",
        "grantDigest",
        "authority",
        "signature",
      ],
      "role grant",
    );
  for (const x of c.heartbeats)
    exact(
      x,
      [
        "sequence",
        "observedAt",
        "head",
        "collectorId",
        "bootId",
        "processId",
        "evidenceDigest",
        "signature",
      ],
      "heartbeat",
    );
  for (const x of c.crashes)
    exact(
      x,
      [
        "phase",
        "beforeBootId",
        "afterBootId",
        "beforeProcessId",
        "afterProcessId",
        "storageGenerationBefore",
        "storageGenerationAfter",
        ...(x.effectId !== undefined ? ["effectId"] : []),
        "receiptDigest",
        "authority",
        "keyId",
        "publicKeyPem",
        "signature",
      ],
      "crash",
    );
  for (const p of c.proposals) {
    exact(
      p,
      [
        "id",
        "outcome",
        "claim",
        "patch",
        "preregistration",
        "checks",
        "benchmark",
        ...(p.deployment ? ["deployment"] : []),
        ...(p.canary ? ["canary"] : []),
        "decision",
        "effects",
        "protectedControlsAfter",
        "accounting",
        "attestations",
      ],
      "proposal",
    );
    exact(
      p.patch,
      ["digest", "resultStateDigest", "paths", "operations"],
      "patch",
    );
    exact(
      p.preregistration,
      [
        "digest",
        "metric",
        "unit",
        "population",
        "estimand",
        "minimumImprovement",
        "guardrailsDigest",
      ],
      "preregistration",
    );
    exact(
      p.checks,
      [
        "digest",
        "patchDigest",
        "compile",
        "conform",
        "formal",
        "inheritedObligationsDigest",
      ],
      "checks",
    );
    exact(
      p.benchmark,
      ["digest", "patchDigest", "authority", "passed"],
      "benchmark",
    );
    exact(
      p.decision,
      [
        "digest",
        "preregistrationDigest",
        "measuredImprovement",
        "confidenceInterval",
        "safetyRegressions",
        "automatic",
      ],
      "decision",
    );
    exact(
      p.accounting,
      ["spend", "operations", "changedPaths", "receiptDigest"],
      "accounting",
    );
    for (const e of p.effects)
      exact(
        e,
        ["id", "kind", "status", "patchDigest", "receiptDigest"],
        "effect",
      );
    for (const a of p.attestations)
      exact(
        a,
        ["stage", "role", "identity", "payloadDigest", "signedAt", "signature"],
        "stage attestation",
      );
  }
  for (const x of Object.values(c.attacks))
    exact(
      x,
      ["inputDigest", "rejectionDigest", "authority", "signature"],
      "attack",
    );
  exact(
    c.pause,
    [
      "requestDigest",
      "safeStateDigest",
      "rollbackEffects",
      "authority",
      "signature",
    ],
    "pause",
  );
  for (const a of c.audit)
    exact(
      a,
      [
        "sequence",
        "at",
        "proposalId",
        "event",
        "artifactDigest",
        ...(a.effectId ? ["effectId"] : []),
        ...(a.previousDigest ? ["previousDigest"] : []),
        "digest",
        "authority",
        "signature",
      ],
      "audit",
    );
  exact(
    c.validator,
    ["identity", "keyId", "publicKeyPem", "signedAt", "signature"],
    "validator",
  );
}
function signedStage(
  p: R28Proposal,
  grants: Map<Role, R28RoleGrant>,
  stage: R28Proposal["attestations"][number]["stage"],
  role: Role,
  digest: D,
  min: number,
  max: number,
) {
  const a = p.attestations.filter((x) => x.stage === stage);
  if (a.length !== 1) throw Error(`${p.id} ${stage} attestation cardinality`);
  const x = a[0]!,
    g = grants.get(role)!;
  if (
    x.role !== role ||
    x.identity !== g.identity ||
    x.payloadDigest !== digest ||
    dt(x.signedAt) < min ||
    dt(x.signedAt) > max ||
    !signature(without(x as any, "signature"), g.publicKeyPem, x.signature)
  )
    throw Error(`${p.id} ${stage} attestation invalid`);
}
export function signableR28Campaign(c: R28ExternalCampaign) {
  return {
    ...c,
    validator: {
      identity: c.validator.identity,
      keyId: c.validator.keyId,
      publicKeyPem: c.validator.publicKeyPem,
      signedAt: c.validator.signedAt,
    },
  };
}
export function verifyR28ExternalCampaign(
  c: R28ExternalCampaign,
  t: R28ExternalTrust,
  nowIso: string,
) {
  schemas(c);
  const now = dt(nowIso);
  exact(
    c,
    [
      "schema",
      "closureClaim",
      "campaignId",
      "generatedAt",
      "dependencies",
      "repository",
      "bounds",
      "protectedControls",
      "roleGrants",
      "heartbeats",
      "crashes",
      "proposals",
      "attacks",
      "pause",
      "audit",
      "residuals",
      "validator",
    ],
    "campaign",
  );
  if (
    c.schema !== "open-autonomy.bench-r28-external-campaign.v1" ||
    c.closureClaim !== false ||
    !non(c.campaignId) ||
    !fin(now) ||
    !fin(dt(c.generatedAt)) ||
    dt(c.generatedAt) > now ||
    now - dt(c.generatedAt) > DAY ||
    c.residuals.length
  )
    throw Error("campaign envelope invalid");
  if (
    c.dependencies.length !== 28 ||
    new Set(c.dependencies.map((x) => x.checkpoint)).size !== 28
  )
    throw Error("dependency set invalid");
  for (let i = 0; i < 28; i++) {
    const d = c.dependencies.find((x) => x.checkpoint === `R${i}`);
    if (
      !d ||
      ![d.digest, d.registryDigest].every((x) => SHA.test(x)) ||
      !non(d.artifactId) ||
      !t.dependency(d.checkpoint, d.artifactId, d.digest, d.registryDigest)
    )
      throw Error(`dependency R${i} invalid`);
  }
  if (
    !t.repository(c.repository) ||
    ![
      c.repository.remoteDigest,
      c.repository.baselineHead,
      c.repository.finalHead,
      c.repository.cleanTreeDigest,
    ].every((x) => SHA.test(x))
  )
    throw Error("canonical repository invalid");
  if (
    !SHA.test(c.bounds.digest) ||
    !nat(c.bounds.proposalCount) ||
    c.bounds.proposalCount < 3 ||
    ![c.bounds.spend, c.bounds.operations, c.bounds.changedPaths].every(
      (x) => nat(x) && x > 0,
    ) ||
    !nat(c.bounds.maximumObservationGapMs) ||
    c.bounds.maximumObservationGapMs < 1 ||
    c.bounds.maximumObservationGapMs > DAY
  )
    throw Error("bounds invalid");
  if (
    Object.keys(c.protectedControls).sort().join() !==
      [...CONTROL_KEYS].sort().join() ||
    !Object.values(c.protectedControls).every((x) => SHA.test(x)) ||
    !t.protectedControls(c.protectedControls)
  )
    throw Error("protected controls invalid");
  const grants = new Map<Role, R28RoleGrant>();
  for (const g of c.roleGrants) {
    if (
      !(
        ["proposer", "evaluator", "approver", "deployer", "auditor"] as string[]
      ).includes(g.role) ||
      grants.has(g.role) ||
      !t.roleGrant(g) ||
      g.revoked !== false ||
      dt(g.issuedAt) > dt(c.heartbeats[0]?.observedAt ?? "") ||
      dt(g.expiresAt) < now ||
      !signature(without(g as any, "signature"), g.publicKeyPem, g.signature)
    )
      throw Error("role grant invalid");
    grants.set(g.role, g);
  }
  if (
    grants.size !== 5 ||
    new Set([...grants.values()].map((x) => x.identity)).size !== 5 ||
    new Set([...grants.values()].map((x) => x.publicKeyPem)).size !== 5
  )
    throw Error("global role independence invalid");
  if (c.heartbeats.length < 2) throw Error("heartbeats absent");
  let prior = -Infinity;
  for (let i = 0; i < c.heartbeats.length; i++) {
    const x = c.heartbeats[i]!,
      at = dt(x.observedAt),
      body = without(x as any, "signature");
    if (
      x.sequence !== i + 1 ||
      !fin(at) ||
      at <= prior ||
      (i && at - prior > c.bounds.maximumObservationGapMs) ||
      ![x.head, x.evidenceDigest].every((v) => SHA.test(v)) ||
      !non(x.bootId) ||
      !non(x.processId) ||
      !t.collector(x.collectorId, body, x.signature)
    )
      throw Error("heartbeat invalid");
    prior = at;
  }
  if (
    prior - dt(c.heartbeats[0]!.observedAt) < MIN ||
    now - prior > c.bounds.maximumObservationGapMs ||
    new Set(c.heartbeats.map((x) => x.evidenceDigest)).size !==
      c.heartbeats.length
  )
    throw Error("90-day continuity invalid");
  if (
    c.crashes.length !== R28_EXTERNAL_PHASES.length ||
    new Set(c.crashes.map((x) => x.phase)).size !== R28_EXTERNAL_PHASES.length
  )
    throw Error("crash coverage invalid");
  for (const x of c.crashes) {
    const body = without(x as any, "signature");
    if (
      !R28_EXTERNAL_PHASES.includes(x.phase) ||
      x.beforeBootId === x.afterBootId ||
      x.beforeProcessId === x.afterProcessId ||
      !nat(x.storageGenerationBefore) ||
      !nat(x.storageGenerationAfter) ||
      x.storageGenerationAfter < x.storageGenerationBefore ||
      !SHA.test(x.receiptDigest) ||
      !t.crash(body, x.signature) ||
      !signature(body, x.publicKeyPem, x.signature)
    )
      throw Error("crash attestation invalid");
  }
  let spend = 0,
    ops = 0,
    paths = 0;
  const outcomes = new Set(c.proposals.map((x) => x.outcome)),
    effectIds = new Set<string>();
  if (
    !["accepted", "rejected", "rolled-back"].every((x) =>
      outcomes.has(x as any),
    ) ||
    c.proposals.length > c.bounds.proposalCount ||
    new Set(c.proposals.map((x) => x.id)).size !== c.proposals.length
  )
    throw Error("proposal outcome coverage invalid");
  for (const p of c.proposals) {
    if (
      !non(p.id) ||
      !SHA.test(p.patch.digest) ||
      !SHA.test(p.patch.resultStateDigest) ||
      !nat(p.patch.operations) ||
      p.patch.operations < 1 ||
      p.patch.operations !== p.accounting.operations ||
      p.patch.paths.length !== p.accounting.changedPaths ||
      new Set(p.patch.paths).size !== p.patch.paths.length ||
      !t.accounting(p.accounting, c.campaignId)
    )
      throw Error(`${p.id} patch/accounting invalid`);
    spend += p.accounting.spend;
    ops += p.accounting.operations;
    paths += p.accounting.changedPaths;
    const pre = p.preregistration;
    if (
      ![
        pre.digest,
        pre.guardrailsDigest,
        p.checks.digest,
        p.checks.inheritedObligationsDigest,
        p.benchmark.digest,
        p.decision.digest,
      ].every((x) => SHA.test(x)) ||
      !non(pre.metric) ||
      !non(pre.unit) ||
      !non(pre.population) ||
      !non(pre.estimand) ||
      !fin(pre.minimumImprovement) ||
      p.checks.patchDigest !== p.patch.digest ||
      p.benchmark.patchDigest !== p.patch.digest ||
      p.benchmark.authority === grants.get("proposer")!.identity
    )
      throw Error(`${p.id} chain invalid`);
    const lo = p.decision.confidenceInterval[0],
      hi = p.decision.confidenceInterval[1];
    if (
      !fin(p.decision.measuredImprovement) ||
      !fin(lo) ||
      !fin(hi) ||
      lo > hi ||
      p.decision.preregistrationDigest !== pre.digest ||
      !nat(p.decision.safetyRegressions)
    )
      throw Error(`${p.id} decision invalid`);
    if (
      p.outcome === "accepted" &&
      (p.claim !== "causal" ||
        !p.benchmark.passed ||
        !p.deployment ||
        !p.canary ||
        p.decision.automatic ||
        lo < pre.minimumImprovement ||
        p.decision.measuredImprovement < pre.minimumImprovement ||
        p.decision.safetyRegressions !== 0 ||
        !p.effects.some((x) => x.kind === "promote"))
    )
      throw Error(`${p.id} acceptance invalid`);
    if (
      p.outcome === "rolled-back" &&
      (!p.deployment ||
        !p.canary ||
        !p.decision.automatic ||
        !p.effects.some((x) => x.kind === "rollback"))
    )
      throw Error(`${p.id} rollback invalid`);
    if (
      p.canary &&
      (!t.r27Canary(p.canary.r27Digest, p.id) ||
        p.canary.patchDigest !== p.patch.digest)
    )
      throw Error(`${p.id} R27 canary invalid`);
    for (const [k, v] of Object.entries(c.protectedControls))
      if (p.protectedControlsAfter[k] !== v)
        throw Error(`${p.id} protected control changed`);
    for (const e of p.effects) {
      if (
        effectIds.has(e.id) ||
        e.patchDigest !== p.patch.digest ||
        !SHA.test(e.receiptDigest) ||
        e.status !== "acknowledged"
      )
        throw Error("effect exactly-once invalid");
      effectIds.add(e.id);
    }
    const audited = [
      p.patch.digest,
      p.preregistration.digest,
      p.checks.digest,
      p.benchmark.digest,
      ...(p.deployment ? [p.deployment.digest] : []),
      ...(p.canary ? [p.canary.digest] : []),
      p.decision.digest,
      ...p.effects.map((e) => e.receiptDigest),
    ];
    if (
      audited.some(
        (d) =>
          c.audit.filter((a) => a.proposalId === p.id && a.artifactDigest === d)
            .length !== 1,
      )
    )
      throw Error(`${p.id} audit artifact completeness invalid`);
    const start = dt(c.heartbeats[0]!.observedAt),
      end = dt(c.generatedAt);
    signedStage(p, grants, "proposal", "proposer", p.patch.digest, start, end);
    signedStage(
      p,
      grants,
      "preregistration",
      "auditor",
      pre.digest,
      start,
      end,
    );
    signedStage(p, grants, "checks", "evaluator", p.checks.digest, start, end);
    signedStage(
      p,
      grants,
      "benchmark",
      "evaluator",
      p.benchmark.digest,
      start,
      end,
    );
    signedStage(p, grants, "approval", "approver", pre.digest, start, end);
    if (p.deployment)
      signedStage(
        p,
        grants,
        "deployment",
        "deployer",
        p.deployment.digest,
        start,
        end,
      );
    if (p.canary)
      signedStage(p, grants, "canary", "auditor", p.canary.digest, start, end);
    signedStage(
      p,
      grants,
      "decision",
      "evaluator",
      p.decision.digest,
      start,
      end,
    );
  }
  if (
    spend > c.bounds.spend ||
    ops > c.bounds.operations ||
    paths > c.bounds.changedPaths
  )
    throw Error("derived campaign bound exceeded");
  for (const kind of ["forgedApproval", "compromisedWorker"] as const) {
    const x = c.attacks[kind],
      body = without(x as any, "signature");
    if (
      !SHA.test(x.inputDigest) ||
      !SHA.test(x.rejectionDigest) ||
      !t.attack(kind, body, x.signature)
    )
      throw Error("attack drill invalid");
  }
  const pb = without(c.pause as any, "signature");
  if (
    !SHA.test(c.pause.requestDigest) ||
    !SHA.test(c.pause.safeStateDigest) ||
    !t.pause(pb, c.pause.signature) ||
    !c.pause.rollbackEffects.every((x) => effectIds.has(x))
  )
    throw Error("pause safe-state invalid");
  let prev: D | undefined;
  for (let i = 0; i < c.audit.length; i++) {
    const a = c.audit[i]!,
      body = without(without(a as any, "signature") as any, "digest");
    if (
      a.sequence !== i + 1 ||
      a.previousDigest !== prev ||
      a.digest !== h(body) ||
      !SHA.test(a.artifactDigest) ||
      !grants.get("auditor") ||
      a.authority !== grants.get("auditor")!.identity ||
      !signature(
        without(a as any, "signature"),
        grants.get("auditor")!.publicKeyPem,
        a.signature,
      )
    )
      throw Error("audit chain invalid");
    prev = a.digest;
  }
  for (const e of effectIds)
    if (c.audit.filter((a) => a.effectId === e).length !== 1)
      throw Error("effect audit exactly-once invalid");
  if (
    !t.validator(
      c.validator.identity,
      c.validator.keyId,
      c.validator.publicKeyPem,
    ) ||
    c.validator.identity === grants.get("auditor")!.identity ||
    dt(c.validator.signedAt) !== dt(c.generatedAt) ||
    !signature(
      signableR28Campaign(c),
      c.validator.publicKeyPem,
      c.validator.signature,
    )
  )
    throw Error("independent validator invalid");
  return {
    status: "valid-complete-external-campaign" as const,
    campaignId: c.campaignId,
    durationMs: prior - dt(c.heartbeats[0]!.observedAt),
    proposalCount: c.proposals.length,
    auditHead: prev,
  };
}
