import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { canonicalSemanticJson as C } from "./organization-canonical";
import type { FrozenU3ObservationCalculus } from "./organization-u3-observation-calculus";
import {
  evaluateU3ObservationTrace,
  projectU3ObservationSourceValue,
  verifyU3EvaluationReport,
  verifyU3SourceTraceDigest,
  type U3TraceEvaluationContract,
  type U3TraceEvaluationInput,
  type U3TrustedKeys,
} from "./organization-u3-observation-evaluator";
import type {
  FrozenU4SourceInventory,
  FrozenU4SyntheticSourceRegistry,
  U4TrustedVerificationInputs,
} from "./organization-u4-source-inventory";
import { verifyFrozenU4SourceInventory } from "./organization-u4-source-inventory";
import { verifyFrozenU3ObservationCalculus } from "./organization-u3-observation-calculus";

type Sha = `sha256:${string}`;
export const U4_PROBE_PROTOCOL_SCHEMA =
  "open-autonomy.u4-probe-protocol.v1" as const;
const H = (x: string | Uint8Array) =>
  `sha256:${createHash("sha256").update(x).digest("hex")}` as Sha;
const MAC = (k: Buffer, d: string, x: unknown) =>
  createHmac("sha256", k).update(d).update("\0").update(C(x)).digest("hex");
const time = (x: unknown): x is string =>
  typeof x === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x) &&
  Number.isFinite(Date.parse(x)) &&
  new Date(Date.parse(x)).toISOString() === x;
const id = (x: unknown): x is string =>
  typeof x === "string" &&
  x.length <= 200 &&
  /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(x);
