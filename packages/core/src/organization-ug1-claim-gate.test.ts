import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  createUG1ClaimGateInput,
  freezeUG1ClaimGate,
  verifyFrozenUG1ClaimGate,
} from "./organization-ug1-claim-gate";
import artifact from "../../../docs/universality/campaign-v9/ug1-claim-gate.json";
const H = (x: string) =>
    `sha256:${createHash("sha256").update(x).digest("hex")}`,
  attack = (f: (x: any) => void, re = /UG1/) => {
    const x: any = createUG1ClaimGateInput();
    f(x);
    expect(() => freezeUG1ClaimGate(x)).toThrow(re);
  };
test("freezes UG1 as implementation complete with external validation deferred", () => {
  const v: any = freezeUG1ClaimGate(createUG1ClaimGateInput());
  expect(v.status).toBe("implementation-complete-external-validation-deferred");
  expect(v.passed).toBe(false);
  expect(v.accounting.externalDeferredCount).toBe(5);
  expect(verifyFrozenUG1ClaimGate(v)).toEqual(v);
  expect(Object.isFrozen(v.checkpoints[0])).toBe(true);
});
test("verifies the published UG1 deferred gate artifact", () =>
  expect(verifyFrozenUG1ClaimGate(artifact)).toEqual(artifact));
test("rejects passage promotion empirical relabel and retroactive anchor mutation", () => {
  attack((x) => (x.passed = true));
  attack((x) => (x.status = "passed"));
  attack((x) => (x.fixtureKind = "empirical"));
  attack((x) => (x.empiricalRegistration = true));
  attack((x) => (x.promotionAllowed = true));
  attack((x) => (x.retroactiveMutationAllowed = true));
  attack((x) => (x.checkpoints[0].byteDigest = H("mutated")), /anchor/);
  attack((x) => (x.checkpoints[1].status = "complete"), /anchor/);
});
test("rejects evidence graph and exact accounting attacks", () => {
  attack((x) => x.evidenceGraph.pop(), /graph/);
  attack((x) => (x.evidenceGraph[5].dependsOn = []), /graph/);
  attack((x) => x.checkpoints.pop(), /anchor/);
  attack((x) => (x.accounting.externalDeferredCount = 4), /accounting/);
  attack((x) => (x.accounting.passedCount = 1), /accounting/);
  attack((x) => x.prohibitedClaims.pop(), /prohibited/);
});
test("rejects digest replay resource cycle and preserves deep freeze", () => {
  const v: any = freezeUG1ClaimGate(createUG1ClaimGateInput()),
    d: any = structuredClone(v);
  d.digest = H("replay");
  expect(() => verifyFrozenUG1ClaimGate(d)).toThrow(/digest/);
  const h: any = createUG1ClaimGateInput();
  h.prohibitedClaims[0] = "x".repeat(100001);
  expect(() => freezeUG1ClaimGate(h)).toThrow(/field/);
  const c: any = createUG1ClaimGateInput();
  c.loop = c;
  expect(() => freezeUG1ClaimGate(c)).toThrow(/cyclic/);
  expect(Object.isFrozen(v.accounting)).toBe(true);
});
