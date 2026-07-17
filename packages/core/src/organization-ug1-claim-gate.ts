import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { canonicalSemanticJson as C } from "./organization-canonical";

const S = "open-autonomy.ug1-claim-gate.v1",
  STATUS = "implementation-complete-external-validation-deferred";
const H = (v: string | Uint8Array) =>
  `sha256:${createHash("sha256").update(v).digest("hex")}`;
export const UG1_CHECKPOINT_ANCHORS = [
  {
    checkpoint: "U0",
    commit: "1a904e46187238013245a0e07868caebe8e9f570",
    artifactPath: "docs/universality/campaign-v9/u0-closure.json",
    byteDigest:
      "sha256:4b044575710d772c7d8edf1f8a14e5e6ba7b026ae785fc3b150f5ee2e9b73901",
    status: "complete",
    externalValidation: "not-deferred",
  },
  {
    checkpoint: "U1",
    commit: "ac2da0d8ae9241f49abcc07f19456e512afeb6d7",
    artifactPath:
      "docs/universality/campaign-v9/u1-implementation-closure.json",
    byteDigest:
      "sha256:b997ec1b7ac848c96c9296cc598500586924f93dbce2110f86472af4775271f5",
    status: STATUS,
    externalValidation: "deferred",
  },
  {
    checkpoint: "U2",
    commit: "f8a99078da701740c2df818682655a9af750cb4f",
    artifactPath:
      "docs/universality/campaign-v9/u2-implementation-closure.json",
    byteDigest:
      "sha256:c38f5a1ea68c1172f5e8689f5795afdff8fb3ca4d088b9ee95889ba54f1ca93d",
    status: STATUS,
    externalValidation: "deferred",
  },
  {
    checkpoint: "U3",
    commit: "7af2e958a7d92157bda932070b6763b3cde6f6d6",
    artifactPath:
      "docs/universality/campaign-v9/u3-implementation-closure.json",
    byteDigest:
      "sha256:9d043694ae78e2fd61ddc96bbf21d9331f03e26beb50a11098ddcff03fb64fb0",
    status: STATUS,
    externalValidation: "deferred",
  },
  {
    checkpoint: "U4",
    commit: "db93bdf4e8340522d23ad0ed1497250a2650a560",
    artifactPath:
      "docs/universality/campaign-v9/u4-implementation-closure-attestation.json",
    byteDigest:
      "sha256:dcb1e467a86592f4aa421dfc4add208c02e3ea76dbbe94dfc54d445ee4436922",
    status: "locally-attested-external-deferred",
    externalValidation: "deferred",
  },
  {
    checkpoint: "U5",
    commit: "7c83643ea716e6675550f4e22396258ddc19ee86",
    artifactPath:
      "docs/universality/campaign-v9/u5-implementation-closure-attestation.json",
    byteDigest:
      "sha256:a6c501e14ab8446521271b1b903a72f4c7240a9ef06e6caecfaf5cf68f775a5d",
    status: "locally-attested-external-deferred",
    externalValidation: "deferred",
  },
] as const;
const GRAPH = [
  { checkpoint: "U0", dependsOn: [] },
  { checkpoint: "U1", dependsOn: ["U0"] },
  { checkpoint: "U2", dependsOn: ["U0", "U1"] },
  { checkpoint: "U3", dependsOn: ["U0", "U1", "U2"] },
  { checkpoint: "U4", dependsOn: ["U1", "U3"] },
  { checkpoint: "U5", dependsOn: ["U3", "U4"] },
] as const;
const exact = (x: any, k: string[], n: string) => {
  if (
    !x ||
    typeof x !== "object" ||
    Array.isArray(x) ||
    C(Object.keys(x).sort()) !== C([...k].sort())
  )
    throw Error(`UG1 ${n} schema invalid`);
};
const bound = (v: any) => {
  let nodes = 0,
    bytes = 0;
  const active = new Set<any>(),
    q: any[] = [[v, 0]];
  while (q.length) {
    const [x, exit] = q.pop();
    if (exit) {
      active.delete(x);
      continue;
    }
    if (++nodes > 20000) throw Error("UG1 resource bound");
    if (typeof x === "string") {
      bytes += Buffer.byteLength(x);
      if (x.length > 100000) throw Error("UG1 field bound");
    } else if (x && typeof x === "object") {
      if (active.has(x)) throw Error("UG1 cyclic input");
      active.add(x);
      q.push([x, 1], ...Object.values(x).map((y) => [y, 0]));
    }
  }
  if (bytes > 2e6) throw Error("UG1 resource bound");
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
export const digestUG1ClaimGate = (v: any) => {
  const { digest: _, ...b } = v;
  void _;
  return H(`${S}\0${C(b)}`);
};
export const createUG1ClaimGateInput = () => ({
  schema: S,
  campaign: "v9",
  gate: "UG1",
  status: STATUS,
  passed: false,
  fixtureKind: "synthetic",
  empiricalRegistration: false,
  promotionAllowed: false,
  retroactiveMutationAllowed: false,
  checkpoints: structuredClone(UG1_CHECKPOINT_ANCHORS),
  evidenceGraph: structuredClone(GRAPH),
  accounting: {
    checkpointCount: 6,
    implementationCheckpointCount: 6,
    externalDeferredCount: 5,
    passedCount: 0,
  },
  prohibitedClaims: [
    "UG1 has passed",
    "external U1-U5 validation is complete",
    "synthetic evidence is empirical",
    "later gates may mutate U0-U5 anchors",
  ],
});
export function freezeUG1ClaimGate(input: any, { root = process.cwd() } = {}) {
  bound(input);
  exact(
    input,
    [
      "schema",
      "campaign",
      "gate",
      "status",
      "passed",
      "fixtureKind",
      "empiricalRegistration",
      "promotionAllowed",
      "retroactiveMutationAllowed",
      "checkpoints",
      "evidenceGraph",
      "accounting",
      "prohibitedClaims",
    ],
    "root",
  );
  if (
    input.schema !== S ||
    input.campaign !== "v9" ||
    input.gate !== "UG1" ||
    input.status !== STATUS ||
    input.passed !== false ||
    input.fixtureKind !== "synthetic" ||
    input.empiricalRegistration !== false ||
    input.promotionAllowed !== false ||
    input.retroactiveMutationAllowed !== false
  )
    throw Error("UG1 non-promotion boundary invalid");
  if (
    C(input.checkpoints) !== C(UG1_CHECKPOINT_ANCHORS) ||
    C(input.evidenceGraph) !== C(GRAPH)
  )
    throw Error("UG1 frozen checkpoint anchor or evidence graph invalid");
  for (const a of UG1_CHECKPOINT_ANCHORS) {
    const revision = spawnSync(
        "git",
        ["rev-parse", "--verify", `${a.commit}^{commit}`],
        { cwd: root, encoding: "utf8" },
      ),
      bytes = spawnSync("git", ["show", `${a.commit}:${a.artifactPath}`], {
        cwd: root,
      });
    if (
      revision.status ||
      revision.stdout.trim() !== a.commit ||
      bytes.status ||
      H(bytes.stdout) !== a.byteDigest
    )
      throw Error(`UG1 committed checkpoint custody invalid: ${a.checkpoint}`);
  }
  const ids = new Set(input.checkpoints.map((x: any) => x.checkpoint));
  if (
    ids.size !== 6 ||
    input.evidenceGraph.some(
      (n: any) =>
        !ids.has(n.checkpoint) || n.dependsOn.some((d: string) => !ids.has(d)),
    )
  )
    throw Error("UG1 evidence graph reachability invalid");
  const expected = {
    checkpointCount: 6,
    implementationCheckpointCount: 6,
    externalDeferredCount: 5,
    passedCount: 0,
  };
  if (C(input.accounting) !== C(expected))
    throw Error("UG1 accounting invalid");
  if (
    C(input.prohibitedClaims) !== C(createUG1ClaimGateInput().prohibitedClaims)
  )
    throw Error("UG1 prohibited claims invalid");
  const body = structuredClone(input);
  return freeze({ ...body, digest: digestUG1ClaimGate(body) });
}
export function verifyFrozenUG1ClaimGate(v: any, options: any = {}) {
  bound(v);
  exact(
    v,
    [
      "schema",
      "campaign",
      "gate",
      "status",
      "passed",
      "fixtureKind",
      "empiricalRegistration",
      "promotionAllowed",
      "retroactiveMutationAllowed",
      "checkpoints",
      "evidenceGraph",
      "accounting",
      "prohibitedClaims",
      "digest",
    ],
    "frozen root",
  );
  const { digest, ...body } = v,
    f = freezeUG1ClaimGate(body, options);
  if (digest !== f.digest) throw Error("UG1 digest invalid");
  return f;
}
