import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { canonicalSemanticJson as C } from "./organization-canonical";
import {
  verifyFrozenU3ObservationCalculus,
  type FrozenU3ObservationCalculus,
} from "./organization-u3-observation-calculus";
import {
  verifyFrozenU4SourceInventory,
  type FrozenU4SourceInventory,
  type FrozenU4SyntheticSourceRegistry,
  type U4TrustedVerificationInputs,
} from "./organization-u4-source-inventory";
import {
  computeU4ProbeMaterialDigest,
  freezeU4VerifiedProbeBundle,
  type FrozenU4VerifiedProbeBundle,
  type U4ProbeVerificationMaterial,
} from "./organization-u4-probe-protocol";
import type { U3TraceEvaluationContract } from "./organization-u3-observation-evaluator";

type Sha = `sha256:${string}`;
export const U4_INVENTORY_REPLAY_CERTIFICATE_SCHEMA =
  "open-autonomy.u4-inventory-replay-certificate.v1" as const;
export const U4_REPLAY_SOURCE_ANCHORS = {
  commit: "ec04d1de5aecc6530fc7eaffe3d736f28e4c2c12",
  sourcePath: "packages/core/src/organization-u4-source-inventory.ts",
  sourceSha256:
    "sha256:d213a2e4fc466fdcbaf000655df787a3f649aaec12030725ffa83e7c39269395",
  testPath: "packages/core/src/organization-u4-source-inventory.test.ts",
  testSha256:
    "sha256:c6cfc3e90bff56169ae492e0143e6c7f32f78d3b895d253d2586bd87ec8c4d7b",
} as const;
export const U4_REPLAY_IMPLEMENTATION_PATHS = Object.freeze([
  "packages/core/src/organization-u4-probe-protocol.ts",
  "packages/core/src/organization-u4-probe-protocol.test.ts",
  "packages/core/src/organization-u4-inventory-replay-certificate.ts",
  "packages/core/src/organization-u4-inventory-replay-certificate.test.ts",
] as const);
export type U4ReplayImplementationCustodyManifest = {
  schema: "open-autonomy.u4-replay-implementation-custody.v1";
  implementationCommit: string;
  files: Array<{ path: (typeof U4_REPLAY_IMPLEMENTATION_PATHS)[number]; sha256: Sha }>;
  digest: Sha;
};
/** Finalized only after commit A exists. A permanent certificate issuer must
 * require this compiled digest; null is an explicit pre-commit state. */
export const U4_REPLAY_IMPLEMENTATION_CUSTODY_DIGEST: Sha | null = null;
export type U4ReplayProbeEvidence = {
  bundle: FrozenU4VerifiedProbeBundle;
  materials: U4ProbeVerificationMaterial[];
  u3Contract: U3TraceEvaluationContract;
};
export type U4FrontendOutcome = {
  schema: "open-autonomy.u4-frontend-outcome.v1";
  at: string;
  authorityId: string;
  ownerId: string;
  resultDigest: Sha;
  receipt: string;
};
export type U4InventoryReplayCertificate = {
  schema: typeof U4_INVENTORY_REPLAY_CERTIFICATE_SCHEMA;
  fixtureKind: "synthetic";
  denominatorScope: "fixture-local";
  empiricalRegistration: false;
  closureClaim: false;
  sourceAnchors: typeof U4_REPLAY_SOURCE_ANCHORS;
  inventoryDigest: Sha;
  sourceRegistryDigest: Sha;
  calculusDigest: Sha;
  freezeReceiptDigest: Sha;
  probeCertificateDigest: Sha;
  frontendOutcomeDigest: Sha;
  evidenceNodes: Array<{
    id: string;
    digest: Sha;
  }>;
  evidenceEdges: Array<{
    from: string;
    to: string;
    relation: "binds" | "precedes" | "requires";
  }>;
  digest: Sha;
};
const H = (x: string | Uint8Array) =>
    `sha256:${createHash("sha256").update(x).digest("hex")}` as Sha,
  sha = (x: unknown): x is Sha =>
    typeof x === "string" && /^sha256:[0-9a-f]{64}$/.test(x),
  sid = (x: unknown): x is string =>
    typeof x === "string" && /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(x),
  time = (x: unknown): x is string =>
    typeof x === "string" &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x) &&
    Number.isFinite(Date.parse(x)) &&
    new Date(Date.parse(x)).toISOString() === x;
