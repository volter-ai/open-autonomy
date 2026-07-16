import { expect, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  V5_NEGATIVE_CONTROLS,
  V5_SOURCE_ROLES,
  applyCanonicalV5NegativeMutation,
  projectV5LiveCellFromRecord,
  r24V5ArtifactDigest,
  r24V5PlanAuthorizationDigest,
  r24V5ResultAuthorizationDigest,
  r24V5SourceCustodyDigest,
  verifyR24V5LiveArtifact,
  type V5LiveArtifact,
} from "./organization-r24-v5-live-acceptance-contract";
import { v5ProtocolDigest } from "./organization-r24-v5-protocol";
import {
  matchedBenchmarkDigest,
  planMatchedV2,
  type V2Design,
} from "./organization-matched-benchmark";
import { createV5CellFixture } from "./test-support/organization-r24-v5-fixture";

const d = "sha256:" + "a".repeat(64),
  planner = generateKeyPairSync("ed25519"),
  resultCustodian = generateKeyPairSync("ed25519"),
  plannerPublic = planner.publicKey
    .export({ type: "spki", format: "pem" })
    .toString(),
  resultPublic = resultCustodian.publicKey
    .export({ type: "spki", format: "pem" })
    .toString(),
  sourceKeys = Object.fromEntries(
    V5_SOURCE_ROLES.map((role) => [role, generateKeyPairSync("ed25519")]),
  ) as Record<
    (typeof V5_SOURCE_ROLES)[number],
    ReturnType<typeof generateKeyPairSync>
  >,
  receiptKeyFor = (keyId: string) => `${keyId}:${"k".repeat(64)}`.slice(0, 48),
  trust = {
    signerKeyId: "planner-key",
    publicKeyPem: plannerPublic,
    resultSignerKeyId: "result-custodian-key",
    resultPublicKeyPem: resultPublic,
    sourcePublicKeys: Object.fromEntries(
      V5_SOURCE_ROLES.map((role) => [
        `source-${role}`,
        sourceKeys[role].publicKey
          .export({ type: "spki", format: "pem" })
          .toString(),
      ]),
    ),
    resolveReceiptKey: (keyId: string) => {
      if (!/^receipt-\d+-(?:hermes|paperclip)$/.test(keyId))
        throw Error("unknown receipt key id");
      return receiptKeyFor(keyId);
    },
  };

function signResult(a: V5LiveArtifact) {
  a.resultAuthorization.signature = sign(
    null,
    Buffer.from(r24V5ResultAuthorizationDigest(a)),
    resultCustodian.privateKey,
  ).toString("base64");
  const { digest: _digest, ...body } = a;
  a.digest = r24V5ArtifactDigest(body);
}

function resign(a: V5LiveArtifact) {
  a.plan.authorization.signature = sign(
    null,
    Buffer.from(r24V5PlanAuthorizationDigest(a.plan)),
    planner.privateKey,
  ).toString("base64");
  signResult(a);
}

