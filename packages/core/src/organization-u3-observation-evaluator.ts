import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  verifyFrozenU3ObservationCalculus,
  type FrozenU3ObservationCalculus,
} from "./organization-u3-observation-calculus";
export const U3_EVALUATOR_SCHEMA =
  "open-autonomy.u3-trace-evaluation-contract.v2" as const;
export const U3_CALCULUS_ANCHOR = {
  commit: "d00c5190e3284482493328925a88e682404362be",
  path: "packages/core/src/organization-u3-observation-calculus.ts",
  sha256:
    "sha256:bb313242dd918e934861a32ec8fd3f28bee59fee31bd79689dea68d20c7f843b",
} as const;
type Sha = `sha256:${string}`;
export type U3EvaluationStatus =
  | "preserved/equivalent"
  | "preserved/refinement"
  | "preserved/abstraction"
  | "permitted-variance"
  | "permitted-typed-loss"
  | "violated"
  | "unknown"
  | "incompatible";
type Shape = {
  id: string;
  schemaId: string;
  schemaVersion: string;
  schemaDigest: Sha;
  type: "object" | "array" | "number" | "string" | "boolean";
  required: string[];
  properties: Array<{
    name: string;
    type: "number" | "string" | "boolean" | "array" | "object";
  }>;
  semanticDigest: Sha;
};
type Tool = { id: string; version: string; digest: Sha };
type Authority = {
  id: string;
  role:
    | "trace-producer"
    | "evidence-producer"
    | "provenance-producer"
    | "custodian";
  trustRootDigest: Sha;
  verificationKeyDigest: Sha;
};
export type U3TraceEvaluationContract = {
  schema: typeof U3_EVALUATOR_SCHEMA;
  fixtureKind: "synthetic";
  calculusDigest: Sha;
  shapes: Shape[];
  adapters: Tool[];
  compilers: Tool[];
  runtimes: Tool[];
  authorities: Authority[];
  quotients: Array<{
    id: string;
    comparisonId: string;
    operator: "field" | "json-pointer";
    argument: string;
  }>;
  digest: Sha;
};
export type U3TrustedKeys = { keys: Record<string, string> };
type Subject = {
  sort: "provider" | "component";
  providerId: string;
  componentId: string | null;
};
type Event = {
  id: string;
  sampleId: string;
  observationId: string;
  runId: string;
  traceId: string;
  side: "source" | "lifted";
  subject: Subject;
  schemaId: string;
  schemaVersion: string;
  timestamp: string | null;
  logicalOrder: number | null;
  causalParentIds: string[];
  correlationId: string;
  epistemic: "observation" | "attestation" | "verification";
  provenanceId: string;
  evidenceId: string;
  adapterId: string;
  adapterVersion: string;
  adapterDigest: Sha;
  compilerId: string;
  compilerVersion: string;
  compilerDigest: Sha;
  runtimeId: string;
  runtimeVersion: string;
  runtimeDigest: Sha;
  payload: unknown;
  integrityDigest: Sha;
  authentication: { authorityId: string; receipt: Sha };
};
type Evidence = {
  id: string;
  eventId: string;
  payloadDigest: Sha;
  runId: string;
  subjectDigest: Sha;
  provenanceDigest: Sha;
  custodyDigest: Sha;
  authorityId: string;
  receipt: Sha;
  custodyAuthorityId: string;
  custodyReceipt: Sha;
};
type Provenance = {
  id: string;
  producerAuthorityId: string;
  custodyAuthorityId: string;
  artifactDigest: Sha;
  producerReceipt: Sha;
  custodyReceipt: Sha;
};
type Trace = {
  schema: "open-autonomy.u3-trace.v2";
  version: "2.0.0";
  traceId: string;
  side: "source" | "lifted";
  runId: string;
  producerAuthorityId: string;
  start: string | null;
  end: string | null;
  logicalStart: number | null;
  logicalEnd: number | null;
  window: "instant" | "interval" | "trace";
  closure: "open" | "closed";
  completeness: "complete" | "gapped";
  gapCodes: string[];
  events: Event[];
  producerReceipt: Sha;
  closureCustodianAuthorityId: string;
  closureReceipt: Sha;
};
export type U3TraceEvaluationInput = {
  schema: "open-autonomy.u3-trace-evaluation-input.v2";
  fixtureKind: "synthetic";
  calculusDigest: Sha;
  contractDigest: Sha;
  profileId: string;
  runId: string;
  source: Trace;
  lifted: Trace;
  evidence: Evidence[];
  provenance: Provenance[];
  losses: Array<{
    id: string;
    schema: "open-autonomy.u3-typed-loss.v1";
    runId: string;
    observationId: string;
    code: "optional-not-emitted" | "adapter-unavailable";
    evidenceId: string;
    provenanceId: string;
    subject: Subject;
    authorityId: string;
    receipt: Sha;
  }>;
};
export type U3EvaluationReport = {
  schema: "open-autonomy.u3-observation-report.v2";
  fixtureKind: "synthetic";
  closureClaim: false;
  calculusDigest: Sha;
  contractDigest: Sha;
  profileId: string;
  runId: string;
  sourceTraceDigest: Sha;
  liftedTraceDigest: Sha;
  evidenceDigest: Sha;
  results: Array<{
    observationId: string;
    comparisonId: string;
    varianceId: string;
    status: U3EvaluationStatus;
    code: string;
    sourceEventIds: string[];
    liftedEventIds: string[];
    evidenceIds: string[];
    provenanceIds: string[];
    lossIds: string[];
    witnessDigest: Sha;
    counterexampleDigest: Sha | null;
  }>;
  counts: Record<U3EvaluationStatus, number>;
  digest: Sha;
};
const C = canonicalSemanticJson,
  H = (x: string | Uint8Array) =>
    `sha256:${createHash("sha256").update(x).digest("hex")}` as Sha,
  HM = (k: string, x: unknown) =>
    `sha256:${createHmac("sha256", k).update(C(x)).digest("hex")}` as Sha,
  sha = (x: unknown): x is Sha =>
    typeof x === "string" && /^sha256:[0-9a-f]{64}$/.test(x),
  id = (x: unknown): x is string =>
    typeof x === "string" &&
    Buffer.byteLength(x) <= 256 &&
    /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(x),
  exact = (x: unknown, k: string[], l: string) => {
    if (
      !x ||
      typeof x !== "object" ||
      Array.isArray(x) ||
      C(Object.keys(x).sort()) !== C([...k].sort())
    )
      throw Error(`${l} schema invalid`);
    return x as any;
  },
  ord = (x: unknown, l: string) => {
    if (
      !Array.isArray(x) ||
      x.some((y) => !id(y)) ||
      new Set(x).size !== x.length ||
      C(x) !== C([...x].sort())
    )
      throw Error(`${l} order invalid`);
    return x as string[];
  },
  eq = (a: Sha, b: Sha) => {
    const x = Buffer.from(a),
      y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  };
