import { createHash, createPublicKey, verify } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";

type Digest = `sha256:${string}`;
type Claim = "prediction" | "causal" | "unknown";
type Direction = "minimize" | "maximize";
type PatchKind =
  | "profile"
  | "component"
  | "capacity"
  | "routing"
  | "retry"
  | "review"
  | "human-seam";
export type R26PatchOperation = {
  kind: PatchKind;
  path: string;
  from: unknown;
  to: unknown;
};
export type R26Approval = {
  candidateId: string;
  kind: "governance" | "security" | "rollout" | "budget";
  authorityId: string;
  keyId: string;
  publicKeyPem: string;
  issuedAt: string;
  expiresAt: string;
  scope: string;
  limit: number;
  signature: string;
};
export type R26Candidate = {
  id: string;
  patch: {
    schema: "autonomy.organization-patch.v1";
    id: string;
    operations: R26PatchOperation[];
  };
  claim: Claim;
  disposition: "baseline" | "experiment-only" | "actionable";
  identificationId: string;
  rationale: string;
  assumptions: string[];
  risks: string[];
  rollbackTrigger: string;
  expectedEffects: Array<{
    metric: string;
    population: string;
    horizon: string;
    unit: string;
    estimand: string;
    direction: Direction;
    point: number;
    interval: [number, number];
    r25EvidenceDigest: Digest;
    provenance: "r25-prediction" | "r25-intervention";
  }>;
};
export type R26Evaluation = {
  cost: number;
  authority: Record<string, number>;
  semanticPaths: string[];
  metrics: Record<
    string,
    {
      point: number;
      uncertainty: number;
      unit: string;
      r25EvidenceDigest: Digest;
    }
  >;
  proxy: {
    reportedEscalations: number;
    latentFailures: number;
    attributedHumanMinutes: number;
    actualHumanMinutes: number;
    metricCoverage: number;
    distributionShift: number;
  };
  heldout: {
    splitId: string;
    trainingDigest: Digest;
    testDigest: Digest;
    disjoint: true;
    frozenAt: string;
    evaluatedAt: string;
    rows: Array<{
      metric: string;
      unit: string;
      predicted: number;
      lower: number;
      upper: number;
      actual: number;
    }>;
  };
  evidence: {
    authorityId: string;
    keyId: string;
    publicKeyPem: string;
    r25Digest: Digest;
    baselineStateDigest: Digest;
    patchDigest: Digest;
    resultStateDigest: Digest;
    resultDigest: Digest;
    evaluatedAt: string;
    signature: string;
  };
};
export type R26Assessment = {
  candidateId: string;
  evaluation: R26Evaluation | null;
  feasible: boolean;
  violations: string[];
  adjustedObjectives: Record<string, number> | null;
  dominatedBy: string[];
};
export type R26Certificate = {
  schema: "autonomy.r26-external-certificate.v1";
  r25: {
    artifactId: string;
    digest: Digest;
    acceptedAt: string;
    authorityId: string;
  };
  baseline: {
    candidateId: string;
    stateDigest: Digest;
    state: Record<string, unknown>;
  };
  manifest: {
    digest: Digest;
    candidateIds: string[];
    authorityId: string;
    keyId: string;
    publicKeyPem: string;
    signedAt: string;
    signature: string;
  };
  candidates: R26Candidate[];
  objectives: Array<{
    metric: string;
    direction: Direction;
    uncertaintyAversion: number;
    complexityPenalty: number;
    minimum?: number;
    maximum?: number;
  }>;
  constraints: {
    allowedPaths: string[];
    maximumAuthority: Record<string, number>;
    budget: number;
    rolloutMaximum: number;
    maximumComplexity: number;
    minimumMetricCoverage: number;
    maximumProxyGap: number;
    maximumDistributionShift: number;
    backtestPolicy: Record<
      string,
      { unit: string; maxMae: number; minCoverage: number }
    >;
  };
  approvals: R26Approval[];
  assessments: R26Assessment[];
  paretoFront: string[];
  recommendation: string | null;
  outcome: "recommended" | "tradeoff" | "refused";
  rationale: string;
  generatedAt: string;
  validator: {
    validatorId: string;
    keyId: string;
    publicKeyPem: string;
    signedAt: string;
    signature: string;
  };
};
export interface R26ExternalTrust {
  acceptedR25(ref: R26Certificate["r25"]): boolean;
  acceptedBaseline(r25Digest: Digest, stateDigest: Digest): boolean;
  completeCandidateManifest(
    digest: Digest,
    candidateIds: string[],
    r25Digest: Digest,
  ): boolean;
  identification(
    r25Digest: Digest,
    identificationId: string,
  ): "identified" | "unknown";
  verifyR25Effect(
    r25Digest: Digest,
    effect: R26Candidate["expectedEffects"][number],
  ): boolean;
  canonicalPatchOperation(
    kind: PatchKind,
    path: string,
    from: unknown,
    to: unknown,
  ): boolean;
  heldout(split: R26Evaluation["heldout"], r25Digest: Digest): boolean;
  trustedKey(
    role: "manifest" | "validator" | "assessment" | R26Approval["kind"],
    authorityId: string,
    keyId: string,
    publicKeyPem: string,
  ): boolean;
}

