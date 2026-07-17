import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { spawnSync } from "node:child_process";
import { canonicalSemanticJson as C } from "./organization-canonical";
import { verifyU4ClosureAttestation } from "./organization-u4-closure-attestation";
type Sha = `sha256:${string}`;
const H = (x: string | Uint8Array) =>
    `sha256:${createHash("sha256").update(x).digest("hex")}` as Sha,
  M = (k: Buffer, d: string, x: any) =>
    createHmac("sha256", k).update(d).update("\0").update(C(x)).digest("hex"),
  S = "open-autonomy.u5-credit-policy.v1",
  AK = Buffer.from("u5-policy-authority-key-32bytes!!"),
  CK = Buffer.from("u5-policy-custodian-key-32bytes!"),
  ATTESTATION_COMMIT = "db93bdf4e8340522d23ad0ed1497250a2650a560",
  ATTESTATION_DIGEST =
    "sha256:139d26bc123c9dfcd82e7d1ae95e6d99552bc93a3ef7c0aa04e316466b4656e1";
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
export const U5_PHASE_A_ANCHOR = {
  commit: "ce7e851c2bb1cf8e79d15c4b25944b4983bd7247",
  files: [
    {
      path: "docs/universality/campaign-v9/u5-phase-a-denominator.json",
      sha256: "sha256:927ac1f8ad4f5f6ca50eba3218410b18ba4f9ba229beffcde8dff864b2eabb0f",
    },
  ],
} as const;
export const U5_INVENTORY_ANCHOR = {
  custodyStatus: "committed-by-post-commit-attestation",
  inventoryDigest:
    "sha256:43cf3b527e903d9d2293f4d3082149a0123135d271848d9aace2bf7d98d259b9",
  sourceRegistryDigest:
    "sha256:3f6900cf4dc70d8387f87062ee8c2df8d554ad65800bad609b2b7a984c3894d8",
  calculusDigest:
    "sha256:4fdc2d9fd0ffd8987af8bf02034032105c84fde3fb905d346039376d4bf8c3e2",
  factCount: 17,
  factDenominatorDigest:
    "sha256:19342ac7a2236fe29960734d63ca41a7e2c9be612eb8a64c5e356876f644c6bb",
  factIds: [
    "source.authority.d8027108bf1d8d34",
    "source.configuration.dec853147d7c3634",
    "source.evidence.ce960c47b3b63d26",
    "source.extensions.e74696255965f3f1",
    "source.failure.73b76fe0641aeb38",
    "source.lifecycle.40362a64591f1b91",
    "source.omissions.caf0d22aab883754",
    "source.prompt-context.0bbc7329204e680b",
    "source.prompt-context.2f753380ca0b6735",
    "source.prompt-context.4a8a361f6c75b48c",
    "source.prompt-context.5093187c98dc3456",
    "source.prompt-context.aad40bd1c9f8b008",
    "source.prompt-context.b8b65c2b9442f642",
    "source.prompt-context.c13899e14e049f14",
    "source.resource.503a6bbcd5375576",
    "source.runtime.5fe89210994d0ad3",
    "source.safety-security.e676dd4fc83b723c",
  ],
} as const;
export const U5_ATTESTATION_ANCHOR = {
  commit: ATTESTATION_COMMIT,
  digest: ATTESTATION_DIGEST,
  files: [
    {
      path: "packages/core/src/organization-u4-closure-attestation.ts",
      sha256:
        "sha256:d612ebde1c500fdb9d148c4afa73bdb75c71aa60bf7f654b0567de4b10355114",
    },
    {
      path: "packages/core/src/organization-u4-closure-attestation.test.ts",
      sha256:
        "sha256:ea14855bd47b1659900be325125bd445bc747edcc31cf024f197ab8c9c0bb02c",
    },
    {
      path: "docs/universality/campaign-v9/u4-implementation-closure-attestation.json",
      sha256:
        "sha256:dcb1e467a86592f4aa421dfc4add208c02e3ea76dbbe94dfc54d445ee4436922",
    },
  ],
} as const;
export type FrozenU5CreditPolicy = Readonly<any>;
const digest = (b: any) => H(`${S}\0${C(b)}`),
  base: any = {
    schema: S,
    fixtureKind: "synthetic",
    empiricalRegistration: false,
    promotionAllowed: false,
    issuedAt: "2026-07-17T14:00:00.000Z",
    evidenceNotBefore: "2026-07-18T00:00:00.000Z",
    policyAuthority: {
      id: "u5-policy-authority",
      ownerId: "u5-policy-owner",
      keyDigest: H(AK),
    },
    custodian: {
      id: "u5-policy-custodian",
      ownerId: "u5-custody-owner",
      keyDigest: H(CK),
    },
    protectedOwners: ["frontend", "implementer"],
    dispositions: [...U5_DISPOSITIONS],
    canonicalEligible: ["preserved", "derived", "lowered"],
    extensionSubstrata: [...U5_EXTENSION_SUBSTRATA],
    weightsByCriticality: { critical: 2, noncritical: 1 },
    inventoryAnchor: U5_INVENTORY_ANCHOR,
    attestationAnchor: U5_ATTESTATION_ANCHOR,
  };
const bodyDigest = digest(base),
  authorityReceipt = M(AK, "u5-credit-policy", { bodyDigest }),
  custodyReceipt = M(CK, "u5-credit-policy-custody", {
    bodyDigest,
    authorityReceipt,
  });
