import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  deterministicU1Batches,
  selectU1IndependentReview,
  verifyU1ClassificationContract,
  type FrozenU1ClassificationContract,
  type U1Decision,
  type U1ReviewerRole,
} from "./organization-u1-classification-contract";
import {
  canonicalV3RepositoryCorpusDigest,
  validateV3NodeEvidence,
  validateV3PrimaryDescriptor,
  verifyV3ForcingIdentityMapping,
  type V3BatchAttempt,
  type V3Classification,
  type V3Evidence,
  type V3ForcingIdentityMapping,
  type V3PrimaryDescriptor,
  type V3Review,
} from "./organization-source-population-v3";
import {
  verifyForcingSupplement,
  type FrozenForcingSupplement,
} from "./organization-universality-census-contract";
import {
  canonicalU1Frame,
  canonicalU1FrameDigest,
  validateU1TerminalReplay,
  verifySourceCensusOccurrenceContract,
  type FrozenSourceCensusOccurrenceContract,
  type U1TerminalReplay,
} from "./organization-universality-occurrence-contract";
import {
  verifyFrozenUniversalityClaim,
  type FrozenUniversalityClaim,
} from "./organization-universality-claim";
type Sha = `sha256:${string}`;
type Authority = "primary" | "independent" | "third";
export type ClassificationRunnerNode = {
  nodeId: string;
  repository: string;
  membership: "frame" | "forcing";
  commitEvidence: Extract<V3Evidence, { role: "commit-resolution" }>;
  repositoryEvidence: Array<
    Extract<V3Evidence, { role: "repository-evidence" }>
  >;
  rawBytes: Record<string, string>;
};
export type ClassificationRunnerRequest = {
  role: U1ReviewerRole;
  batchIndex: number;
  attempt: number;
  phaseDigest: Sha | null;
  batchInputDigest: Sha;
  members: Array<{ nodeId: string; inputDigest: Sha }>;
};
export type ClassificationRunnerOutcome = {
  nodeId: string;
  decision: U1Decision;
  reason: string;
  descriptor?: V3PrimaryDescriptor;
};
export type ClassificationRunnerProvider = (
  request: ClassificationRunnerRequest,
) => Promise<{ outcomes: ClassificationRunnerOutcome[] }>;
export type ClassificationRunnerClock = { now(): string };
export type ClassificationRunnerInput = {
  contract: FrozenU1ClassificationContract;
  forcingSupplement: FrozenForcingSupplement;
  claim: FrozenUniversalityClaim;
  censusContract: FrozenSourceCensusOccurrenceContract;
  replay: U1TerminalReplay;
  forcingIdentityMapping: V3ForcingIdentityMapping;
  nodes: ClassificationRunnerNode[];
  provider: ClassificationRunnerProvider;
  clock: ClassificationRunnerClock;
};
export type ClassificationRunnerResult = {
  classifications: V3Classification[];
  evidence: V3Evidence[];
  rawBytes: Record<string, string>;
  batchAttempts: V3BatchAttempt[];
};
export class U1ClassificationRunInvalidation extends Error {
  constructor(
    readonly custody: {
      reason:
        | "batch-attempts-exhausted"
        | "invalid-provider-outcome"
        | "invalid-clock"
        | "forcing-out-of-domain";
      evidence: V3Evidence[];
      rawBytes: Record<string, string>;
      batchAttempts: V3BatchAttempt[];
      completed: ClassificationRunnerOutcome[];
    },
    options?: ErrorOptions,
  ) {
    super(`U1 classification run invalid: ${custody.reason}`, options);
  }
}
const hash = (domain: string, x: unknown) =>
    `sha256:${createHash("sha256")
      .update(`${domain}\0${canonicalSemanticJson(x)}`)
      .digest("hex")}` as Sha,
  bytes = (x: unknown) => Buffer.from(canonicalSemanticJson(x)),
  rawDigest = (x: Uint8Array) =>
    `sha256:${createHash("sha256").update(x).digest("hex")}` as Sha,
  utf8 = (a: string, b: string) => Buffer.from(a).compare(Buffer.from(b)),
  utc = (x: string) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x) &&
    new Date(x).toISOString() === x;

