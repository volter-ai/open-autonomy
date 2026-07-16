import { expect, test } from "bun:test";
import {
  createHash,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  V2_METRICS,
  type V2Measure,
  type V2Design,
} from "./organization-matched-benchmark";
import {
  analyzeVerifiedR24V5Artifact,
  collectSignedV5AccountingEvidence,
  collectSignedV5PortableEvidence,
  finalizeVerifiedR24V5Bundle,
  r24V5AccountingEvidenceDigest,
  type V5AccountingEvidence,
  type V5PortableEvidence,
  verifyR24V5MatchedBundle,
} from "./organization-r24-v5-matched-projection";
import {
  assembleAuthorizedV5Artifact,
  createAuthorizedV5Plan,
} from "./organization-r24-v5-bundle-composer";
import { writeR24V5BundleAtomic } from "./organization-r24-v5-bundle-store";
import { createV5CellFixture } from "./test-support/organization-r24-v5-fixture";
import { canonicalSemanticJson } from "./organization-canonical";
import { deriveR24DifferenceInventory, verifyR24ExternalClosure, type ClosureSigned, type R24ExternalCampaign, type R24ExternalClosureTrust } from "./organization-r24-external-closure";
import { acceptR24Bundle, acceptR24Closure, acceptR24Evidence, acceptR24Preregistration, assembleR24, createR24State, issueR24Bundle, issueR24Closure, issueR24Evidence, issueR24Preregistration, type R24Request, type R24Response } from "../../../bench/dev/evidence/r24-acquisition";