const hash = (v: unknown): Digest =>
  `sha256:${createHash("sha256").update(canonicalSemanticJson(v)).digest("hex")}`;
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const date = (v: string) =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
const unique = <T>(v: T[]) => new Set(v).size === v.length;
const nonempty = (v: string) => typeof v === "string" && v.trim().length > 0;
function exact(v: unknown, keys: string[], label: string) {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).sort().join("\0") !== [...keys].sort().join("\0")
  )
    throw Error(`${label} schema invalid`);
}
function exactSchemas(c: R26Certificate) {
  exact(
    c,
    [
      "schema",
      "r25",
      "baseline",
      "manifest",
      "candidates",
      "objectives",
      "constraints",
      "approvals",
      "assessments",
      "paretoFront",
      "recommendation",
      "outcome",
      "rationale",
      "generatedAt",
      "validator",
    ],
    "certificate",
  );
  exact(c.r25, ["artifactId", "digest", "acceptedAt", "authorityId"], "r25");
  exact(c.baseline, ["candidateId", "stateDigest", "state"], "baseline");
  exact(
    c.manifest,
    [
      "digest",
      "candidateIds",
      "authorityId",
      "keyId",
      "publicKeyPem",
      "signedAt",
      "signature",
    ],
    "manifest",
  );
  exact(
    c.validator,
    ["validatorId", "keyId", "publicKeyPem", "signedAt", "signature"],
    "validator",
  );
  for (const a of c.approvals)
    exact(
      a,
      [
        "candidateId",
        "kind",
        "authorityId",
        "keyId",
        "publicKeyPem",
        "issuedAt",
        "expiresAt",
        "scope",
        "limit",
        "signature",
      ],
      "approval",
    );
  for (const a of c.assessments) {
    exact(
      a,
      [
        "candidateId",
        "evaluation",
        "feasible",
        "violations",
        "adjustedObjectives",
        "dominatedBy",
      ],
      "assessment",
    );
    if (a.evaluation) {
      const e = a.evaluation;
      exact(
        e,
        [
          "cost",
          "authority",
          "semanticPaths",
          "metrics",
          "proxy",
          "heldout",
          "evidence",
        ],
        "evaluation",
      );
      exact(
        e.proxy,
        [
          "reportedEscalations",
          "latentFailures",
          "attributedHumanMinutes",
          "actualHumanMinutes",
          "metricCoverage",
          "distributionShift",
        ],
        "proxy",
      );
      exact(
        e.heldout,
        [
          "splitId",
          "trainingDigest",
          "testDigest",
          "disjoint",
          "frozenAt",
          "evaluatedAt",
          "rows",
        ],
        "heldout",
      );
      for (const r of e.heldout.rows)
        exact(
          r,
          ["metric", "unit", "predicted", "lower", "upper", "actual"],
          "backtest row",
        );
      exact(
        e.evidence,
        [
          "authorityId",
          "keyId",
          "publicKeyPem",
          "r25Digest",
          "baselineStateDigest",
          "patchDigest",
          "resultStateDigest",
          "resultDigest",
          "evaluatedAt",
          "signature",
        ],
        "evaluation evidence",
      );
      for (const m of Object.values(e.metrics))
        exact(
          m,
          ["point", "uncertainty", "unit", "r25EvidenceDigest"],
          "metric",
        );
    }
  }
  exact(
    c.constraints,
    [
      "allowedPaths",
      "maximumAuthority",
      "budget",
      "rolloutMaximum",
      "maximumComplexity",
      "minimumMetricCoverage",
      "maximumProxyGap",
      "maximumDistributionShift",
      "backtestPolicy",
    ],
    "constraints",
  );
  for (const p of Object.values(c.constraints.backtestPolicy))
    exact(p, ["unit", "maxMae", "minCoverage"], "backtest policy");
  for (const o of c.objectives)
    exact(
      o,
      [
        "metric",
        "direction",
        "uncertaintyAversion",
        "complexityPenalty",
        ...(o.minimum !== undefined ? ["minimum"] : []),
        ...(o.maximum !== undefined ? ["maximum"] : []),
      ],
      "objective",
    );
  for (const x of c.candidates) {
    exact(
      x,
      [
        "id",
        "patch",
        "claim",
        "disposition",
        "identificationId",
        "rationale",
        "assumptions",
        "risks",
        "rollbackTrigger",
        "expectedEffects",
      ],
      "candidate",
    );
    exact(x.patch, ["schema", "id", "operations"], "patch");
    for (const p of x.patch.operations)
      exact(p, ["kind", "path", "from", "to"], "operation");
    for (const e of x.expectedEffects)
      exact(
        e,
        [
          "metric",
          "population",
          "horizon",
          "unit",
          "estimand",
          "direction",
          "point",
          "interval",
          "r25EvidenceDigest",
          "provenance",
        ],
        "effect",
      );
  }
}
function sig(body: unknown, pem: string, signature: string) {
  try {
    return (
      createPublicKey(pem).asymmetricKeyType === "ed25519" &&
      verify(
        null,
        Buffer.from(canonicalSemanticJson(body)),
        pem,
        Buffer.from(signature, "base64"),
      )
    );
  } catch {
    return false;
  }
}
function approvalBody(a: R26Approval) {
  const { signature, ...body } = a;
  return body;
}
export const signableR26Approval = approvalBody;
function evaluationResult(e: R26Evaluation) {
  const { evidence, ...result } = e;
  return result;
}
function evaluationEvidenceBody(candidateId: string, e: R26Evaluation) {
  const { signature, ...body } = e.evidence;
  return { candidateId, ...body };
}
export function signableR26Evaluation(candidateId: string, e: R26Evaluation) {
  return evaluationEvidenceBody(candidateId, e);
}
function manifestBody(c: R26Certificate) {
  const { signature, ...m } = c.manifest;
  return { ...m, r25Digest: c.r25.digest };
}
export function signableR26Manifest(c: R26Certificate) {
  return manifestBody(c);
}
function certificateBody(c: R26Certificate) {
  const { validator, ...body } = c;
  return {
    ...body,
    validator: {
      validatorId: validator.validatorId,
      keyId: validator.keyId,
      publicKeyPem: validator.publicKeyPem,
      signedAt: validator.signedAt,
    },
  };
}
export function signableR26Certificate(c: R26Certificate) {
  return certificateBody(c);
}
function segments(path: string) {
  const raw = path.startsWith("/")
    ? path
        .slice(1)
        .split("/")
        .map((x) => x.replace(/~1/g, "/").replace(/~0/g, "~"))
    : path.split(".");
  if (
    !raw.length ||
    raw.some(
      (x) =>
        !x || x === "__proto__" || x === "prototype" || x === "constructor",
    )
  )
    throw Error("patch path invalid");
  return raw;
}
function readPath(root: Record<string, unknown>, path: string) {
  if (Object.prototype.hasOwnProperty.call(root, path))
    return { found: true, value: root[path] };
  let v: unknown = root;
  for (const s of segments(path)) {
    if (
      !v ||
      typeof v !== "object" ||
      Array.isArray(v) ||
      !Object.prototype.hasOwnProperty.call(v, s)
    )
      return { found: false, value: undefined };
    v = (v as Record<string, unknown>)[s];
  }
  return { found: true, value: v };
}
function writePath(
  root: Record<string, unknown>,
  path: string,
  value: unknown,
) {
  if (Object.prototype.hasOwnProperty.call(root, path)) {
    root[path] = structuredClone(value);
    return;
  }
  const ss = segments(path);
  let v: Record<string, unknown> = root;
  for (const s of ss.slice(0, -1)) {
    const n = v[s];
    if (!n || typeof n !== "object" || Array.isArray(n))
      throw Error("patch parent invalid");
    v = n as Record<string, unknown>;
  }
  v[ss.at(-1)!] = structuredClone(value);
}
function resultState(c: R26Certificate, x: R26Candidate) {
  const state = structuredClone(c.baseline.state);
  for (const op of x.patch.operations) {
    const prior = readPath(state, op.path);
    if (
      !prior.found ||
      hash(prior.value) !== hash(op.from) ||
      hash(op.from) === hash(op.to)
    )
      throw Error("patch transition invalid");
    writePath(state, op.path, op.to);
  }
  hash(state);
  return state;
}

