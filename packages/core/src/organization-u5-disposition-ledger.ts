import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { canonicalSemanticJson as C } from "./organization-canonical";
import {
  verifyFrozenU4SourceInventory,
  type FrozenU4SourceInventory,
  type FrozenU4SyntheticSourceRegistry,
  type U4TrustedVerificationInputs,
} from "./organization-u4-source-inventory";
import type { FrozenU3ObservationCalculus } from "./organization-u3-observation-calculus";
import { verifyU4ClosureAttestation } from "./organization-u4-closure-attestation";
import {
  U5_SYNTHETIC_CREDIT_POLICY,
  verifyU5CommittedBoundary,
} from "./organization-u5-credit-policy";
type Sha = `sha256:${string}`;
const S = "open-autonomy.u5-disposition-ledger.v1",
  P = "open-autonomy.u5-credit-policy.v1",
  H = (x: string) =>
    `sha256:${createHash("sha256").update(x).digest("hex")}` as Sha;
const EVIDENCE_KEY = Buffer.from("u5-evidence-authority-key-32bytes"),
  CUSTODY_KEY = Buffer.from("u5-evidence-custodian-key-32byt"),
  CLASSIFIER_KEY = Buffer.from("u5-extension-classifier-key-32byte"),
  ORACLE_KEY = Buffer.from("u5-semantic-oracle-fixed-key-32byte"),
  ROW_KEY = Buffer.from("u5-ledger-row-signer-key-32bytes!");
const mac = (key: Buffer, domain: string, value: any) =>
  createHmac("sha256", key)
    .update(domain)
    .update("\0")
    .update(C(value))
    .digest("hex");
const authenticate = (actual: any, expected: string, name: string) => {
  if (typeof actual !== "string" || !/^[0-9a-f]{64}$/.test(actual))
    throw Error(`U5 ${name} authentication invalid`);
  const a = Buffer.from(actual, "hex"),
    e = Buffer.from(expected, "hex");
  if (a.length !== e.length || !timingSafeEqual(a, e))
    throw Error(`U5 ${name} authentication invalid`);
};
export const authenticateU5SyntheticEvidence = (body: any) => {
  const payloadBytes = C(body.payload),
    payloadDigest = H(payloadBytes),
    classifierReceipt =
      body.disposition === "extension"
        ? mac(CLASSIFIER_KEY, "u5-extension-classifier", {
            sourceId: body.sourceId,
            factId: body.factId,
            evidenceVersion: body.evidenceVersion,
            signatureDomain: body.signatureDomain,
            issuedAt: body.issuedAt,
            payloadBytes,
          })
        : null,
    signedBody = { ...body, payloadBytes, payloadDigest, classifierReceipt },
    authorityReceipt = mac(EVIDENCE_KEY, "u5-evidence", signedBody);
  return {
    ...signedBody,
    authorityReceipt,
    custodyReceipt: mac(CUSTODY_KEY, "u5-evidence-custody", {
      body: signedBody,
      authorityReceipt,
    }),
  };
};
export const authenticateU5SyntheticLedgerRow = (body: any) => ({
  ...body,
  rowReceipt: mac(ROW_KEY, "u5-ledger-row", body),
});
const ORACLE_OWNER = "u5-independent-semantic-oracle";
export const createU5SyntheticSemanticOracleRegistry = (
  inventory: any,
  calculus: any,
) =>
  freeze(
    inventory.facts.map((fact: any) => {
      const observationIds = [...fact.mandatoryObservationIds].sort(),
        events = observationIds.map((observationId: string) => ({
          observationId,
          value: "observed",
        })),
        trace = observationIds.map((observationId: string) => ({
          observationId,
          value: true,
        })),
        request = { factId: fact.id, operation: "invoke" },
        response = { factId: fact.id, accepted: true, terminal: true };
      const data = {
        factBytes: C({
          factId: fact.id,
          semantic: fact.semantic,
          default: fact.default,
        }),
        denotation: fact.denotation,
        nativePath: fact.nativePath,
        mandatoryObservationIds: [...fact.mandatoryObservationIds],
        extensionClass: fact.semantic.extensionClass,
        opaqueVersion: fact.semantic.opaqueVersion,
        namespace: `${fact.sourceId}/${fact.semantic.extensionClass}/${fact.semantic.opaqueVersion}`,
        capability: fact.semantic.to,
        semanticDomain: fact.semantic.domain,
        targetArtifact: {
          bytes: C({
            factId: fact.id,
            semantic: fact.semantic,
            default: fact.default,
          }),
          execution: fact.denotation,
        },
        premiseValues: [
          fact.denotation.slice(
            0,
            Math.max(1, Math.floor(fact.denotation.length / 2)),
          ),
          fact.denotation.slice(
            Math.max(1, Math.floor(fact.denotation.length / 2)),
          ),
        ],
        loweringResult: {
          targetPath: fact.nativePath,
          observations: observationIds.map((observationId: string) => ({
            observationId,
            sourceValue: true,
            targetValue: true,
          })),
        },
        opaqueExecution: { request, events, response },
        sourceTrace: trace,
        abstractTrace: structuredClone(trace),
        capabilityUniverse: [fact.semantic.to],
        capabilityProbe: { capability: fact.semantic.to, supported: false },
        substrateCandidates: [
          {
            id: "candidate.from",
            assignments: { [fact.semantic.domain]: fact.semantic.from },
          },
          {
            id: "candidate.to",
            assignments: { [fact.semantic.domain]: fact.semantic.to },
          },
        ],
      };
      const body = {
        id: `oracle.${fact.id}`,
        factId: fact.id,
        sourceId: fact.sourceId,
        inventoryDigest: inventory.digest,
        calculusDigest: calculus.digest,
        oracleOwnerId: ORACLE_OWNER,
        registeredAt: "2026-07-17T23:00:00.000Z",
        data,
        digest: H(C(data)),
      };
      return { ...body, receipt: mac(ORACLE_KEY, "u5-semantic-oracle", body) };
    }),
  );