export async function runU1Classification(
  input: ClassificationRunnerInput,
): Promise<ClassificationRunnerResult> {
  const contract = verifyU1ClassificationContract(input.contract),
    supplement = verifyForcingSupplement(input.forcingSupplement),
    claim = verifyFrozenUniversalityClaim(input.claim),
    census = verifySourceCensusOccurrenceContract(input.censusContract),
    replay = validateU1TerminalReplay(census, input.replay),
    frame = canonicalU1Frame(replay),
    frameFreeze = replay.passes[1]!.completedAt,
    censusCutoff = census.censusCutoff;
  if (
    claim.campaignId !== census.campaignId ||
    claim.sourceCensusContractDigest !== census.digest ||
    claim.forcingSupplementDigest !== supplement.digest ||
    contract.campaignId !== census.campaignId ||
    contract.inputJoins.censusContractDigest !== census.digest ||
    contract.inputJoins.forcingSupplementDigest !== supplement.digest ||
    contract.inputJoins.samplingFrameDigest !== canonicalU1FrameDigest(replay)
  )
    throw Error("classification runner frozen joins invalid");
  verifyV3ForcingIdentityMapping(
    contract,
    supplement,
    input.forcingIdentityMapping,
  );
  const evidence: V3Evidence[] = [],
    rawBytes: Record<string, string> = {},
    batchAttempts: V3BatchAttempt[] = [],
    completed: ClassificationRunnerOutcome[] = [],
    nodeById = new Map(input.nodes.map((x) => [x.nodeId, x]));
  if (nodeById.size !== input.nodes.length)
    throw Error("classification runner node identity invalid");
  const expected = new Map<
    string,
    { repository: string; membership: "frame" | "forcing" }
  >();
  for (const x of frame)
    expected.set(x.nodeId, {
      repository: x.metadata.repository,
      membership: "frame",
    });
  for (const p of input.forcingIdentityMapping.pairs)
    if (!expected.has(p.nodeId))
      expected.set(p.nodeId, {
        repository: p.repository,
        membership: "forcing",
      });
  if (
    expected.size !== nodeById.size ||
    [...expected].some(([id, x]) => {
      const n = nodeById.get(id);
      return (
        !n ||
        n.repository.toLowerCase() !== x.repository.toLowerCase() ||
        n.membership !== x.membership
      );
    })
  )
    throw Error("classification runner node/frame join invalid");
  for (const n of input.nodes) {
    const expectedNodeBlobs = new Set([
      n.commitEvidence.digest,
      ...n.repositoryEvidence.map((x) => x.bodyDigest),
    ]);
    if (
      canonicalSemanticJson([...Object.keys(n.rawBytes)].sort()) !==
      canonicalSemanticJson([...expectedNodeBlobs].sort())
    )
      throw Error("classification runner blob inventory invalid");
    validateV3NodeEvidence({ ...n, frameFreeze, censusCutoff });
    evidence.push(n.commitEvidence, ...n.repositoryEvidence);
    for (const key of expectedNodeBlobs) rawBytes[key] = n.rawBytes[key]!;
  }
  if (
    canonicalV3RepositoryCorpusDigest(evidence) !==
    contract.inputJoins.repositoryEvidenceDigest
  )
    throw Error("classification runner repository corpus join invalid");
  const reviews = new Map<string, Partial<Record<Authority, V3Review>>>(),
    decisions = new Map<
      U1ReviewerRole,
      Map<string, ClassificationRunnerOutcome>
    >();
  const invalidate = (
    reason: U1ClassificationRunInvalidation["custody"]["reason"],
    cause?: unknown,
  ): never => {
    throw new U1ClassificationRunInvalidation(
      {
        reason,
        evidence: structuredClone(evidence),
        rawBytes: structuredClone(rawBytes),
        batchAttempts: structuredClone(batchAttempts),
        completed: structuredClone(completed),
      },
      { cause },
    );
  };
  let lastObserved = frameFreeze;
  const runPhase = async (
    role: U1ReviewerRole,
    nodeIds: string[],
    phaseDigest: Sha | null,
  ) => {
    const policy = contract.reviewers.find((x) => x.role === role)!,
      out = new Map<string, ClassificationRunnerOutcome>(),
      batches = deterministicU1Batches(contract, role, nodeIds);
    for (const [membersIds, batchIndex] of batches.map(
      (x, i) => [x, i] as const,
    )) {
      const members = membersIds.map((nodeId) => {
          const n = nodeById.get(nodeId)!;
          return {
            nodeId,
            inputDigest: hash("open-autonomy.u1.review-input.v2", {
              nodeId,
              repository: n.repository,
              membership: n.membership,
              domainPredicate: contract.domainPredicate,
              repositoryEvidence: n.repositoryEvidence.map((x) => x.digest),
            }),
          };
        }),
        batchInputDigest = hash("open-autonomy.u1.review-batch-input.v3", {
          role,
          batchIndex,
          members,
        });
      let terminal = false;
      for (
        let attempt = 1;
        attempt <= contract.batching.maximumAttemptsPerBatch && !terminal;
        attempt++
      ) {
        const startedAt = input.clock.now(),
          ready = Math.max(
            ...membersIds.flatMap((id) =>
              nodeById
                .get(id)!
                .repositoryEvidence.map((x) => Date.parse(x.acquiredAt)),
            ),
            Date.parse(frameFreeze),
          );
        if (
          !utc(startedAt) ||
          Date.parse(startedAt) <= ready ||
          startedAt <= lastObserved ||
          startedAt >= censusCutoff
        )
          invalidate("invalid-clock");
        const runId = `${role}-${batchIndex}-${attempt}`,
          authority: Authority = role === "adjudicator" ? "third" : role,
          blindTo: Authority[] = role === "independent" ? ["primary"] : [],
          request = {
            schema: "open-autonomy.u1-review-request.v1",
            runId,
            role,
            authorityId: policy.authorityId,
            provider: policy.provider,
            model: policy.model,
            modelRevision: policy.modelRevision,
            promptDigest: policy.promptDigest,
            toolPolicyDigest: policy.toolPolicyDigest,
            inputDigest: batchInputDigest,
            blindTo,
            batchIndex,
            attempt,
            phaseDigest,
            members,
          },
          requestBytes = bytes(request),
          requestDigest = rawDigest(requestBytes),
          requestEvidence: Extract<V3Evidence, { role: "review-request" }> = {
            digest: requestDigest,
            bytes: requestBytes.length,
            mediaType: "application/json",
            role: "review-request",
            runId,
            reviewer: policy.authorityId,
            authority,
            provider: policy.provider,
            model: policy.model,
            modelRevision: policy.modelRevision,
            promptDigest: policy.promptDigest,
            toolPolicyDigest: policy.toolPolicyDigest,
            inputDigest: batchInputDigest,
            startedAt,
            blindTo,
            batchIndex,
            attempt,
            phaseDigest,
          };
        evidence.push(requestEvidence);
        rawBytes[requestDigest] = requestBytes.toString("base64");
        try {
          const supplied = await input.provider({
              role,
              batchIndex,
              attempt,
              phaseDigest,
              batchInputDigest,
              members,
            }),
            completedAt = input.clock.now();
          if (
            !utc(completedAt) ||
            completedAt < startedAt ||
            completedAt > censusCutoff
          )
            invalidate("invalid-clock");
          lastObserved = completedAt;
          const outcomes = supplied?.outcomes;
          if (
            !Array.isArray(outcomes) ||
            outcomes.length !== members.length ||
            new Set(outcomes.map((x) => x.nodeId)).size !== outcomes.length ||
            outcomes.some(
              (x, i) =>
                Object.keys(x).sort().join(",") !==
                  (role === "primary"
                    ? "decision,descriptor,nodeId,reason"
                    : "decision,nodeId,reason") ||
                x.nodeId !== members[i]!.nodeId ||
                (x.decision !== "in-domain" &&
                  x.decision !== "out-of-domain") ||
                typeof x.reason !== "string" ||
                !x.reason.trim(),
            )
          )
            throw Error("invalid provider outcome");
          if (role === "primary")
            for (const x of outcomes)
              validateV3PrimaryDescriptor(x.descriptor!);
          const response = {
              schema: "open-autonomy.u1-review-response.v1",
              runId,
              requestDigest,
              inputDigest: batchInputDigest,
              decisions: outcomes,
            },
            responseBytes = bytes(response),
            responseDigest = rawDigest(responseBytes),
            responseEvidence: Extract<V3Evidence, { role: "review-response" }> =
              {
                digest: responseDigest,
                bytes: responseBytes.length,
                mediaType: "application/json",
                role: "review-response",
                runId,
                reviewer: policy.authorityId,
                authority,
                inputDigest: batchInputDigest,
                requestDigest,
                completedAt,
              };
          evidence.push(responseEvidence);
          rawBytes[responseDigest] = responseBytes.toString("base64");
          batchAttempts.push({
            role,
            batchIndex,
            attempt,
            runId,
            batchInputDigest,
            requestDigest,
            responseDigest,
            status: "success",
            failure: null,
          });
          for (const x of outcomes) {
            out.set(x.nodeId, x);
            completed.push(x);
            const n = nodeById.get(x.nodeId)!,
              member = members.find((m) => m.nodeId === x.nodeId)!;
            const review: V3Review = {
              reviewer: policy.authorityId,
              authority,
              decision: x.decision,
              reason: x.reason,
              inputDigest: member.inputDigest,
              requestDigest,
              responseDigest,
              repositoryEvidence: n.repositoryEvidence.map((e) => e.digest),
              ...(role === "primary"
                ? { descriptor: structuredClone(x.descriptor!) }
                : {}),
            };
            (reviews.get(x.nodeId) ?? reviews.set(x.nodeId, {}).get(x.nodeId)!)[
              authority
            ] = review;
          }
          terminal = true;
        } catch (cause) {
          if (cause instanceof U1ClassificationRunInvalidation) throw cause;
          const completedAt = input.clock.now();
          if (
            !utc(completedAt) ||
            completedAt < startedAt ||
            completedAt > censusCutoff
          )
            invalidate("invalid-clock", cause);
          lastObserved = completedAt;
          const failure = {
              code: "provider-error",
              message:
                cause instanceof Error ? cause.message : "provider rejected",
            },
            response = {
              schema: "open-autonomy.u1-review-failure.v1",
              runId,
              requestDigest,
              inputDigest: batchInputDigest,
              error: failure,
            },
            responseBytes = bytes(response),
            responseDigest = rawDigest(responseBytes),
            responseEvidence: Extract<V3Evidence, { role: "review-response" }> =
              {
                digest: responseDigest,
                bytes: responseBytes.length,
                mediaType: "application/json",
                role: "review-response",
                runId,
                reviewer: policy.authorityId,
                authority,
                inputDigest: batchInputDigest,
                requestDigest,
                completedAt,
              };
          evidence.push(responseEvidence);
          rawBytes[responseDigest] = responseBytes.toString("base64");
          batchAttempts.push({
            role,
            batchIndex,
            attempt,
            runId,
            batchInputDigest,
            requestDigest,
            responseDigest,
            status: "failed",
            failure,
          });
          if (attempt === contract.batching.maximumAttemptsPerBatch)
            invalidate(
              cause instanceof Error &&
                cause.message === "invalid provider outcome"
                ? "invalid-provider-outcome"
                : "batch-attempts-exhausted",
              cause,
            );
        }
      }
      if (!terminal) invalidate("batch-attempts-exhausted");
    }
    decisions.set(role, out);
    return out;
  };
  const frameIds = frame.map((x) => x.nodeId),
    primary = await runPhase("primary", [...expected.keys()], null),
    selectionParts = [
      [...frameIds],
      [
        ...input.forcingIdentityMapping.pairs
          .map((x) => x.nodeId)
          .filter((x) => !frameIds.includes(x)),
      ],
    ].map((ids) =>
      selectU1IndependentReview(
        contract,
        ids.map((nodeId) => ({
          nodeId,
          decision: primary.get(nodeId)!.decision,
        })),
      ),
    ),
    selection = { selected: selectionParts.flatMap((x) => x.selected) },
    primaryResponses = batchAttempts
      .filter((x) => x.role === "primary" && x.status === "success")
      .sort((a, b) => a.batchIndex - b.batchIndex)
      .map((x) => ({
        batchIndex: x.batchIndex,
        responseDigest: x.responseDigest,
      })),
    primaryPhase = hash("open-autonomy.u1.primary-phase.v3", {
      responses: primaryResponses,
      selectedNodeIds: [...selection.selected].sort(utf8),
    }),
    independent = await runPhase(
      "independent",
      selection.selected,
      primaryPhase,
    ),
    conflictIds = selection.selected
      .filter(
        (id) => independent.get(id)!.decision !== primary.get(id)!.decision,
      )
      .sort(utf8),
    conflictRows = conflictIds.map((nodeId) => ({
      nodeId,
      primaryResponseDigest: reviews.get(nodeId)!.primary!.responseDigest,
      independentResponseDigest:
        reviews.get(nodeId)!.independent!.responseDigest,
    })),
    conflictPhase = hash("open-autonomy.u1.conflict-phase.v3", conflictRows),
    adjudicated = conflictIds.length
      ? await runPhase("adjudicator", conflictIds, conflictPhase)
      : new Map<string, ClassificationRunnerOutcome>();
  const classifications: V3Classification[] = [...expected.keys()]
      .sort(utf8)
      .map((nodeId) => {
        const n = nodeById.get(nodeId)!,
          r = reviews.get(nodeId)!,
          decision =
            adjudicated.get(nodeId)?.decision ?? primary.get(nodeId)!.decision;
        return {
          nodeId,
          repository: n.repository,
          membership: n.membership,
          commitEvidence: n.commitEvidence.digest,
          primary: r.primary!,
          ...(r.independent ? { independent: r.independent } : {}),
          ...(r.third ? { third: r.third } : {}),
          finalDecision: decision,
        };
      }),
    forcingNodeIds = new Set(
      input.forcingIdentityMapping.pairs.map((x) => x.nodeId),
    );
  for (const pair of input.forcingIdentityMapping.pairs) {
    const registered = supplement.members.find(
        (x) => x.repository.toLowerCase() === pair.repository.toLowerCase(),
      ),
      classified = classifications.find((x) => x.nodeId === pair.nodeId);
    if (
      !registered ||
      !classified ||
      classified.primary.descriptor!.structuralStratum !==
        registered.structuralStratum
    )
      throw Error("forcing descriptor join invalid");
  }
  if (
    classifications.some(
      (x) =>
        forcingNodeIds.has(x.nodeId) && x.finalDecision === "out-of-domain",
    )
  )
    invalidate("forcing-out-of-domain");
  return { classifications, evidence, rawBytes, batchAttempts };
}
