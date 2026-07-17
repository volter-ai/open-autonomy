import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url),
  read = (path: string) =>
    JSON.parse(readFileSync(new URL(path, root), "utf8")),
  text = (path: string) => readFileSync(new URL(path, root), "utf8");

const exactInternalClaims = new Map([
  ["U1-I13", "every primary classification binds an exact raw-byte descriptor whose entity kind is SourceSystem, SourceOrganization, NativePlatform, or BehaviorHarness"],
  ["U1-I14", "entity-kind identifiers are normalized, nullable, mutually exclusive, and constrained by kind-specific non-null invariants"],
  ["U1-I15", "every descriptor has a nonempty normalized structural stratum and every forcing member including adoption overlap joins the registered forcing stratum"],
  ["U1-I16", "candidate descriptors are exact copies of the verified primary descriptor"],
  ["U1-I17", "candidate license is derived exactly from canonical replay metadata and is null for forcing members without replay metadata"],
]);

test("U1 closes local implementation while preserving every external obligation", () => {
  const closure = read(
      "docs/universality/campaign-v9/u1-implementation-closure.json",
    ),
    claim = read("docs/universality/campaign-v9/claim.json"),
    contract = read("docs/universality/campaign-v9/source-census-contract.json"),
    forcing = read("docs/universality/campaign-v9/forcing-supplement.json");
  expect(closure.status).toBe(
    "implementation-complete-external-validation-deferred",
  );
  expect(closure.claimDigest).toBe(claim.digest);
  expect(closure.sourceCensusContractDigest).toBe(contract.digest);
  expect(closure.forcingSupplementDigest).toBe(forcing.digest);
  expect(new Set(closure.obligations.map((x: any) => x.id)).size).toBe(
    closure.obligations.length,
  );
  expect(new Set(closure.externalDeferred.map((x: any) => x.id)).size).toBe(
    closure.externalDeferred.length,
  );
  expect(closure.obligations.map((x: any) => x.id)).toEqual(
    Array.from({ length: 17 }, (_, index) => `U1-I${index + 1}`),
  );
  for (const [id, claimText] of exactInternalClaims)
    expect(closure.obligations.find((x: any) => x.id === id)?.claim).toBe(
      claimText,
    );
  expect(closure.externalDeferred.map((x: any) => x.id)).toEqual([
    "U1-E1",
    "U1-E2",
    "U1-E3",
    "U1-E4",
  ]);
  expect(closure.obligations.find((x: any) => x.id === "U1-I7")?.claim).toBe(
    "registered forcing repositories bind exact node-ID pair records under the frozen authentication-policy reference",
  );
  expect(closure.externalDeferred.find((x: any) => x.id === "U1-E2")?.requires).toBe(
    "authenticated distinct reviewer authorities and real provider observations for every required review role",
  );
  for (const obligation of closure.obligations)
    expect(existsSync(new URL(obligation.evidence, root))).toBe(true);
  expect(closure.accounting).toEqual({
    openInternal: 0,
    dischargedInternal: closure.obligations.length,
    deferredExternal: closure.externalDeferred.length,
  });
  expect(closure.prohibitedClaims).toHaveLength(3);
  expect(
    existsSync(new URL("docs/universality/campaign-v9/source-population.json", root)),
  ).toBe(false);
  expect(closure.nextImplementation).toBe("U2");
});

test("U1 descriptor obligations join concrete verifier and adversarial proofs", () => {
  const verifier = text("packages/core/src/organization-source-population-v3.ts"),
    verifierTests = text("packages/core/src/organization-source-population-v3.test.ts"),
    runner = text("packages/core/src/organization-u1-classification-runner.ts"),
    runnerTests = text("packages/core/src/organization-u1-classification-runner.test.ts");
  for (const kind of [
    "SourceSystem",
    "SourceOrganization",
    "NativePlatform",
    "BehaviorHarness",
  ]) expect(verifier).toContain(`\"${kind}\"`);
  expect(verifier).toContain("validateV3PrimaryDescriptor");
  expect(verifier).toContain(
    "c.license !== canonicalV3CandidateLicense(frameMetadata)",
  );
  expect(verifier).toContain("canon(primaryDescriptor)");
  expect(runner).toContain("forcing descriptor join invalid");
  expect(verifierTests).toContain(
    "rejects descriptor mutation outside raw primary response custody",
  );
  expect(verifierTests).toContain("rejects candidate license substitution");
  expect(runnerTests).toContain(
    "forcing overlap remains terminal when its classification membership is frame",
  );
  expect(runnerTests).toContain(
    "rejects invalid primary descriptor kind and missing stratum",
  );
  expect(runnerTests).toContain(
    "unmodified runner output freezes as a trusted V3 population",
  );
});

test("U1 implementation closure permits only fixture-local U2 work", () => {
  const closure = read(
    "docs/universality/campaign-v9/u1-implementation-closure.json",
  );
  expect(closure.downstreamBoundary.allowed).toEqual([
    "U2 interface and fixture development that declares its population input synthetic",
    "U2 property tests whose denominators are fixture-local",
  ]);
  expect(closure.downstreamBoundary.forbidden).toEqual([
    "U2 checkpoint or semantic closure",
    "registration of a U2 empirical corpus",
    "publication or reuse of downstream empirical denominators",
    "treating this implementation closure as a completed U1 population gate",
  ]);
  expect(closure.downstreamBoundary.releaseCondition).toContain(
    "external U1 source-population.v3 digest",
  );
  expect(closure.downstreamBoundary.prerequisiteIds).toEqual([
    "U1-E1",
    "U1-E2",
    "U1-E3",
    "U1-E4",
  ]);
});