const exact = (x: unknown, ks: string[], at: string): any => {
  if (
    !x ||
    typeof x !== "object" ||
    Array.isArray(x) ||
    C(Object.keys(x).sort()) !== C([...ks].sort())
  )
    throw Error(`U4 replay ${at} schema invalid`);
  return x;
};
const mac = (key: Buffer, domain: string, body: unknown) =>
    createHmac("sha256", key)
      .update(domain)
      .update("\0")
      .update(C(body))
      .digest("hex"),
  validMac = (key: Buffer, domain: string, body: unknown, sig: string) => {
    const a = Buffer.from(mac(key, domain, body), "hex"),
      b = Buffer.from(sig, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  };
const certificateDigest = (v: Omit<U4InventoryReplayCertificate, "digest">) =>
  H(`${U4_INVENTORY_REPLAY_CERTIFICATE_SCHEMA}\0${C(v)}`);
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
function bounded(...roots: unknown[]) {
  let nodes = 0,
    bytes = 0;
  const active = new Set<object>(),
    q: Array<[unknown, number, boolean]> = roots.map((x) => [x, 0, true]);
  while (q.length) {
    const [x, d, e] = q.pop()!;
    if (!e) {
      active.delete(x as object);
      continue;
    }
    if (++nodes > 50000 || d > 64) throw Error("U4 replay resource bound");
    if (typeof x === "string") {
      bytes += Buffer.byteLength(x);
      if (Buffer.byteLength(x) > 1_048_576)
        throw Error("U4 replay field bound");
      continue;
    }
    if (!x || typeof x !== "object") continue;
    if (active.has(x as object)) throw Error("U4 replay cyclic input");
    active.add(x as object);
    q.push([x, d, false]);
    const vs = Array.isArray(x) ? x : Object.values(x);
    if (vs.length > 2048) throw Error("U4 replay collection bound");
    for (const y of vs) q.push([y, d + 1, true]);
  }
  if (bytes > 8_388_608) throw Error("U4 replay byte bound");
}
export function verifyU4ReplaySourceGitCustody(root = process.cwd()) {
  const a = U4_REPLAY_SOURCE_ANCHORS,
    r = spawnSync("git", ["rev-parse", "--verify", `${a.commit}^{commit}`], {
      cwd: root,
      encoding: "utf8",
    });
  if (
    r.status !== 0 ||
    typeof r.stdout !== "string" ||
    r.stdout.trim() !== a.commit
  )
    throw Error("U4 replay source commit custody invalid");
  for (const [path, digest] of [
    [a.sourcePath, a.sourceSha256],
    [a.testPath, a.testSha256],
  ] as const) {
    const g = spawnSync("git", ["show", `${a.commit}:${path}`], { cwd: root });
    if (
      g.status !== 0 ||
      !g.stdout ||
      H(g.stdout) !== digest ||
      H(readFileSync(`${root}/${path}`)) !== digest
    )
      throw Error("U4 replay source byte custody invalid");
  }
}
export const computeU4ReplayImplementationCustodyDigest = (body: Omit<U4ReplayImplementationCustodyManifest, "digest">) =>
  H(`open-autonomy.u4-replay-implementation-custody.v1\0${C(body)}`);
export function verifyU4ReplayImplementationCustody(
  manifest: U4ReplayImplementationCustodyManifest,
  expectedDigest: Sha,
  root = process.cwd(),
) {
  bounded(manifest);
  exact(manifest, ["schema", "implementationCommit", "files", "digest"], "implementation custody");
  if (manifest.schema !== "open-autonomy.u4-replay-implementation-custody.v1" ||
      !/^[0-9a-f]{40}$/.test(manifest.implementationCommit) || !sha(expectedDigest) ||
      manifest.digest !== expectedDigest) throw Error("U4 replay implementation custody boundary invalid");
  const { digest: _, ...body } = manifest;
  if (computeU4ReplayImplementationCustodyDigest(body) !== manifest.digest ||
      !Array.isArray(manifest.files) || manifest.files.length !== U4_REPLAY_IMPLEMENTATION_PATHS.length ||
      C(manifest.files.map(x => x.path)) !== C([...U4_REPLAY_IMPLEMENTATION_PATHS]) ||
      manifest.files.some(x => !sha(x.sha256))) throw Error("U4 replay implementation custody manifest invalid");
  const commit = spawnSync("git", ["rev-parse", "--verify", `${manifest.implementationCommit}^{commit}`], { cwd: root, encoding: "utf8" });
  if (commit.status !== 0 || commit.stdout.trim() !== manifest.implementationCommit) throw Error("U4 replay implementation commit custody invalid");
  for (const file of manifest.files) {
    const shown = spawnSync("git", ["show", `${manifest.implementationCommit}:${file.path}`], { cwd: root });
    if (shown.status !== 0 || !shown.stdout || H(shown.stdout) !== file.sha256) throw Error("U4 replay implementation byte custody invalid");
  }
  return freeze(structuredClone(manifest));
}
function verifyProbeBundle(
  evidence: U4ReplayProbeEvidence,
  inventory: FrozenU4SourceInventory,
  calculus: FrozenU3ObservationCalculus,
  registry: FrozenU4SyntheticSourceRegistry,
  trusted: U4TrustedVerificationInputs,
) {
  exact(evidence, ["bundle", "materials", "u3Contract"], "probe evidence");
  const { digest, ...bundleBody } = evidence.bundle,
    bundle = freezeU4VerifiedProbeBundle(
      bundleBody,
      evidence.materials,
      inventory,
      calculus,
      evidence.u3Contract,
      trusted,
      registry,
    );
  if (bundle.digest !== digest)
    throw Error("U4 replay probe bundle digest invalid");
  const protectedOwners = new Set(
      inventory.sources.flatMap((s) => [
        s.sourceImplementerOwnerId,
        s.frontendOwnerId,
      ]),
    ),
    used = new Set([
      bundle.plan.plannerAuthorityId,
      bundle.plan.custodyAuthorityId,
      ...bundle.executions.flatMap((e) => [
        e.run.operatorAuthorityId,
        e.run.custodyAuthorityId,
        ...(e.join
          ? [e.join.observerAuthorityId, e.join.custodyAuthorityId]
          : []),
      ]),
    ]);
  for (const id of used) {
    const a = inventory.authorities.find((x) => x.id === id);
    if (
      !a ||
      protectedOwners.has(a.ownerId) ||
      [inventory.frontendAuthorityId, inventory.freezerAuthorityId].includes(id)
    )
      throw Error("U4 replay probe authority independence invalid");
  }
  return bundle;
}
export const computeU4FrontendReplayResultDigest = (
  inventoryDigest: Sha,
  calculusDigest: Sha,
  sourceRegistryDigest: Sha,
  probeBundleDigest: Sha,
  u3ContractDigest: Sha,
  materialDigests: Sha[],
) =>
  H(
    `open-autonomy.u4-frontend-replay-result.v1\0${C({ inventoryDigest, calculusDigest, sourceRegistryDigest, probeBundleDigest, u3ContractDigest, materialDigests })}`,
  );
function verifyOutcome(
  v0: U4FrontendOutcome,
  inventory: FrozenU4SourceInventory,
  trusted: U4TrustedVerificationInputs,
  expectedResultDigest: Sha,
  probe: FrozenU4VerifiedProbeBundle,
) {
  const v = exact(
      v0,
      ["schema", "at", "authorityId", "ownerId", "resultDigest", "receipt"],
      "frontend outcome",
    ),
    authority = inventory.authorities.find((a) => a.id === v.authorityId),
    tk = trusted.authorityKeys.find((k) => k.authorityId === v.authorityId);
  let key: Buffer;
  try {
    key = Buffer.from(tk?.keyBase64 ?? "", "base64");
  } catch {
    throw Error("U4 replay frontend key invalid");
  }
  const lastFreeze = Math.max(
      ...inventory.chronology.map((x) => Date.parse(x.frozenAt)),
    ),
    lastProbeEnd = Math.max(
      ...probe.executions.map((x) => Date.parse(x.run.endedAt)),
      Date.parse(probe.plan.issuedAt),
    );
  if (
    v.schema !== "open-autonomy.u4-frontend-outcome.v1" ||
    v.authorityId !== inventory.frontendAuthorityId ||
    authority?.role !== "frontend" ||
    v.ownerId !== authority.ownerId ||
    tk?.ownerId !== authority.ownerId ||
    tk.role !== "frontend" ||
    H(key) !== authority.verificationKeyDigest ||
    v.resultDigest !== expectedResultDigest ||
    !time(v.at) ||
    Date.parse(v.at) <= lastFreeze ||
    Date.parse(v.at) <= lastProbeEnd ||
    Date.parse(v.at) <
      Date.parse(inventory.chronologyPolicy.frontendOutcomeNotBefore) ||
    !validMac(
      key,
      "u4-frontend-outcome",
      {
        schema: v.schema,
        at: v.at,
        authorityId: v.authorityId,
        ownerId: v.ownerId,
        resultDigest: v.resultDigest,
      },
      v.receipt,
    )
  )
    throw Error("U4 replay frontend outcome invalid");
  return v as U4FrontendOutcome;
}
function body(
  inventory: FrozenU4SourceInventory,
  calculus: FrozenU3ObservationCalculus,
  registry: FrozenU4SyntheticSourceRegistry,
  probe: FrozenU4VerifiedProbeBundle,
  materials: U4ProbeVerificationMaterial[],
  outcome: U4FrontendOutcome,
): Omit<U4InventoryReplayCertificate, "digest"> {
  const freezeReceiptDigest = H(inventory.freezeReceipt),
    frontendOutcomeDigest = H(
      `open-autonomy.u4-frontend-outcome.v1\0${C(outcome)}`,
    ),
    materialsDigest = H(
      `open-autonomy.u4-probe-material-set.v1\0${C(probe.materialDigests)}`,
    ),
    nodes: any[] = [
      { id: "calculus", digest: calculus.digest },
      { id: "frontend-outcome", digest: frontendOutcomeDigest },
      { id: "freeze-receipt", digest: freezeReceiptDigest },
      { id: "inventory", digest: inventory.digest },
      { id: "probe-bundle", digest: probe.digest },
      { id: "probe-materials", digest: materialsDigest },
      { id: "probe-plan", digest: probe.plan.digest },
      { id: "source-registry", digest: registry.digest },
      { id: "u3-contract", digest: probe.u3ContractDigest },
      { id: "u3-trust-anchor", digest: probe.u3TrustAnchorDigest },
    ],
    edges: any[] = [
      { from: "calculus", to: "inventory", relation: "binds" },
      { from: "calculus", to: "probe-bundle", relation: "requires" },
      { from: "freeze-receipt", to: "frontend-outcome", relation: "precedes" },
      { from: "inventory", to: "frontend-outcome", relation: "precedes" },
      { from: "inventory", to: "probe-plan", relation: "requires" },
      { from: "probe-plan", to: "probe-bundle", relation: "requires" },
      { from: "probe-materials", to: "probe-bundle", relation: "binds" },
      { from: "probe-bundle", to: "frontend-outcome", relation: "precedes" },
      { from: "source-registry", to: "inventory", relation: "binds" },
      { from: "u3-contract", to: "probe-bundle", relation: "requires" },
      { from: "u3-trust-anchor", to: "u3-contract", relation: "binds" },
    ];
  const materialByInvocation = new Map(materials.map((m) => [m.invocationId, computeU4ProbeMaterialDigest(m)]));
  for (const execution of probe.executions) {
    const suffix = execution.invocationId,
      executionId = `execution.${suffix}`,
      runId = `run.${suffix}`,
      executionDigest = H(`open-autonomy.u4-replay-execution.v1\0${C(execution)}`);
    nodes.push({ id: executionId, digest: executionDigest }, { id: runId, digest: execution.run.digest });
    edges.push(
      { from: "probe-plan", to: runId, relation: "requires" },
      { from: runId, to: executionId, relation: "binds" },
      { from: executionId, to: "probe-bundle", relation: "binds" },
    );
    if (execution.disposition === "credited") {
      const joinId = `join.${suffix}`,
        materialId = `material.${suffix}`,
        materialDigest = materialByInvocation.get(suffix);
      if (!execution.join || !materialDigest) throw Error("U4 replay credited DAG material invalid");
      nodes.push({ id: joinId, digest: execution.join.digest }, { id: materialId, digest: materialDigest });
      edges.push(
        { from: runId, to: joinId, relation: "requires" },
        { from: materialId, to: joinId, relation: "requires" },
        { from: joinId, to: executionId, relation: "binds" },
        { from: materialId, to: "probe-materials", relation: "binds" },
      );
    } else {
      const terminalId = `terminal.${suffix}`,
        terminalDigest = H(`open-autonomy.u4-replay-noncredit-terminal.v1\0${C({ invocationId: suffix, disposition: execution.disposition, noncreditReason: execution.noncreditReason, termination: execution.run.termination, runDigest: execution.run.digest })}`);
      nodes.push({ id: terminalId, digest: terminalDigest });
      edges.push({ from: runId, to: terminalId, relation: "requires" }, { from: terminalId, to: executionId, relation: "binds" });
    }
  }
  nodes.sort((a, b) => a.id.localeCompare(b.id));
  edges.sort((a, b) => C(a).localeCompare(C(b)));
  return {
    schema: U4_INVENTORY_REPLAY_CERTIFICATE_SCHEMA,
    fixtureKind: "synthetic",
    denominatorScope: "fixture-local",
    empiricalRegistration: false,
    closureClaim: false,
    sourceAnchors: U4_REPLAY_SOURCE_ANCHORS,
    inventoryDigest: inventory.digest,
    sourceRegistryDigest: registry.digest,
    calculusDigest: calculus.digest,
    freezeReceiptDigest,
    probeCertificateDigest: probe.digest,
    frontendOutcomeDigest,
    evidenceNodes: nodes,
    evidenceEdges: edges,
  };
}
export function createU4InventoryReplayCertificate(
  inventoryInput: FrozenU4SourceInventory,
  calculusInput: FrozenU3ObservationCalculus,
  registry: FrozenU4SyntheticSourceRegistry,
  trusted: U4TrustedVerificationInputs,
  probeEvidence: U4ReplayProbeEvidence,
  outcomeInput: U4FrontendOutcome,
  { root = process.cwd() } = {},
) {
  verifyU4ReplaySourceGitCustody(root);
  bounded(
    inventoryInput,
    calculusInput,
    registry,
    trusted,
    probeEvidence,
    outcomeInput,
  );
  const calculus = verifyFrozenU3ObservationCalculus(calculusInput, {
      requireFixtureDigest: false,
    }),
    inventory = verifyFrozenU4SourceInventory(
      inventoryInput,
      calculus,
      registry,
      trusted,
    ),
    probe = verifyProbeBundle(
      probeEvidence,
      inventory,
      calculus,
      registry,
      trusted,
    ),
    expected = computeU4FrontendReplayResultDigest(
      inventory.digest,
      calculus.digest,
      registry.digest,
      probe.digest,
      probe.u3ContractDigest,
      probe.materialDigests,
    ),
    outcome = verifyOutcome(outcomeInput, inventory, trusted, expected, probe),
    b = body(inventory, calculus, registry, probe, probeEvidence.materials, outcome);
  return freeze({ ...b, digest: certificateDigest(b) });
}
export function verifyU4InventoryReplayCertificate(
  certificate: U4InventoryReplayCertificate,
  inventory: FrozenU4SourceInventory,
  calculus: FrozenU3ObservationCalculus,
  registry: FrozenU4SyntheticSourceRegistry,
  trusted: U4TrustedVerificationInputs,
  probeEvidence: U4ReplayProbeEvidence,
  outcome: U4FrontendOutcome,
  options = {},
) {
  verifyU4ReplaySourceGitCustody((options as any).root ?? process.cwd());
  bounded(
    certificate,
    inventory,
    calculus,
    registry,
    trusted,
    probeEvidence,
    outcome,
  );
  exact(
    certificate,
    [
      "schema",
      "fixtureKind",
      "denominatorScope",
      "empiricalRegistration",
      "closureClaim",
      "sourceAnchors",
      "inventoryDigest",
      "sourceRegistryDigest",
      "calculusDigest",
      "freezeReceiptDigest",
      "probeCertificateDigest",
      "frontendOutcomeDigest",
      "evidenceNodes",
      "evidenceEdges",
      "digest",
    ],
    "certificate",
  );
  const expected = createU4InventoryReplayCertificate(
    inventory,
    calculus,
    registry,
    trusted,
    probeEvidence,
    outcome,
    options,
  );
  if (C(certificate) !== C(expected))
    throw Error("U4 replay certificate mismatch");
  return expected;
}