const d = "sha256:" + "a".repeat(64),
  planner = generateKeyPairSync("ed25519"),
  resultCustodian = generateKeyPairSync("ed25519"),
  grader = generateKeyPairSync("ed25519"),
  accountant = generateKeyPairSync("ed25519"),
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
  keyFingerprint = (key: ReturnType<typeof generateKeyPairSync>["publicKey"]) =>
    createHash("sha256")
      .update(key.export({ type: "spki", format: "der" }))
      .digest("hex"),
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
    faults = ["f0", "f1"].map((id) => ({ id, digest: v5ProtocolDigest(`fault:${id}`) })),
    design: V2Design = {
      schema: "autonomy.matched-design.v2",
      seed: 73,
      units: ["u0", "u1"],
      repetitions: 4,
      faults,
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
    cells = exactAssignments.map((exactAssignment, assignmentIndex) => {
        const { substrate } = exactAssignment,
          assignmentDigest = v5ProtocolDigest(exactAssignment),
          nonce = createHash("sha256").update(exactAssignment.pairId).digest("hex"),
          receiptKeyId = `receipt-${assignmentIndex}-${substrate}`,
          receiptKey = receiptKeyFor(receiptKeyId),
          record = createV5CellFixture({
            substrate,
            pairId: exactAssignment.pairId,
            trialId: exactAssignment.trialId,
            replication: exactAssignment.replication,
            assignmentDigest,
            launcherSpecDigest: d,
            nonce,
            isolationId: `cell:${assignmentIndex}:${substrate}`,
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
      grader: {
        policyDigest: d,
        signerKeyId: "grader-key",
        publicKeyFingerprint: keyFingerprint(grader.publicKey),
        trustRegistryDigest: "sha256:" + "c".repeat(64),
      },
      accounting: {
        policyDigest: "sha256:" + "b".repeat(64),
        signerKeyId: "accounting-key",
        publicKeyFingerprint: keyFingerprint(accountant.publicKey),
        trustRegistryDigest: "sha256:" + "c".repeat(64),
      },
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

function observed(value: number, unit: string, provenance: string): V2Measure {
  const raw = { value, unit, provenance };
  return {
    status: "observed",
    value,
    unit,
    provenance,
    raw,
    rawDigest: matchedBenchmarkDigest(raw),
  };
}

function projectedEvidence(a: V5LiveArtifact, completeAccounting = false) {
  const portable: V5PortableEvidence[] = [],
    accounting: V5AccountingEvidence[] = [];
  for (const cell of a.cells) {
    const score = observed(1, "ratio", "portable-grader"),
      unknown = (unit: string): V2Measure => ({
        status: "unknown",
        value: null,
        unit,
        reason: "provider did not expose a signed observation",
        provenance: "accounting-collector",
      }),
      p = collectSignedV5PortableEvidence(
        a,
        cell.pairId,
        cell.substrate,
        {
          outcome: { accepted: true },
          portableTrace: [{ grader: "portable" }],
          portableScore: score,
        },
        {
          keyId: "grader-key",
          sign: (digest) =>
            sign(null, Buffer.from(digest), grader.privateKey).toString("base64"),
        },
      ),
      ac = collectSignedV5AccountingEvidence(
        a,
        cell.pairId,
        cell.substrate,
        score,
        {
          tokens: completeAccounting ? observed(1, "token", "accounting-collector") : unknown("token"),
          computeUnits: completeAccounting ? observed(1, "compute-unit", "accounting-collector") : unknown("compute-unit"),
          moneyUsd: completeAccounting ? observed(1, "USD", "accounting-collector") : unknown("USD"),
        },
        {
          keyId: "accounting-key",
          sign: (digest) =>
            sign(null, Buffer.from(digest), accountant.privateKey).toString(
              "base64",
            ),
        },
      );
    portable.push(p);
    accounting.push(ac);
  }
  return { portable, accounting };
}

test("projects verified V5 evidence canonically into the matched V2 analyzer", () => {
  const a = artifact(),
    evidence = projectedEvidence(a),
    result = analyzeVerifiedR24V5Artifact(
      a,
      evidence.portable,
      evidence.accounting,
      {
        ...trust,
        graderPublicKeys: {
          "grader-key": grader.publicKey
            .export({ type: "spki", format: "pem" })
            .toString(),
        },
        accountingPublicKeys: {
          "accounting-key": accountant.publicKey
            .export({ type: "spki", format: "pem" })
            .toString(),
        },
      },
      "2026-07-15T12:01:00Z",
    );
  expect(result.assignments).toEqual(a.plan.assignments);
  expect(result.cells).toHaveLength(a.cells.length);
  expect(result.cells.every((cell) => cell.measures.tokens.status === "unknown"))
    .toBe(true);
});

test("rejects signed accounting drift and max-RSS substitution for memory integration", () => {
  const projectionTrust = {
    ...trust,
    graderPublicKeys: {
      "grader-key": grader.publicKey
        .export({ type: "spki", format: "pem" })
        .toString(),
    },
    accountingPublicKeys: {
      "accounting-key": accountant.publicKey
        .export({ type: "spki", format: "pem" })
        .toString(),
    },
  };
  for (const mutate of [
    (e: V5AccountingEvidence) => {
      const wall = e.measures.wallTimeMs;
      if (wall.status !== "observed") throw Error("fixture wall absent");
      e.measures.wallTimeMs = observed(
        wall.value + 1,
        wall.unit,
        wall.provenance,
      );
    },
    (e: V5AccountingEvidence) => {
      e.measures.memoryByteMs = observed(
        1024,
        "byte-ms",
        "max-rss-substitution",
      );
    },
    (e: V5AccountingEvidence) => {
      e.nativeMeterJoins.wall = d;
    },
    (e: V5AccountingEvidence) => {
      e.measures.memoryByteMs = {
        status: "unknown",
        value: null,
        unit: "byte-ms",
        reason: "selectively suppressed",
        provenance: "accounting-collector",
      };
    },
    (e: V5AccountingEvidence) => {
      const cpu = e.measures.cpuMs;
      if (cpu.status !== "observed") throw Error("fixture CPU absent");
      e.measures.cpuMs = { ...cpu, unit: "seconds" };
    },
  ]) {
    const a = artifact(),
      evidence = projectedEvidence(a),
      target = evidence.accounting[0]!;
    mutate(target);
    target.signature = sign(
      null,
      Buffer.from(r24V5AccountingEvidenceDigest(target)),
      accountant.privateKey,
    ).toString("base64");
    expect(() =>
      analyzeVerifiedR24V5Artifact(
        a,
        evidence.portable,
        evidence.accounting,
        projectionTrust,
        "2026-07-15T12:01:00Z",
      ),
    ).toThrow();
  }
});

test("rejects cross-campaign evidence replay and globally overlapping evidence roles", () => {
  const original = artifact(),
    evidence = projectedEvidence(original),
    fresh = artifact();
  fresh.plan.campaignDigest = "sha256:" + "c".repeat(64);
  resign(fresh);
  const graderPem = grader.publicKey
      .export({ type: "spki", format: "pem" })
      .toString(),
    accountantPem = accountant.publicKey
      .export({ type: "spki", format: "pem" })
      .toString(),
    baseProjectionTrust = {
      ...trust,
      graderPublicKeys: { "grader-key": graderPem },
      accountingPublicKeys: { "accounting-key": accountantPem },
    };
  expect(() =>
    analyzeVerifiedR24V5Artifact(
      fresh,
      evidence.portable,
      evidence.accounting,
      baseProjectionTrust,
      "2026-07-15T12:01:00Z",
    ),
  ).toThrow("projected evidence independence or provenance invalid");
  expect(() =>
    analyzeVerifiedR24V5Artifact(
      original,
      evidence.portable,
      evidence.accounting,
      {
        ...baseProjectionTrust,
        accountingPublicKeys: {
          "accounting-key": accountantPem,
          "unused-overlap": graderPem,
        },
      },
      "2026-07-15T12:01:00Z",
    ),
  ).toThrow("projected evidence cardinality mismatch");
});

test("production composer derives and signs the plan and artifact without caller summaries", () => {
  const fixture = artifact(),
    preparedCells = fixture.plan.assignments.map((assignment) => {
      const cell = fixture.cells.find(
          (candidate) =>
            candidate.pairId === assignment.pairId &&
            candidate.substrate === assignment.substrate,
        )!,
        authorized = fixture.plan.bindings.find(
          (candidate) =>
            candidate.pairId === assignment.pairId &&
            candidate.substrate === assignment.substrate,
        )!;
      return {
        assignment,
        binding: cell.evidenceRecord.binding,
        receiptKeyId: authorized.receiptKeyId,
        receiptKey: receiptKeyFor(authorized.receiptKeyId),
        sourceKeyIds: authorized.sourceKeyIds,
      };
    }),
    plan = createAuthorizedV5Plan(
      {
        campaignDigest: fixture.plan.campaignDigest,
        authorizedAt: fixture.plan.authorizedAt,
        notAfter: fixture.plan.notAfter,
        design: fixture.plan.design,
        launcherDigest: fixture.plan.launcherDigest,
        launcherSpecDigest: fixture.plan.launcherSpecDigest,
        grader: fixture.plan.grader,
        accounting: fixture.plan.accounting,
        preparedCells,
      },
      {
        keyId: "planner-key",
        sign: (digest) =>
          sign(null, Buffer.from(digest), planner.privateKey).toString("base64"),
      },
    ),
    composed = assembleAuthorizedV5Artifact(
      plan,
      fixture.cells.map((cell) => cell.evidenceRecord),
      Object.fromEntries(
        preparedCells.map((cell) => [cell.receiptKeyId, cell.receiptKey]),
      ),
      fixture.generatedAt,
      {
        keyId: "result-custodian-key",
        sign: (digest) =>
          sign(null, Buffer.from(digest), resultCustodian.privateKey).toString(
            "base64",
          ),
      },
    );
  expect(plan.assignments).toEqual(planMatchedV2(fixture.plan.design));
  expect(verifyR24V5LiveArtifact(composed, trust)).toBe(true);
});

test("final bundle replays analysis and publishes immutably despite orphan temporaries", async () => {
  const a = artifact(),
    evidence = projectedEvidence(a),
    projectionTrust = {
      ...trust,
      graderPublicKeys: {
        "grader-key": grader.publicKey
          .export({ type: "spki", format: "pem" })
          .toString(),
      },
      accountingPublicKeys: {
        "accounting-key": accountant.publicKey
          .export({ type: "spki", format: "pem" })
          .toString(),
      },
    },
    bundle = finalizeVerifiedR24V5Bundle(
      a,
      evidence.portable,
      evidence.accounting,
      projectionTrust,
      "2026-07-15T12:01:00Z",
    ),
    dir = mkdtempSync(join(tmpdir(), "oa-r24-v5-")),
    path = join(dir, "bundle.json");
  try {
    expect(verifyR24V5MatchedBundle(bundle, projectionTrust)).toEqual(
      bundle.analysis,
    );
    writeFileSync(`${path}.999.crashed.tmp`, "orphan");
    const invalidFirstWriter = structuredClone(bundle);
    invalidFirstWriter.digest = "sha256:" + "0".repeat(64);
    await expect(
      writeR24V5BundleAtomic(path, invalidFirstWriter, projectionTrust),
    ).rejects.toThrow("digest invalid");
    expect(existsSync(path)).toBe(false);
    expect(await writeR24V5BundleAtomic(path, bundle, projectionTrust)).toBe(
      bundle.digest,
    );
    expect(JSON.parse(readFileSync(path, "utf8")).digest).toBe(bundle.digest);
    await expect(
      writeR24V5BundleAtomic(path, bundle, projectionTrust),
    ).rejects.toThrow();
    const tampered = structuredClone(bundle);
    tampered.analysis.createdAt = "2026-07-15T12:02:00Z";
    expect(() => verifyR24V5MatchedBundle(tampered, projectionTrust)).toThrow();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("production external closure accepts a complete independently signed V5 study", () => {
  const a = artifact(), evidence = projectedEvidence(a, true), projectionTrust = { ...trust,
    graderPublicKeys: { "grader-key": grader.publicKey.export({ type: "spki", format: "pem" }).toString() },
    accountingPublicKeys: { "accounting-key": accountant.publicKey.export({ type: "spki", format: "pem" }).toString() },
  }, bundle = finalizeVerifiedR24V5Bundle(a, evidence.portable, evidence.accounting, projectionTrust, "2026-07-15T12:01:00Z"),
    closureIds = ["preregistration", "equivalence", "triage", "closure"], dependencyIds = ["R15", "R16", "R21", "R22", "R23"] as const,
    closureKeys = Object.fromEntries(closureIds.map((id) => [id, generateKeyPairSync("ed25519")])), dependencyKeys = Object.fromEntries(dependencyIds.map((id) => [id, generateKeyPairSync("ed25519")])),
    closurePublicKeys = Object.fromEntries(closureIds.map((id) => [id, closureKeys[id]!.publicKey.export({ type: "spki", format: "pem" }).toString()])),
    digest = (x: unknown) => `sha256:${createHash("sha256").update(canonicalSemanticJson(x)).digest("hex")}`,
    signed = <T,>(purpose: "preregistration" | "equivalence" | "triage" | "closure", keyId: string, body: T, signedAt: string): ClosureSigned<T> => { const value = { body, digest: digest(body), keyId, signedAt }, signature = sign(null, Buffer.from(canonicalSemanticJson({ purpose, ...value })), closureKeys[keyId]!.privateKey).toString("base64"); return { ...value, signature }; },
    preregistration = signed("preregistration", "preregistration", { planDigest: digest(a.plan), designDigest: matchedBenchmarkDigest(a.plan.design), authorizedBefore: "2026-07-14T00:00:00Z", minimumIndependentUnits: 2, minimumRepetitions: 4, minimumFaultStrata: 2, requiredMetrics: [...V2_METRICS], requireCompletePairs: true as const, requireOrderSensitivity: true as const, requireLeaveUnitOut: true as const, requireLeaveFaultOut: true as const }, "2026-07-14T00:00:00Z"),
    equivalence = a.plan.pairSummaries.flatMap(({ pairId }) => ["isolation", "credential-scope", "provider-revision", "provider-config", "provider-command"].map((path) => { const h = a.cells.find((x) => x.pairId === pairId && x.substrate === "hermes")!, p = a.cells.find((x) => x.pairId === pairId && x.substrate === "paperclip")!; return signed("equivalence", "equivalence", { pairId, path, hermesDigest: h.locks.find((x) => x.path === path)!.digest, paperclipDigest: p.locks.find((x) => x.path === path)!.digest, equivalent: true as const, evidenceDigest: digest({ pairId, path }) }, "2026-07-15T12:02:00Z"); })),
    triage = deriveR24DifferenceInventory(bundle).map((difference) => signed("triage", "triage", { differenceId: difference.id, disposition: "expected-substrate" as const, rationale: `registered substrate difference in ${difference.category}`, evidenceDigests: [digest(difference)] }, "2026-07-15T12:02:00Z")),
    dependencyRegistry = Object.fromEntries(dependencyIds.map((checkpoint) => [checkpoint, { verifierId: `verifier-${checkpoint}`, policyDigest: digest(`policy-${checkpoint}`), role: `dependency-${checkpoint}`, keyId: `dependency-key-${checkpoint}`, publicKeyPem: dependencyKeys[checkpoint]!.publicKey.export({ type: "spki", format: "pem" }).toString() }])) as R24ExternalClosureTrust["dependencyRegistry"],
    dependencies = dependencyIds.map((checkpoint) => { const registered = dependencyRegistry[checkpoint], artifact = { checkpoint, closed: true }, body = { checkpoint, artifact, artifactDigest: digest(artifact), policyDigest: registered.policyDigest, verifierId: registered.verifierId, role: registered.role, keyId: registered.keyId, verifiedAt: "2026-07-15T11:00:00Z" }; return { ...body, signature: sign(null, Buffer.from(canonicalSemanticJson(body)), dependencyKeys[checkpoint]!.privateKey).toString("base64") }; }),
    externalTrust: R24ExternalClosureTrust = { ...projectionTrust, closurePublicKeys, dependencyRegistry,
      verifyClosureSignature: (purpose, value) => verify(null, Buffer.from(canonicalSemanticJson({ purpose, body: value.body, digest: value.digest, keyId: value.keyId, signedAt: value.signedAt })), closurePublicKeys[value.keyId]!, Buffer.from(value.signature, "base64")),
      verifyDependency: (value) => { const { signature, ...body } = value; return verify(null, Buffer.from(canonicalSemanticJson(body)), dependencyRegistry[value.checkpoint].publicKeyPem, Buffer.from(signature, "base64")); },
    }, closureBody = { schema: "autonomy.r24-external-closure.v2" as const, closureClaim: true as const, bundle, bundleDigest: bundle.digest, preregistration, equivalence, triage, dependencies, generatedAt: "2026-07-15T12:03:00Z" }, closureSigned = signed("closure", "closure", closureBody, closureBody.generatedAt),
    campaign: R24ExternalCampaign = { ...closureBody, signerKeyId: closureSigned.keyId, digest: closureSigned.digest, signature: closureSigned.signature };
  expect(verifyR24ExternalClosure(campaign, externalTrust)).toEqual({ closed: true, studyConclusion: "inconclusive", bundleDigest: bundle.digest, pairs: 8, differences: triage.length });
  const publicKeys: Record<string, string> = { preregistration: closurePublicKeys.preregistration!, bundle: resultPublic, equivalence: closurePublicKeys.equivalence!, triage: closurePublicKeys.triage!, closure: closurePublicKeys.closure!, ...Object.fromEntries(dependencyIds.map((id) => [`dependency-key-${id}`, dependencyRegistry[id].publicKeyPem])) },
    acquisition = createR24State({ campaignId: "r24-complete", createdAt: "2026-07-14T00:00:00Z", preregistrationKeyId: "preregistration", bundleKeyId: "bundle", equivalenceKeyId: "equivalence", triageKeyId: "triage", closureKeyId: "closure", dependencyKeyIds: Object.fromEntries(dependencyIds.map((id) => [id, `dependency-key-${id}`])) as any, publicKeys }),
    acquisitionPrivate: Record<string, any> = { preregistration: closureKeys.preregistration!.privateKey, bundle: resultCustodian.privateKey, equivalence: closureKeys.equivalence!.privateKey, triage: closureKeys.triage!.privateKey, closure: closureKeys.closure!.privateKey, ...Object.fromEntries(dependencyIds.map((id) => [`dependency-key-${id}`, dependencyKeys[id]!.privateKey])) },
    responseKey = (q: R24Request) => q.action === "preregistration" ? "preregistration" : q.action === "bundle" ? "bundle" : q.action === "closure" ? "closure" : q.kind === "equivalence" ? "equivalence" : q.kind === "triage" ? "triage" : `dependency-key-${q.signerId}`,
    respond = (q: R24Request, fragment: unknown): R24Response => { const signerKeyId = responseKey(q), value = { schema: "open-autonomy.bench-r24-acquisition-response.v1" as const, requestDigest: digest(q) as `sha256:${string}`, fragmentDigest: digest(fragment) as `sha256:${string}`, signerKeyId, signedAt: closureBody.generatedAt }; return { ...value, signature: sign(null, Buffer.from(canonicalSemanticJson(value)), acquisitionPrivate[signerKeyId]).toString("base64"), fragment }; },
    acceptCell = (kind: "equivalence" | "triage" | "dependencies", id: string, fragment: unknown) => { const q = issueR24Evidence(acquisition, kind, id); acceptR24Evidence(acquisition, kind, id, respond(q, fragment)); };
  let q = issueR24Preregistration(acquisition); acceptR24Preregistration(acquisition, respond(q, preregistration)); q = issueR24Bundle(acquisition); acceptR24Bundle(acquisition, respond(q, bundle));
  for (const x of equivalence) acceptCell("equivalence", [x.body.pairId, x.body.path].map(encodeURIComponent).join("/"), x);
  for (const x of dependencies) acceptCell("dependencies", encodeURIComponent(x.checkpoint), x);
  for (const x of triage) acceptCell("triage", encodeURIComponent(x.body.differenceId), x);
  q = issueR24Closure(acquisition, closureBody.generatedAt); acceptR24Closure(acquisition, respond(q, { generatedAt: closureBody.generatedAt, signerKeyId: campaign.signerKeyId, digest: campaign.digest, signature: campaign.signature }));
  const assembled = assembleR24(acquisition); expect(canonicalSemanticJson(assembled)).toBe(canonicalSemanticJson(campaign)); expect(verifyR24ExternalClosure(assembled, externalTrust).closed).toBe(true);
}, 30_000);