function preflight(v: unknown) {
  let n = 0,
    b = 0;
  const active = new Set<object>(),
    q: Array<[unknown, number, boolean]> = [[v, 0, true]];
  while (q.length) {
    const [x, d, e] = q.pop()!;
    if (!e) {
      active.delete(x as object);
      continue;
    }
    if (d > 48 || ++n > 30000) throw Error("U3 evaluator work bound");
    if (typeof x === "string") {
      b += Buffer.byteLength(x);
      if (Buffer.byteLength(x) > 4096) throw Error("U3 field bound");
      continue;
    }
    if (!x || typeof x !== "object") continue;
    if (active.has(x as object)) throw Error("U3 cyclic input");
    active.add(x as object);
    q.push([x, d, false]);
    const vs = Array.isArray(x) ? x : Object.values(x);
    if (vs.length > 4096) throw Error("U3 collection bound");
    for (const y of vs) q.push([y, d + 1, true]);
  }
  if (b > 4_194_304) throw Error("U3 byte bound");
}
const registry = <T extends { id: string }>(xs: T[], l: string) => {
    const m = new Map<string, T>();
    for (const x of xs) {
      if (!id(x.id) || m.has(x.id)) throw Error(`${l} identity invalid`);
      m.set(x.id, x);
    }
    if (C([...m.keys()]) !== C([...m.keys()].sort()))
      throw Error(`${l} order invalid`);
    return m;
  },
  bodyWithout = (x: any, ...ks: string[]) =>
    Object.fromEntries(Object.entries(x).filter(([k]) => !ks.includes(k))),
  auth = (key: string, body: unknown, receipt: Sha) =>
    eq(HM(key, body), receipt),
  finite = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v) && !Object.is(v, -0);
const deepFreeze = <T>(value: T): T => {
  const pending: unknown[] = [value];
  while (pending.length) {
    const item = pending.pop();
    if (item && typeof item === "object" && !Object.isFrozen(item)) {
      pending.push(...Object.values(item));
      Object.freeze(item);
    }
  }
  return value;
};
export function verifyU3EvaluatorCalculusGitCustody(root = process.cwd()) {
  const a = U3_CALCULUS_ANCHOR,
    r = spawnSync("git", ["rev-parse", "--verify", `${a.commit}^{commit}`], {
      cwd: root,
      encoding: "utf8",
    }),
    g = spawnSync("git", ["show", `${a.commit}:${a.path}`], { cwd: root });
  if (
    r.status ||
    r.stdout.trim() !== a.commit ||
    g.status ||
    H(g.stdout) !== a.sha256 ||
    H(readFileSync(`${root}/${a.path}`)) !== a.sha256
  )
    throw Error("calculus custody invalid");
}
export function freezeU3TraceEvaluationContract(
  input: Omit<U3TraceEvaluationContract, "digest">,
): U3TraceEvaluationContract {
  preflight(input);
  exact(
    input,
    [
      "schema",
      "fixtureKind",
      "calculusDigest",
      "shapes",
      "adapters",
      "compilers",
      "runtimes",
      "authorities",
      "quotients",
    ],
    "contract",
  );
  if (
    input.schema !== U3_EVALUATOR_SCHEMA ||
    input.fixtureKind !== "synthetic" || !sha(input.calculusDigest)
  )
    throw Error("contract boundary invalid");
  for (const s of input.shapes) {
    exact(
      s,
      [
        "id",
        "schemaId",
        "schemaVersion",
        "schemaDigest",
        "type",
        "required",
        "properties",
        "semanticDigest",
      ],
      "shape",
    );
    ord(s.required, "shape required");
    if (
      !id(s.schemaId) ||
      !id(s.schemaVersion) ||
      !sha(s.schemaDigest) ||
      !sha(s.semanticDigest) ||
      !["object", "array", "number", "string", "boolean"].includes(s.type)
    )
      throw Error("shape invalid");
    if (
      s.semanticDigest !==
      H(C(bodyWithout(s, "semanticDigest")))
    )
      throw Error("shape semantic digest invalid");
    if (
      new Set(s.properties.map((p) => p.name)).size !== s.properties.length ||
      C(s.properties.map((p) => p.name)) !==
        C(s.properties.map((p) => p.name).sort()) ||
      s.required.some((k) => !s.properties.some((p) => p.name === k))
    )
      throw Error("shape property coverage invalid");
    for (const p of s.properties) {
      exact(p, ["name", "type"], "shape property");
      if (
        !id(p.name) ||
        !["number", "string", "boolean", "array", "object"].includes(p.type)
      )
        throw Error("shape property invalid");
    }
  }
  for (const [xs, l] of [
    [input.adapters, "adapter"],
    [input.compilers, "compiler"],
    [input.runtimes, "runtime"],
  ] as const)
    for (const x of xs) {
      exact(x, ["id", "version", "digest"], l);
      if (!id(x.version) || !sha(x.digest)) throw Error(`${l} invalid`);
    }
  for (const a of input.authorities) {
    exact(a, ["id", "role", "trustRootDigest", "verificationKeyDigest"], "authority");
    if (
      ![
        "trace-producer",
        "evidence-producer",
        "provenance-producer",
        "custodian",
      ].includes(a.role) ||
      !sha(a.trustRootDigest) || !sha(a.verificationKeyDigest)
    )
      throw Error("authority invalid");
  }
  if (
    new Set(input.authorities.map((a) => a.verificationKeyDigest)).size !==
    input.authorities.length
  )
    throw Error("authority verification key alias invalid");
  for (const q of input.quotients) {
    exact(q, ["id", "comparisonId", "operator", "argument"], "quotient");
    if (
      !["field", "json-pointer"].includes(q.operator) ||
      pointerParts(q.operator, q.argument) === null
    )
      throw Error("quotient invalid");
  }
  for (const [xs, l] of [
    [input.shapes, "shape"],
    [input.adapters, "adapter"],
    [input.compilers, "compiler"],
    [input.runtimes, "runtime"],
    [input.authorities, "authority"],
    [input.quotients, "quotient"],
  ] as any)
    registry(xs, l);
  const digest = H(
    `open-autonomy.u3-trace-evaluation-contract.v2\0${C(input)}`,
  );
  return deepFreeze({ ...structuredClone(input), digest });
}
export const integrityU3Event = (
  e: Omit<Event, "integrityDigest" | "authentication">,
) => H(C(e));
export const signU3Record = (key: string, body: unknown) => HM(key, body);
const pointerParts = (operator: string, argument: unknown): string[] | null => {
  if (typeof argument !== "string" || Buffer.byteLength(argument) > 256)
    return null;
  if (operator === "field") {
    if (!id(argument) || ["__proto__", "prototype", "constructor"].includes(argument)) return null;
    return [argument];
  }
  if (operator !== "json-pointer" || (argument !== "" && !argument.startsWith("/"))) return null;
  if (argument === "") return [];
  const encoded = argument.slice(1).split("/");
  if (encoded.some((part) => /~(?![01])/u.test(part))) return null;
  const decoded = encoded.map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  return decoded.some((part) => ["__proto__", "prototype", "constructor"].includes(part)) ? null : decoded;
};
const project = (p: any, v: any) => {
    if (p.operator === "identity") return v;
    if (p.operator === "json-pointer" && p.argument === "") return v;
    if (!v || typeof v !== "object") return undefined;
    const parts = pointerParts(p.operator, p.argument);
    if (!parts) return undefined;
    let x = v;
    for (const k of parts) {
      if (
        ["__proto__", "prototype", "constructor"].includes(k) ||
        !x ||
        typeof x !== "object" ||
        !Object.prototype.hasOwnProperty.call(x, k)
      )
        return undefined;
      x = x[k];
    }
    return x;
  },
  shapeOk = (s: Shape, v: any) => {
    if (s.type !== "object")
      return s.type === "number" ? finite(v) : typeof v === s.type;
    if (!v || typeof v !== "object" || Array.isArray(v)) return false;
    if (Object.keys(v).some((k) => !s.properties.some((p) => p.name === k)))
      return false;
    for (const k of s.required)
      if (!Object.prototype.hasOwnProperty.call(v, k)) return false;
    return s.properties.every(
      (p) =>
        !Object.prototype.hasOwnProperty.call(v, p.name) ||
        (p.type === "number"
          ? finite(v[p.name])
          : p.type === "array"
            ? Array.isArray(v[p.name])
            : p.type === "object"
              ? v[p.name] &&
                typeof v[p.name] === "object" &&
                !Array.isArray(v[p.name])
              : typeof v[p.name] === p.type),
    );
  };
