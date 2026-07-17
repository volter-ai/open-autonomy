import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  freezeForcingWindowSupplement,
  freezeSourceCensusWindowContract,
  verifyForcingWindowSupplement,
  verifySourceCensusWindowContract,
  type FrozenForcingWindowSupplement,
  type FrozenSourceCensusWindowContract,
} from "./organization-universality-window-contract";
import { verifyFrozenUniversalityClaim, type FrozenUniversalityClaim } from "./organization-universality-claim";

const read = (name: string) => JSON.parse(readFileSync(`docs/universality/campaign-v6/${name}`, "utf8"));

test("U0 v6 freezes a finite exhaustive two-pass result union", () => {
  const contract = read("source-census-contract.json") as FrozenSourceCensusWindowContract;
  const forcing = read("forcing-supplement.json") as FrozenForcingWindowSupplement;
  const claim = read("claim.json") as FrozenUniversalityClaim;
  expect(verifySourceCensusWindowContract(contract)).toEqual(contract);
  expect(verifyForcingWindowSupplement(forcing)).toEqual(forcing);
  const verifiedClaim = verifyFrozenUniversalityClaim(claim);
  expect(verifiedClaim.sourceCensusContractDigest).toBe(contract.digest);
  expect(verifiedClaim.forcingSupplementDigest).toBe(forcing.digest);
  expect(contract.completion.aggregation.requiredCompletePasses).toBe(2);
  expect(contract.classification.samplingFrame).toBe(contract.completion.aggregation.samplingFrame);
  expect(contract.invalidation).toContain("accepted-response-at-or-after-cutoff");
});

test("U0 v6 rejects weakened, continuous-window, or divergent census semantics", () => {
  const contract = read("source-census-contract.json") as FrozenSourceCensusWindowContract;
  const mutations: Array<(x: any) => void> = [
    (x) => x.enumeration.rootQuery = "agent stars:>=1000",
    (x) => x.completion.aggregation.samplingFrame = "intersection",
    (x) => x.completion.aggregation.crossPassEquality = "required",
    (x) => x.completion.aggregation.observationScope = "continuous-window",
    (x) => x.completion.surplus = "semantic",
    (x) => x.classification.samplingFrame = "unique-node-ids-in-second-pass",
    (x) => x.invalidation = x.invalidation.filter((v: string) => v !== "accepted-response-at-or-after-cutoff"),
  ];
  for (const mutate of mutations) {
    const changed: any = structuredClone(contract);
    delete changed.digest;
    mutate(changed);
    expect(() => freezeSourceCensusWindowContract(changed)).toThrow();
  }
});

test("U0 v6 forcing semantics reject overlap, weight, and surplus ambiguity", () => {
  const forcing = read("forcing-supplement.json") as FrozenForcingWindowSupplement;
  const mutations: Array<(x: any) => void> = [
    (x) => x.populationWeight = 1,
    (x) => x.overlap = "at-population-instant",
    (x) => x.surplus = true,
    (x) => x.members[0].surplus = true,
  ];
  for (const mutate of mutations) {
    const changed: any = structuredClone(forcing);
    delete changed.digest;
    mutate(changed);
    expect(() => freezeForcingWindowSupplement(changed)).toThrow();
  }
});
