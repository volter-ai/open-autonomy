import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  verifyFrozenCampaignSupersession,
  verifyFrozenUniversalityClaim,
  type FrozenUniversalityClaim,
} from "./organization-universality-claim";
import { verifySourceCensusOccurrenceContract } from "./organization-universality-occurrence-contract";
import { verifyForcingWindowSupplement } from "./organization-universality-window-contract";

type Sha = `sha256:${string}`;
export interface FailedCensusAttempt {
  attempt: number;
  startedAt: string;
  status: "failed";
  failure: string;
}
export interface CustodyFile {
  path: string;
  digest: Sha;
  bytes: number;
}
export interface PredecessorCensusInvalidation {
  schema: "open-autonomy.github-census-invalidation.v2";
  campaignId: string;
  registrationCommit: string;
  captureImplementationCommit: string;
  sourceCensusContractDigest: Sha;
  terminalRule: {
    maximumTotalAttempts: 4;
    requiredCompletePasses: 2;
    outcome: "four-total-attempts-with-fewer-than-two-complete-passes";
    allowedFailures: [
      "cross-range-membership-drift",
      "transport-failure",
    ];
  };
  gitProvenanceBoundary: "git-object-and-byte-equality-verified-locally-at-registration-portable-bundle-verifies-retained-bytes-and-provenance-fields-only";
  reason: string;
  detail: string;
  attempts: FailedCensusAttempt[];
  evidence: CustodyFile[];
}
export type FrozenPredecessorCensusInvalidation =
  PredecessorCensusInvalidation & { digest: Sha };

export interface CampaignRegistrationManifest {
  schema: "open-autonomy.campaign-registration-manifest.v1";
  campaignId: string;
  predecessorCampaignId: string;
  predecessorClaimDigest: Sha;
  predecessorInvalidationDigest: Sha;
  claimDigest: Sha;
  censusContractDigest: Sha;
  forcingSupplementDigest: Sha;
  supersessionDigest: Sha;
  files: CustodyFile[];
}
export type FrozenCampaignRegistrationManifest = CampaignRegistrationManifest & {
  digest: Sha;
};

const sha = (domain: string, value: unknown) =>
    `sha256:${createHash("sha256")
      .update(`${domain}\0${canonicalSemanticJson(value)}`)
      .digest("hex")}` as Sha,
  validSha = (value: string): value is Sha =>
    /^sha256:[a-f0-9]{64}$/.test(value),
  exact = (value: object, keys: string[]) =>
    canonicalSemanticJson(Object.keys(value).sort()) ===
    canonicalSemanticJson(keys.sort()),
  utc = (value: string) => {
    const parsed = Date.parse(value);
    return (
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
      Number.isFinite(parsed) &&
      new Date(parsed).toISOString() === value
    );
  },
  verifyFiles = (files: CustodyFile[]) => {
    if (!Array.isArray(files) || files.length === 0) throw Error("custody empty");
    const paths = new Set<string>();
    for (const file of files) {
      if (
        !exact(file, ["path", "digest", "bytes"]) ||
        !file.path ||
        file.path.startsWith("/") ||
        file.path.includes("..") ||
        paths.has(file.path) ||
        !validSha(file.digest) ||
        !Number.isSafeInteger(file.bytes) ||
        file.bytes < 0
      )
        throw Error("custody file invalid");
      paths.add(file.path);
    }
    if (
      canonicalSemanticJson(files.map((file) => file.path)) !==
      canonicalSemanticJson([...paths].sort())
    )
      throw Error("custody files must be path sorted");
  };