const subsequence = (a: any[], b: any[]) => {
    let i = 0;
    for (const x of b) if (i < a.length && C(x) === C(a[i])) i++;
    return i === a.length;
  },
  aggregate = (xs: number[], op: string) =>
    op === "identity"
      ? xs
      : op === "maximum"
        ? Math.max(...xs)
      : xs.reduce((a, b) => a + b, 0) / xs.length;

/** Narrow public exposure of the evaluator's source-projection semantics. */
export function projectU3ObservationSourceValue(
  calculus: FrozenU3ObservationCalculus,
  observationId: string,
  value: unknown,
): unknown {
  const observation = calculus.observations.find((x) => x.id === observationId);
  if (!observation) throw Error("source projection observation invalid");
  const projection = calculus.projections.find(
    (x) => x.id === observation.sourceProjectionId,
  );
  if (!projection) throw Error("source projection registry invalid");
  if (
    projection.operator !== "identity" &&
    pointerParts(projection.operator, projection.argument) === null
  )
    throw Error("source projection pointer invalid");
  return project(projection, value);
}

/** Computes and verifies the exact source-trace digest used in U3 reports. */
export function computeU3SourceTraceDigest(
  trace: U3TraceEvaluationInput["source"],
): Sha {
  preflight(trace);
  return H(C(trace));
}