export const U5_DISPOSITIONS = [
  "preserved",
  "derived",
  "lowered",
  "extension",
  "opaque",
  "abstracted",
  "unsupported",
  "inexpressible",
] as const;
export const U5_EXTENSION_SUBSTRATA = [
  "portable-standardized",
  "provider-neutral-single-implementation",
  "provider-local",
] as const;
const CAN = new Set(["preserved", "derived", "lowered"]),
  K: any = {
    preserved: "preservation-proof",
    derived: "derivation-proof",
    lowered: "lowering-proof",
    extension: "extension-proof",
    opaque: "interoperability-proof",
    abstracted: "observational-indistinguishability-proof",
    unsupported: "unsupported-diagnostic",
    inexpressible: "incompatibility-core",
  };
const validatePayload = (
  record: any,
  fact: any,
  calculus: any,
  oracle: any,
) => {
  if (
    !oracle ||
    oracle.data.factBytes !==
      C({ factId: fact.id, semantic: fact.semantic, default: fact.default })
  )
    throw Error("U5 semantic oracle join invalid");
  const p = record.payload;
  switch (record.disposition) {
    case "preserved": {
      exact(
        p,
        ["sourceBytes", "targetBytes", "sourceDigest", "targetDigest"],
        "preservation payload",
      );
      const bytes = C({
        factId: fact.id,
        semantic: fact.semantic,
        default: fact.default,
      });
      if (
        p.sourceBytes === bytes &&
        p.targetBytes === oracle.data.targetArtifact.bytes &&
        p.sourceDigest === H(bytes) &&
        p.targetDigest === H(oracle.data.targetArtifact.bytes)
      )
        return;
      break;
    }
    case "derived": {
      exact(
        p,
        ["premiseFactDigest", "nodes", "outputNodeId", "outputValue"],
        "derivation payload",
      );
      const factBytes = C({
        factId: fact.id,
        semantic: fact.semantic,
        default: fact.default,
      });
      if (
        p.premiseFactDigest !== H(factBytes) ||
        !Array.isArray(p.nodes) ||
        p.nodes.length < 2
      )
        break;
      const values = new Map<string, string>();
      let operated = false;
      for (const n of p.nodes) {
        exact(n, ["id", "op", "inputs", "value"], "derivation node");
        if (
          typeof n.id !== "string" ||
          values.has(n.id) ||
          !Array.isArray(n.inputs) ||
          n.inputs.some((id: any) => !values.has(id))
        )
          break;
        if (
          n.op === "literal" &&
          n.inputs.length === 0 &&
          typeof n.value === "string" &&
          n.value !== fact.denotation
        )
          values.set(n.id, n.value);
        else if (
          n.op === "concat" &&
          n.inputs.length >= 2 &&
          n.value === null
        ) {
          values.set(
            n.id,
            n.inputs.map((id: string) => values.get(id)!).join(""),
          );
          operated = true;
        } else break;
      }
      if (
        operated &&
        C(
          p.nodes
            .filter((n: any) => n.op === "literal")
            .map((n: any) => n.value),
        ) === C(oracle.data.premiseValues) &&
        values.size === p.nodes.length &&
        values.get(p.outputNodeId) === p.outputValue &&
        p.outputValue === oracle.data.targetArtifact.execution
      )
        return;
      break;
    }
    case "lowered": {
      exact(
        p,
        ["map", "losses", "mandatoryObservations", "opaqueFallback"],
        "lowering payload",
      );
      if (
        Array.isArray(p.map) &&
        p.map.length === 1 &&
        C(p.map[0]) ===
          C({ nativePath: fact.nativePath, targetPath: fact.nativePath }) &&
        Array.isArray(p.losses) &&
        p.losses.length === 0 &&
        p.opaqueFallback === null &&
        Array.isArray(p.mandatoryObservations) &&
        C(p.mandatoryObservations.map((x: any) => x.observationId).sort()) ===
          C([...fact.mandatoryObservationIds].sort()) &&
        C(p.mandatoryObservations) ===
          C(oracle.data.loweringResult.observations) &&
        !p.mandatoryObservations.some(
          (x: any) => x.sourceValue !== x.targetValue,
        )
      )
        return;
      break;
    }
    case "extension": {
      exact(
        p,
        ["extensionClass", "opaqueVersion", "namespace", "classification"],
        "extension payload",
      );
      if (
        p.extensionClass === oracle.data.extensionClass &&
        p.opaqueVersion === oracle.data.opaqueVersion &&
        U5_EXTENSION_SUBSTRATA.includes(p.classification) &&
        p.namespace === oracle.data.namespace
      )
        return;
      break;
    }
    case "opaque": {
      exact(
        p,
        [
          "request",
          "mandatoryObservationIds",
          "events",
          "response",
          "traceDigest",
        ],
        "opaque payload",
      );
      const ids = [...fact.mandatoryObservationIds].sort();
      if (
        Array.isArray(p.events) &&
        C([...p.mandatoryObservationIds].sort()) === C(ids) &&
        C(p.events.map((x: any) => x.observationId).sort()) === C(ids) &&
        p.request?.factId === fact.id &&
        p.response?.factId === fact.id &&
        p.response?.accepted === true &&
        p.response?.terminal === true &&
        C({ request: p.request, events: p.events, response: p.response }) ===
          C(oracle.data.opaqueExecution) &&
        p.traceDigest ===
          H(C({ request: p.request, events: p.events, response: p.response }))
      )
        return;
      break;
    }
    case "abstracted": {
      exact(
        p,
        [
          "preregisteredObservationIds",
          "preregistrationDigest",
          "sourceTrace",
          "abstractTrace",
        ],
        "abstraction payload",
      );
      const ids = [...fact.mandatoryObservationIds].sort();
      if (
        C([...p.preregisteredObservationIds].sort()) === C(ids) &&
        p.preregistrationDigest ===
          H(
            C({
              factId: fact.id,
              observationIds: ids,
              calculusDigest: calculus.digest,
            }),
          ) &&
        C(p.sourceTrace) === C(oracle.data.sourceTrace) &&
        C(p.abstractTrace) === C(oracle.data.abstractTrace) &&
        C(p.sourceTrace) === C(p.abstractTrace) &&
        C(p.sourceTrace.map((x: any) => x.observationId).sort()) === C(ids)
      )
        return;
      break;
    }
    case "unsupported": {
      exact(
        p,
        ["diagnosticCode", "attemptedCapability", "observationIds"],
        "unsupported payload",
      );
      if (
        p.diagnosticCode === "capability-absent" &&
        oracle.data.capabilityProbe.supported === false &&
        oracle.data.capabilityUniverse.includes(p.attemptedCapability) &&
        p.attemptedCapability === fact.semantic.to &&
        C([...p.observationIds].sort()) ===
          C([...fact.mandatoryObservationIds].sort())
      )
        return;
      break;
    }
    case "inexpressible": {
      exact(
        p,
        ["candidateCapabilities", "evaluations", "minimalUnsatisfiedCore"],
        "inexpressible payload",
      );
      const a = p.minimalUnsatisfiedCore?.[0],
        b = p.minimalUnsatisfiedCore?.[1],
        satisfies = (candidate: any, clauses: any[]) =>
          clauses.every((c) => candidate.assignments?.[c.key] === c.value);
      if (
        Array.isArray(p.candidateCapabilities) &&
        C(p.candidateCapabilities) === C(oracle.data.substrateCandidates) &&
        p.candidateCapabilities.length &&
        new Set(p.candidateCapabilities.map((c: any) => c.id)).size ===
          p.candidateCapabilities.length &&
        Array.isArray(p.evaluations) &&
        p.evaluations.length === p.candidateCapabilities.length &&
        new Set(p.evaluations.map((e: any) => e.candidateId)).size ===
          p.evaluations.length &&
        C(p.evaluations.map((e: any) => e.candidateId).sort()) ===
          C(p.candidateCapabilities.map((c: any) => c.id).sort()) &&
        p.evaluations.every((e: any) => {
          const candidate = p.candidateCapabilities.find(
              (c: any) => c.id === e.candidateId,
            ),
            unsatisfied = p.minimalUnsatisfiedCore
              .map((c: any, i: number) =>
                candidate?.assignments?.[c.key] === c.value ? null : i,
              )
              .filter((i: any) => i !== null);
          return (
            candidate &&
            e.feasible === satisfies(candidate, p.minimalUnsatisfiedCore) &&
            C(e.unsatisfiedClauseIndexes) === C(unsatisfied)
          );
        }) &&
        p.minimalUnsatisfiedCore?.length === 2 &&
        a?.key === fact.semantic.domain &&
        b?.key === a.key &&
        a.value === fact.semantic.from &&
        b.value === fact.semantic.to &&
        a.value !== b.value &&
        !p.candidateCapabilities.some((c: any) =>
          satisfies(c, p.minimalUnsatisfiedCore),
        ) &&
        [0, 1].every((drop) =>
          p.candidateCapabilities.some((c: any) =>
            satisfies(
              c,
              p.minimalUnsatisfiedCore.filter(
                (_: any, i: number) => i !== drop,
              ),
            ),
          ),
        )
      )
        return;
      break;
    }
  }
  throw Error(`U5 ${record.disposition} evidence semantics invalid`);
};
const exact = (x: any, k: string[], n: string) => {
    if (
      !x ||
      typeof x !== "object" ||
      Array.isArray(x) ||
      C(Object.keys(x).sort()) !== C([...k].sort())
    )
      throw Error(`U5 ${n} schema invalid`);
  },
  eq = (a: any, b: any, n: string) => {
    if (C(a) !== C(b)) throw Error(`U5 ${n} invalid`);
  },
  sha = (x: any) => typeof x === "string" && /^sha256:[0-9a-f]{64}$/.test(x),
  freeze = <T>(v: T): T => {
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
function bound(v: any) {
  let n = 0,
    z = 0;
  const a = new Set<any>(),
    q: any[] = [[v, 0]];
  while (q.length) {
    const [x, e] = q.pop();
    if (e) {
      a.delete(x);
      continue;
    }
    if (++n > 50000) throw Error("U5 resource bound");
    if (typeof x === "string") {
      z += Buffer.byteLength(x);
      if (x.length > 100000) throw Error("U5 field bound");
    } else if (x && typeof x === "object") {
      if (a.has(x)) throw Error("U5 cyclic input");
      a.add(x);
      q.push([x, 1], ...Object.values(x).map((y) => [y, 0]));
    }
  }
  if (z > 4e6) throw Error("U5 resource bound");
}
export function digestU5CreditPolicy(v: any) {
  const { digest: _, ...b } = v;
  void _;
  return H(`${P}\0${C(b)}`);
}
export function freezeU5CreditPolicy(v: any) {
  bound(v);
  exact(
    v,
    [
      "schema",
      "fixtureKind",
      "empiricalRegistration",
      "promotionAllowed",
      "policyOwnerId",
      "dispositions",
      "canonicalEligible",
      "extensionSubstrata",
      "weightsByCriticality",
    ],
    "policy",
  );
  if (
    v.schema !== P ||
    v.fixtureKind !== "synthetic" ||
    v.empiricalRegistration ||
    v.promotionAllowed ||
    typeof v.policyOwnerId !== "string" ||
    !v.policyOwnerId ||
    C(v.dispositions) !== C(U5_DISPOSITIONS) ||
    C(v.canonicalEligible) !== C(["preserved", "derived", "lowered"]) ||
    C(v.extensionSubstrata) !== C(U5_EXTENSION_SUBSTRATA)
  )
    throw Error("U5 policy boundary invalid");
  exact(v.weightsByCriticality, ["critical", "noncritical"], "weights");
  if (
    !Number.isSafeInteger(v.weightsByCriticality.critical) ||
    !Number.isSafeInteger(v.weightsByCriticality.noncritical) ||
    v.weightsByCriticality.critical <= 0 ||
    v.weightsByCriticality.noncritical <= 0
  )
    throw Error("U5 policy weight invalid");
  return freeze({ ...structuredClone(v), digest: digestU5CreditPolicy(v) });
}
export function verifyFrozenU5CreditPolicy(v: any) {
  bound(v);
  exact(
    v,
    [
      "schema",
      "fixtureKind",
      "empiricalRegistration",
      "promotionAllowed",
      "policyOwnerId",
      "dispositions",
      "canonicalEligible",
      "extensionSubstrata",
      "weightsByCriticality",
      "digest",
    ],
    "frozen policy",
  );
  const { digest, ...body } = v,
    f = freezeU5CreditPolicy(body);
  if (digest !== f.digest) throw Error("U5 policy digest invalid");
  return f;
}
export const createU5SyntheticCreditPolicy = () =>
  freezeU5CreditPolicy({
    schema: P,
    fixtureKind: "synthetic",
    empiricalRegistration: false,
    promotionAllowed: false,
    policyOwnerId: "u5-policy-owner",
    dispositions: [...U5_DISPOSITIONS],
    canonicalEligible: ["preserved", "derived", "lowered"],
    extensionSubstrata: [...U5_EXTENSION_SUBSTRATA],
    weightsByCriticality: { critical: 2, noncritical: 1 },
  });
export function digestU5DispositionLedger(v: any) {
  const { digest: _, ...b } = v;
  void _;
  return H(`${S}\0${C(b)}`);
}
export function freezeU5DispositionLedger(
  input: any,
  inventoryInput: FrozenU4SourceInventory,
  calculus: FrozenU3ObservationCalculus,
  registry: FrozenU4SyntheticSourceRegistry,
  trusted: U4TrustedVerificationInputs,
  attestationInput: any,
  policyInput: any,
  { root = process.cwd() } = {},
) {
  bound(input);
  const inventory = verifyFrozenU4SourceInventory(
      inventoryInput,
      calculus,
      registry,
      trusted,
    ),
    attestation = verifyU4ClosureAttestation(attestationInput, { root }),
    policy = U5_SYNTHETIC_CREDIT_POLICY;
  verifyU5CommittedBoundary(inventory, attestation, policy, { root });
  if (C(policyInput) !== C(policy)) throw Error("U5 alternate policy invalid");
  exact(
    input,
    [
      "schema",
      "fixtureKind",
      "denominatorScope",
      "empiricalRegistration",
      "closureClaim",
      "assurancePromotionAllowed",
      "inventoryDigest",
      "closureAttestationDigest",
      "policyDigest",
      "semanticOracleRegistry",
      "evidenceOwners",
      "evidenceRegistry",
      "ledger",
      "accounting",
    ],
    "ledger root",
  );
  if (
    input.schema !== S ||
    input.fixtureKind !== "synthetic" ||
    input.denominatorScope !== "fixture-local" ||
    input.empiricalRegistration ||
    input.closureClaim ||
    input.assurancePromotionAllowed ||
    input.inventoryDigest !== inventory.digest ||
    input.closureAttestationDigest !== attestation.digest ||
    input.policyDigest !== policy.digest
  )
    throw Error("U5 boundary invalid");
  if (
    !Array.isArray(input.evidenceOwners) ||
    !Array.isArray(input.semanticOracleRegistry) ||
    !Array.isArray(input.evidenceRegistry) ||
    !Array.isArray(input.ledger) ||
    input.ledger.length !== inventory.facts.length ||
    input.evidenceRegistry.length !== inventory.facts.length ||
    input.semanticOracleRegistry.length !== inventory.facts.length ||
    input.evidenceOwners.length !== inventory.facts.length
  )
    throw Error("U5 denominator totality invalid");
  const facts = new Map(inventory.facts.map((f: any) => [f.id, f])),
    owners = new Map<string, any>();
  const expectedOracle = createU5SyntheticSemanticOracleRegistry(
    inventory,
    calculus,
  );
  if (C(input.semanticOracleRegistry) !== C(expectedOracle))
    throw Error("U5 semantic oracle authentication or denominator invalid");
  const oracles = new Map(
    expectedOracle.map((record: any) => [record.id, record]),
  );
  const protectedOwners = new Set([
    policy.policyAuthority.ownerId,
    policy.custodian.ownerId,
    ...policy.protectedOwners,
    ORACLE_OWNER,
  ]);
  for (const o of input.evidenceOwners) {
    exact(o, ["id", "factId", "ownerId"], "evidence owner");
    if (
      typeof o.id !== "string" ||
      typeof o.ownerId !== "string" ||
      owners.has(o.id) ||
      protectedOwners.has(o.ownerId) ||
      [...owners.values()].some((prior) => prior.ownerId === o.ownerId)
    )
      throw Error("U5 evidence owner alias or surplus invalid");
    owners.set(o.id, o);
  }
  const evidence = new Map<string, any>(),
    evidenceActors = new Set<string>([
      ...protectedOwners,
      ...[...owners.values()].map((owner) => owner.ownerId),
    ]);
  for (const record of input.evidenceRegistry) {
    exact(
      record,
      [
        "id",
        "factId",
        "sourceId",
        "evidenceVersion",
        "signatureDomain",
        "disposition",
        "kind",
        "dependencies",
        "payload",
        "payloadBytes",
        "payloadDigest",
        "oracleId",
        "oracleDigest",
        "classifierOwnerId",
        "classifierReceipt",
        "evidenceOwnerId",
        "authorityOwnerId",
        "custodianOwnerId",
        "issuedAt",
        "authorityReceipt",
        "custodyReceipt",
      ],
      "evidence record",
    );
    const { authorityReceipt, custodyReceipt, ...body } = record;
    if (
      typeof record.id !== "string" ||
      evidence.has(record.id) ||
      !facts.has(record.factId) ||
      record.sourceId !== (facts.get(record.factId) as any).sourceId ||
      record.evidenceVersion !== 1 ||
      record.signatureDomain !== "open-autonomy.u5-evidence.v1" ||
      !U5_DISPOSITIONS.includes(record.disposition) ||
      record.kind !== K[record.disposition] ||
      !sha(record.payloadDigest) ||
      record.payloadBytes !== C(record.payload) ||
      record.payloadDigest !== H(record.payloadBytes) ||
      !oracles.has(record.oracleId) ||
      (oracles.get(record.oracleId) as any).factId !== record.factId ||
      record.oracleDigest !== (oracles.get(record.oracleId) as any).digest ||
      !Array.isArray(record.dependencies) ||
      !record.dependencies.every((x: any) => typeof x === "string") ||
      typeof record.issuedAt !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(record.issuedAt) ||
      !Number.isFinite(Date.parse(record.issuedAt)) ||
      record.issuedAt < policy.evidenceNotBefore ||
      record.issuedAt > "2026-07-18T23:59:59.999Z"
    )
      throw Error("U5 evidence registry semantic or chronology invalid");
    if (
      record.authorityOwnerId !== `evidence-authority.${record.factId}` ||
      record.custodianOwnerId !== `evidence-custodian.${record.factId}`
    )
      throw Error("U5 evidence actor registry binding invalid");
    if (record.disposition === "derived" && record.dependencies.length !== 0)
      throw Error("U5 derived oracle-root dependency invalid");
    validatePayload(
      record,
      facts.get(record.factId),
      calculus,
      oracles.get(record.oracleId),
    );
    if (record.disposition === "extension") {
      if (
        typeof record.classifierOwnerId !== "string" ||
        evidenceActors.has(record.classifierOwnerId) ||
        record.classifierOwnerId === record.authorityOwnerId ||
        record.classifierOwnerId === record.custodianOwnerId
      )
        throw Error("U5 extension classifier owner separation invalid");
      authenticate(
        record.classifierReceipt,
        mac(CLASSIFIER_KEY, "u5-extension-classifier", {
          sourceId: record.sourceId,
          factId: record.factId,
          evidenceVersion: record.evidenceVersion,
          signatureDomain: record.signatureDomain,
          issuedAt: record.issuedAt,
          payloadBytes: record.payloadBytes,
        }),
        "extension classifier",
      );
      evidenceActors.add(record.classifierOwnerId);
    } else if (
      record.classifierOwnerId !== null ||
      record.classifierReceipt !== null
    )
      throw Error("U5 extension classifier surplus invalid");
    const owner = owners.get(record.evidenceOwnerId);
    if (
      !owner ||
      owner.factId !== record.factId ||
      protectedOwners.has(record.authorityOwnerId) ||
      protectedOwners.has(record.custodianOwnerId) ||
      evidenceActors.has(record.authorityOwnerId) ||
      evidenceActors.has(record.custodianOwnerId) ||
      record.authorityOwnerId === record.custodianOwnerId ||
      record.authorityOwnerId === owner.ownerId ||
      record.custodianOwnerId === owner.ownerId
    )
      throw Error("U5 evidence authority custody owner separation invalid");
    authenticate(
      authorityReceipt,
      mac(EVIDENCE_KEY, "u5-evidence", body),
      "evidence authority",
    );
    authenticate(
      custodyReceipt,
      mac(CUSTODY_KEY, "u5-evidence-custody", { body, authorityReceipt }),
      "evidence custody",
    );
    evidenceActors.add(record.authorityOwnerId);
    evidenceActors.add(record.custodianOwnerId);
    evidence.set(record.id, record);
  }
  for (const record of evidence.values())
    for (const dependency of record.dependencies)
      if (!evidence.has(dependency))
        throw Error("U5 evidence DAG unreachable dependency invalid");
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw Error("U5 evidence DAG cycle invalid");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of evidence.get(id).dependencies) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of evidence.keys()) visit(id);
  const seen = new Set<string>(),
    reachedEvidence = new Set<string>(),
    counts = Object.fromEntries(U5_DISPOSITIONS.map((d) => [d, 0])),
    weights = Object.fromEntries(U5_DISPOSITIONS.map((d) => [d, 0])),
    canonical = Object.fromEntries(U5_DISPOSITIONS.map((d) => [d, 0]));
  let denominatorWeight = 0,
    canonicalWeight = 0;
  for (const r of input.ledger) {
    exact(
      r,
      [
        "factId",
        "sourceId",
        "disposition",
        "extensionSubstratum",
        "evidenceOwnerId",
        "evidenceId",
        "weight",
        "canonicalCreditWeight",
        "rowReceipt",
      ],
      "row",
    );
    const f: any = facts.get(r.factId);
    if (
      !f ||
      seen.has(r.factId) ||
      r.sourceId !== f.sourceId ||
      !U5_DISPOSITIONS.includes(r.disposition)
    )
      throw Error("U5 fact disposition totality invalid");
    seen.add(r.factId);
    const owner = owners.get(r.evidenceOwnerId);
    if (
      !owner ||
      owner.factId !== r.factId ||
      protectedOwners.has(owner.ownerId)
    )
      throw Error("U5 evidence owner join invalid");
    const record = evidence.get(r.evidenceId);
    if (
      !record ||
      reachedEvidence.has(r.evidenceId) ||
      record.factId !== r.factId ||
      record.disposition !== r.disposition ||
      record.evidenceOwnerId !== r.evidenceOwnerId
    )
      throw Error("U5 evidence exact reachability invalid");
    reachedEvidence.add(r.evidenceId);
    const { rowReceipt, ...rowBody } = r;
    authenticate(
      rowReceipt,
      mac(ROW_KEY, "u5-ledger-row", rowBody),
      "ledger row",
    );
    if (
      r.disposition === "extension"
        ? !U5_EXTENSION_SUBSTRATA.includes(r.extensionSubstratum)
        : r.extensionSubstratum !== null
    )
      throw Error("U5 extension substratum invalid");
    if (
      r.disposition === "extension" &&
      record.payload.classification !== r.extensionSubstratum
    )
      throw Error("U5 extension classifier row binding invalid");
    if (
      r.disposition === "abstracted" &&
      record.kind !== "observational-indistinguishability-proof"
    )
      throw Error("U5 abstraction evidence invalid");
    const w = policy.weightsByCriticality[f.criticality];
    if (
      r.weight !== w ||
      r.canonicalCreditWeight !== (CAN.has(r.disposition) ? w : 0)
    )
      throw Error("U5 credit inflation or weight invalid");
    counts[r.disposition]++;
    weights[r.disposition] += w;
    canonical[r.disposition] += r.canonicalCreditWeight;
    denominatorWeight += w;
    canonicalWeight += r.canonicalCreditWeight;
  }
  if (
    seen.size !== facts.size ||
    reachedEvidence.size !== evidence.size ||
    [...owners.values()].some((o) => !seen.has(o.factId)) ||
    new Set([...owners.values()].map((o) => o.factId)).size !== facts.size
  )
    throw Error("U5 omission duplicate surplus invalid");
  const strata = U5_DISPOSITIONS.map((d) => ({
    disposition: d,
    count: counts[d],
    weight: weights[d],
    canonicalCreditWeight: canonical[d],
  }));
  const extensionSubstrata = U5_EXTENSION_SUBSTRATA.map(
      (extensionSubstratum) => {
        const rows = input.ledger.filter(
          (r: any) =>
            r.disposition === "extension" &&
            r.extensionSubstratum === extensionSubstratum,
        );
        return {
          extensionSubstratum,
          count: rows.length,
          weight: rows.reduce((n: number, r: any) => n + r.weight, 0),
        };
      },
    ),
    expected = {
      factCount: facts.size,
      denominatorWeight,
      canonicalCreditWeight: canonicalWeight,
      strata,
      extensionSubstrata,
    };
  eq(input.accounting, expected, "accounting");
  const body = structuredClone(input);
  return freeze({ ...body, digest: digestU5DispositionLedger(body) });
}
export function verifyFrozenU5DispositionLedger(
  v: any,
  inventory: FrozenU4SourceInventory,
  calculus: FrozenU3ObservationCalculus,
  registry: FrozenU4SyntheticSourceRegistry,
  trusted: U4TrustedVerificationInputs,
  attestation: any,
  policy: any,
  options: any = {},
) {
  bound(v);
  exact(
    v,
    [
      "schema",
      "fixtureKind",
      "denominatorScope",
      "empiricalRegistration",
      "closureClaim",
      "assurancePromotionAllowed",
      "inventoryDigest",
      "closureAttestationDigest",
      "policyDigest",
      "semanticOracleRegistry",
      "evidenceOwners",
      "evidenceRegistry",
      "ledger",
      "accounting",
      "digest",
    ],
    "frozen ledger",
  );
  const { digest, ...body } = v,
    f = freezeU5DispositionLedger(
      body,
      inventory,
      calculus,
      registry,
      trusted,
      attestation,
      policy,
      options,
    );
  if (digest !== f.digest) throw Error("U5 ledger digest invalid");
  return f;
}