export function freezePredecessorCensusInvalidation(
  value: PredecessorCensusInvalidation,
): FrozenPredecessorCensusInvalidation {
  if (
    !exact(value, [
      "schema",
      "campaignId",
      "registrationCommit",
      "captureImplementationCommit",
      "sourceCensusContractDigest",
      "terminalRule",
      "gitProvenanceBoundary",
      "reason",
      "detail",
      "attempts",
      "evidence",
    ]) ||
    value.schema !== "open-autonomy.github-census-invalidation.v2" ||
    !value.campaignId ||
    !/^[a-f0-9]{40}$/.test(value.registrationCommit) ||
    !/^[a-f0-9]{40}$/.test(value.captureImplementationCommit) ||
    !validSha(value.sourceCensusContractDigest) ||
    !exact(value.terminalRule, [
      "maximumTotalAttempts",
      "requiredCompletePasses",
      "outcome",
      "allowedFailures",
    ]) ||
    value.terminalRule.maximumTotalAttempts !== 4 ||
    value.terminalRule.requiredCompletePasses !== 2 ||
    value.terminalRule.outcome !==
      "four-total-attempts-with-fewer-than-two-complete-passes" ||
    canonicalSemanticJson(value.terminalRule.allowedFailures) !==
      canonicalSemanticJson([
        "cross-range-membership-drift",
        "transport-failure",
      ]) ||
    value.gitProvenanceBoundary !==
      "git-object-and-byte-equality-verified-locally-at-registration-portable-bundle-verifies-retained-bytes-and-provenance-fields-only" ||
    !value.reason ||
    !value.detail ||
    !Array.isArray(value.attempts) ||
    value.attempts.length !== value.terminalRule.maximumTotalAttempts ||
    value.reason !== value.terminalRule.outcome
  )
    throw Error("predecessor invalidation invalid");
  let previous = -Infinity;
  for (const [index, attempt] of value.attempts.entries()) {
    const time = Date.parse(attempt.startedAt);
    if (
      !exact(attempt, ["attempt", "startedAt", "status", "failure"]) ||
      attempt.attempt !== index + 1 ||
      attempt.status !== "failed" ||
      !attempt.failure ||
      !value.terminalRule.allowedFailures.includes(attempt.failure as any) ||
      !utc(attempt.startedAt) ||
      time < previous
    )
      throw Error("failed attempt invalid");
    previous = time;
  }
  verifyFiles(value.evidence);
  const body = structuredClone(value);
  return {
    ...body,
    digest: sha("open-autonomy.github-census-invalidation.v2", body),
  };
}

export function verifyPredecessorCensusInvalidation(
  value: FrozenPredecessorCensusInvalidation,
) {
  const { digest, ...body } = value,
    frozen = freezePredecessorCensusInvalidation(body);
  if (digest !== frozen.digest) throw Error("invalidation digest mismatch");
  return frozen;
}

export function freezeCampaignRegistrationManifest(
  value: CampaignRegistrationManifest,
): FrozenCampaignRegistrationManifest {
  if (
    !exact(value, [
      "schema",
      "campaignId",
      "predecessorCampaignId",
      "predecessorClaimDigest",
      "predecessorInvalidationDigest",
      "claimDigest",
      "censusContractDigest",
      "forcingSupplementDigest",
      "supersessionDigest",
      "files",
    ]) ||
    value.schema !== "open-autonomy.campaign-registration-manifest.v1" ||
    !value.campaignId ||
    !value.predecessorCampaignId ||
    [
      value.predecessorClaimDigest,
      value.predecessorInvalidationDigest,
      value.claimDigest,
      value.censusContractDigest,
      value.forcingSupplementDigest,
      value.supersessionDigest,
    ].some((digest) => !validSha(digest))
  )
    throw Error("registration manifest invalid");
  verifyFiles(value.files);
  const body = structuredClone(value);
  return {
    ...body,
    digest: sha("open-autonomy.campaign-registration-manifest.v1", body),
  };
}

export function verifyCampaignRegistrationManifest(
  value: FrozenCampaignRegistrationManifest,
) {
  const { digest, ...body } = value,
    frozen = freezeCampaignRegistrationManifest(body);
  if (digest !== frozen.digest) throw Error("registration manifest digest mismatch");
  return frozen;
}

const registrationPaths = [
  "claim.json",
  "forcing-supplement.json",
  "predecessor-invalidation.json",
  "source-census-contract.json",
  "supersession.json",
] as const;

