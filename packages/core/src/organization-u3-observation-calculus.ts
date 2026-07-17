import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { canonicalSemanticJson } from "./organization-canonical";
export const U3_OBSERVATION_CALCULUS_SCHEMA =
  "open-autonomy.u3-observation-calculus.v3" as const;
export const U3_TAXONOMY = [
  "timing",
  "fairness",
  "nondeterminism",
  "authority",
  "failure",
  "prompt-context",
  "provider-local",
  "lifecycle-success",
  "evidence-provenance",
  "resource-cost",
  "security-privacy",
  "retry-cancellation-idempotency",
  "communication-tool",
  "state-consistency-durability",
  "human-intervention",
  "output-correctness",
] as const;
export const U3_TAXONOMY_ALIASES = {
  "retry-idempotency": "retry-cancellation-idempotency",
  "communication-tool-effects": "communication-tool",
} as const;
export type U3Taxonomy = (typeof U3_TAXONOMY)[number];
type Sha = `sha256:${string}`;
export const U3_PREDECESSORS = [
  {
    id: "claim",
    commit: "f2cbf838577233cbb2faa7a086218abb8cfa42c3",
    path: "docs/universality/campaign-v9/claim.json",
    sha256:
      "sha256:b8da679f4242e5a10dba70eb365041bc54e284751fcd879736dad37e3feec18a",
  },
  {
    id: "u1",
    commit: "ac2da0d8ae9241f49abcc07f19456e512afeb6d7",
    path: "docs/universality/campaign-v9/u1-implementation-closure.json",
    sha256:
      "sha256:b997ec1b7ac848c96c9296cc598500586924f93dbce2110f86472af4775271f5",
  },
  {
    id: "u2-prereg",
    commit: "bd8f8356571b7919d1a50e8d144b45ab1b5c771c",
    path: "packages/core/src/organization-u2-population-contract.ts",
    sha256:
      "sha256:4a9e0d75718a0e0e42b986a5a4f7940959d66793b1e4c5784150c53f34adf367",
  },
  {
    id: "u2-closure",
    commit: "f8a99078da701740c2df818682655a9af750cb4f",
    path: "docs/universality/campaign-v9/u2-implementation-closure.json",
    sha256:
      "sha256:c38f5a1ea68c1172f5e8689f5795afdff8fb3ca4d088b9ee95889ba54f1ca93d",
  },
] as const;
type Endpoint = {
  observationId: string;
  subjectKind: string;
  schemaId: string;
  schemaVersion: string;
};
type Applicability = {
  stratumId: string;
  status: "mandatory" | "optional" | "excluded";
  predicateId: string;
  evidenceDigest: Sha | null;
  reason: string | null;
};
export type U3ObservationCalculus = {
  schema: typeof U3_OBSERVATION_CALCULUS_SCHEMA;
  fixtureKind: "synthetic";
  denominatorScope: "fixture-local";
  empiricalRegistration: false;
  closureClaim: false;
  campaignId: "organization-universality-2026-v9";
  predecessors: Array<{
    id: string;
    commit: string;
    path: string;
    sha256: Sha;
  }>;
  schemas: Array<{
    id: string;
    version: string;
    mediaType: "application/json";
    schemaSha256: Sha;
  }>;
  predicates: Array<{
    id: string;
    version: string;
    operator: "always" | "json-pointer-exists" | "subject-sort-is";
    argument: string;
  }>;
  projections: Array<{
    id: string;
    version: string;
    operator: "identity" | "json-pointer" | "field";
    argument: string;
    inputSchemaId: string;
    inputSchemaVersion: string;
    outputSchemaId: string;
    outputSchemaVersion: string;
  }>;
  evidencePolicies: Array<{
    id: string;
    required: boolean;
    minimum: "observation" | "attestation" | "verification";
    referenceSchemaId: string;
    referenceSchemaVersion: string;
  }>;
  authenticationPolicies: Array<{
    id: string;
    required: boolean;
    mechanism: "none" | "signature" | "mac";
    trustRootSha256: Sha | null;
  }>;
  strata: Array<{ id: string }>;
  observations: Array<{
    id: string;
    taxonomy: U3Taxonomy;
    subjectSort: "provider" | "component";
    subjectKind: string;
    providerId: string | null;
    componentId: string | null;
    nativeSchemaId: string;
    nativeSchemaVersion: string;
    valueSchemaId: string;
    valueSchemaVersion: string;
    sourceProjectionId: string;
    unit: string;
    clock: "none" | "monotonic" | "wall";
    window: "instant" | "interval" | "trace";
    dedupKey: string;
    completeness: "complete" | "best-effort";
    evidencePolicyId: string;
    authenticationPolicyId: string;
    missing: "unknown" | "violation";
    applicability: Applicability[];
  }>;
  comparisons: Array<{
    id: string;
    left: Endpoint;
    right: Endpoint;
    sourceProjectionId: string;
    targetProjectionId: string;
    direction: "left-to-right" | "right-to-left" | "symmetric";
    operator: "equal" | "refines" | "abstracts";
    missing: "unknown" | "violation";
  }>;
  variances: Array<{
    id: string;
    comparisonId: string;
    operator: "accept-within";
    metric: "exact" | "absolute" | "relative";
    unit: string;
    clock: "none" | "monotonic" | "wall";
    window: "instant" | "interval" | "trace";
    aggregation: "identity" | "maximum" | "mean";
    missing: "unknown" | "violation";
    bound: number;
    minimumSamples: number;
  }>;
  profiles: Array<{
    id: string;
    lineageId: string;
    version: string;
    stratumId: string;
    parentIds: string[];
    observationIds: string[];
    comparisonIds: string[];
    varianceIds: string[];
    forbiddenLossObservationIds: string[];
    unknownPolicy: "report" | "reject";
  }>;
  profilePairs: Array<{
    leftProfileId: string;
    rightProfileId: string;
    kind:
      | "equivalent"
      | "left-refines-right"
      | "right-refines-left"
      | "conflict"
      | "incomparable";
    reason: string;
    witnessDigest: Sha;
  }>;
};
export type FrozenU3ObservationCalculus = U3ObservationCalculus & {
  digest: Sha;
};
const MAX_ITEMS = 512,
  MAX_DEPTH = 64,
  MAX_NODES = 12000,
  MAX_BYTES = 1_048_576,
  canon = canonicalSemanticJson,
  H = (x: string | Uint8Array) =>
    `sha256:${createHash("sha256").update(x).digest("hex")}` as Sha,
  domain = (x: unknown) => H(`${U3_OBSERVATION_CALCULUS_SCHEMA}\0${canon(x)}`),
  sha = (x: unknown): x is Sha =>
    typeof x === "string" && /^sha256:[0-9a-f]{64}$/.test(x),
  sid = (x: unknown): x is string =>
    typeof x === "string" &&
    x.length <= 256 &&
    /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(x),
  text = (x: unknown, n = 256) =>
    typeof x === "string" &&
    x === x.trim() &&
    x.length > 0 &&
    Buffer.byteLength(x, "utf8") <= n,
  normalized = (x: unknown, n = 256) =>
    typeof x === "string" &&
    x === x.trim() &&
    Buffer.byteLength(x, "utf8") <= n,
  exact = (x: unknown, ks: string[], l: string) => {
    if (
      !x ||
      typeof x !== "object" ||
      Array.isArray(x) ||
      canon(Object.keys(x).sort()) !== canon([...ks].sort())
    )
      throw Error(`${l} schema invalid`);
    return x as any;
  },
  ordered = (x: unknown, l: string) => {
    if (
      !Array.isArray(x) ||
      x.some((y) => !sid(y)) ||
      new Set(x).size !== x.length ||
      canon(x) !== canon([...x].sort())
    )
      throw Error(`${l} order invalid`);
    return x as string[];
  };
