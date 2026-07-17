import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename } from "node:fs/promises";
import {
  freezeCampaignSupersession,
  freezeUniversalityClaim,
  type FrozenUniversalityClaim,
  verifyFrozenUniversalityClaim,
} from "../../packages/core/src/organization-universality-claim";
import { freezeForcingWindowSupplement } from "../../packages/core/src/organization-universality-window-contract";
import {
  freezeSourceCensusOccurrenceContract,
  sourceCensusOccurrenceConstants,
  type SourceCensusOccurrenceContract,
} from "../../packages/core/src/organization-universality-occurrence-contract";
import { verifySourceCensusIndexObservationContract } from "../../packages/core/src/organization-universality-index-observation-contract";
import {
  freezeCampaignRegistrationManifest,
  freezePredecessorCensusInvalidation,
  verifyCampaignRegistrationBundle,
} from "../../packages/core/src/organization-campaign-registration";
import { verifyForcingWindowSupplement } from "../../packages/core/src/organization-universality-window-contract";

const prior = "docs/universality/campaign-v8",
  next = "docs/universality/campaign-v9",
  raw = `${prior}/u1-github-raw`,
  campaignId = "organization-universality-2026-v9",
  censusCutoff = "2026-07-30T23:59:59.999Z",
  stage = `${next}.staging`;

if (existsSync(next) || existsSync(stage))
  throw Error("v9 registration output already exists");
if (await Bun.file(`${raw}/.capture-lock/owner.json`).exists())
  throw Error("active predecessor capture");

const list = async () => {
    const paths: string[] = [];
    for await (const path of new Bun.Glob("**/*").scan({
      cwd: raw,
      onlyFiles: true,
    }))
      paths.push(path);
    return paths.sort();
  },
  files = await list(),
  stateBytes = new Uint8Array(
    await Bun.file(`${raw}/capture-state.json`).arrayBuffer(),
  ),
  evidence = [],
  custodySnapshot = new Map<string, Uint8Array>();