function structural(c: R26Certificate, x: R26Candidate, now: number): string[] {
  const out: string[] = [],
    ops = x.patch.operations;
  if (
    !nonempty(x.id) ||
    x.patch.schema !== "autonomy.organization-patch.v1" ||
    x.patch.id !== x.id ||
    !nonempty(x.rationale) ||
    !x.assumptions.length ||
    x.assumptions.some((v) => !nonempty(v)) ||
    !x.risks.length ||
    x.risks.some((v) => !nonempty(v)) ||
    !nonempty(x.rollbackTrigger) ||
    !x.expectedEffects.length
  )
    out.push("candidate-shape");
  const complexity = ops.reduce(
    (n, o) =>
      n + (o.kind === "component" ? 3 : o.kind === "human-seam" ? 2 : 1),
    0,
  );
  if (complexity > c.constraints.maximumComplexity) out.push("complexity");
  if (
    !["prediction", "causal", "unknown"].includes(x.claim) ||
    !["baseline", "experiment-only", "actionable"].includes(x.disposition) ||
    (x.id === c.baseline.candidateId
      ? x.disposition !== "baseline" ||
        x.claim !== "prediction" ||
        ops.length !== 0
      : x.disposition === "baseline" ||
        (x.disposition === "actionable" && x.claim !== "causal") ||
        (x.claim === "prediction" && x.disposition !== "experiment-only"))
  )
    out.push("claim-disposition");
  for (const op of ops) {
    if (
      ![
        "profile",
        "component",
        "capacity",
        "routing",
        "retry",
        "review",
        "human-seam",
      ].includes(op.kind) ||
      !nonempty(op.path) ||
      !c.constraints.allowedPaths.some(
        (p) => op.path === p || op.path.startsWith(`${p}.`),
      ) ||
      !cTrust!.canonicalPatchOperation(op.kind, op.path, op.from, op.to)
    )
      out.push("semantic-boundary");
    if (
      (["capacity", "retry"].includes(op.kind) &&
        (!Number.isSafeInteger(op.to) || (op.to as number) < 0)) ||
      (op.kind === "routing" && (!finite(op.to) || op.to < 0 || op.to > 1)) ||
      (["review", "human-seam"].includes(op.kind) &&
        (!nonempty(op.from as string) || !nonempty(op.to as string))) ||
      (["component", "profile"].includes(op.kind) &&
        (!op.from ||
          typeof op.from !== "object" ||
          Array.isArray(op.from) ||
          !op.to ||
          typeof op.to !== "object" ||
          Array.isArray(op.to)))
    )
      out.push("patch-domain");
  }
  try {
    resultState(c, x);
  } catch {
    out.push("patch-transition");
  }
  if (
    !unique(x.expectedEffects.map((e) => e.metric)) ||
    x.expectedEffects
      .map((e) => e.metric)
      .sort()
      .join("\0") !==
      c.objectives
        .map((o) => o.metric)
        .sort()
        .join("\0") ||
    x.expectedEffects.some(
      (e) =>
        !nonempty(e.metric) ||
        !nonempty(e.population) ||
        !nonempty(e.horizon) ||
        !nonempty(e.unit) ||
        !nonempty(e.estimand) ||
        !finite(e.point) ||
        e.interval.length !== 2 ||
        e.interval.some((v) => !finite(v)) ||
        e.interval[0] > e.point ||
        e.point > e.interval[1] ||
        !/^sha256:[a-f0-9]{64}$/.test(e.r25EvidenceDigest) ||
        e.direction !==
          c.objectives.find((o) => o.metric === e.metric)?.direction ||
        e.provenance !==
          (x.claim === "causal" ? "r25-intervention" : "r25-prediction") ||
        !cTrust!.verifyR25Effect(c.r25.digest, e),
    )
  )
    out.push("expected-effect");
  if (
    x.claim === "unknown" ||
    cTrust!.identification(c.r25.digest, x.identificationId) !==
      (x.claim === "causal"
        ? "identified"
        : cTrust!.identification(c.r25.digest, x.identificationId))
  )
    out.push("unsupported-counterfactual");
  for (const kind of ["governance", "security", "rollout", "budget"] as const) {
    const matches = c.approvals.filter(
      (a) => a.candidateId === x.id && a.kind === kind,
    );
    if (
      matches.length !== 1 ||
      !matches.every(
        (a) =>
          date(a.issuedAt) &&
          date(a.expiresAt) &&
          Date.parse(a.issuedAt) >= Date.parse(c.manifest.signedAt) &&
          Date.parse(a.issuedAt) <= Date.parse(c.validator.signedAt) &&
          Date.parse(a.issuedAt) < Date.parse(a.expiresAt) &&
          now <= Date.parse(a.expiresAt) &&
          a.scope === `candidate:${x.id}` &&
          finite(a.limit) &&
          a.limit >= 0 &&
          cTrust!.trustedKey(kind, a.authorityId, a.keyId, a.publicKeyPem) &&
          sig(approvalBody(a), a.publicKeyPem, a.signature),
      )
    )
      out.push(`${kind}-approval`);
  }
  const rollout = c.approvals.find(
    (a) => a.candidateId === x.id && a.kind === "rollout",
  );
  if (rollout && rollout.limit > c.constraints.rolloutMaximum)
    out.push("rollout-bound");
  const budget = c.approvals.find(
    (a) => a.candidateId === x.id && a.kind === "budget",
  );
  if (budget && budget.limit > c.constraints.budget)
    out.push("budget-approval-bound");
  return [...new Set(out)].sort();
}
let cTrust: R26ExternalTrust | undefined;
function evaluate(
  c: R26Certificate,
  x: R26Candidate,
  e: R26Evaluation | null,
): { violations: string[]; adjusted: Record<string, number> | null } {
  if (!e) return { violations: ["evaluation-required"], adjusted: null };
  const out: string[] = [],
    nums = [
      e.cost,
      ...Object.values(e.authority),
      e.proxy.reportedEscalations,
      e.proxy.latentFailures,
      e.proxy.attributedHumanMinutes,
      e.proxy.actualHumanMinutes,
      e.proxy.metricCoverage,
      e.proxy.distributionShift,
      ...Object.values(e.metrics).flatMap((m) => [m.point, m.uncertainty]),
      ...e.heldout.rows.flatMap((r) => [
        r.predicted,
        r.lower,
        r.upper,
        r.actual,
      ]),
    ];
  const objectiveMetrics = c.objectives
      .map((o) => o.metric)
      .sort()
      .join("\0"),
    rowMetrics = e.heldout.rows
      .map((r) => r.metric)
      .sort()
      .join("\0"),
    metricSet = Object.keys(e.metrics).sort().join("\0");
  if (
    nums.some((n) => !finite(n)) ||
    [
      e.cost,
      ...Object.values(e.authority),
      e.proxy.reportedEscalations,
      e.proxy.latentFailures,
      e.proxy.attributedHumanMinutes,
      e.proxy.actualHumanMinutes,
      ...Object.values(e.metrics).map((m) => m.uncertainty),
    ].some((n) => n < 0) ||
    ![e.proxy.reportedEscalations, e.proxy.latentFailures].every(
      Number.isSafeInteger,
    ) ||
    e.proxy.metricCoverage < 0 ||
    e.proxy.metricCoverage > 1 ||
    e.proxy.distributionShift < 0 ||
    e.proxy.distributionShift > 1 ||
    e.heldout.disjoint !== true ||
    !date(e.heldout.frozenAt) ||
    !date(e.heldout.evaluatedAt) ||
    Date.parse(e.heldout.frozenAt) < Date.parse(c.r25.acceptedAt) ||
    Date.parse(e.heldout.evaluatedAt) < Date.parse(e.heldout.frozenAt) ||
    Date.parse(e.heldout.evaluatedAt) > Date.parse(c.validator.signedAt) ||
    !/^sha256:[a-f0-9]{64}$/.test(e.heldout.trainingDigest) ||
    !/^sha256:[a-f0-9]{64}$/.test(e.heldout.testDigest) ||
    e.heldout.trainingDigest === e.heldout.testDigest ||
    !e.heldout.rows.length ||
    rowMetrics
      .split("\0")
      .some((m) => !c.objectives.some((o) => o.metric === m)) ||
    c.objectives.some(
      (o) => !e.heldout.rows.some((r) => r.metric === o.metric),
    ) ||
    metricSet !== objectiveMetrics ||
    e.heldout.rows.some(
      (r) =>
        !nonempty(r.metric) ||
        !nonempty(r.unit) ||
        r.unit !== e.metrics[r.metric]?.unit ||
        r.lower > r.upper,
    ) ||
    !cTrust!.heldout(e.heldout, c.r25.digest)
  )
    out.push("heldout-provenance");
  let stateDigest = "";
  try {
    stateDigest = hash(resultState(c, x));
  } catch {}
  const ev = e.evidence;
  if (
    ev.r25Digest !== c.r25.digest ||
    ev.baselineStateDigest !== c.baseline.stateDigest ||
    ev.patchDigest !== hash(x.patch) ||
    ev.resultStateDigest !== stateDigest ||
    ev.resultDigest !== hash(evaluationResult(e)) ||
    ev.evaluatedAt !== e.heldout.evaluatedAt ||
    !cTrust!.trustedKey(
      "assessment",
      ev.authorityId,
      ev.keyId,
      ev.publicKeyPem,
    ) ||
    ev.publicKeyPem === c.validator.publicKeyPem ||
    ev.publicKeyPem === c.manifest.publicKeyPem ||
    !sig(evaluationEvidenceBody(x.id, e), ev.publicKeyPem, ev.signature)
  )
    out.push("assessment-evidence");
  if (e.cost > c.constraints.budget) out.push("budget");
  for (const [k, v] of Object.entries(e.authority))
    if (v > (c.constraints.maximumAuthority[k] ?? 0))
      out.push(`authority:${k}`);
  if (
    e.semanticPaths.some(
      (p) =>
        !c.constraints.allowedPaths.some(
          (a) => p === a || p.startsWith(`${a}.`),
        ),
    )
  )
    out.push("semantic-boundary");
  if (e.proxy.metricCoverage < c.constraints.minimumMetricCoverage)
    out.push("metric-coverage");
  if (
    e.proxy.latentFailures - e.proxy.reportedEscalations >
    c.constraints.maximumProxyGap
  )
    out.push("proxy-gaming");
  if (e.proxy.actualHumanMinutes > e.proxy.attributedHumanMinutes)
    out.push("hidden-human-labor");
  if (e.proxy.distributionShift > c.constraints.maximumDistributionShift)
    out.push("distribution-shift");
  for (const o of c.objectives) {
    const policy = c.constraints.backtestPolicy[o.metric],
      rows = e.heldout.rows.filter((r) => r.metric === o.metric),
      mae =
        rows.reduce((n, r) => n + Math.abs(r.predicted - r.actual), 0) /
        rows.length,
      coverage =
        rows.filter((r) => r.actual >= r.lower && r.actual <= r.upper).length /
        rows.length;
    if (
      !policy ||
      rows.some((r) => r.unit !== policy.unit) ||
      !finite(mae) ||
      mae > policy.maxMae
    )
      out.push(`backtest-mae:${o.metric}`);
    if (!policy || !finite(coverage) || coverage < policy.minCoverage)
      out.push(`backtest-coverage:${o.metric}`);
  }
  const complexity = x.patch.operations.reduce(
      (n, p) =>
        n + (p.kind === "component" ? 3 : p.kind === "human-seam" ? 2 : 1),
      0,
    ),
    adjusted: Record<string, number> = {};
  for (const o of c.objectives) {
    const m = e.metrics[o.metric];
    if (!m) {
      out.push(`metric:${o.metric}`);
      continue;
    }
    const effect = x.expectedEffects.find((v) => v.metric === o.metric);
    if (
      !effect ||
      effect.point !== m.point ||
      effect.interval[0] !== m.point - m.uncertainty ||
      effect.interval[1] !== m.point + m.uncertainty ||
      effect.unit !== m.unit ||
      effect.r25EvidenceDigest !== m.r25EvidenceDigest
    )
      out.push(`effect-replay:${o.metric}`);
    const pessimistic =
      o.direction === "maximize"
        ? m.point - o.uncertaintyAversion * m.uncertainty
        : m.point + o.uncertaintyAversion * m.uncertainty;
    adjusted[o.metric] =
      o.direction === "maximize"
        ? pessimistic - o.complexityPenalty * complexity
        : pessimistic + o.complexityPenalty * complexity;
    if (o.minimum !== undefined && m.point < o.minimum)
      out.push(`minimum:${o.metric}`);
    if (o.maximum !== undefined && m.point > o.maximum)
      out.push(`maximum:${o.metric}`);
  }
  return { violations: [...new Set(out)].sort(), adjusted };
}
function dominates(
  a: R26Assessment,
  b: R26Assessment,
  objectives: R26Certificate["objectives"],
) {
  if (!a.adjustedObjectives || !b.adjustedObjectives) return false;
  return (
    objectives.every((o) =>
      o.direction === "maximize"
        ? a.adjustedObjectives![o.metric]! >= b.adjustedObjectives![o.metric]!
        : a.adjustedObjectives![o.metric]! <= b.adjustedObjectives![o.metric]!,
    ) &&
    objectives.some((o) =>
      o.direction === "maximize"
        ? a.adjustedObjectives![o.metric]! > b.adjustedObjectives![o.metric]!
        : a.adjustedObjectives![o.metric]! < b.adjustedObjectives![o.metric]!,
    )
  );
}

