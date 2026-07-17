import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
  UNIVERSALITY_FLOORS,
  UNIVERSALITY_METRIC_CONTRACTS,
} from "./organization-universality-claim";

const read = (path: string) =>
  JSON.parse(readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8"));

test("v9 U0 closure joins every registered digest and closes no external work", () => {
  const closure = read("docs/universality/campaign-v9/u0-closure.json"),
    claim = read("docs/universality/campaign-v9/claim.json"),
    contract = read("docs/universality/campaign-v9/source-census-contract.json"),
    forcing = read("docs/universality/campaign-v9/forcing-supplement.json"),
    supersession = read("docs/universality/campaign-v9/supersession.json"),
    registration = read("docs/universality/campaign-v9/registration-manifest.json"),
    invalidation = read(
      "docs/universality/campaign-v9/predecessor-invalidation.json",
    );
  expect(closure.status).toBe("complete");
  expect(closure.claimDigest).toBe(claim.digest);
  expect(closure.sourceCensusContractDigest).toBe(contract.digest);
  expect(closure.forcingSupplementDigest).toBe(forcing.digest);
  expect(closure.supersessionDigest).toBe(supersession.digest);
  expect(closure.registrationManifestDigest).toBe(registration.digest);
  expect(closure.predecessorInvalidationDigest).toBe(invalidation.digest);
  expect(closure.obligationAccounting).toEqual({
    open: 0,
    discharged: closure.obligations.length,
    deferredExternal: 0,
  });
  expect(new Set(closure.obligations.map((x: any) => x.id)).size).toBe(
    closure.obligations.length,
  );
  for (const obligation of closure.obligations) {
    expect(closure.evidence).toContain(obligation.evidence);
    expect(closure.falsifiersExercised).toContain(obligation.falsifier);
  }
  for (const path of closure.evidence)
    expect(existsSync(new URL(`../../../${path}`, import.meta.url))).toBe(true);
  for (const file of registration.files) {
    const value = readFileSync(
      new URL(`../../../docs/universality/campaign-v9/${file.path}`, import.meta.url),
    );
    expect(value.length).toBe(file.bytes);
    expect(`sha256:${createHash("sha256").update(value).digest("hex")}`).toBe(
      file.digest,
    );
  }
  expect(claim.metrics.map((metric: any) => metric.metric)).toEqual([
    "diagnosticAccounting",
    "canonicalFactWeighted",
    "canonicalFactPerSystem",
    "mandatoryObservationWeighted",
    "mandatoryObservationPerSystem",
    "twoFamilyPortability",
    "certifiedCompatibleCompilation",
    "nativeExecutedPreservation",
    "compatibleCellExecutionSampling",
    "maxHoldoutDegradation",
    "maxSilentLoss",
    "maxResultDependentExclusion",
    "maxCriticalInventoryConflict",
  ]);
  for (const metric of claim.metrics)
    expect(Object.keys(metric).sort()).toEqual(
      [
        "assurance",
        "denominator",
        "direction",
        "metric",
        "numerator",
        "population",
        "threshold",
        "weight",
      ].sort(),
    );
  for (const metric of claim.metrics) {
    expect(metric.threshold).toBe(
      UNIVERSALITY_FLOORS[metric.metric as keyof typeof UNIVERSALITY_FLOORS],
    );
    expect({
      direction: metric.direction,
      numerator: metric.numerator,
      denominator: metric.denominator,
      weight: metric.weight,
      population: metric.population,
      assurance: metric.assurance,
    }).toEqual(
      UNIVERSALITY_METRIC_CONTRACTS[
        metric.metric as keyof typeof UNIVERSALITY_METRIC_CONTRACTS
      ],
    );
  }
  expect(closure.declaredBoundaries).toEqual([
    {
      id: "U0-B1",
      statement:
        "U0 closes the preregistered claim and executable census design; empirical v9 population capture and classification remain U1 work",
      next: "U1",
    },
  ]);
  expect(closure.residuals).toEqual([]);
});