function raw(v: unknown) {
  let nodes = 0,
    bytes = 0;
  const active = new Set<object>(),
    q: Array<[unknown, number, boolean]> = [[v, 0, true]];
  while (q.length) {
    const [x, d, e] = q.pop()!;
    if (!e) {
      active.delete(x as object);
      continue;
    }
    if (d > MAX_DEPTH || ++nodes > MAX_NODES)
      throw Error("U3 raw resource bound");
    if (typeof x === "string") {
      bytes += Buffer.byteLength(x);
      if (Buffer.byteLength(x, "utf8") > 1024)
        throw Error("U3 semantic string bound");
      continue;
    }
    if (!x || typeof x !== "object") continue;
    if (active.has(x as object)) throw Error("U3 cyclic input");
    active.add(x as object);
    q.push([x, d, false]);
    const vs = Array.isArray(x) ? x : Object.values(x);
    if (vs.length > MAX_ITEMS) throw Error("U3 collection bound");
    for (const y of vs) q.push([y, d + 1, true]);
  }
  if (bytes > MAX_BYTES) throw Error("U3 byte bound");
}
function reg<T>(x: unknown, l: string, check: (x: any) => void) {
  if (!Array.isArray(x) || x.length > MAX_ITEMS)
    throw Error(`${l} registry invalid`);
  const m = new Map<string, T>();
  for (const y of x) {
    check(y);
    if (!sid(y.id) || m.has(y.id)) throw Error(`${l} identity invalid`);
    m.set(y.id, y);
  }
  if (canon([...m.keys()]) !== canon([...m.keys()].sort()))
    throw Error(`${l} order invalid`);
  return m;
}
const deepFreeze = <T>(v: T) => {
  const q: any[] = [v];
  while (q.length) {
    const x = q.pop();
    if (x && typeof x === "object" && !Object.isFrozen(x)) {
      q.push(...Object.values(x));
      Object.freeze(x);
    }
  }
  return v;
};
export function verifyU3PredecessorGitCustody(root = process.cwd()) {
  for (const a of U3_PREDECESSORS) {
    const r = spawnSync(
      "git",
      ["rev-parse", "--verify", `${a.commit}^{commit}`],
      { cwd: root, encoding: "utf8" },
    );
    if (r.status || r.stdout.trim() !== a.commit)
      throw Error(`${a.id} commit custody invalid`);
    const g = spawnSync("git", ["show", `${a.commit}:${a.path}`], {
      cwd: root,
    });
    if (
      g.status ||
      H(g.stdout) !== a.sha256 ||
      H(readFileSync(`${root}/${a.path}`)) !== a.sha256
    )
      throw Error(`${a.id} byte custody invalid`);
  }
}
export const computeU3ObservationCalculusDigest = (v: U3ObservationCalculus) =>
  domain(v);
