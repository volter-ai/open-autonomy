import {
  V5_NEGATIVE_CONTROLS,
  V5_SOURCE_ROLES,
  applyCanonicalV5NegativeMutation,
  projectV5LiveCellFromRecord,
  r24V5ArtifactDigest,
  r24V5PlanAuthorizationDigest,
  r24V5ResultAuthorizationDigest,
  type V5LiveArtifact,
  type V5SourceRole,
} from "./organization-r24-v5-live-acceptance-contract";
import {
  matchedBenchmarkDigest,
  planMatchedV2,
  type V2Assignment,
  type V2Design,
} from "./organization-matched-benchmark";
import { v5ProtocolDigest, type V5Binding } from "./organization-r24-v5-protocol";
import type { V5CellRecord } from "./organization-r24-v5-live-runner";

export interface V5DigestSigner {
  keyId: string;
  sign(digest: string): string;
}

export type V5PreparedCell = {
  assignment: V2Assignment;
  binding: V5Binding;
  receiptKeyId: string;
  receiptKey: string;
  sourceKeyIds: Record<V5SourceRole, string>;
};

export type V5PlanInput = {
  campaignDigest: string;
  authorizedAt: string;
  notAfter: string;
  design: V2Design;
  launcherDigest: string;
  launcherSpecDigest: string;
  grader: V5LiveArtifact["plan"]["grader"];
  accounting: V5LiveArtifact["plan"]["accounting"];
  preparedCells: V5PreparedCell[];
};

function pairSummaries(assignments: V2Assignment[]) {
  return assignments
    .filter((assignment) => assignment.order === 0)
    .map(({ pairId, trialId, unitId, replication, fault, substrate }) => ({
      pairId,
      trialId,
      unitId,
      replication,
      fault,
      first: substrate,
    }));
}

export function createAuthorizedV5Plan(
  input: V5PlanInput,
  signer: V5DigestSigner,
): V5LiveArtifact["plan"] {
  const assignments = planMatchedV2(input.design);
  if (
    !signer.keyId ||
    !/^sha256:[a-f0-9]{64}$/.test(input.campaignDigest) ||
    !/^sha256:[a-f0-9]{64}$/.test(input.launcherDigest) ||
    !/^sha256:[a-f0-9]{64}$/.test(input.launcherSpecDigest) ||
    !/^sha256:[a-f0-9]{64}$/.test(input.grader.policyDigest) ||
    !input.grader.signerKeyId ||
    !/^[a-f0-9]{64}$/.test(input.grader.publicKeyFingerprint) ||
    !/^sha256:[a-f0-9]{64}$/.test(input.grader.trustRegistryDigest) ||
    !/^sha256:[a-f0-9]{64}$/.test(input.accounting.policyDigest) ||
    !input.accounting.signerKeyId ||
    !/^[a-f0-9]{64}$/.test(input.accounting.publicKeyFingerprint) ||
    !/^sha256:[a-f0-9]{64}$/.test(input.accounting.trustRegistryDigest) ||
    input.grader.trustRegistryDigest !== input.accounting.trustRegistryDigest ||
    input.grader.publicKeyFingerprint === input.accounting.publicKeyFingerprint ||
    input.grader.signerKeyId === input.accounting.signerKeyId ||
    input.grader.signerKeyId === signer.keyId ||
    input.accounting.signerKeyId === signer.keyId ||
    !Number.isFinite(Date.parse(input.authorizedAt)) ||
    !Number.isFinite(Date.parse(input.notAfter)) ||
    Date.parse(input.authorizedAt) >= Date.parse(input.notAfter) ||
    input.preparedCells.length !== assignments.length
  )
    throw Error("R24 V5 plan input invalid");
  const preparedByCell = new Map(
    input.preparedCells.map((cell) => [
      `${cell.assignment.pairId}:${cell.assignment.substrate}`,
      cell,
    ]),
  );
  if (preparedByCell.size !== assignments.length)
    throw Error("R24 V5 prepared cell cardinality invalid");
  const prepared = assignments.map((assignment) => {
    const cell = preparedByCell.get(
      `${assignment.pairId}:${assignment.substrate}`,
    );
    if (
      !cell ||
      matchedBenchmarkDigest(cell.assignment) !==
        matchedBenchmarkDigest(assignment) ||
      cell.binding.pairId !== assignment.pairId ||
      cell.binding.trialId !== assignment.trialId ||
      cell.binding.replication !== assignment.replication ||
      cell.binding.substrate !== assignment.substrate ||
      cell.binding.assignmentDigest !== v5ProtocolDigest(assignment) ||
      cell.binding.launcherSpecDigest !== input.launcherSpecDigest ||
      !cell.receiptKeyId ||
      !cell.receiptKey ||
      V5_SOURCE_ROLES.some((role) => !cell.sourceKeyIds[role]) ||
      new Set(V5_SOURCE_ROLES.map((role) => cell.sourceKeyIds[role])).size !==
        V5_SOURCE_ROLES.length
    )
      throw Error("R24 V5 prepared cell differs from matched assignment");
    return cell;
  });
  if (
    new Set(prepared.map((cell) => cell.receiptKeyId)).size !==
      prepared.length ||
    new Set(prepared.map((cell) => v5ProtocolDigest({ receiptKey: cell.receiptKey })))
      .size !== prepared.length
  )
    throw Error("R24 V5 receipt authority reused");
  const bindings = prepared.map((cell) => ({
      pairId: cell.assignment.pairId,
      substrate: cell.assignment.substrate,
      bindingDigest: v5ProtocolDigest(cell.binding),
      receiptKeyId: cell.receiptKeyId,
      receiptKeyCommitment: v5ProtocolDigest({ receiptKey: cell.receiptKey }),
      assignmentDigest: cell.binding.assignmentDigest,
      launcherSpecDigest: cell.binding.launcherSpecDigest,
      inputLockDigest: cell.binding.lockDigest,
      challengeDigest: v5ProtocolDigest(cell.binding.nonce),
      sourceKeyIds: structuredClone(cell.sourceKeyIds),
    })),
    inputLockDigest = v5ProtocolDigest(
      bindings
        .map(({ pairId, substrate, inputLockDigest }) => ({
          pairId,
          substrate,
          inputLockDigest,
        }))
        .sort((a, b) =>
          `${a.pairId}:${a.substrate}`.localeCompare(`${b.pairId}:${b.substrate}`),
        ),
    ),
    plan: V5LiveArtifact["plan"] = {
      schema: "autonomy.r24-authorized-plan.v1",
      campaignDigest: input.campaignDigest,
      authorizedAt: input.authorizedAt,
      notAfter: input.notAfter,
      design: structuredClone(input.design),
      designDigest: matchedBenchmarkDigest(input.design),
      assignmentDigest: matchedBenchmarkDigest(assignments),
      launcherDigest: input.launcherDigest,
      launcherSpecDigest: input.launcherSpecDigest,
      inputLockDigest,
      grader: structuredClone(input.grader),
      accounting: structuredClone(input.accounting),
      authorization: {
        algorithm: "Ed25519",
        signerKeyId: signer.keyId,
        signature: "",
      },
      bindings,
      assignments,
      pairSummaries: pairSummaries(assignments),
    };
  plan.authorization.signature = signer.sign(r24V5PlanAuthorizationDigest(plan));
  if (!plan.authorization.signature) throw Error("R24 V5 plan signature absent");
  return plan;
}