const exact = (x: any, ks: string[], l: string) => {
  if (
    !x ||
    typeof x !== "object" ||
    Array.isArray(x) ||
    C(Object.keys(x).sort()) !== C([...ks].sort())
  )
    throw Error(`U4 probe ${l} schema invalid`);
  return x;
};
const sorted = (x: any, l: string) => {
  if (
    !Array.isArray(x) ||
    x.some((v: any) => !id(v)) ||
    new Set(x).size !== x.length ||
    C(x) !== C([...x].sort())
  )
    throw Error(`U4 probe ${l} order invalid`);
  return x as string[];
};
const bounded = (x: unknown) => {
  let n = 0,
    b = 0;
  const active = new Set<object>(),
    q: Array<[unknown, number, boolean]> = [[x, 0, true]];
  while (q.length) {
    const [v, d, e] = q.pop()!;
    if (!e) {
      active.delete(v as object);
      continue;
    }
    if (++n > 20000 || d > 48) throw Error("U4 probe resource bound");
    if (typeof v === "string") {
      b += Buffer.byteLength(v);
      if (Buffer.byteLength(v) > 1_048_576) throw Error("U4 probe field bound");
      continue;
    }
    if (!v || typeof v !== "object") continue;
    if (active.has(v as object)) throw Error("U4 probe cyclic input");
    active.add(v as object);
    q.push([v, d, false]);
    const vs = Array.isArray(v) ? v : Object.values(v);
    if (vs.length > 1024) throw Error("U4 probe collection bound");
    for (const y of vs) q.push([y, d + 1, true]);
  }
  if (b > 8_388_608) throw Error("U4 probe byte bound");
};
const freeze = <T>(v: T): T => {
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
const body = (x: any, ...omit: string[]) =>
  Object.fromEntries(Object.entries(x).filter(([k]) => !omit.includes(k)));

export type U4ProbeCase = {
  id: string;
  sourceId: string;
  sourceVersion: string;
  factIds: string[];
  observationIds: string[];
  factResultBindings: Array<{
    factId: string;
    semanticSlotId: string;
    observationIds: string[];
    stdoutJsonPointer: string;
    sourceProjection: "u3-observation-source-value-v1";
    sharedProjectionEquivalenceId: string | null;
  }>;
  runtimeProbeProvenanceId: string;
  sourceBehaviorProvenanceId: string;
  invocation: {
    adapterId: string;
    adapterVersion: string;
    adapterDigest: Sha;
    inputSchemaId: string;
    inputSchemaVersion: string;
    inputCanonicalJson: string;
  };
  bounds: { timeoutMs: number; maxStdoutBytes: number; maxStderrBytes: number };
  repetitions: number;
  expected: {
    allowedTermination: Array<"exited" | "failed" | "timeout">;
    stdoutMode: "exactly-one-canonical-json-value";
    traceWindow: "instant" | "interval" | "trace";
  };
};
export type U4ProbePlan = {
  schema: typeof U4_PROBE_PROTOCOL_SCHEMA;
  fixtureKind: "synthetic";
  denominatorScope: "fixture-local";
  empiricalRegistration: false;
  closureClaim: false;
  campaignId: "organization-universality-2026-v9";
  inventoryDigest: Sha;
  calculusDigest: Sha;
  u3ContractDigest: Sha;
  issuedAt: string;
  executionNotBefore: string;
  executionNotAfter: string;
  plannerAuthorityId: string;
  custodyAuthorityId: string;
  cases: U4ProbeCase[];
  plannerReceipt: string;
  custodyReceipt: string;
};
export type FrozenU4ProbePlan = U4ProbePlan & { digest: Sha };
export type U4ProbeRun = {
  schema: "open-autonomy.u4-probe-run.v1";
  fixtureKind: "synthetic";
  planDigest: Sha;
  caseId: string;
  invocationId: string;
  repetition: number;
  sourceId: string;
  sourceVersion: string;
  runId: string;
  startedAt: string;
  endedAt: string;
  termination: "exited" | "failed" | "timeout";
  exitCode: number | null;
  signal: string | null;
  stdoutBase64: string;
  stderrBase64: string;
  stdoutSha256: Sha;
  stderrSha256: Sha;
  operatorAuthorityId: string;
  custodyAuthorityId: string;
  operatorReceipt: string;
  custodyReceipt: string;
};
export type FrozenU4ProbeRun = U4ProbeRun & { digest: Sha };
export type U4SourceBehaviorTraceJoin = {
  schema: "open-autonomy.u4-source-behavior-trace-join.v1";
  fixtureKind: "synthetic";
  semanticProjectionStatus: "verified-u3-source-projection";
  inventoryDigest: Sha;
  calculusDigest: Sha;
  u3ContractDigest: Sha;
  planDigest: Sha;
  probeRunDigest: Sha;
  caseId: string;
  invocationId: string;
  runId: string;
  sourceId: string;
  factIds: string[];
  observationIds: string[];
  sourceBehaviorProvenanceId: string;
  sourceTraceDigest: Sha;
  sourceEventIds: string[];
  sourceEvidenceIds: string[];
  sourceProvenanceIds: string[];
  observerAuthorityId: string;
  custodyAuthorityId: string;
  observerReceipt: string;
  custodyReceipt: string;
};
export type FrozenU4SourceBehaviorTraceJoin = U4SourceBehaviorTraceJoin & {
  digest: Sha;
};
export type U4ProbeKeys = U4TrustedVerificationInputs;
export const signU4ProbeRecord = (
  keyBase64: string,
  domain: string,
  value: unknown,
) => MAC(Buffer.from(keyBase64, "base64"), domain, value);
export const computeU4ProbeInvocationId = (
  planDigest: Sha,
  caseId: string,
  repetition: number,
) => `inv.${H(C({ planDigest, caseId, repetition })).slice(7, 31)}`;
export const computeU4ProbeCorrelationId = (
  invocationId: string,
  observationId: string,
  sampleId: string,
) => `corr.${H(C({ invocationId, observationId, sampleId })).slice(7, 31)}`;
const digest = (domain: string, x: unknown) => H(`${domain}\0${C(x)}`);

function auth(inventory: FrozenU4SourceInventory, trusted: U4ProbeKeys) {
  const as = new Map(inventory.authorities.map((a) => [a.id, a])),
    ks = new Map<string, Buffer>();
  for (const k of trusted.authorityKeys) {
    const a = as.get(k.authorityId),
      b = Buffer.from(k.keyBase64, "base64");
    if (
      !a ||
      a.ownerId !== k.ownerId ||
      a.role !== k.role ||
      H(b) !== a.verificationKeyDigest ||
      a.verificationKeyDigest !== k.verificationKeyDigest ||
      ks.has(k.authorityId)
    )
      throw Error("U4 probe trusted key join invalid");
    ks.set(k.authorityId, b);
  }
  if (ks.size !== as.size) throw Error("U4 probe trusted key totality invalid");
  return {
    as,
    ok: (aid: string, d: string, x: unknown, s: string) => {
      const k = ks.get(aid);
      if (!k) return false;
      const a = Buffer.from(MAC(k, d, x), "hex"),
        z = Buffer.from(s, "hex");
      return a.length === z.length && timingSafeEqual(a, z);
    },
  };
}
function authority(
  a: ReturnType<typeof auth>,
  producer: string,
  role: string,
  custodian: string,
  inventory: FrozenU4SourceInventory,
) {
  const p = a.as.get(producer),
    c = a.as.get(custodian),
    sourceOwners = new Set(
      inventory.sources.flatMap((s) => [
        s.frontendOwnerId,
        s.sourceImplementerOwnerId,
      ]),
    );
  if (
    !p ||
    p.role !== role ||
    !c ||
    c.role !== "evidence-custodian" ||
    producer === custodian ||
    p.ownerId === c.ownerId ||
    sourceOwners.has(p.ownerId)
  )
    throw Error("U4 probe authority separation invalid");
}

export function freezeU4ProbePlan(
  input: U4ProbePlan,
  inventory: FrozenU4SourceInventory,
  calculus: FrozenU3ObservationCalculus,
  contract: U3TraceEvaluationContract,
  trusted: U4ProbeKeys,
): FrozenU4ProbePlan {
  bounded(input);
  exact(
    input,
    [
      "schema",
      "fixtureKind",
      "denominatorScope",
      "empiricalRegistration",
      "closureClaim",
      "campaignId",
      "inventoryDigest",
      "calculusDigest",
      "u3ContractDigest",
      "issuedAt",
      "executionNotBefore",
      "executionNotAfter",
      "plannerAuthorityId",
      "custodyAuthorityId",
      "cases",
      "plannerReceipt",
      "custodyReceipt",
    ],
    "plan",
  );
  if (
    input.schema !== U4_PROBE_PROTOCOL_SCHEMA ||
    input.fixtureKind !== "synthetic" ||
    input.denominatorScope !== "fixture-local" ||
    input.empiricalRegistration !== false ||
    input.closureClaim !== false ||
    input.campaignId !== "organization-universality-2026-v9" ||
    input.inventoryDigest !== inventory.digest ||
    input.calculusDigest !== calculus.digest ||
    input.u3ContractDigest !== contract.digest ||
    ![input.issuedAt, input.executionNotBefore, input.executionNotAfter].every(
      time,
    ) ||
    Date.parse(input.issuedAt) > Date.parse(input.executionNotBefore) ||
    Date.parse(input.executionNotBefore) > Date.parse(input.executionNotAfter)
  )
    throw Error("U4 probe plan boundary invalid");
  if (!Array.isArray(input.cases) || input.cases.length === 0)
    throw Error("U4 probe cases empty");
  for (const c of input.cases) {
    exact(
      c.invocation,
      [
        "adapterId",
        "adapterVersion",
        "adapterDigest",
        "inputSchemaId",
        "inputSchemaVersion",
        "inputCanonicalJson",
      ],
      "invocation",
    );
    exact(
      c.bounds,
      ["timeoutMs", "maxStdoutBytes", "maxStderrBytes"],
      "bounds",
    );
    exact(
      c.expected,
      ["allowedTermination", "stdoutMode", "traceWindow"],
      "expected",
    );
    if (
      !id(c.id) ||
      !id(c.sourceId) ||
      !id(c.sourceVersion) ||
      !id(c.runtimeProbeProvenanceId) ||
      !id(c.sourceBehaviorProvenanceId) ||
      !id(c.invocation.adapterId) ||
      !id(c.invocation.adapterVersion) ||
      !id(c.invocation.inputSchemaId) ||
      !id(c.invocation.inputSchemaVersion) ||
      !/^sha256:[0-9a-f]{64}$/.test(c.invocation.adapterDigest) ||
      !Number.isSafeInteger(c.repetitions) ||
      !Number.isFinite(c.repetitions) ||
      c.repetitions < 1 ||
      c.repetitions > 64 ||
      Object.values(c.bounds).some(
        (n) =>
          !Number.isSafeInteger(n) ||
          !Number.isFinite(n) ||
          n < 1 ||
          n > 16_777_216,
      ) ||
      c.expected.stdoutMode !== "exactly-one-canonical-json-value" ||
      !["instant", "interval", "trace"].includes(c.expected.traceWindow) ||
      !Array.isArray(c.expected.allowedTermination) ||
      !c.expected.allowedTermination.length ||
      c.expected.allowedTermination.some(
        (x) => !["exited", "failed", "timeout"].includes(x),
      ) ||
      new Set(c.expected.allowedTermination).size !==
        c.expected.allowedTermination.length ||
      C(c.expected.allowedTermination) !==
        C([...c.expected.allowedTermination].sort())
    )
      throw Error("U4 probe nested contract invalid");
  }
  const au = auth(inventory, trusted);
  authority(
    au,
    input.plannerAuthorityId,
    "semantic-inventory-authority",
    input.custodyAuthorityId,
    inventory,
  );
  const sources = new Map(inventory.sources.map((s) => [s.id, s])),
    facts = new Map(inventory.facts.map((f) => [f.id, f])),
    prov = new Map(inventory.provenance.map((p) => [p.id, p])),
    obs = new Map(calculus.observations.map((o) => [o.id, o])),
    adapters = new Map(contract.adapters.map((x) => [x.id, x]));
  let last = "";
  for (const c of input.cases) {
    exact(
      c,
      [
        "id",
        "sourceId",
        "sourceVersion",
        "factIds",
        "observationIds",
        "factResultBindings",
        "runtimeProbeProvenanceId",
        "sourceBehaviorProvenanceId",
        "invocation",
        "bounds",
        "repetitions",
        "expected",
      ],
      "case",
    );
    sorted(c.factIds, "fact ids");
    sorted(c.observationIds, "observation ids");
    if (!Array.isArray(c.factResultBindings))
      throw Error("U4 probe fact result bindings invalid");
    if (C(c.factResultBindings.map(b=>b.factId)) !== C(c.factResultBindings.map(b=>b.factId).sort()))
      throw Error("U4 probe fact result binding order invalid");
    if (c.id <= last) throw Error("U4 probe case order invalid");
    last = c.id;
    const s = sources.get(c.sourceId);
    if (!s || !c.factIds.length || !c.observationIds.length)
      throw Error("U4 probe case invalid");
    if (
      c.sourceVersion !== prov.get(c.runtimeProbeProvenanceId)?.sourceVersion ||
      prov.get(c.runtimeProbeProvenanceId)?.kind !== "runtime-probe" ||
      prov.get(c.runtimeProbeProvenanceId)?.sourceId !== c.sourceId ||
      prov.get(c.sourceBehaviorProvenanceId)?.kind !== "source-behavior" ||
      prov.get(c.sourceBehaviorProvenanceId)?.sourceVersion !==
        c.sourceVersion ||
      prov.get(c.sourceBehaviorProvenanceId)?.sourceId !== c.sourceId
    )
      throw Error("U4 probe provenance invalid");
    const expected = new Set<string>();
    for (const fid of c.factIds) {
      const f = facts.get(fid);
      if (
        !f ||
        f.sourceId !== c.sourceId ||
        !f.provenanceIds.includes(c.runtimeProbeProvenanceId) ||
        !f.provenanceIds.includes(c.sourceBehaviorProvenanceId)
      )
        throw Error("U4 probe fact join invalid");
      f.mandatoryObservationIds.forEach((x) => expected.add(x));
    }
    if (C([...expected].sort()) !== C(c.observationIds))
      throw Error("U4 probe observation denominator invalid");
    const bindingFacts = new Set<string>();
    for (const b of c.factResultBindings) {
      exact(b, ["factId", "semanticSlotId", "observationIds", "stdoutJsonPointer", "sourceProjection", "sharedProjectionEquivalenceId"], "fact result binding");
      sorted(b.observationIds, "fact result observations");
      const f = facts.get(b.factId);
      if (!f || !c.factIds.includes(b.factId) || bindingFacts.has(b.factId) ||
          b.semanticSlotId !== "value" || !/^$|^\/(?:[^~/]|~[01])+(?:\/(?:[^~/]|~[01])+)*$/.test(b.stdoutJsonPointer) ||
          b.sourceProjection !== "u3-observation-source-value-v1" ||
          (b.sharedProjectionEquivalenceId !== null && !id(b.sharedProjectionEquivalenceId)) ||
          C(b.observationIds) !== C(f.mandatoryObservationIds))
        throw Error("U4 probe fact result binding invalid");
      bindingFacts.add(b.factId);
    }
    if (C([...bindingFacts].sort()) !== C(c.factIds))
      throw Error("U4 probe fact result binding totality invalid");
    for (const b of c.factResultBindings) {
      const samePointer = c.factResultBindings.filter(x => x.stdoutJsonPointer === b.stdoutJsonPointer);
      if (samePointer.length > 1 && (b.sharedProjectionEquivalenceId === null || samePointer.some(x => x.sharedProjectionEquivalenceId !== b.sharedProjectionEquivalenceId)))
        throw Error("U4 probe shared projection equivalence invalid");
    }
    for (const oid of c.observationIds) {
      const o = obs.get(oid);
      if (
        !o ||
        !o.applicability.some(
          (x) => x.stratumId === s.stratumId && x.status === "mandatory",
        ) ||
        !calculus.profiles
          .find((p) => p.id === s.profileId)
          ?.observationIds.includes(oid) ||
        o.window !== c.expected.traceWindow
      )
        throw Error("U4 probe observation join invalid");
    }
    const ad = adapters.get(c.invocation.adapterId);
    if (
      !ad ||
      ad.version !== c.invocation.adapterVersion ||
      ad.digest !== c.invocation.adapterDigest
    )
      throw Error("U4 probe adapter join invalid");
    try {
      if (
        C(JSON.parse(c.invocation.inputCanonicalJson)) !==
        c.invocation.inputCanonicalJson
      )
        throw 0;
    } catch {
      throw Error("U4 probe input canonicalization invalid");
    }
  }
  // The preregistration denominator is the inventory, not the planner's
  // selection. Every fact backed by both empirical provenance kinds must occur
  // in exactly one case; omissions and duplicate credit opportunities fail.
  const empiricalFactIds = inventory.facts
    .filter((f) => {
      const kinds = new Set(
        f.provenanceIds.map((pid) => prov.get(pid)?.kind).filter(Boolean),
      );
      return kinds.has("runtime-probe") && kinds.has("source-behavior");
    })
    .map((f) => f.id)
    .sort();
  const plannedFactIds = input.cases.flatMap((c) => c.factIds).sort();
  if (
    C(empiricalFactIds) !== C(plannedFactIds) ||
    new Set(plannedFactIds).size !== plannedFactIds.length
  )
    throw Error("U4 probe fact denominator totality invalid");
  const pbody = body(input, "plannerReceipt", "custodyReceipt");
  if (
    !au.ok(
      input.plannerAuthorityId,
      "u4-probe-plan",
      pbody,
      input.plannerReceipt,
    ) ||
    !au.ok(
      input.custodyAuthorityId,
      "u4-probe-plan-custody",
      {
        ...pbody,
        plannerAuthorityId: input.plannerAuthorityId,
        plannerReceipt: input.plannerReceipt,
      },
      input.custodyReceipt,
    )
  )
    throw Error("U4 probe plan authentication invalid");
  return freeze({
    ...structuredClone(input),
    digest: digest(U4_PROBE_PROTOCOL_SCHEMA, input),
  });
}

export function freezeU4ProbeRun(
  input: U4ProbeRun,
  plan: FrozenU4ProbePlan,
  inventory: FrozenU4SourceInventory,
  trusted: U4ProbeKeys,
): FrozenU4ProbeRun {
  bounded(input);
  exact(
    input,
    [
      "schema",
      "fixtureKind",
      "planDigest",
      "caseId",
      "invocationId",
      "repetition",
      "sourceId",
      "sourceVersion",
      "runId",
      "startedAt",
      "endedAt",
      "termination",
      "exitCode",
      "signal",
      "stdoutBase64",
      "stderrBase64",
      "stdoutSha256",
      "stderrSha256",
      "operatorAuthorityId",
      "custodyAuthorityId",
      "operatorReceipt",
      "custodyReceipt",
    ],
    "run",
  );
  const c = plan.cases.find((x) => x.id === input.caseId);
  if (
    input.schema !== "open-autonomy.u4-probe-run.v1" ||
    input.fixtureKind !== "synthetic" ||
    input.planDigest !== plan.digest ||
    !c ||
    input.sourceId !== c.sourceId ||
    input.sourceVersion !== c.sourceVersion ||
    !Number.isSafeInteger(input.repetition) ||
    input.repetition < 0 ||
    input.repetition >= c.repetitions ||
    input.invocationId !==
      computeU4ProbeInvocationId(plan.digest, c.id, input.repetition) ||
    !time(input.startedAt) ||
    !time(input.endedAt) ||
    Date.parse(input.startedAt) < Date.parse(plan.executionNotBefore) ||
    Date.parse(input.endedAt) > Date.parse(plan.executionNotAfter) ||
    Date.parse(input.startedAt) > Date.parse(input.endedAt) ||
    Date.parse(input.endedAt) - Date.parse(input.startedAt) >
      c.bounds.timeoutMs ||
    !c.expected.allowedTermination.includes(input.termination)
  )
    throw Error("U4 probe run join invalid");
  let out: Buffer, err: Buffer;
  try {
    out = Buffer.from(input.stdoutBase64, "base64");
    err = Buffer.from(input.stderrBase64, "base64");
  } catch {
    throw Error("U4 probe bytes invalid");
  }
  if (
    out.toString("base64") !== input.stdoutBase64 ||
    err.toString("base64") !== input.stderrBase64 ||
    out.length > c.bounds.maxStdoutBytes ||
    err.length > c.bounds.maxStderrBytes ||
    H(out) !== input.stdoutSha256 ||
    H(err) !== input.stderrSha256
  )
    throw Error("U4 probe bytes invalid");
  if (
    input.termination === "exited"
      ? input.exitCode !== 0 || input.signal !== null
      : input.termination === "timeout"
        ? input.exitCode !== null || input.signal !== null
        : !(
            input.signal !== null ||
            (Number.isSafeInteger(input.exitCode) && input.exitCode !== 0)
          )
  )
    throw Error("U4 probe termination invalid");
  // A malformed exited response is retained as an authenticated noncredit
  // terminal by the aggregate bundle; only a trace join may claim semantics.
  const au = auth(inventory, trusted);
  authority(
    au,
    input.operatorAuthorityId,
    "runtime-probe-operator",
    input.custodyAuthorityId,
    inventory,
  );
  const rb = body(input, "operatorReceipt", "custodyReceipt");
  if (
    !au.ok(
      input.operatorAuthorityId,
      "u4-probe-run",
      rb,
      input.operatorReceipt,
    ) ||
    !au.ok(
      input.custodyAuthorityId,
      "u4-probe-run-custody",
      {
        ...rb,
        operatorAuthorityId: input.operatorAuthorityId,
        operatorReceipt: input.operatorReceipt,
      },
      input.custodyReceipt,
    )
  )
    throw Error("U4 probe run authentication invalid");
  return freeze({
    ...structuredClone(input),
    digest: digest(input.schema, input),
  });
}

export function freezeU4SourceBehaviorTraceJoin(
  input: U4SourceBehaviorTraceJoin,
  run: FrozenU4ProbeRun,
  plan: FrozenU4ProbePlan,
  inventory: FrozenU4SourceInventory,
  calculus: FrozenU3ObservationCalculus,
  contract: U3TraceEvaluationContract,
  u3Input: U3TraceEvaluationInput,
  u3Trusted: U3TrustedKeys,
  trusted: U4ProbeKeys,
): FrozenU4SourceBehaviorTraceJoin {
  bounded(input);
  exact(
    input,
    [
      "schema",
      "fixtureKind",
      "semanticProjectionStatus",
      "inventoryDigest",
      "calculusDigest",
      "u3ContractDigest",
      "planDigest",
      "probeRunDigest",
      "caseId",
      "invocationId",
      "runId",
      "sourceId",
      "factIds",
      "observationIds",
      "sourceBehaviorProvenanceId",
      "sourceTraceDigest",
      "sourceEventIds",
      "sourceEvidenceIds",
      "sourceProvenanceIds",
      "observerAuthorityId",
      "custodyAuthorityId",
      "observerReceipt",
      "custodyReceipt",
    ],
    "trace join",
  );
  const c = plan.cases.find((x) => x.id === run.caseId)!;
  const source = inventory.sources.find((x) => x.id === c.sourceId);
  if (
    input.schema !== "open-autonomy.u4-source-behavior-trace-join.v1" ||
    input.fixtureKind !== "synthetic" ||
    input.semanticProjectionStatus !== "verified-u3-source-projection" ||
    input.inventoryDigest !== inventory.digest ||
    input.calculusDigest !== calculus.digest ||
    input.u3ContractDigest !== contract.digest ||
    input.planDigest !== plan.digest ||
    input.probeRunDigest !== run.digest ||
    input.caseId !== c.id ||
    input.invocationId !== run.invocationId ||
    input.runId !== run.runId ||
    input.sourceId !== c.sourceId ||
    C(sorted(input.factIds, "join facts")) !== C(c.factIds) ||
    C(sorted(input.observationIds, "join observations")) !==
      C(c.observationIds) ||
    input.sourceBehaviorProvenanceId !== c.sourceBehaviorProvenanceId ||
    !source ||
    u3Input.profileId !== source.profileId ||
    u3Input.runId !== run.runId ||
    u3Input.source.side !== "source" ||
    u3Input.calculusDigest !== calculus.digest ||
    u3Input.contractDigest !== contract.digest ||
    run.termination !== "exited"
  )
    throw Error("U4 probe trace join invalid");
  verifyU3SourceTraceDigest(u3Input.source, input.sourceTraceDigest);
  let native: unknown;
  try {
    native = JSON.parse(
      Buffer.from(run.stdoutBase64, "base64").toString("utf8"),
    );
  } catch {
    throw Error("U4 probe trace native response invalid");
  }
  sorted(input.sourceEventIds, "join events");
  sorted(input.sourceEvidenceIds, "join evidence");
  sorted(input.sourceProvenanceIds, "join provenance");
  const events = new Map(u3Input.source.events.map((e) => [e.id, e]));
  const completeEventIds = u3Input.source.events
    .filter(
      (e) =>
        e.runId === run.runId &&
        e.correlationId ===
          computeU4ProbeCorrelationId(
            run.invocationId,
            e.observationId,
            e.sampleId,
          ) &&
        c.observationIds.includes(e.observationId),
    )
    .map((e) => e.id)
    .sort();
  if (C(completeEventIds) !== C(input.sourceEventIds))
    throw Error("U4 probe trace event totality invalid");
  if (!input.sourceEventIds.length)
    throw Error("U4 probe trace event coverage invalid");
  const seen = new Set<string>();
  for (const eid of input.sourceEventIds) {
    const e = events.get(eid);
    if (
      !e ||
      e.runId !== run.runId ||
      e.correlationId !==
        computeU4ProbeCorrelationId(
          run.invocationId,
          e.observationId,
          e.sampleId,
        ) ||
      !c.observationIds.includes(e.observationId) ||
      e.adapterId !== c.invocation.adapterId ||
      e.adapterVersion !== c.invocation.adapterVersion ||
      e.adapterDigest !== c.invocation.adapterDigest
    )
      throw Error("U4 probe trace event join invalid");
    const bindings=c.factResultBindings.filter(b=>b.observationIds.includes(e.observationId)),payload=C(projectU3ObservationSourceValue(calculus,e.observationId,e.payload));
    if(!bindings.length||bindings.some(b=>{let selected:any=native;for(const raw of b.stdoutJsonPointer.slice(1).split("/")){if(b.stdoutJsonPointer==="")break;const k=raw.replace(/~1/g,"/").replace(/~0/g,"~");if(selected===null||typeof selected!=="object"||!Object.prototype.hasOwnProperty.call(selected,k))throw Error("U4 probe trace stdout pointer invalid");selected=selected[k]}return C(projectU3ObservationSourceValue(calculus,e.observationId,selected))!==payload}))
      throw Error("U4 probe trace semantic projection mismatch");
    seen.add(e.observationId);
  }
  if (c.observationIds.some((x) => !seen.has(x)))
    throw Error("U4 probe trace observation totality invalid");
  const authenticatedReport = evaluateU3ObservationTrace(
    calculus,
    contract,
    u3Input,
    u3Trusted,
  );
  verifyU3EvaluationReport(
    authenticatedReport,
    calculus,
    contract,
    u3Input,
    u3Trusted,
  );
  const creditable = new Set([
    "preserved/equivalent",
    "preserved/refinement",
    "preserved/abstraction",
    "permitted-variance",
  ]);
  for (const observationId of c.observationIds) {
    const results = authenticatedReport.results.filter(
      (r) => r.observationId === observationId,
    );
    if (!results.length || results.some((r) => !creditable.has(r.status)))
      throw Error("U4 probe trace preservation credit invalid");
  }
  const joinedEvents = input.sourceEventIds.map((eid) => events.get(eid)!);
  const exactEvidence = [
      ...new Set(joinedEvents.map((e) => e.evidenceId)),
    ].sort(),
    exactProv = [...new Set(joinedEvents.map((e) => e.provenanceId))].sort();
  for (const e of joinedEvents) {
    if (
      !u3Input.evidence.some((x) => x.id === e.evidenceId && x.eventId === e.id)
    )
      throw Error("U4 probe trace evidence event join invalid");
    if (!u3Input.provenance.some((x) => x.id === e.provenanceId))
      throw Error("U4 probe trace provenance event join invalid");
  }
  if (
    C(exactEvidence) !== C(input.sourceEvidenceIds) ||
    C(exactProv) !== C(input.sourceProvenanceIds)
  )
    throw Error("U4 probe trace evidence totality invalid");
  const au = auth(inventory, trusted);
  authority(
    au,
    input.observerAuthorityId,
    "source-behavior-observer",
    input.custodyAuthorityId,
    inventory,
  );
  const op = au.as.get(run.operatorAuthorityId)!,
    ob = au.as.get(input.observerAuthorityId)!;
  if (op.ownerId === ob.ownerId)
    throw Error("U4 probe observer independence invalid");
  const jb = body(input, "observerReceipt", "custodyReceipt");
  if (
    !au.ok(
      input.observerAuthorityId,
      "u4-source-behavior-trace-join",
      jb,
      input.observerReceipt,
    ) ||
    !au.ok(
      input.custodyAuthorityId,
      "u4-source-behavior-trace-join-custody",
      {
        ...jb,
        observerAuthorityId: input.observerAuthorityId,
        observerReceipt: input.observerReceipt,
      },
      input.custodyReceipt,
    )
  )
    throw Error("U4 probe trace authentication invalid");
  return freeze({
    ...structuredClone(input),
    digest: digest(input.schema, input),
  });
}

export function assertU4ProbeRunTotality(
  plan: FrozenU4ProbePlan,
  runs: FrozenU4ProbeRun[],
) {
  const expected = plan.cases
      .flatMap((c) =>
        Array.from({ length: c.repetitions }, (_, i) =>
          computeU4ProbeInvocationId(plan.digest, c.id, i),
        ),
      )
      .sort(),
    actual = runs.map((r) => r.invocationId).sort();
  if (C(expected) !== C(actual) || new Set(actual).size !== actual.length)
    throw Error("U4 probe repetition totality invalid");
}

export type U4VerifiedProbeBundle = {
  schema: "open-autonomy.u4-verified-probe-bundle.v1";
  fixtureKind: "synthetic";
  denominatorScope: "fixture-local";
  empiricalRegistration: false;
  closureClaim: false;
  inventoryDigest: Sha;
  calculusDigest: Sha;
  u3ContractDigest: Sha;
  u3TrustAnchorDigest: Sha;
  materialDigests: Sha[];
  plan: FrozenU4ProbePlan;
  executions: Array<{
    invocationId: string;
    disposition: "credited" | "noncredit";
    noncreditReason: "failed" | "timeout" | "malformed-output" | null;
    run: FrozenU4ProbeRun;
    join: FrozenU4SourceBehaviorTraceJoin | null;
    u3InputDigest: Sha | null;
    u3ReportDigest: Sha | null;
  }>;
};
export type FrozenU4VerifiedProbeBundle = U4VerifiedProbeBundle & {
  digest: Sha;
};
export type U4ProbeVerificationMaterial = {
  invocationId: string;
  u3Input: U3TraceEvaluationInput;
  u3Trusted: U3TrustedKeys;
};

export const computeU4ProbeMaterialDigest = (
  material: U4ProbeVerificationMaterial,
) => digest("open-autonomy.u4-probe-verification-material.v1", material);

export const computeU4SyntheticU3TrustAnchorDigest = (
  contract: U3TraceEvaluationContract,
  u3Trusted: U3TrustedKeys,
) =>
  H(
    `open-autonomy.u4-synthetic-u3-trust-anchor.v1\0${C({ contract, u3Trusted })}`,
  );

// Fixture-local trust registrations are compiled independently of submitted
// probe evidence. Real/empirical trust registration is an external campaign.
export const U4_SYNTHETIC_U3_TRUST_ANCHOR_DIGESTS = Object.freeze([
  "sha256:5f17e3a9bb6fb1f00e70e65ed40b23b1efe21e3ec0f4211ba28473d206fac35c",
  "sha256:4f520d5248260091b6b5d18246a78c1b4bd14a7db0ac092e9889b56976b9257d",
  "sha256:710aeb9ade7748050dce7a1b0ce8753dc6d3d3c769fac7cf91f25d1311c860ef",
  "sha256:b2aa37c63b637a907e0cbb2cdef45f8e5ea7a7033eb49c8aade005dc071d5b54",
] as const);

export function freezeU4VerifiedProbeBundle(
  input: U4VerifiedProbeBundle,
  materials: U4ProbeVerificationMaterial[],
  inventory: FrozenU4SourceInventory,
  calculus: FrozenU3ObservationCalculus,
  contract: U3TraceEvaluationContract,
  trusted: U4ProbeKeys,
  registry: FrozenU4SyntheticSourceRegistry,
): FrozenU4VerifiedProbeBundle {
  bounded(input);
  bounded(materials);
  const verifiedCalculus = verifyFrozenU3ObservationCalculus(calculus, {
      requireFixtureDigest: false,
    }),
    verifiedInventory = verifyFrozenU4SourceInventory(
      inventory,
      verifiedCalculus,
      registry,
      trusted,
    );
  if (
    verifiedCalculus.digest !== calculus.digest ||
    verifiedInventory.digest !== inventory.digest
  )
    throw Error("U4 probe verified boundary mismatch");
  exact(
    input,
    [
      "schema",
      "fixtureKind",
      "denominatorScope",
      "empiricalRegistration",
      "closureClaim",
      "inventoryDigest",
      "calculusDigest",
      "u3ContractDigest",
      "u3TrustAnchorDigest",
      "materialDigests",
      "plan",
      "executions",
    ],
    "verified bundle",
  );
  if (
    input.schema !== "open-autonomy.u4-verified-probe-bundle.v1" ||
    input.fixtureKind !== "synthetic" ||
    input.denominatorScope !== "fixture-local" ||
    input.empiricalRegistration !== false ||
    input.closureClaim !== false ||
    input.inventoryDigest !== inventory.digest ||
    input.calculusDigest !== calculus.digest ||
    input.u3ContractDigest !== contract.digest
  )
    throw Error("U4 probe bundle boundary invalid");
  const { digest: _pd, ...planBody } = input.plan;
  const plan = freezeU4ProbePlan(
    planBody as U4ProbePlan,
    inventory,
    calculus,
    contract,
    trusted,
  );
  if (plan.digest !== input.plan.digest)
    throw Error("U4 probe bundle plan replay invalid");
  if (!Array.isArray(input.executions) || !input.executions.length)
    throw Error("U4 probe bundle executions empty");
  const material = new Map<string, U4ProbeVerificationMaterial>();
  if (!Array.isArray(materials))
    throw Error("U4 probe bundle materials invalid");
  for (const m of materials) {
    exact(m, ["invocationId", "u3Input", "u3Trusted"], "bundle material");
    if (!id(m.invocationId) || material.has(m.invocationId))
      throw Error("U4 probe bundle material identity invalid");
    material.set(m.invocationId, m);
  }
  const actualMaterialDigests = materials
    .map(computeU4ProbeMaterialDigest)
    .sort();
  const trustPolicies = [
    ...new Set(
      (materials.length ? materials : [{ u3Trusted: { keys: {} } }]).map((m) =>
        computeU4SyntheticU3TrustAnchorDigest(contract, m.u3Trusted),
      ),
    ),
  ];
  if (
    !Array.isArray(input.materialDigests) ||
    input.materialDigests.some((x) => !/^sha256:[0-9a-f]{64}$/.test(x)) ||
    new Set(input.materialDigests).size !== input.materialDigests.length ||
    C(input.materialDigests) !== C(actualMaterialDigests)
  )
    throw Error("U4 probe bundle material topology invalid");
  if (
    trustPolicies.length !== 1 ||
    input.u3TrustAnchorDigest !== trustPolicies[0] ||
    !U4_SYNTHETIC_U3_TRUST_ANCHOR_DIGESTS.includes(trustPolicies[0] as any)
  )
    throw Error("U4 probe independent U3 trust anchor invalid");
  const runs: FrozenU4ProbeRun[] = [],
    seen = new Set<string>(),
    runIds = new Set<string>();
  let previous = "";
  for (const execution of input.executions) {
    exact(
      execution,
      [
        "invocationId",
        "disposition",
        "noncreditReason",
        "run",
        "join",
        "u3InputDigest",
        "u3ReportDigest",
      ],
      "bundle execution",
    );
    if (
      !id(execution.invocationId) ||
      execution.invocationId <= previous ||
      seen.has(execution.invocationId) ||
      execution.run.invocationId !== execution.invocationId
    )
      throw Error("U4 probe bundle execution order invalid");
    previous = execution.invocationId;
    seen.add(execution.invocationId);
    const { digest: _rd, ...runBody } = execution.run;
    const run = freezeU4ProbeRun(
      runBody as U4ProbeRun,
      plan,
      inventory,
      trusted,
    );
    if (run.digest !== execution.run.digest)
      throw Error("U4 probe bundle run replay invalid");
    if (runIds.has(run.runId))
      throw Error("U4 probe bundle run identity invalid");
    runIds.add(run.runId);
    runs.push(run);
    if (execution.disposition === "credited") {
      if (
        execution.noncreditReason !== null ||
        !execution.join ||
        run.termination !== "exited"
      )
        throw Error("U4 probe bundle credited terminal invalid");
      const m = material.get(execution.invocationId);
      if (!m) throw Error("U4 probe bundle material missing");
      let parsed: unknown;
      try {
        const text = Buffer.from(run.stdoutBase64, "base64").toString("utf8");
        parsed = JSON.parse(text);
        if (C(parsed) !== text) throw 0;
      } catch {
        throw Error("U4 probe bundle credited output invalid");
      }
      const { digest: _jd, ...joinBody } = execution.join;
      const join = freezeU4SourceBehaviorTraceJoin(
        joinBody as U4SourceBehaviorTraceJoin,
        run,
        plan,
        inventory,
        calculus,
        contract,
        m.u3Input,
        m.u3Trusted,
        trusted,
      );
      const report = evaluateU3ObservationTrace(
        calculus,
        contract,
        m.u3Input,
        m.u3Trusted,
      );
      if (
        join.digest !== execution.join.digest ||
        execution.u3InputDigest !==
          digest("open-autonomy.u4-probe-u3-input.v1", m.u3Input) ||
        execution.u3ReportDigest !== report.digest
      )
        throw Error("U4 probe bundle credited replay invalid");
      material.delete(execution.invocationId);
    } else {
      if (
        execution.join !== null ||
        execution.u3InputDigest !== null ||
        execution.u3ReportDigest !== null ||
        material.has(execution.invocationId)
      )
        throw Error("U4 probe bundle noncredit evidence invalid");
      const malformed =
        run.termination === "exited" &&
        (() => {
          try {
            const t = Buffer.from(run.stdoutBase64, "base64").toString("utf8");
            return C(JSON.parse(t)) !== t;
          } catch {
            return true;
          }
        })();
      const expected =
        run.termination === "failed"
          ? "failed"
          : run.termination === "timeout"
            ? "timeout"
            : malformed
              ? "malformed-output"
              : null;
      if (!expected || execution.noncreditReason !== expected)
        throw Error("U4 probe bundle noncredit terminal invalid");
    }
  }
  assertU4ProbeRunTotality(plan, runs);
  if (material.size) throw Error("U4 probe bundle surplus material invalid");
  return freeze({
    ...structuredClone(input),
    digest: digest(input.schema, input),
  });
}