function artifact(): V5LiveArtifact {
  const campaignDigest = v5ProtocolDigest("campaign"),
    fault = { id: "none", digest: v5ProtocolDigest("fault:none") },
    design: V2Design = {
      schema: "autonomy.matched-design.v2",
      seed: 73,
      units: ["u"],
      repetitions: 2,
      faults: [fault],
      primaryEndpoint: "portableScore",
      alpha: 0.05,
      multiplicity: "holm",
      missingness: "complete-pair",
      failureEstimand: "worst-score-and-observed-resources",
      strata: ["unit", "fault"],
      permutations: "exact-pair-swap",
    },
    exactAssignments = planMatchedV2(design),
    pairSummaries = exactAssignments
      .filter((assignment) => assignment.order === 0)
      .map(({ substrate, ...assignment }) => ({
        pairId: assignment.pairId,
        trialId: assignment.trialId,
        unitId: assignment.unitId,
        replication: assignment.replication,
        fault: assignment.fault,
        first: substrate,
      })),
    cells = exactAssignments.map((exactAssignment) => {
        const { substrate } = exactAssignment,
          assignmentDigest = v5ProtocolDigest(exactAssignment),
          nonce = Buffer.from(`${exactAssignment.replication}`.padEnd(32, "!"))
            .toString("hex")
            .slice(0, 64),
          receiptKeyId = `receipt-${exactAssignment.replication}-${substrate}`,
          receiptKey = receiptKeyFor(receiptKeyId),
          record = createV5CellFixture({
            substrate,
            pairId: exactAssignment.pairId,
            trialId: exactAssignment.trialId,
            replication: exactAssignment.replication,
            assignmentDigest,
            launcherSpecDigest: d,
            nonce,
            isolationId: `cell:${exactAssignment.replication}:${substrate}`,
            fault: exactAssignment.fault,
            receiptKey,
          });
        const bindingDigest = v5ProtocolDigest(record.binding),
          launched = record.attempts.find((x) => x.kind === "launched")!,
          sourceValues = {
            provider: launched.providerTranscript,
            supervisor: launched.trace.supervisor,
            meter: launched.trace.externalMeter,
            fault: record.fault,
            cleanup: { isolation: record.isolation, cleanup: record.cleanup },
            assistance: record.assistance,
          };
        record.sourceCustody = Object.fromEntries(
          V5_SOURCE_ROLES.map((role) => {
            const sourceDigest = r24V5ArtifactDigest(sourceValues[role] as any),
              signature = sign(
                null,
                Buffer.from(
                  r24V5SourceCustodyDigest(role, bindingDigest, sourceDigest),
                ),
                sourceKeys[role].privateKey,
              ).toString("base64");
            return [role, { keyId: `source-${role}`, sourceDigest, signature }];
          }),
        ) as NonNullable<typeof record.sourceCustody>;
        return projectV5LiveCellFromRecord(
          record,
          {
            pairId: exactAssignment.pairId,
            trialId: exactAssignment.trialId,
            unitId: exactAssignment.unitId,
            replication: exactAssignment.replication,
            substrate,
            order: exactAssignment.order,
            fault: exactAssignment.fault,
          },
          receiptKeyId,
          receiptKey,
        );
      }),
    bindings = cells.map((cell) => ({
      pairId: cell.pairId,
      substrate: cell.substrate,
      bindingDigest: cell.bindingDigest,
      receiptKeyId: cell.receiptKeyId,
      receiptKeyCommitment: r24V5ArtifactDigest({
        receiptKey: receiptKeyFor(cell.receiptKeyId),
      } as any),
      assignmentDigest: cell.assignmentDigest,
      launcherSpecDigest: cell.launcherSpecDigest,
      inputLockDigest: cell.inputLockDigest,
      challengeDigest: cell.challengeDigest,
      sourceKeyIds: Object.fromEntries(
        V5_SOURCE_ROLES.map((role) => [role, `source-${role}`]),
      ) as Record<(typeof V5_SOURCE_ROLES)[number], string>,
    })),
    inputLockDigest = v5ProtocolDigest(
      bindings
        .map(({ pairId, substrate, inputLockDigest }) => ({
          pairId,
          substrate,
          inputLockDigest,
        }))
        .sort((x, y) =>
          `${x.pairId}:${x.substrate}`.localeCompare(
            `${y.pairId}:${y.substrate}`,
          ),
        ),
    ),
    plan: V5LiveArtifact["plan"] = {
      schema: "autonomy.r24-authorized-plan.v1",
      campaignDigest,
      authorizedAt: "2026-07-15T00:00:00Z",
      notAfter: "2026-07-16T00:00:00Z",
      design,
      designDigest: matchedBenchmarkDigest(design),
      assignmentDigest: matchedBenchmarkDigest(exactAssignments),
      launcherDigest: d,
      launcherSpecDigest: d,
      inputLockDigest,
      bindings,
      assignments: exactAssignments,
      pairSummaries,
      authorization: {
        algorithm: "Ed25519",
        signerKeyId: "planner-key",
        signature: "",
      },
    };
  plan.authorization.signature = sign(
    null,
    Buffer.from(r24V5PlanAuthorizationDigest(plan)),
    planner.privateKey,
  ).toString("base64");
  const base = cells[0]!,
    negativeControls = V5_NEGATIVE_CONTROLS.map((id) => ({
      id,
      basePairId: base.pairId,
      baseSubstrate: base.substrate,
      mutatedRecordDigest: v5ProtocolDigest(
        applyCanonicalV5NegativeMutation(id, base.evidenceRecord),
      ),
    })),
    value: V5LiveArtifact = {
      schema: "autonomy.r24-v5-live-acceptance.v1",
      plan,
      cells,
      negativeControls,
      generatedAt: "2026-07-15T12:00:00Z",
      resultAuthorization: {
        algorithm: "Ed25519",
        signerKeyId: "result-custodian-key",
        signature: "",
      },
      digest: d,
    };
  signResult(value);
  return value;
}