export function verifyU3SourceTraceDigest(
  trace: U3TraceEvaluationInput["source"],
  expected: Sha,
): Sha {
  if (!sha(expected) || !eq(computeU3SourceTraceDigest(trace), expected))
    throw Error("source trace digest invalid");
  return expected;
}
export function evaluateU3ObservationTrace(
  calculus: FrozenU3ObservationCalculus,
  contract: U3TraceEvaluationContract,
  input: U3TraceEvaluationInput,
  trusted: U3TrustedKeys,
): U3EvaluationReport {
  preflight(input);
  verifyFrozenU3ObservationCalculus(calculus, { requireFixtureDigest: false });
  if (
    contract.calculusDigest !== calculus.digest ||
    contract.digest !==
      freezeU3TraceEvaluationContract(bodyWithout(contract, "digest") as any)
        .digest ||
    input.contractDigest !== contract.digest
  )
    throw Error("evaluator anchor invalid");
  exact(
    input,
    [
      "schema",
      "fixtureKind",
      "calculusDigest",
      "contractDigest",
      "profileId",
      "runId",
      "source",
      "lifted",
      "evidence",
      "provenance",
      "losses",
    ],
    "input",
  );
  if (
    input.schema !== "open-autonomy.u3-trace-evaluation-input.v2" ||
    input.fixtureKind !== "synthetic" ||
    input.calculusDigest !== calculus.digest ||
    !id(input.runId)
  )
    throw Error("input boundary invalid");
  const profile = calculus.profiles.find((x) => x.id === input.profileId);
  if (!profile) throw Error("profile invalid");
  exact(trusted, ["keys"], "trusted keys");
  if (!trusted.keys || typeof trusted.keys !== "object" || Array.isArray(trusted.keys))
    throw Error("trusted keys invalid");
  const observationRegistry = new Map(calculus.observations.map((x) => [x.id, x])),
    evidencePolicies = new Map(calculus.evidencePolicies.map((x) => [x.id, x])),
    authenticationPolicies = new Map(calculus.authenticationPolicies.map((x) => [x.id, x])),
    calculusSchemas = new Map(calculus.schemas.map((x) => [`${x.id}\0${x.version}`, x])),
    shapes = registry(contract.shapes, "shape"),
    adapters = registry(contract.adapters, "adapter"),
    compilers = registry(contract.compilers, "compiler"),
    runtimes = registry(contract.runtimes, "runtime"),
    authorities = registry(contract.authorities, "authority"),
    provenance = registry(input.provenance, "provenance"),
    evidence = registry(input.evidence, "evidence"),
    events = new Map<string, Event>(),
    key = (aid: string, role: string) => {
      const a = authorities.get(aid),
        k = Object.prototype.hasOwnProperty.call(trusted.keys, aid) ? trusted.keys[aid] : undefined;
      if (!a || a.role !== role || !k || H(k) !== a.verificationKeyDigest)
        throw Error("trusted authority join invalid");
      return k;
    };
  if (C(Object.keys(trusted.keys).sort()) !== C([...authorities.keys()].sort()))
    throw Error("trusted key reachability invalid");
  const effectiveObservations = profile.observationIds.map((oid) => observationRegistry.get(oid)!);
  for (const observation of effectiveObservations) {
    const policy = authenticationPolicies.get(observation.authenticationPolicyId), evidencePolicy = evidencePolicies.get(observation.evidencePolicyId);
    if (!policy?.required || policy.mechanism !== "mac" || !policy.trustRootSha256 || !evidencePolicy?.required)
      throw Error("unsupported effective policy invalid");
  }
  const requiredSchemaKeys = new Set(effectiveObservations.flatMap((o) => [
    `${o.nativeSchemaId}\0${o.nativeSchemaVersion}`,
    `${o.valueSchemaId}\0${o.valueSchemaVersion}`,
  ]));
  for (const schemaKey of requiredSchemaKeys) {
    const schema = calculusSchemas.get(schemaKey), matches = contract.shapes.filter((s) => `${s.schemaId}\0${s.schemaVersion}` === schemaKey);
    if (!schema || matches.length !== 1 || matches[0].schemaDigest !== schema.schemaSha256)
      throw Error("shape calculus join invalid");
  }
  if (contract.shapes.some((s) => !requiredSchemaKeys.has(`${s.schemaId}\0${s.schemaVersion}`)))
    throw Error("surplus shape invalid");
  const effectiveComparisons = profile.comparisonIds.map((cid) => calculus.comparisons.find((c) => c.id === cid)!);
  for (const projectionId of [
    ...effectiveObservations.map((o) => o.sourceProjectionId),
    ...effectiveComparisons.flatMap((c) => [c.sourceProjectionId, c.targetProjectionId]),
  ]) {
    const projection = calculus.projections.find((p) => p.id === projectionId)!;
    if (projection.operator !== "identity" && pointerParts(projection.operator, projection.argument) === null)
      throw Error("projection pointer invalid");
  }
  for (const c of effectiveComparisons)
    if (contract.quotients.filter((q) => q.comparisonId === c.id).length !== (c.operator === "abstracts" ? 1 : 0))
      throw Error("quotient reachability invalid");
  if (contract.quotients.some((q) => !profile.comparisonIds.includes(q.comparisonId)))
    throw Error("surplus quotient invalid");
  for (const p of input.provenance) {
    exact(
      p,
      [
        "id",
        "producerAuthorityId",
        "custodyAuthorityId",
        "artifactDigest",
        "producerReceipt",
        "custodyReceipt",
      ],
      "provenance",
    );
    if (
      p.producerAuthorityId === p.custodyAuthorityId ||
      !sha(p.artifactDigest) ||
      !auth(
        key(p.producerAuthorityId, "provenance-producer"),
        bodyWithout(p, "producerReceipt", "custodyReceipt"),
        p.producerReceipt,
      ) ||
      !auth(
        key(p.custodyAuthorityId, "custodian"),
        bodyWithout(p, "custodyReceipt"),
        p.custodyReceipt,
      )
    )
      throw Error("provenance invalid");
  }
  for (const e of input.evidence) {
    exact(
      e,
      [
        "id",
        "eventId",
        "payloadDigest",
        "runId",
        "subjectDigest",
        "provenanceDigest",
        "custodyDigest",
        "authorityId",
        "receipt",
        "custodyAuthorityId",
        "custodyReceipt",
      ],
      "evidence",
    );
    if (
      e.runId !== input.runId ||
      !sha(e.payloadDigest) ||
      !sha(e.subjectDigest) ||
      !sha(e.provenanceDigest) ||
      !sha(e.custodyDigest) ||
      !auth(
        key(e.authorityId, "evidence-producer"),
        bodyWithout(e, "receipt", "custodyReceipt"),
        e.receipt,
      ) ||
      e.authorityId === e.custodyAuthorityId ||
      !auth(
        key(e.custodyAuthorityId, "custodian"),
        bodyWithout(e, "custodyReceipt"),
        e.custodyReceipt,
      )
    )
      throw Error("evidence invalid");
  }
  const validateTrace = (t: Trace, side: "source" | "lifted") => {
    exact(
      t,
      [
        "schema",
        "version",
        "traceId",
        "side",
        "runId",
        "producerAuthorityId",
        "start",
        "end",
        "logicalStart",
        "logicalEnd",
        "window",
        "closure",
        "completeness",
        "gapCodes",
        "events",
        "producerReceipt",
        "closureCustodianAuthorityId",
        "closureReceipt",
      ],
      "trace",
    );
    ord(t.gapCodes, "trace gaps");
    if (
      t.schema !== "open-autonomy.u3-trace.v2" ||
      t.version !== "2.0.0" ||
      t.side !== side ||
      t.runId !== input.runId ||
      !id(t.traceId) ||
      !["instant", "interval", "trace"].includes(t.window) ||
      !["open", "closed"].includes(t.closure) ||
      !["complete", "gapped"].includes(t.completeness) ||
      (t.completeness === "complete"
        ? t.gapCodes.length !== 0
        : t.gapCodes.length === 0) ||
      t.producerAuthorityId === t.closureCustodianAuthorityId ||
      !auth(
        key(t.producerAuthorityId, "trace-producer"),
        bodyWithout(t, "producerReceipt", "closureReceipt"),
        t.producerReceipt,
      ) ||
      !auth(
        key(t.closureCustodianAuthorityId, "custodian"),
        bodyWithout(t, "closureReceipt"),
        t.closureReceipt,
      )
    )
      throw Error("trace closure invalid");
    const wall =
        typeof t.start === "string" &&
        typeof t.end === "string" &&
        Number.isFinite(Date.parse(t.start)) &&
        Number.isFinite(Date.parse(t.end)) &&
        Date.parse(t.start) <= Date.parse(t.end),
      logical =
        Number.isSafeInteger(t.logicalStart) &&
        Number.isSafeInteger(t.logicalEnd) &&
        t.logicalStart! <= t.logicalEnd!;
    if (!wall && !logical) throw Error("trace time basis invalid");
    let last = -1, lastWall = -Infinity;
    const local = new Map<string, Event>();
    for (const e of t.events) {
      exact(
        e,
        [
          "id",
          "sampleId",
          "observationId",
          "runId",
          "traceId",
          "side",
          "subject",
          "schemaId",
          "schemaVersion",
          "timestamp",
          "logicalOrder",
          "causalParentIds",
          "correlationId",
          "epistemic",
          "provenanceId",
          "evidenceId",
          "adapterId",
          "adapterVersion",
          "adapterDigest",
          "compilerId",
          "compilerVersion",
          "compilerDigest",
          "runtimeId",
          "runtimeVersion",
          "runtimeDigest",
          "payload",
          "integrityDigest",
          "authentication",
        ],
        "event",
      );
      exact(e.subject, ["sort", "providerId", "componentId"], "subject");
      exact(e.authentication, ["authorityId", "receipt"], "event auth");
      ord(e.causalParentIds, "causal parents");
      const observation = observationRegistry.get(e.observationId);
      if (
        !id(e.id) || !id(e.correlationId) || events.has(e.id) ||
        e.runId !== input.runId ||
        e.traceId !== t.traceId ||
        e.side !== side || !["observation", "attestation", "verification"].includes(e.epistemic) ||
        !id(e.sampleId) ||
        !observation || !profile.observationIds.includes(e.observationId) ||
        e.subject.sort !== observation.subjectSort ||
        e.subject.providerId !== observation.providerId ||
        e.subject.componentId !== observation.componentId ||
        e.schemaId !== observation.nativeSchemaId ||
        e.schemaVersion !== observation.nativeSchemaVersion ||
        !provenance.has(e.provenanceId) ||
        !evidence.has(e.evidenceId) ||
        !adapters.has(e.adapterId) ||
        adapters.get(e.adapterId)!.version !== e.adapterVersion ||
        adapters.get(e.adapterId)!.digest !== e.adapterDigest ||
        !compilers.has(e.compilerId) ||
        compilers.get(e.compilerId)!.version !== e.compilerVersion ||
        compilers.get(e.compilerId)!.digest !== e.compilerDigest ||
        !runtimes.has(e.runtimeId) ||
        runtimes.get(e.runtimeId)!.version !== e.runtimeVersion
        || runtimes.get(e.runtimeId)!.digest !== e.runtimeDigest
      )
        throw Error("event join invalid");
      const integ = integrityU3Event(
        bodyWithout(e, "integrityDigest", "authentication") as any,
      );
      if (
        e.integrityDigest !== integ ||
        e.authentication.authorityId !== t.producerAuthorityId ||
        authorities.get(e.authentication.authorityId)?.trustRootDigest !==
          authenticationPolicies.get(observation.authenticationPolicyId)?.trustRootSha256 ||
        !auth(
          key(e.authentication.authorityId, "trace-producer"),
          bodyWithout(e, "authentication"),
          e.authentication.receipt,
        )
      )
        throw Error("event authentication invalid");
      const ev = evidence.get(e.evidenceId)!;
      const evidencePolicy = evidencePolicies.get(observation.evidencePolicyId)!;
      const epistemicRank = { observation: 0, attestation: 1, verification: 2 } as const;
      if (
        ev.eventId !== e.id ||
        ev.payloadDigest !== H(C(e.payload)) ||
        ev.subjectDigest !== H(C(e.subject)) ||
        ev.provenanceDigest !== provenance.get(e.provenanceId)!.artifactDigest ||
        ev.custodyDigest !== H(C({ custodyAuthorityId: ev.custodyAuthorityId })) ||
        (evidencePolicy.required &&
          epistemicRank[e.epistemic] < epistemicRank[evidencePolicy.minimum]) ||
        evidencePolicy.referenceSchemaId !== e.schemaId ||
        evidencePolicy.referenceSchemaVersion !== e.schemaVersion
      )
        throw Error("evidence graph invalid");
      const eventClock = observation.clock;
      if (eventClock === "monotonic" || (eventClock === "none" && e.logicalOrder !== null)) {
        if (!logical) throw Error("logical envelope missing");
        if (
          !Number.isSafeInteger(e.logicalOrder) ||
          e.timestamp !== null ||
          e.logicalOrder! <= last ||
          e.logicalOrder! < t.logicalStart! || e.logicalOrder! > t.logicalEnd!
        )
          throw Error("logical order invalid");
        last = e.logicalOrder!;
      } else if (eventClock === "wall" || eventClock === "none") {
        if (!wall) throw Error("wall envelope missing");
        if (
        typeof e.timestamp !== "string" ||
        e.logicalOrder !== null ||
        !Number.isFinite(Date.parse(e.timestamp)) ||
        Date.parse(e.timestamp) <= lastWall ||
        Date.parse(e.timestamp) < Date.parse(t.start!) ||
        Date.parse(e.timestamp) > Date.parse(t.end!)
        ) throw Error("wall time invalid");
        lastWall = Date.parse(e.timestamp!);
      } else throw Error("event clock invalid");
      for (const p of e.causalParentIds)
        if (!local.has(p) ||
            (local.get(p)!.logicalOrder !== null) !== (e.logicalOrder !== null) ||
            (local.get(p)!.logicalOrder !== null && local.get(p)!.logicalOrder! >= e.logicalOrder!) ||
            (local.get(p)!.timestamp !== null && Date.parse(local.get(p)!.timestamp!) >= Date.parse(e.timestamp!)))
          throw Error("causal order invalid");
      local.set(e.id, e);
      events.set(e.id, e);
    }
  };
  validateTrace(input.source, "source");
  validateTrace(input.lifted, "lifted");
  if (
    input.source.producerAuthorityId === input.lifted.producerAuthorityId ||
    authorities.get(input.source.producerAuthorityId)!.verificationKeyDigest ===
      authorities.get(input.lifted.producerAuthorityId)!.verificationKeyDigest ||
    input.source.closureReceipt === input.lifted.closureReceipt
  )
    throw Error("trace authority alias invalid");
  const observations = new Map(calculus.observations.map((x) => [x.id, x])),
    comparisons = new Map(calculus.comparisons.map((x) => [x.id, x])),
    variances = new Map(calculus.variances.map((x) => [x.id, x])),
    projections = new Map(calculus.projections.map((x) => [x.id, x])),
    losses = new Map<string, any>();
  for (const l of input.losses) {
    exact(l, ["id", "schema", "runId", "observationId", "code", "evidenceId", "provenanceId", "subject", "authorityId", "receipt"], "loss");
    exact(l.subject, ["sort", "providerId", "componentId"], "loss subject");
    const observation = observations.get(l.observationId),
      applicability = observation?.applicability.find((a) => a.stratumId === profile.stratumId),
      lossEvidence = evidence.get(l.evidenceId), lossProvenance = provenance.get(l.provenanceId);
    if (
      !id(l.id) || l.schema !== "open-autonomy.u3-typed-loss.v1" ||
      l.runId !== input.runId ||
      losses.has(l.observationId) ||
      !profile.observationIds.includes(l.observationId) ||
      profile.forbiddenLossObservationIds.includes(l.observationId) ||
      applicability?.status !== "optional" ||
      !lossEvidence || lossEvidence.eventId !== `loss-${l.observationId}` ||
      lossEvidence.payloadDigest !== H(C(bodyWithout(l, "receipt"))) ||
      !lossProvenance ||
      l.subject.sort !== observation!.subjectSort ||
      l.subject.providerId !== observation!.providerId ||
      l.subject.componentId !== observation!.componentId ||
      lossEvidence.subjectDigest !== H(C(l.subject)) ||
      lossEvidence.provenanceDigest !== lossProvenance.artifactDigest ||
      l.authorityId !== lossEvidence.authorityId ||
      !["optional-not-emitted", "adapter-unavailable"].includes(l.code) ||
      !auth(key(l.authorityId, "evidence-producer"), bodyWithout(l, "receipt"), l.receipt)
    )
      throw Error("typed loss invalid");
    losses.set(l.observationId, l);
  }
  for (const oid of losses.keys())
    if ([...events.values()].some((e) => e.observationId === oid))
      throw Error("loss/observation exclusivity invalid");
  if (C(input.losses.map((l) => l.observationId)) !== C(input.losses.map((l) => l.observationId).sort()))
    throw Error("typed loss order invalid");
  if (new Set(input.losses.map((l) => l.id)).size !== input.losses.length)
    throw Error("typed loss identity invalid");
  const usedEvidence = new Set([
    ...[...events.values()].map((e) => e.evidenceId),
    ...[...losses.values()].map((l) => l.evidenceId),
  ]);
  for (const e of evidence.values())
    if (!usedEvidence.has(e.id)) throw Error("orphan evidence invalid");
  for (const eid of usedEvidence)
    if (
      [...events.values()].filter((event) => event.evidenceId === eid).length +
        [...losses.values()].filter((loss) => loss.evidenceId === eid).length !==
      1
    )
      throw Error("evidence cardinality invalid");
  for (const p of provenance.values())
    if (
      ![...events.values()].some((e) => e.provenanceId === p.id) &&
      ![...losses.values()].some((l) => l.provenanceId === p.id)
    )
      throw Error("orphan provenance invalid");
  for (const pid of provenance.keys())
    if (
      [...events.values()].filter((event) => event.provenanceId === pid).length +
        [...losses.values()].filter((loss) => loss.provenanceId === pid).length !==
      1
    )
      throw Error("provenance cardinality invalid");
  const typedIds = [
    ...[...events.keys()].map((value) => `event\0${value}`),
    ...[...evidence.keys()].map((value) => `evidence\0${value}`),
    ...[...provenance.keys()].map((value) => `provenance\0${value}`),
    ...[...losses.values()].map((loss) => `loss\0${loss.id}`),
  ];
  const bareIds = typedIds.map((value) => value.slice(value.indexOf("\0") + 1));
  if (new Set(bareIds).size !== bareIds.length)
    throw Error("cross-registry identity alias invalid");
  const allEvents = [...events.values()],
    exactReach = (actual: Iterable<string>, expected: Iterable<string>, label: string) => {
      if (C([...new Set(actual)].sort()) !== C([...new Set(expected)].sort()))
        throw Error(`${label} reachability invalid`);
    };
  exactReach(allEvents.map((e) => e.adapterId), adapters.keys(), "adapter");
  exactReach(allEvents.map((e) => e.compilerId), compilers.keys(), "compiler");
  exactReach(allEvents.map((e) => e.runtimeId), runtimes.keys(), "runtime");
  exactReach([
    input.source.producerAuthorityId, input.source.closureCustodianAuthorityId,
    input.lifted.producerAuthorityId, input.lifted.closureCustodianAuthorityId,
    ...allEvents.map((e) => e.authentication.authorityId),
    ...input.evidence.flatMap((e) => [e.authorityId, e.custodyAuthorityId]),
    ...input.provenance.flatMap((p) => [p.producerAuthorityId, p.custodyAuthorityId]),
    ...input.losses.map((l) => l.authorityId),
  ], authorities.keys(), "authority");
  const endpointComparisons = profile.comparisonIds.map((cid) => comparisons.get(cid)!),
    requiredSourceObservationIds = new Set(endpointComparisons.map((comparison) => comparison.left.observationId)),
    requiredLiftedObservationIds = new Set(endpointComparisons.map((comparison) => comparison.right.observationId)),
    endpointSourceEvents = input.source.events.filter((event) => requiredSourceObservationIds.has(event.observationId)),
    endpointLiftedEvents = input.lifted.events.filter((event) => requiredLiftedObservationIds.has(event.observationId)),
    endpointEvents = [...endpointSourceEvents, ...endpointLiftedEvents],
    sameInventory = (actual: string[], required: string[]) =>
      C([...new Set(actual)].sort()) === C([...new Set(required)].sort());
  if (
    !sameInventory(input.source.events.map((event) => event.id), endpointSourceEvents.map((event) => event.id)) ||
    !sameInventory(input.lifted.events.map((event) => event.id), endpointLiftedEvents.map((event) => event.id)) ||
    !sameInventory(input.evidence.map((item) => item.id), [...endpointEvents.map((event) => event.evidenceId), ...input.losses.map((loss) => loss.evidenceId)]) ||
    !sameInventory(input.provenance.map((item) => item.id), [...endpointEvents.map((event) => event.provenanceId), ...input.losses.map((loss) => loss.provenanceId)])
  ) throw Error("unconsumed input inventory invalid");
  const results = [] as U3EvaluationReport["results"];
  const missingStatus = (policy: "unknown" | "violation"):
    U3EvaluationStatus => policy === "violation" || profile.unknownPolicy === "reject" ? "violated" : "unknown";
  for (const oid of profile.observationIds) {
    const o = observations.get(oid)!,
      cid = profile.comparisonIds.find(
        (x) => comparisons.get(x)!.left.observationId === oid,
      )!,
      c = comparisons.get(cid)!,
      vid = profile.varianceIds.find(
        (x) => variances.get(x)!.comparisonId === cid,
      )!,
      v = variances.get(vid)!,
      se = input.source.events.filter((x) => x.observationId === c.left.observationId),
      le = input.lifted.events.filter((x) => x.observationId === c.right.observationId);
    let status: U3EvaluationStatus = "unknown",
      code = "",
      counter: Sha | null = null;
    if (losses.has(oid)) {
      if (le.length || se.length)
        throw Error("loss/observation exclusivity invalid");
      status = "permitted-typed-loss";
      code = losses.get(oid).code;
    } else if (!se.length || !le.length) {
      status = missingStatus(c.missing);
      code = "observation-missing";
    } else if (
      input.source.closure === "open" ||
      input.lifted.closure === "open" ||
      input.source.completeness !== "complete" ||
      input.lifted.completeness !== "complete"
    ) {
      status = missingStatus(o.missing);
      code = "trace-incomplete";
    } else {
      const dedup = (xs: Event[]) =>
        new Set(xs.map((x) => x.sampleId)).size === xs.length &&
        new Set(xs.map((x) => x.correlationId)).size === xs.length;
      const correlations = (xs: Event[]) => xs.map((x) => x.correlationId).sort();
      if (
        !dedup(se) ||
        !dedup(le) ||
        C(correlations(se)) !== C(correlations(le)) ||
        input.source.window !== v.window || input.lifted.window !== v.window ||
        (v.clock === "monotonic" &&
          (input.source.logicalStart === null || input.lifted.logicalStart === null)) ||
        (v.clock === "wall" &&
          (input.source.start === null || input.lifted.start === null)) ||
        se.length < v.minimumSamples ||
        le.length < v.minimumSamples
      ) {
        status = missingStatus(v.missing);
        code = "sample-boundary";
      } else {
        const leftObservation = observations.get(c.left.observationId)!,
          rightObservation = observations.get(c.right.observationId)!,
          leftShape = contract.shapes.find(
          (s) =>
            s.schemaId === leftObservation.nativeSchemaId &&
            s.schemaVersion === leftObservation.nativeSchemaVersion,
          ),
          rightShape = contract.shapes.find(
            (s) => s.schemaId === rightObservation.nativeSchemaId &&
              s.schemaVersion === rightObservation.nativeSchemaVersion,
          );
        if (!leftShape || !rightShape || se.some((e) => !shapeOk(leftShape, e.payload)) || le.some((e) => !shapeOk(rightShape, e.payload))) {
          status = "incompatible";
          code = "schema-incompatible";
        } else {
          const sp = projections.get(c.sourceProjectionId)!,
            tp = projections.get(c.targetProjectionId)!,
            pairs = correlations(se).map((correlationId) => ({
              left: se.find((e) => e.correlationId === correlationId)!,
              right: le.find((e) => e.correlationId === correlationId)!,
            })),
            directionalSource = c.direction === "right-to-left" ? pairs.map((p) => p.right) : pairs.map((p) => p.left),
            directionalTarget = c.direction === "right-to-left" ? pairs.map((p) => p.left) : pairs.map((p) => p.right),
            sv = directionalSource.map((e) => {
              const observation = observations.get(e.observationId)!;
              return project(sp, project(projections.get(observation.sourceProjectionId)!, e.payload));
            }),
            lv = directionalTarget.map((e) => {
              const observation = observations.get(e.observationId)!;
              return project(tp, project(projections.get(observation.sourceProjectionId)!, e.payload));
            });
          if ([...sv, ...lv].some((x) => x === undefined)) {
            status = missingStatus(c.missing);
            code = "projection-missing";
          } else {
            const sourceOutputShape = contract.shapes.find((s) => s.schemaId === sp.outputSchemaId && s.schemaVersion === sp.outputSchemaVersion),
              targetOutputShape = contract.shapes.find((s) => s.schemaId === tp.outputSchemaId && s.schemaVersion === tp.outputSchemaVersion);
            if (!sourceOutputShape || !targetOutputShape || sv.some((x) => !shapeOk(sourceOutputShape, x)) || lv.some((x) => !shapeOk(targetOutputShape, x))) {
              status = "incompatible";
              code = "projection-output-incompatible";
              const evidenceIds = [...se, ...le].map((x) => x.evidenceId).sort(), sourceEventIds = se.map((x) => x.id).sort(), liftedEventIds = le.map((x) => x.id).sort();
              const provenanceIds = [...se, ...le].map((x) => x.provenanceId).sort(), lossIds: string[] = [];
              results.push({ observationId: oid, comparisonId: cid, varianceId: vid, status, code, sourceEventIds, liftedEventIds, evidenceIds, provenanceIds, lossIds, witnessDigest: H(C({ oid, cid, vid, status, code, sourceEventIds, liftedEventIds, evidenceIds, provenanceIds, lossIds })), counterexampleDigest: null });
              continue;
            }
            let relation = false;
            if (c.operator === "equal") relation = C(sv) === C(lv);
            else if (c.operator === "refines") relation = subsequence(lv, sv);
            else {
              const q = contract.quotients.find((x) => x.comparisonId === cid);
              if (q) {
                const quotient = (x: any) => project(q, x);
                const quotientValues = sv.map(quotient);
                if (quotientValues.some((x) => x === undefined || !shapeOk(targetOutputShape, x))) {
                  status = "incompatible";
                  code = "quotient-output-incompatible";
                } else relation = C(quotientValues) === C(lv);
              }
            }
            if (code === "quotient-output-incompatible") {
              // The typed quotient was reachable but did not inhabit its registered codomain.
            } else if (relation) {
              status =
                c.operator === "equal"
                  ? "preserved/equivalent"
                  : c.operator === "refines"
                    ? "preserved/refinement"
                    : "preserved/abstraction";
              code = c.operator;
            } else {
              const nums = [...sv, ...lv].every(finite);
              let within = false;
              if (nums) {
                const a = aggregate(sv as number[], v.aggregation),
                  b = aggregate(lv as number[], v.aggregation),
                  numericPairs: Array<[number, number]> = Array.isArray(a)
                    ? (a.map((x: number, i: number) => [
                        x,
                        (b as number[])[i],
                      ]) as Array<[number, number]>)
                    : [[a as number, b as number]];
                within = numericPairs.every(([x, y]) =>
                  v.metric === "exact"
                    ? x === y
                    : v.metric === "absolute"
                      ? Math.abs(x - y) <= v.bound
                      : x === 0
                        ? y === 0
                        : Math.abs(x - y) / Math.abs(x) <= v.bound,
                );
              }
              if (within) {
                status = "permitted-variance";
                code = `${v.metric}-${v.aggregation}`;
              } else {
                status = "violated";
                code = "relation-failed";
                counter = H(C({ sv, lv }));
              }
            }
          }
        }
      }
    }
    if (status === "violated" && counter === null)
      counter = H(C({ observationId: oid, comparisonId: cid, varianceId: vid, code }));
    const evidenceIds = [
        ...[...se, ...le].map((x) => x.evidenceId),
        ...(losses.has(oid) ? [losses.get(oid).evidenceId] : []),
      ].sort(),
      provenanceIds = [
        ...[...se, ...le].map((x) => x.provenanceId),
        ...(losses.has(oid) ? [losses.get(oid).provenanceId] : []),
      ].sort(),
      lossIds = losses.has(oid) ? [losses.get(oid).id] : [],
      sourceEventIds = se.map((x) => x.id).sort(),
      liftedEventIds = le.map((x) => x.id).sort();
    results.push({
      observationId: oid,
      comparisonId: cid,
      varianceId: vid,
      status,
      code,
      sourceEventIds,
      liftedEventIds,
      evidenceIds,
      provenanceIds,
      lossIds,
      witnessDigest: H(
        C({
          oid,
          cid,
          vid,
          status,
          code,
          sourceEventIds,
          liftedEventIds,
          evidenceIds,
          provenanceIds,
          lossIds,
        }),
      ),
      counterexampleDigest: counter,
    });
  }
  const counts = {
    "preserved/equivalent": 0,
    "preserved/refinement": 0,
    "preserved/abstraction": 0,
    "permitted-variance": 0,
    "permitted-typed-loss": 0,
    violated: 0,
    unknown: 0,
    incompatible: 0,
  } as Record<U3EvaluationStatus, number>;
  for (const r of results) counts[r.status]++;
  const exactConsumedSet = (actual: string[], consumed: string[]) =>
    C([...new Set(actual)].sort()) === C([...new Set(consumed)].sort());
  if (
    !exactConsumedSet(input.source.events.map((event) => event.id), results.flatMap((result) => result.sourceEventIds)) ||
    !exactConsumedSet(input.lifted.events.map((event) => event.id), results.flatMap((result) => result.liftedEventIds)) ||
    !exactConsumedSet(input.evidence.map((item) => item.id), results.flatMap((result) => result.evidenceIds)) ||
    !exactConsumedSet(input.provenance.map((item) => item.id), results.flatMap((result) => result.provenanceIds)) ||
    !exactConsumedSet(input.losses.map((loss) => loss.id), results.flatMap((result) => result.lossIds))
  ) throw Error("unconsumed input inventory invalid");
  const body = {
    schema: "open-autonomy.u3-observation-report.v2" as const,
    fixtureKind: "synthetic" as const,
    closureClaim: false as const,
    calculusDigest: calculus.digest,
    contractDigest: contract.digest,
    profileId: profile.id,
    runId: input.runId,
    sourceTraceDigest: H(C(input.source)),
    liftedTraceDigest: H(C(input.lifted)),
    evidenceDigest: H(
      C({ evidence: input.evidence, provenance: input.provenance }),
    ),
    results,
    counts,
  };
  return deepFreeze({
    ...body,
    digest: H(`open-autonomy.u3-observation-report.v2\0${C(body)}`),
  });
}