export const EXPECTED_U3_SYNTHETIC_FIXTURE_DIGEST =
  "sha256:264d07adc4385f1469fccaf88ce49a277bd22cdd235f8310ac4d8c19771c8ce3" as Sha;
const endpoint = (e: any, obs: Map<string, any>) => {
  exact(
    e,
    ["observationId", "subjectKind", "schemaId", "schemaVersion"],
    "endpoint",
  );
  const o = obs.get(e.observationId);
  if (
    !o ||
    e.subjectKind !== o.subjectKind ||
    e.schemaId !== o.valueSchemaId ||
    e.schemaVersion !== o.valueSchemaVersion
  )
    throw Error("endpoint join invalid");
};
const varianceAtLeast = (child: any, parent: any) =>
  child.operator === parent.operator &&
  child.unit === parent.unit &&
  child.clock === parent.clock &&
  child.window === parent.window &&
  child.aggregation === parent.aggregation &&
  child.missing === parent.missing &&
  child.metric === parent.metric &&
  child.bound <= parent.bound &&
  child.minimumSamples >= parent.minimumSamples;
export function freezeU3ObservationCalculus(
  input: U3ObservationCalculus,
  { requireFixtureDigest = true } = {},
) {
  raw(input);
  const v = exact(
    input,
    [
      "schema",
      "fixtureKind",
      "denominatorScope",
      "empiricalRegistration",
      "closureClaim",
      "campaignId",
      "predecessors",
      "schemas",
      "predicates",
      "projections",
      "evidencePolicies",
      "authenticationPolicies",
      "strata",
      "observations",
      "comparisons",
      "variances",
      "profiles",
      "profilePairs",
    ],
    "calculus",
  ) as U3ObservationCalculus;
  if (
    v.schema !== U3_OBSERVATION_CALCULUS_SCHEMA ||
    v.fixtureKind !== "synthetic" ||
    v.denominatorScope !== "fixture-local" ||
    v.empiricalRegistration !== false ||
    v.closureClaim !== false ||
    v.campaignId !== "organization-universality-2026-v9" ||
    canon(v.predecessors) !== canon(U3_PREDECESSORS)
  )
    throw Error("U3 boundary invalid");
  const schemas = reg<any>(v.schemas, "schema", (x) => {
      exact(x, ["id", "version", "mediaType", "schemaSha256"], "schema");
      if (
        !sid(x.version) ||
        x.mediaType !== "application/json" ||
        !sha(x.schemaSha256)
      )
        throw Error("schema invalid");
    }),
    predicates = reg<any>(v.predicates, "predicate", (x) => {
      exact(x, ["id", "version", "operator", "argument"], "predicate");
      if (
        !sid(x.version) ||
        !["always", "json-pointer-exists", "subject-sort-is"].includes(
          x.operator,
        ) ||
        !normalized(x.argument) ||
        (x.operator === "always" && x.argument !== "")
      )
        throw Error("predicate invalid");
    }),
    projections = reg<any>(v.projections, "projection", (x) => {
      exact(
        x,
        [
          "id",
          "version",
          "operator",
          "argument",
          "inputSchemaId",
          "inputSchemaVersion",
          "outputSchemaId",
          "outputSchemaVersion",
        ],
        "projection",
      );
      if (
        !sid(x.version) ||
        !["identity", "json-pointer", "field"].includes(x.operator) ||
        !normalized(x.argument) ||
        (x.operator === "identity" && x.argument !== "")
      )
        throw Error("projection invalid");
    }),
    evidence = reg<any>(v.evidencePolicies, "evidence", (x) => {
      exact(
        x,
        [
          "id",
          "required",
          "minimum",
          "referenceSchemaId",
          "referenceSchemaVersion",
        ],
        "evidence",
      );
      if (
        typeof x.required !== "boolean" ||
        !["observation", "attestation", "verification"].includes(x.minimum)
      )
        throw Error("evidence invalid");
    }),
    auth = reg<any>(v.authenticationPolicies, "auth", (x) => {
      exact(x, ["id", "required", "mechanism", "trustRootSha256"], "auth");
      if (
        typeof x.required !== "boolean" ||
        !["none", "signature", "mac"].includes(x.mechanism) ||
        (x.required
          ? x.mechanism === "none" || !sha(x.trustRootSha256)
          : x.mechanism !== "none" || x.trustRootSha256 !== null)
      )
        throw Error("auth invalid");
    }),
    strata = reg<any>(v.strata, "stratum", (x) => exact(x, ["id"], "stratum"));
  const schemaHas = (i: string, v: string) => schemas.get(i)?.version === v;
  for (const p of projections.values())
    if (
      !schemaHas(p.inputSchemaId, p.inputSchemaVersion) ||
      !schemaHas(p.outputSchemaId, p.outputSchemaVersion)
    )
      throw Error("projection schema join invalid");
  for (const p of evidence.values())
    if (!schemaHas(p.referenceSchemaId, p.referenceSchemaVersion))
      throw Error("evidence schema join invalid");
  const observations = reg<any>(v.observations, "observation", (o) => {
    exact(
      o,
      [
        "id",
        "taxonomy",
        "subjectSort",
        "subjectKind",
        "providerId",
        "componentId",
        "nativeSchemaId",
        "nativeSchemaVersion",
        "valueSchemaId",
        "valueSchemaVersion",
        "sourceProjectionId",
        "unit",
        "clock",
        "window",
        "dedupKey",
        "completeness",
        "evidencePolicyId",
        "authenticationPolicyId",
        "missing",
        "applicability",
      ],
      "observation",
    );
    if (
      !U3_TAXONOMY.includes(o.taxonomy) ||
      !["provider", "component"].includes(o.subjectSort) ||
      !sid(o.subjectKind) ||
      !sid(o.dedupKey) ||
      !sid(o.unit) ||
      !["none", "monotonic", "wall"].includes(o.clock) ||
      !["instant", "interval", "trace"].includes(o.window) ||
      !["complete", "best-effort"].includes(o.completeness) ||
      !["unknown", "violation"].includes(o.missing) ||
      (o.subjectSort === "provider"
        ? !sid(o.providerId) || o.componentId !== null
        : !sid(o.providerId) || !sid(o.componentId)) ||
      !Array.isArray(o.applicability)
    )
      throw Error("observation invalid");
  });
  for (const o of observations.values()) {
    if (
      !schemaHas(o.nativeSchemaId, o.nativeSchemaVersion) ||
      !schemaHas(o.valueSchemaId, o.valueSchemaVersion) ||
      !projections.has(o.sourceProjectionId) ||
      !evidence.has(o.evidencePolicyId) ||
      !auth.has(o.authenticationPolicyId)
    )
      throw Error("observation join invalid");
    const source = projections.get(o.sourceProjectionId)!;
    if (
      source.inputSchemaId !== o.nativeSchemaId ||
      source.inputSchemaVersion !== o.nativeSchemaVersion ||
      source.outputSchemaId !== o.valueSchemaId ||
      source.outputSchemaVersion !== o.valueSchemaVersion
    )
      throw Error("observation projection topology invalid");
    const seen = new Set<string>();
    for (const a of o.applicability) {
      exact(
        a,
        ["stratumId", "status", "predicateId", "evidenceDigest", "reason"],
        "applicability",
      );
      if (
        !strata.has(a.stratumId) ||
        seen.has(a.stratumId) ||
        !predicates.has(a.predicateId) ||
        !["mandatory", "optional", "excluded"].includes(a.status) ||
        (a.status === "excluded"
          ? !sha(a.evidenceDigest) || !text(a.reason, 1024)
          : a.evidenceDigest !== null || a.reason !== null)
      )
        throw Error("applicability invalid");
      seen.add(a.stratumId);
    }
    if (seen.size !== strata.size)
      throw Error("applicability totality invalid");
  }
  for (const s of strata.keys())
    for (const t of U3_TAXONOMY)
      if (
        ![...observations.values()].some(
          (o) =>
            o.taxonomy === t &&
            o.applicability.some((a: Applicability) => a.stratumId === s),
        )
      )
        throw Error("taxonomy totality invalid");
  const comparisons = reg<any>(v.comparisons, "comparison", (c) => {
      exact(
        c,
        [
          "id",
          "left",
          "right",
          "sourceProjectionId",
          "targetProjectionId",
          "direction",
          "operator",
          "missing",
        ],
        "comparison",
      );
      if (
        !projections.has(c.sourceProjectionId) ||
        !projections.has(c.targetProjectionId) ||
        !["left-to-right", "right-to-left", "symmetric"].includes(
          c.direction,
        ) ||
        !["equal", "refines", "abstracts"].includes(c.operator) ||
        !["unknown", "violation"].includes(c.missing)
      )
        throw Error("comparison invalid");
      if (
        (c.operator === "equal") !== (c.direction === "symmetric") ||
        (["refines", "abstracts"].includes(c.operator) &&
          !["left-to-right", "right-to-left"].includes(c.direction))
      )
        throw Error("comparison operator/direction incoherent");
      endpoint(c.left, observations);
      endpoint(c.right, observations);
      const source = projections.get(c.sourceProjectionId)!,
        target = projections.get(c.targetProjectionId)!,
        sourceEndpoint =
          c.direction === "right-to-left" ? c.right : c.left,
        targetEndpoint =
          c.direction === "right-to-left" ? c.left : c.right;
      if (
        source.inputSchemaId !== sourceEndpoint.schemaId ||
        source.inputSchemaVersion !== sourceEndpoint.schemaVersion ||
        target.inputSchemaId !== targetEndpoint.schemaId ||
        target.inputSchemaVersion !== targetEndpoint.schemaVersion ||
        source.outputSchemaId !== target.outputSchemaId ||
        source.outputSchemaVersion !== target.outputSchemaVersion ||
        (c.direction === "symmetric" &&
          (c.left.schemaId !== c.right.schemaId ||
            c.left.schemaVersion !== c.right.schemaVersion ||
            source.operator !== target.operator ||
            source.argument !== target.argument ||
            source.outputSchemaId !== c.left.schemaId ||
            source.outputSchemaVersion !== c.left.schemaVersion))
      )
        throw Error("comparison projection topology invalid");
    }),
    variances = reg<any>(v.variances, "variance", (x) => {
      exact(
        x,
        [
          "id",
          "comparisonId",
          "operator",
          "metric",
          "unit",
          "clock",
          "window",
          "aggregation",
          "missing",
          "bound",
          "minimumSamples",
        ],
        "variance",
      );
      if (
        !comparisons.has(x.comparisonId) ||
        x.operator !== "accept-within" ||
        !["exact", "absolute", "relative"].includes(x.metric) ||
        !sid(x.unit) ||
        !["none", "monotonic", "wall"].includes(x.clock) ||
        !["instant", "interval", "trace"].includes(x.window) ||
        !["identity", "maximum", "mean"].includes(x.aggregation) ||
        !["unknown", "violation"].includes(x.missing) ||
        !Number.isFinite(x.bound) ||
        x.bound < 0 ||
        (x.metric === "exact" &&
          (x.bound !== 0 || x.aggregation !== "identity")) ||
        !Number.isSafeInteger(x.minimumSamples) ||
        x.minimumSamples < 1
      )
        throw Error("variance invalid");
      const comparison = comparisons.get(x.comparisonId)!,
        left = observations.get(comparison.left.observationId)!,
        right = observations.get(comparison.right.observationId)!;
      if (
        left.unit !== right.unit ||
        left.clock !== right.clock ||
        left.window !== right.window ||
        x.unit !== left.unit ||
        x.clock !== left.clock ||
        x.window !== left.window
      )
        throw Error("variance endpoint dimensions incompatible");
    }),
    profiles = reg<any>(v.profiles, "profile", (p) => {
      exact(
        p,
        [
          "id",
          "lineageId",
          "version",
          "stratumId",
          "parentIds",
          "observationIds",
          "comparisonIds",
          "varianceIds",
          "forbiddenLossObservationIds",
          "unknownPolicy",
        ],
        "profile",
      );
      for (const k of [
        "parentIds",
        "observationIds",
        "comparisonIds",
        "varianceIds",
        "forbiddenLossObservationIds",
      ])
        ordered(p[k], k);
      if (
        !sid(p.lineageId) ||
        typeof p.version !== "string" ||
        !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(p.version) ||
        !["report", "reject"].includes(p.unknownPolicy)
      )
        throw Error("profile invalid");
    });
  if (!strata.size || !profiles.size) throw Error("U3 population empty");
  const applicable = (sid: string) =>
      [...observations.values()]
        .filter((o) =>
          o.applicability.some(
            (a: Applicability) =>
              a.stratumId === sid && a.status !== "excluded",
          ),
        )
        .map((o) => o.id),
    mandatory = (sid: string) =>
      [...observations.values()]
        .filter((o) =>
          o.applicability.some(
            (a: Applicability) =>
              a.stratumId === sid && a.status === "mandatory",
          ),
        )
        .map((o) => o.id);
  for (const stratumId of strata.keys())
    if (!mandatory(stratumId).length)
      throw Error("stratum mandatory observation set empty");
  for (const p of profiles.values()) {
    if (
      !strata.has(p.stratumId) ||
      p.parentIds.some((x: string) => !profiles.has(x) || x === p.id) ||
      mandatory(p.stratumId).some((x) => !p.observationIds.includes(x)) ||
      mandatory(p.stratumId).some(
        (x) => !p.forbiddenLossObservationIds.includes(x),
      ) ||
      p.observationIds.some(
        (x: string) => !applicable(p.stratumId).includes(x),
      ) ||
      p.forbiddenLossObservationIds.some(
        (x: string) => !p.observationIds.includes(x),
      )
    )
      throw Error("profile effective observations invalid");
    const selected = p.comparisonIds.map((x: string) => comparisons.get(x));
    if (
      selected.some((x: any) => !x) ||
      p.observationIds.some(
        (oid: string) =>
          selected.filter((c: any) => c.left.observationId === oid).length !==
          1,
      ) ||
      selected.some(
        (c: any) =>
          !p.observationIds.includes(c.left.observationId) ||
          !p.observationIds.includes(c.right.observationId),
      )
    )
      throw Error("comparison exact coverage invalid");
    if (
      p.varianceIds.some((x: string) => !variances.has(x)) ||
      p.comparisonIds.some(
        (cid: string) =>
          p.varianceIds.filter(
            (vid: string) => variances.get(vid)!.comparisonId === cid,
          ).length !== 1,
      ) ||
      p.varianceIds.some(
        (vid: string) =>
          !p.comparisonIds.includes(variances.get(vid)!.comparisonId),
      )
    )
      throw Error("variance exact coverage invalid");
  }
  const anc = new Map<string, Set<string>>();
  for (const p of profiles.values()) {
    const seen = new Set<string>(),
      q = [...p.parentIds];
    while (q.length) {
      const x = q.pop()!;
      if (x === p.id) throw Error("refinement cycle");
      if (!seen.has(x)) {
        seen.add(x);
        q.push(...profiles.get(x)!.parentIds);
      }
    }
    if (canon([...seen].sort()) !== canon(p.parentIds))
      throw Error("refinement closure invalid");
    anc.set(p.id, seen);
  }
  for (const p of profiles.values())
    for (const qid of p.parentIds) {
      const q = profiles.get(qid)!;
      const pv = p.version.split(".").map(Number),
        qv = q.version.split(".").map(Number),
        versionIncreases =
          pv[0] > qv[0] ||
          (pv[0] === qv[0] && pv[1] > qv[1]) ||
          (pv[0] === qv[0] && pv[1] === qv[1] && pv[2] > qv[2]);
      if (
        q.stratumId !== p.stratumId ||
        p.lineageId !== q.lineageId ||
        pv[0] !== qv[0] ||
        !versionIncreases ||
        q.observationIds.some((x: string) => !p.observationIds.includes(x)) ||
        q.forbiddenLossObservationIds.some(
          (x: string) => !p.forbiddenLossObservationIds.includes(x),
        ) ||
        (q.unknownPolicy === "reject" && p.unknownPolicy !== "reject")
      )
        throw Error("profile weakens parent");
      for (const oid of q.observationIds) {
        const qc = comparisons.get(
            q.comparisonIds.find(
              (x: string) => comparisons.get(x)!.left.observationId === oid,
            )!,
          )!,
          pc = comparisons.get(
            p.comparisonIds.find(
              (x: string) => comparisons.get(x)!.left.observationId === oid,
            )!,
          )!;
        if (canon({ ...qc, id: undefined }) !== canon({ ...pc, id: undefined }))
          throw Error("comparison replacement incompatible");
        const qv = variances.get(
            q.varianceIds.find(
              (x: string) => variances.get(x)!.comparisonId === qc.id,
            )!,
          )!,
          pv = variances.get(
            p.varianceIds.find(
              (x: string) => variances.get(x)!.comparisonId === pc.id,
            )!,
          )!;
        if (!varianceAtLeast(pv, qv)) throw Error("variance weakens parent");
      }
    }
  const roots = new Set(
    [...profiles.values()]
      .filter((p) => !p.parentIds.length)
      .map((p) => p.stratumId),
  );
  if ([...strata.keys()].some((x) => !roots.has(x)))
    throw Error("stratum root profile missing");
  if (!Array.isArray(v.profilePairs)) throw Error("pair registry invalid");
  const expected: number = (profiles.size * (profiles.size - 1)) / 2;
  if (v.profilePairs.length !== expected)
    throw Error("profile pair totality invalid");
  const profileSignature = (p: any) =>
    canon({
      stratumId: p.stratumId,
      observationIds: p.observationIds,
      comparisons: p.comparisonIds.map((id: string) => {
        const { id: _, ...semantic } = comparisons.get(id)!;
        void _;
        return semantic;
      }),
      variances: p.varianceIds.map((id: string) => {
        const { id: _, comparisonId, ...semantic } = variances.get(id)!;
        void _;
        return {
          observationId: comparisons.get(comparisonId)!.left.observationId,
          ...semantic,
        };
      }),
      forbiddenLossObservationIds: p.forbiddenLossObservationIds,
      unknownPolicy: p.unknownPolicy,
    });
  let previous = "";
  for (const r of v.profilePairs) {
    exact(
      r,
      ["leftProfileId", "rightProfileId", "kind", "reason", "witnessDigest"],
      "profile pair",
    );
    const key = `${r.leftProfileId}\0${r.rightProfileId}`;
    if (
      !profiles.has(r.leftProfileId) ||
      !profiles.has(r.rightProfileId) ||
      r.leftProfileId >= r.rightProfileId ||
      key <= previous ||
      !text(r.reason, 1024) ||
      !sha(r.witnessDigest) ||
      ![
        "equivalent",
        "left-refines-right",
        "right-refines-left",
        "conflict",
        "incomparable",
      ].includes(r.kind)
    )
      throw Error("profile pair invalid");
    previous = key;
    const la = anc.get(r.leftProfileId)!,
      ra = anc.get(r.rightProfileId)!,
      derived = la.has(r.rightProfileId)
        ? "left-refines-right"
        : ra.has(r.leftProfileId)
          ? "right-refines-left"
          : profileSignature(profiles.get(r.leftProfileId)) ===
              profileSignature(profiles.get(r.rightProfileId))
            ? "equivalent"
            : r.kind;
    if (
      (r.kind.includes("refines") || r.kind === "equivalent") &&
      r.kind !== derived
    )
      throw Error("profile pair contradicts refinement closure");
  }
  const body = structuredClone(v),
    digest = domain(body);
  if (requireFixtureDigest && digest !== EXPECTED_U3_SYNTHETIC_FIXTURE_DIGEST)
    throw Error("U3 independent fixture digest mismatch");
  return deepFreeze({ ...body, digest });
}
export function verifyFrozenU3ObservationCalculus(
  v: FrozenU3ObservationCalculus,
  options = {},
) {
  raw(v);
  exact(
    v,
    [
      "schema",
      "fixtureKind",
      "denominatorScope",
      "empiricalRegistration",
      "closureClaim",
      "campaignId",
      "predecessors",
      "schemas",
      "predicates",
      "projections",
      "evidencePolicies",
      "authenticationPolicies",
      "strata",
      "observations",
      "comparisons",
      "variances",
      "profiles",
      "profilePairs",
      "digest",
    ],
    "frozen calculus",
  );
  const { digest, ...body } = v,
    f = freezeU3ObservationCalculus(body, options);
  if (digest !== f.digest) throw Error("U3 digest mismatch");
  return f;
}