test("accepts only signed plans and independently signed canonical raw-record projections", () => {
  expect(verifyR24V5LiveArtifact(artifact(), trust)).toBe(true);
});

test("rejects post-plan summary fabrication, raw receipt tampering, fake controls, and trust substitution", () => {
  for (const mutate of [
    (a: V5LiveArtifact) => (a.cells[0]!.native.runId = "fabricated"),
    (a: V5LiveArtifact) => {
      const launched = a.cells[0]!.evidenceRecord.attempts.find(
        (x) => x.kind === "launched",
      )!;
      launched.trace.log = launched.trace.log.replace(/"mac":"./, '"mac":"0');
    },
    (a: V5LiveArtifact) => (a.negativeControls[0]!.mutatedRecordDigest = d),
    (a: V5LiveArtifact) =>
      (a.cells[0]!.evidenceRecord.sourceCustody!.provider.signature = "forged"),
  ]) {
    const a = artifact();
    mutate(a);
    signResult(a);
    expect(() => verifyR24V5LiveArtifact(a, trust)).toThrow();
  }
  expect(() =>
    verifyR24V5LiveArtifact(artifact(), {
      ...trust,
      resolveReceiptKey: () => "wrong-key-wrong-key-wrong-key-wrong",
    }),
  ).toThrow();
  const collapsed = artifact();
  collapsed.resultAuthorization.signature = sign(
    null,
    Buffer.from(r24V5ResultAuthorizationDigest(collapsed)),
    planner.privateKey,
  ).toString("base64");
  const { digest: _digest, ...collapsedBody } = collapsed;
  collapsed.digest = r24V5ArtifactDigest(collapsedBody);
  expect(() =>
    verifyR24V5LiveArtifact(collapsed, {
      ...trust,
      resultPublicKeyPem: `${plannerPublic}\n`,
    }),
  ).toThrow("independent result authorization");
});

test("rejects any covered plan mutation without the planner key", () => {
  const a = artifact();
  a.plan.launcherSpecDigest = "sha256:" + "b".repeat(64);
  signResult(a);
  expect(() => verifyR24V5LiveArtifact(a, trust)).toThrow(
    "invalid matched plan",
  );
});

test("rejects planner-signed divergence from the sole V2 assignment authority", () => {
  for (const mutate of [
    (a: V5LiveArtifact) => a.plan.assignments.reverse(),
    (a: V5LiveArtifact) => a.plan.assignments.pop(),
    (a: V5LiveArtifact) =>
      (a.plan.assignments[0]!.order = a.plan.assignments[0]!.order ? 0 : 1),
    (a: V5LiveArtifact) =>
      (a.plan.pairSummaries[0]!.first =
        a.plan.pairSummaries[0]!.first === "hermes" ? "paperclip" : "hermes"),
  ]) {
    const a = artifact();
    mutate(a);
    resign(a);
    expect(() => verifyR24V5LiveArtifact(a, trust)).toThrow(
      "seeded assignment replay failed",
    );
  }
});