export function assembleAuthorizedV5Artifact(
  plan: V5LiveArtifact["plan"],
  records: V5CellRecord[],
  receiptKeys: Record<string, string>,
  generatedAt: string,
  resultSigner: V5DigestSigner,
): V5LiveArtifact {
  if (
    !resultSigner.keyId ||
    resultSigner.keyId === plan.authorization.signerKeyId ||
    !Number.isFinite(Date.parse(generatedAt)) ||
    Date.parse(generatedAt) < Date.parse(plan.authorizedAt) ||
    Date.parse(generatedAt) > Date.parse(plan.notAfter) ||
    records.length !== plan.assignments.length
  )
    throw Error("R24 V5 result assembly input invalid");
  const recordsByCell = new Map(
    records.map((record) => [
      `${record.binding.pairId}:${record.binding.substrate}`,
      record,
    ]),
  );
  if (recordsByCell.size !== records.length)
    throw Error("R24 V5 result record cardinality invalid");
  const cells = plan.assignments.map((assignment) => {
    const record = recordsByCell.get(
        `${assignment.pairId}:${assignment.substrate}`,
      ),
      authorized = plan.bindings.find(
        (binding) =>
          binding.pairId === assignment.pairId &&
          binding.substrate === assignment.substrate,
      );
    if (!record || !authorized) throw Error("R24 V5 result cell absent");
    const receiptKey = receiptKeys[authorized.receiptKeyId];
    if (
      !receiptKey ||
      authorized.receiptKeyCommitment !==
        v5ProtocolDigest({ receiptKey }) ||
      v5ProtocolDigest(record.binding) !== authorized.bindingDigest
    )
      throw Error("R24 V5 result cell is not plan-authorized");
    return projectV5LiveCellFromRecord(
      record,
      assignment,
      authorized.receiptKeyId,
      receiptKey,
    );
  });
  const base = cells[0];
  if (!base) throw Error("R24 V5 result has no cells");
  const artifact: V5LiveArtifact = {
    schema: "autonomy.r24-v5-live-acceptance.v1",
    plan: structuredClone(plan),
    cells,
    negativeControls: V5_NEGATIVE_CONTROLS.map((id) => ({
      id,
      basePairId: base.pairId,
      baseSubstrate: base.substrate,
      mutatedRecordDigest: v5ProtocolDigest(
        applyCanonicalV5NegativeMutation(id, base.evidenceRecord),
      ),
    })),
    generatedAt,
    resultAuthorization: {
      algorithm: "Ed25519",
      signerKeyId: resultSigner.keyId,
      signature: "",
    },
    digest: "",
  };
  artifact.resultAuthorization.signature = resultSigner.sign(
    r24V5ResultAuthorizationDigest(artifact),
  );
  if (!artifact.resultAuthorization.signature)
    throw Error("R24 V5 result signature absent");
  const { digest: _digest, ...body } = artifact;
  artifact.digest = r24V5ArtifactDigest(body);
  return artifact;
}