export function verifyCampaignRegistrationBundle(
  manifest: FrozenCampaignRegistrationManifest,
  bundle: Record<string, Uint8Array>,
  predecessorClaim: FrozenUniversalityClaim,
  predecessorCustody: Record<string, Uint8Array>,
) {
  const frozenManifest = verifyCampaignRegistrationManifest(manifest),
    names = Object.keys(bundle).sort();
  if (canonicalSemanticJson(names) !== canonicalSemanticJson(registrationPaths))
    throw Error("registration bundle path set mismatch");
  if (
    canonicalSemanticJson(frozenManifest.files.map((file) => file.path)) !==
    canonicalSemanticJson(registrationPaths)
  )
    throw Error("registration manifest required paths mismatch");
  for (const file of frozenManifest.files) {
    const bytes = bundle[file.path];
    if (
      !bytes ||
      bytes.length !== file.bytes ||
      `sha256:${createHash("sha256").update(bytes).digest("hex")}` !==
        file.digest
    )
      throw Error(`registration bundle custody mismatch: ${file.path}`);
  }
  const parse = (path: string) =>
      JSON.parse(new TextDecoder().decode(bundle[path])),
    claim = verifyFrozenUniversalityClaim(parse("claim.json")),
    contract = verifySourceCensusOccurrenceContract(
      parse("source-census-contract.json"),
    ),
    forcing = verifyForcingWindowSupplement(parse("forcing-supplement.json")),
    invalidation = verifyPredecessorCensusInvalidation(
      parse("predecessor-invalidation.json"),
    ),
    supersession = verifyFrozenCampaignSupersession(
      parse("supersession.json"),
      predecessorClaim,
      claim,
    );
  verifyFrozenUniversalityClaim(predecessorClaim);
  if (
    frozenManifest.campaignId === frozenManifest.predecessorCampaignId ||
    claim.campaignId !== frozenManifest.campaignId ||
    contract.campaignId !== claim.campaignId ||
    forcing.campaignId !== claim.campaignId ||
    invalidation.campaignId !== predecessorClaim.campaignId ||
    frozenManifest.predecessorCampaignId !== predecessorClaim.campaignId ||
    frozenManifest.predecessorClaimDigest !== predecessorClaim.digest ||
    frozenManifest.predecessorInvalidationDigest !== invalidation.digest ||
    frozenManifest.claimDigest !== claim.digest ||
    frozenManifest.censusContractDigest !== contract.digest ||
    frozenManifest.forcingSupplementDigest !== forcing.digest ||
    frozenManifest.supersessionDigest !== supersession.digest ||
    claim.sourceCensusContractDigest !== contract.digest ||
    claim.forcingSupplementDigest !== forcing.digest
  )
    throw Error("registration bundle semantic join mismatch");
  const custodyNames = Object.keys(predecessorCustody).sort();
  if (
    canonicalSemanticJson(custodyNames) !==
    canonicalSemanticJson(invalidation.evidence.map((file) => file.path))
  )
    throw Error("predecessor custody path set mismatch");
  for (const file of invalidation.evidence) {
    const bytes = predecessorCustody[file.path];
    if (
      !bytes ||
      bytes.length !== file.bytes ||
      `sha256:${createHash("sha256").update(bytes).digest("hex")}` !==
        file.digest
    )
      throw Error(`predecessor custody mismatch: ${file.path}`);
  }
  const decodeCustody = (path: string) => {
      const bytes = predecessorCustody[path];
      if (!bytes) throw Error(`predecessor custody required file missing: ${path}`);
      return JSON.parse(new TextDecoder().decode(bytes));
    },
    state = decodeCustody("capture-state.json"),
    rawInvalidation = decodeCustody("invalidation.json");
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
    !exact(rawInvalidation, [
      "schema",
      "campaignId",
      "registrationCommit",
      "captureImplementationCommit",
      "sourceCensusContractDigest",
      "reason",
      "attempts",
    ]) ||
    state.schema !== "open-autonomy.github-census-index-observation-state.v4" ||
    rawInvalidation.schema !== "open-autonomy.github-census-invalidation.v1" ||
    state.campaignId !== invalidation.campaignId ||
    rawInvalidation.campaignId !== invalidation.campaignId ||
    state.registrationCommit !== invalidation.registrationCommit ||
    rawInvalidation.registrationCommit !== invalidation.registrationCommit ||
    state.captureImplementationCommit !== invalidation.captureImplementationCommit ||
    rawInvalidation.captureImplementationCommit !==
      invalidation.captureImplementationCommit ||
    state.sourceCensusContractDigest !== invalidation.sourceCensusContractDigest ||
    rawInvalidation.sourceCensusContractDigest !==
      invalidation.sourceCensusContractDigest ||
    predecessorClaim.sourceCensusContractDigest !==
      invalidation.sourceCensusContractDigest ||
    rawInvalidation.reason !== invalidation.reason ||
    canonicalSemanticJson(state.attempts) !==
      canonicalSemanticJson(invalidation.attempts) ||
    canonicalSemanticJson(rawInvalidation.attempts) !==
      canonicalSemanticJson(invalidation.attempts)
  )
    throw Error("predecessor census custody provenance mismatch");
  return { manifest: frozenManifest, claim, contract, forcing, invalidation, supersession };
}