export const U5_SYNTHETIC_CREDIT_POLICY = Object.freeze({
  ...base,
  bodyDigest,
  authorityReceipt,
  custodyReceipt,
  digest: H(
    `${S}.frozen\0${C({ ...base, bodyDigest, authorityReceipt, custodyReceipt })}`,
  ),
}) as FrozenU5CreditPolicy;
const cache = new Set<string>();
export function verifyU5CommittedBoundary(
  inventory: any,
  attestation: any,
  policy: any,
  { root = process.cwd() } = {},
) {
  if (C(policy) !== C(U5_SYNTHETIC_CREDIT_POLICY))
    throw Error("U5 alternate policy invalid");
  if (
    inventory.digest !== U5_INVENTORY_ANCHOR.inventoryDigest ||
    inventory.sourceRegistryDigest !==
      U5_INVENTORY_ANCHOR.sourceRegistryDigest ||
    inventory.calculusDigest !== U5_INVENTORY_ANCHOR.calculusDigest ||
    inventory.facts.length !== U5_INVENTORY_ANCHOR.factCount ||
    C(inventory.facts.map((f: any) => f.id)) !== C(U5_INVENTORY_ANCHOR.factIds)
  )
    throw Error("U5 inventory denominator anchor invalid");
  if (attestation.digest !== ATTESTATION_DIGEST)
    throw Error("U5 attestation digest anchor invalid");
  const owners = [
    policy.policyAuthority.ownerId,
    policy.custodian.ownerId,
    ...policy.protectedOwners,
  ];
  if (
    new Set(owners).size !== owners.length ||
    policy.policyAuthority.keyDigest === policy.custodian.keyDigest ||
    policy.issuedAt >= policy.evidenceNotBefore
  )
    throw Error("U5 policy independence chronology invalid");
  const ab = Buffer.from(policy.authorityReceipt, "hex"),
    ae = Buffer.from(
      M(AK, "u5-credit-policy", { bodyDigest: policy.bodyDigest }),
      "hex",
    ),
    cb = Buffer.from(policy.custodyReceipt, "hex"),
    ce = Buffer.from(
      M(CK, "u5-credit-policy-custody", {
        bodyDigest: policy.bodyDigest,
        authorityReceipt: policy.authorityReceipt,
      }),
      "hex",
    );
  if (
    policy.bodyDigest !== digest(base) ||
    ab.length !== ae.length ||
    !timingSafeEqual(ab, ae) ||
    cb.length !== ce.length ||
    !timingSafeEqual(cb, ce)
  )
    throw Error("U5 policy authentication invalid");
  const k = `${root}\0${ATTESTATION_COMMIT}`;
  if (!cache.has(k)) {
    const rev = spawnSync(
      "git",
      ["rev-parse", "--verify", `${ATTESTATION_COMMIT}^{commit}`],
      { cwd: root, encoding: "utf8" },
    );
    if (
      rev.status ||
      typeof rev.stdout !== "string" ||
      rev.stdout.trim() !== ATTESTATION_COMMIT
    )
      throw Error("U5 attestation commit custody invalid");
    let artifact: any;
    for (const f of U5_ATTESTATION_ANCHOR.files) {
      const g = spawnSync("git", ["show", `${ATTESTATION_COMMIT}:${f.path}`], {
        cwd: root,
      });
      if (g.status || H(g.stdout) !== f.sha256)
        throw Error("U5 attestation byte custody invalid");
      if (f.path.endsWith(".json")) artifact = JSON.parse(g.stdout.toString());
    }
    verifyU4ClosureAttestation(artifact, { root });
    const phaseARev = spawnSync(
      "git",
      ["rev-parse", "--verify", `${U5_PHASE_A_ANCHOR.commit}^{commit}`],
      { cwd: root, encoding: "utf8" },
    );
    if (
      phaseARev.status ||
      typeof phaseARev.stdout !== "string" ||
      phaseARev.stdout.trim() !== U5_PHASE_A_ANCHOR.commit
    )
      throw Error("U5 Phase A commit custody invalid");
    let denominatorArtifact: any;
    for (const file of U5_PHASE_A_ANCHOR.files) {
      const shown = spawnSync(
        "git",
        ["show", `${U5_PHASE_A_ANCHOR.commit}:${file.path}`],
        { cwd: root },
      );
      if (shown.status || H(shown.stdout) !== file.sha256)
        throw Error("U5 Phase A byte custody invalid");
      if (file.path.endsWith("u5-phase-a-denominator.json"))
        denominatorArtifact = JSON.parse(shown.stdout.toString("utf8"));
    }
    const denominatorBody = {
      inventoryDigest: denominatorArtifact?.inventoryDigest,
      sourceRegistryDigest: denominatorArtifact?.sourceRegistryDigest,
      calculusDigest: denominatorArtifact?.calculusDigest,
      factCount: denominatorArtifact?.factCount,
      factIds: denominatorArtifact?.factIds,
    };
    if (
      denominatorArtifact?.schema !==
        "open-autonomy.u5-phase-a-denominator.v2" ||
      denominatorArtifact?.custodyStatus !==
        "pending-post-commit-attestation" ||
      C(denominatorBody) !==
        C({
          inventoryDigest: U5_INVENTORY_ANCHOR.inventoryDigest,
          sourceRegistryDigest: U5_INVENTORY_ANCHOR.sourceRegistryDigest,
          calculusDigest: U5_INVENTORY_ANCHOR.calculusDigest,
          factCount: U5_INVENTORY_ANCHOR.factCount,
          factIds: U5_INVENTORY_ANCHOR.factIds,
        }) ||
      denominatorArtifact.factDenominatorDigest !==
        H(`open-autonomy.u5-fact-denominator.v2\0${C(denominatorBody)}`) ||
      denominatorArtifact.factDenominatorDigest !==
        U5_INVENTORY_ANCHOR.factDenominatorDigest
    )
      throw Error("U5 Phase A denominator replay invalid");
    cache.add(k);
  }
  return policy;
}