export function verifyR26ExternalCertificate(
  c: R26Certificate,
  trust: R26ExternalTrust,
  nowIso: string,
) {
  cTrust = trust;
  try {
    exactSchemas(c);
    if (
      c.schema !== "autonomy.r26-external-certificate.v1" ||
      !date(nowIso) ||
      !date(c.generatedAt) ||
      !date(c.validator.signedAt) ||
      Date.parse(c.generatedAt) > Date.parse(nowIso) ||
      Date.parse(c.validator.signedAt) !== Date.parse(c.generatedAt)
    )
      throw Error("envelope invalid");
    if (
      !trust.acceptedR25(c.r25) ||
      !date(c.r25.acceptedAt) ||
      !/^sha256:[a-f0-9]{64}$/.test(c.r25.digest)
    )
      throw Error("accepted R25 binding invalid");
    const ids = c.candidates.map((x) => x.id);
    if (
      ids.length < 2 ||
      !unique(ids) ||
      !date(c.manifest.signedAt) ||
      Date.parse(c.manifest.signedAt) < Date.parse(c.r25.acceptedAt) ||
      Date.parse(c.manifest.signedAt) > Date.parse(c.validator.signedAt) ||
      c.manifest.candidateIds.join("\0") !== ids.join("\0") ||
      c.manifest.digest !==
        hash({
          r25Digest: c.r25.digest,
          candidateIds: ids,
          candidates: c.candidates,
        }) ||
      !trust.completeCandidateManifest(c.manifest.digest, ids, c.r25.digest) ||
      !trust.trustedKey(
        "manifest",
        c.manifest.authorityId,
        c.manifest.keyId,
        c.manifest.publicKeyPem,
      ) ||
      !sig(manifestBody(c), c.manifest.publicKeyPem, c.manifest.signature)
    )
      throw Error("complete candidate manifest invalid");
    const approvalKeys = c.approvals.map((a) => a.publicKeyPem),
      approvalAuthorities = c.approvals.map(
        (a) => `${a.kind}:${a.authorityId}`,
      );
    if (
      c.validator.validatorId === c.manifest.authorityId ||
      c.validator.publicKeyPem === c.manifest.publicKeyPem ||
      approvalKeys.includes(c.validator.publicKeyPem) ||
      approvalKeys.includes(c.manifest.publicKeyPem) ||
      new Set(approvalAuthorities).size < 4 ||
      !trust.trustedKey(
        "validator",
        c.validator.validatorId,
        c.validator.keyId,
        c.validator.publicKeyPem,
      ) ||
      !sig(certificateBody(c), c.validator.publicKeyPem, c.validator.signature)
    )
      throw Error("independent validator signature invalid");
    const objectiveMetrics = c.objectives
        .map((x) => x.metric)
        .sort()
        .join("\0"),
      policyMetrics = Object.keys(c.constraints.backtestPolicy)
        .sort()
        .join("\0");
    if (
      !c.objectives.length ||
      !unique(c.objectives.map((x) => x.metric)) ||
      objectiveMetrics !== policyMetrics ||
      c.objectives.some(
        (o) =>
          !nonempty(o.metric) ||
          !["minimize", "maximize"].includes(o.direction) ||
          !finite(o.uncertaintyAversion) ||
          o.uncertaintyAversion < 0 ||
          !finite(o.complexityPenalty) ||
          o.complexityPenalty < 0 ||
          (o.minimum !== undefined && !finite(o.minimum)) ||
          (o.maximum !== undefined && !finite(o.maximum)),
      ) ||
      Object.values(c.constraints).some(
        (v) => typeof v === "number" && !finite(v),
      ) ||
      Object.values(c.constraints.maximumAuthority).some(
        (v) => !finite(v) || v < 0,
      ) ||
      Object.values(c.constraints.backtestPolicy).some(
        (p) =>
          !nonempty(p.unit) ||
          !finite(p.maxMae) ||
          p.maxMae <= 0 ||
          p.maxMae > 1_000_000 ||
          !finite(p.minCoverage) ||
          p.minCoverage <= 0 ||
          p.minCoverage > 1,
      ) ||
      c.constraints.budget <= 0 ||
      c.constraints.rolloutMaximum <= 0 ||
      c.constraints.rolloutMaximum > 1 ||
      c.constraints.maximumComplexity < 1 ||
      c.constraints.minimumMetricCoverage <= 0 ||
      c.constraints.minimumMetricCoverage > 1 ||
      c.constraints.maximumProxyGap < 0 ||
      !Number.isSafeInteger(c.constraints.maximumProxyGap) ||
      c.constraints.maximumProxyGap > 1_000_000 ||
      c.constraints.maximumDistributionShift < 0 ||
      c.constraints.maximumDistributionShift > 1
    )
      throw Error("planner specification invalid");
    const baseline = c.candidates.find((x) => x.id === c.baseline.candidateId);
    if (
      !baseline ||
      baseline.patch.operations.length ||
      c.baseline.stateDigest !== hash(c.baseline.state) ||
      !trust.acceptedBaseline(c.r25.digest, c.baseline.stateDigest)
    )
      throw Error("baseline join invalid");
    if (
      c.assessments.length !== ids.length ||
      !unique(c.assessments.map((a) => a.candidateId))
    )
      throw Error("assessment completeness invalid");
    for (const a of c.assessments) {
      const x = c.candidates.find((v) => v.id === a.candidateId);
      if (!x) throw Error("assessment candidate invalid");
      const structuralViolations = structural(c, x, Date.parse(nowIso)),
        scored = evaluate(c, x, a.evaluation),
        violations = [
          ...new Set([...structuralViolations, ...scored.violations]),
        ].sort(),
        feasible = violations.length === 0;
      if (
        a.feasible !== feasible ||
        a.violations.join("\0") !== violations.join("\0") ||
        hash(a.adjustedObjectives) !== hash(scored.adjusted)
      )
        throw Error(`assessment replay invalid: ${a.candidateId}`);
    }
    const feasible = c.assessments.filter((a) => a.feasible),
      eligible = feasible.filter((a) => {
        const x = c.candidates.find((v) => v.id === a.candidateId)!;
        return (
          (x.id === c.baseline.candidateId &&
            x.disposition === "baseline" &&
            x.claim === "prediction") ||
          (x.disposition === "actionable" &&
            x.claim === "causal" &&
            trust.identification(c.r25.digest, x.identificationId) ===
              "identified")
        );
      });
    for (const a of c.assessments) {
      const expected = eligible
        .filter((b) => b !== a && dominates(b, a, c.objectives))
        .map((b) => b.candidateId)
        .sort();
      if (a.dominatedBy.join("\0") !== expected.join("\0"))
        throw Error(`dominance replay invalid: ${a.candidateId}`);
    }
    const front = eligible
      .filter((a) => !a.dominatedBy.length)
      .map((a) => a.candidateId)
      .sort();
    if (c.paretoFront.join("\0") !== front.join("\0"))
      throw Error("Pareto replay invalid");
    const base = c.assessments.find(
        (a) => a.candidateId === c.baseline.candidateId,
      )!,
      nonbase = front.filter((id) => id !== base.candidateId),
      winner =
        nonbase.length === 1
          ? eligible.find(
              (a) =>
                a.candidateId === nonbase[0] &&
                eligible.every((b) => a === b || dominates(a, b, c.objectives)),
            )
          : undefined,
      expectedOutcome =
        !base.feasible || !eligible.length
          ? "refused"
          : winner
            ? "recommended"
            : "tradeoff",
      expectedRecommendation = winner?.candidateId ?? null,
      expectedRationale =
        expectedOutcome === "refused"
          ? !base.feasible
            ? "no-op baseline is infeasible under declared constraints"
            : "no feasible candidates"
          : expectedOutcome === "recommended"
            ? "candidate robustly Pareto-dominates every feasible alternative"
            : "Pareto frontier has no unique dominating intervention; external decision required";
    if (
      c.outcome !== expectedOutcome ||
      c.recommendation !== expectedRecommendation ||
      c.rationale !== expectedRationale
    )
      throw Error("decision replay invalid");
    return {
      status: "valid-complete-certificate" as const,
      r25Digest: c.r25.digest,
      candidateCount: ids.length,
      paretoFront: front,
      recommendation: c.recommendation,
    };
  } finally {
    cTrust = undefined;
  }
}