const exact = (value: object, keys: string[]) =>
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys.sort()),
  gitCommitFor = (path: string) => {
    const result = Bun.spawnSync({
      cmd: ["git", "log", "-1", "--format=%H", "--", path],
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode !== 0) throw Error(`git provenance failed for ${path}`);
    const commit = result.stdout.toString().trim();
    if (!/^[a-f0-9]{40}$/.test(commit))
      throw Error(`git provenance missing for ${path}`);
    return commit;
  },
  gitBytes = (commit: string, path: string) => {
    const result = Bun.spawnSync({
      cmd: ["git", "show", `${commit}:${path}`],
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode !== 0)
      throw Error(`git byte provenance failed for ${commit}:${path}`);
    return new Uint8Array(result.stdout);
  },
  digest = (domain: string, value: unknown) =>
    `sha256:${createHash("sha256")
      .update(`${domain}\0${JSON.stringify(value)}`)
      .digest("hex")}`;

for (const path of files) {
  const bytes = new Uint8Array(await Bun.file(`${raw}/${path}`).arrayBuffer());
  custodySnapshot.set(path, bytes.slice());
  evidence.push({
    path,
    digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    bytes: bytes.length,
  });
}
if (
  JSON.stringify(files) !== JSON.stringify(await list()) ||
  !Buffer.from(stateBytes).equals(
    Buffer.from(await Bun.file(`${raw}/capture-state.json`).arrayBuffer()),
  )
)
  throw Error("custody changed");

const state = JSON.parse(new TextDecoder().decode(stateBytes)),
  failures = state.attempts?.map((attempt: any) => attempt.failure);
if (
  !exact(state, [
    "schema",
    "campaignId",
    "registrationCommit",
    "captureImplementationCommit",
    "sourceCensusContractDigest",
    "identityOwners",
    "identityNodes",
    "attempts",
  ]) ||
  state.schema !== "open-autonomy.github-census-index-observation-state.v4" ||
  state.attempts?.length !== 4 ||
  state.attempts.some((attempt: any) => attempt.status !== "failed") ||
  JSON.stringify(failures) !==
    JSON.stringify([
      "cross-range-membership-drift",
      "cross-range-membership-drift",
      "cross-range-membership-drift",
      "transport-failure",
    ])
)
  throw Error("v8 exhaustion not final");
const invalidation = await Bun.file(`${raw}/invalidation.json`).json();
if (
  !exact(invalidation, [
    "schema",
    "campaignId",
    "registrationCommit",
    "captureImplementationCommit",
    "sourceCensusContractDigest",
    "reason",
    "attempts",
  ]) ||
  invalidation.schema !== "open-autonomy.github-census-invalidation.v1" ||
  invalidation.reason !==
    "four-total-attempts-with-fewer-than-two-complete-passes" ||
  JSON.stringify(invalidation.attempts) !== JSON.stringify(state.attempts)
)
  throw Error("v8 invalidation mismatch");
const predecessorInvalidation = freezePredecessorCensusInvalidation({
      schema: "open-autonomy.github-census-invalidation.v2",
      campaignId: state.campaignId,
      registrationCommit: state.registrationCommit,
      captureImplementationCommit: state.captureImplementationCommit,
      sourceCensusContractDigest: state.sourceCensusContractDigest,
      terminalRule: {
        maximumTotalAttempts: 4,
        requiredCompletePasses: 2,
        outcome: "four-total-attempts-with-fewer-than-two-complete-passes",
        allowedFailures: [
          "cross-range-membership-drift",
          "transport-failure",
        ],
      },
      gitProvenanceBoundary:
        "git-object-and-byte-equality-verified-locally-at-registration-portable-bundle-verifies-retained-bytes-and-provenance-fields-only",
      reason: invalidation.reason,
      detail:
        "v8 required unique node IDs across nominally disjoint live search-index leaves; repeated node IDs are valid non-atomic index observations. v9 retains every terminal occurrence and quotients by node ID without multiplying population weight",
      attempts: state.attempts,
      evidence,
    });

const oldContractBytes = new Uint8Array(
    await Bun.file(`${prior}/source-census-contract.json`).arrayBuffer(),
  ),
  oldClaimBytes = new Uint8Array(
    await Bun.file(`${prior}/claim.json`).arrayBuffer(),
  ),
  oldForcingBytes = new Uint8Array(
    await Bun.file(`${prior}/forcing-supplement.json`).arrayBuffer(),
  ),
  old = JSON.parse(new TextDecoder().decode(oldContractBytes)),
  verifiedOld = verifySourceCensusIndexObservationContract(old),
  { digest: _, ...base } = old,
  contract = freezeSourceCensusOccurrenceContract({
    ...base,
    schema: "open-autonomy.source-census-occurrence-contract.v5",
    id: "oa-source-census-occurrence-2026-v9",
    campaignId,
    completion: {
      pass: structuredClone(sourceCensusOccurrenceConstants.pass),
      leaf: structuredClone(sourceCensusOccurrenceConstants.leaf),
      aggregation: structuredClone(sourceCensusOccurrenceConstants.aggregation),
    },
    invalidation: structuredClone(sourceCensusOccurrenceConstants.invalidation),
    censusCutoff,
  } as unknown as SourceCensusOccurrenceContract),
  oldForcing = verifyForcingWindowSupplement(
    JSON.parse(new TextDecoder().decode(oldForcingBytes)),
  ),
  forcing = freezeForcingWindowSupplement({
    schema: "open-autonomy.forcing-window-supplement.v2",
    id: "oa-forcing-window-supplement-2026-v9",
    campaignId,
    populationWeight: 0,
    domainEligibility:
      "same-primary-independent-and-third-reviewer-conflict-protocol-as-adoption-census",
    outOfDomain: "invalidate-campaign",
    overlap:
      "any-final-in-domain-node-in-two-pass-sampling-frame-counts-once-as-adoption-weight-1-otherwise-counts-once-as-forcing-weight-0",
    members: oldForcing.members,
  }),
  predecessor = JSON.parse(
    new TextDecoder().decode(oldClaimBytes),
  ) as FrozenUniversalityClaim,
  verifiedPredecessor = verifyFrozenUniversalityClaim(predecessor),
  { digest: __, ...claimBody } = predecessor,
  registeredAt = new Date().toISOString(),
  claim = freezeUniversalityClaim({
    ...claimBody,
    campaignId,
    registeredAt,
    sourceSelectionRule: `Operational U1 finite two-pass node-ID union defined exactly by ${contract.id} at ${contract.digest}; every terminal response occurrence is retained, occurrence multiplicity is audited, and each node-ID equivalence class contributes at most one population unit`,
    sourceCensusContractDigest: contract.digest,
    forcingSupplementDigest: forcing.digest,
    sourcePopulationId: "oa-source-population-2026-v9",
    compositionPopulationId: "oa-composition-population-2026-v9",
    censusAt: censusCutoff,
    executionSamplingSeed: "oa-universality-2026-v9-execution-sample",
  }),
  supersession = freezeCampaignSupersession(
    {
      schema: "open-autonomy.campaign-supersession.v1",
      predecessorCampaign: predecessor.campaignId,
      predecessorDigest: predecessor.digest,
      successorCampaign: claim.campaignId,
      successorDigest: claim.digest,
      reason:
        "v8 treated repeated node IDs across nominally disjoint live-index leaves as pass failure; v9 losslessly retains ordered occurrences and uses the node-ID quotient as the population unit",
      predecessorStatus: "invalidated-before-u1-closure",
    },
    predecessor,
    claim,
  );

if (
  state.campaignId !== verifiedPredecessor.campaignId ||
  invalidation.campaignId !== state.campaignId ||
  state.sourceCensusContractDigest !== verifiedOld.digest ||
  invalidation.sourceCensusContractDigest !== verifiedOld.digest ||
  state.registrationCommit !==
    gitCommitFor(`${prior}/source-census-contract.json`) ||
  invalidation.registrationCommit !== state.registrationCommit ||
  state.captureImplementationCommit !==
    gitCommitFor("scripts/universality/capture-u1-v8.ts") ||
  invalidation.captureImplementationCommit !==
    state.captureImplementationCommit ||
  verifiedPredecessor.forcingSupplementDigest !== oldForcing.digest
)
  throw Error("v8 custody provenance mismatch");
if (
  !Buffer.from(oldContractBytes).equals(
    Buffer.from(
      gitBytes(
        state.registrationCommit,
        `${prior}/source-census-contract.json`,
      ),
    ),
  ) ||
  !Buffer.from(oldClaimBytes).equals(
    Buffer.from(gitBytes(state.registrationCommit, `${prior}/claim.json`)),
  ) ||
  !Buffer.from(oldForcingBytes).equals(
    Buffer.from(
      gitBytes(state.registrationCommit, `${prior}/forcing-supplement.json`),
    ),
  )
)
  throw Error("v8 predecessor bytes differ from registration commit");

const predecessorInvalidationDigest = predecessorInvalidation.digest,
  payloadValues = new Map<string, unknown>([
    ["source-census-contract.json", contract],
    ["forcing-supplement.json", forcing],
    ["claim.json", claim],
    ["supersession.json", supersession],
    [
      "predecessor-invalidation.json",
      predecessorInvalidation,
    ],
  ]),
  payloadBytes = new Map(
    [...payloadValues].map(([name, value]) => [
      name,
      new TextEncoder().encode(JSON.stringify(value, null, 2) + "\n"),
    ]),
  ),
  registrationBody = {
    schema: "open-autonomy.campaign-registration-manifest.v1",
    campaignId,
    predecessorCampaignId: predecessor.campaignId,
    predecessorClaimDigest: predecessor.digest,
    predecessorInvalidationDigest,
    claimDigest: claim.digest,
    censusContractDigest: contract.digest,
    forcingSupplementDigest: forcing.digest,
    supersessionDigest: supersession.digest,
    files: [...payloadBytes]
      .map(([path, bytes]) => ({
        path,
        bytes: bytes.length,
        digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  },
  registrationManifest = freezeCampaignRegistrationManifest(registrationBody);

verifyCampaignRegistrationBundle(
  registrationManifest,
  Object.fromEntries(payloadBytes),
  predecessor,
  Object.fromEntries(custodySnapshot),
);

for (const [path, beforeBytes] of custodySnapshot) {
  const afterBytes = new Uint8Array(
    await Bun.file(`${raw}/${path}`).arrayBuffer(),
  );
  if (!Buffer.from(beforeBytes).equals(Buffer.from(afterBytes)))
    throw Error(`v8 custody changed after hashing: ${path}`);
}
if (JSON.stringify(files) !== JSON.stringify(await list()))
  throw Error("v8 custody path set changed after hashing");

await mkdir(stage, { recursive: false });
for (const [name, bytes] of payloadBytes)
  await Bun.write(`${stage}/${name}`, bytes);
const manifestBytes = new TextEncoder().encode(
  JSON.stringify(registrationManifest, null, 2) + "\n",
);
await Bun.write(`${stage}/registration-manifest.json`, manifestBytes);
const expectedStage = new Map(payloadBytes);
expectedStage.set("registration-manifest.json", manifestBytes);
const stagedNames: string[] = [];
for await (const path of new Bun.Glob("*").scan({
  cwd: stage,
  onlyFiles: true,
}))
  stagedNames.push(path);
if (
  JSON.stringify(stagedNames.sort()) !==
  JSON.stringify([...expectedStage.keys()].sort())
)
  throw Error("staged registration file set mismatch");
for (const [path, expected] of expectedStage) {
  const actual = new Uint8Array(
    await Bun.file(`${stage}/${path}`).arrayBuffer(),
  );
  if (!Buffer.from(actual).equals(Buffer.from(expected)))
    throw Error(`staged registration bytes mismatch: ${path}`);
}
await rename(stage, next);

console.log(
  JSON.stringify(
    {
      registeredAt,
      claimDigest: claim.digest,
      contractDigest: contract.digest,
      forcingDigest: forcing.digest,
      supersessionDigest: supersession.digest,
      registrationManifestDigest: registrationManifest.digest,
      predecessorInvalidationDigest,
      evidenceFiles: evidence.length,
    },
    null,
    2,
  ),
);