export function verifyU3EvaluationReport(
  report: U3EvaluationReport,
  calculus: FrozenU3ObservationCalculus,
  contract: U3TraceEvaluationContract,
  input: U3TraceEvaluationInput,
  trusted: U3TrustedKeys,
) {
  preflight(report);
  verifyFrozenU3ObservationCalculus(calculus, { requireFixtureDigest: false });
  exact(report, ["schema", "fixtureKind", "closureClaim", "calculusDigest", "contractDigest", "profileId", "runId", "sourceTraceDigest", "liftedTraceDigest", "evidenceDigest", "results", "counts", "digest"], "report");
  const profile = calculus.profiles.find((p) => p.id === report.profileId);
  if (report.schema !== "open-autonomy.u3-observation-report.v2" || report.fixtureKind !== "synthetic" || report.closureClaim !== false || report.calculusDigest !== calculus.digest || report.contractDigest !== contract.digest || !profile || !id(report.runId) || !sha(report.sourceTraceDigest) || !sha(report.liftedTraceDigest) || !sha(report.evidenceDigest) || !sha(report.digest))
    throw Error("report boundary invalid");
  if (!Array.isArray(report.results) || C(report.results.map((r) => r.observationId)) !== C(profile.observationIds))
    throw Error("report coverage invalid");
  const counts = { "preserved/equivalent": 0, "preserved/refinement": 0, "preserved/abstraction": 0, "permitted-variance": 0, "permitted-typed-loss": 0, violated: 0, unknown: 0, incompatible: 0 } as Record<U3EvaluationStatus, number>;
  for (const r of report.results) {
    exact(r, ["observationId", "comparisonId", "varianceId", "status", "code", "sourceEventIds", "liftedEventIds", "evidenceIds", "provenanceIds", "lossIds", "witnessDigest", "counterexampleDigest"], "report result");
    const selectedComparisonId = profile.comparisonIds.find((cid) =>
        calculus.comparisons.find((c) => c.id === cid)!.left.observationId === r.observationId),
      selectedVarianceId = profile.varianceIds.find((vid) =>
        calculus.variances.find((v) => v.id === vid)!.comparisonId === selectedComparisonId),
      comparison = calculus.comparisons.find((c) => c.id === selectedComparisonId)!,
      variance = calculus.variances.find((v) => v.id === selectedVarianceId)!,
      expectedPreservedStatus: U3EvaluationStatus = comparison.operator === "equal" ? "preserved/equivalent" : comparison.operator === "refines" ? "preserved/refinement" : "preserved/abstraction",
      eventEvidenceCardinality = r.sourceEventIds.length + r.liftedEventIds.length;
    if (r.comparisonId !== selectedComparisonId || r.varianceId !== selectedVarianceId || !(r.status in counts) || !id(r.code) || !sha(r.witnessDigest) || (r.counterexampleDigest !== null && !sha(r.counterexampleDigest)))
      throw Error("report result invalid");
    ord(r.sourceEventIds, "report source events"); ord(r.liftedEventIds, "report lifted events"); ord(r.evidenceIds, "report evidence"); ord(r.provenanceIds, "report provenance"); ord(r.lossIds, "report losses");
    const resultLosses = input.losses.filter((loss) => loss.observationId === r.observationId),
      expectedSourceEvents = input.source.events.filter((event) => event.observationId === comparison.left.observationId),
      expectedLiftedEvents = input.lifted.events.filter((event) => event.observationId === comparison.right.observationId),
      expectedEvents = [...expectedSourceEvents, ...expectedLiftedEvents],
      sameSet = (actual: string[], expected: string[]) =>
        C([...new Set(actual)].sort()) === C([...new Set(expected)].sort());
    if (
      !sameSet(r.sourceEventIds, expectedSourceEvents.map((event) => event.id)) ||
      !sameSet(r.liftedEventIds, expectedLiftedEvents.map((event) => event.id)) ||
      !sameSet(r.evidenceIds, [...expectedEvents.map((event) => event.evidenceId), ...resultLosses.map((loss) => loss.evidenceId)]) ||
      !sameSet(r.provenanceIds, [...expectedEvents.map((event) => event.provenanceId), ...resultLosses.map((loss) => loss.provenanceId)]) ||
      !sameSet(r.lossIds, resultLosses.map((loss) => loss.id))
    ) throw Error("report endpoint witness topology invalid");
    const witness = { oid: r.observationId, cid: r.comparisonId, vid: r.varianceId, status: r.status, code: r.code, sourceEventIds: r.sourceEventIds, liftedEventIds: r.liftedEventIds, evidenceIds: r.evidenceIds, provenanceIds: r.provenanceIds, lossIds: r.lossIds };
    if (r.witnessDigest !== H(C(witness))) throw Error("report witness invalid");
    if (
      (r.status.startsWith("preserved/") &&
        (r.status !== expectedPreservedStatus || r.code !== comparison.operator || r.counterexampleDigest !== null || !r.sourceEventIds.length || !r.liftedEventIds.length || r.evidenceIds.length !== eventEvidenceCardinality || r.provenanceIds.length !== eventEvidenceCardinality || r.lossIds.length !== 0)) ||
      (r.status === "permitted-variance" &&
        (r.code !== `${variance.metric}-${variance.aggregation}` || r.counterexampleDigest !== null || r.evidenceIds.length !== eventEvidenceCardinality || r.provenanceIds.length !== eventEvidenceCardinality || r.lossIds.length !== 0)) ||
      (r.status === "violated" &&
        (r.counterexampleDigest === null || !["relation-failed", "observation-missing", "trace-incomplete", "sample-boundary", "projection-missing"].includes(r.code))) ||
      (r.status === "unknown" && (r.counterexampleDigest !== null || !["observation-missing", "trace-incomplete", "sample-boundary", "projection-missing"].includes(r.code))) ||
      (r.status === "incompatible" && (r.counterexampleDigest !== null || !["schema-incompatible", "projection-output-incompatible", "quotient-output-incompatible"].includes(r.code))) ||
      (r.status === "permitted-typed-loss" &&
        (r.counterexampleDigest !== null || !["optional-not-emitted", "adapter-unavailable"].includes(r.code) || r.sourceEventIds.length !== 0 || r.liftedEventIds.length !== 0 || r.evidenceIds.length !== 1 || r.provenanceIds.length !== 1 || r.lossIds.length !== 1))
    ) throw Error("report terminal invariant invalid");
    counts[r.status]++;
  }
  if (C(counts) !== C(report.counts)) throw Error("report counts invalid");
  const exactUnion = (actual: string[], expected: string[], label: string) => {
    if (C([...new Set(actual)].sort()) !== C([...new Set(expected)].sort()))
      throw Error(`report ${label} union invalid`);
  };
  exactUnion(report.results.flatMap((r) => r.sourceEventIds), input.source.events.map((e) => e.id), "source event");
  exactUnion(report.results.flatMap((r) => r.liftedEventIds), input.lifted.events.map((e) => e.id), "lifted event");
  exactUnion(report.results.flatMap((r) => r.evidenceIds), input.evidence.map((e) => e.id), "evidence");
  exactUnion(report.results.flatMap((r) => r.provenanceIds), input.provenance.map((p) => p.id), "provenance");
  exactUnion(report.results.flatMap((r) => r.lossIds), input.losses.map((l) => l.id), "loss");
  const { digest, ...body } = report;
  if (digest !== H(`open-autonomy.u3-observation-report.v2\0${C(body)}`)) throw Error("report digest invalid");
  const replay = evaluateU3ObservationTrace(calculus, contract, input, trusted);
  if (C(replay) !== C(report)) throw Error("report replay mismatch");
  return deepFreeze(structuredClone(report));
}
