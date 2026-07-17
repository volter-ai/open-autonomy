import { expect, test } from "bun:test";
import attestation from "../../../docs/universality/campaign-v9/u4-implementation-closure-attestation.json";
import { createU4AuthenticatedTestFixture } from "./organization-u4-test-fixture";
import {
  authenticateU5SyntheticEvidence,
  authenticateU5SyntheticLedgerRow,
  createU5SyntheticSemanticOracleRegistry,
  digestU5DispositionLedger,
  freezeU5DispositionLedger,
  U5_DISPOSITIONS,
  U5_EXTENSION_SUBSTRATA,
  verifyFrozenU5DispositionLedger,
} from "./organization-u5-disposition-ledger";
import { createHash } from "node:crypto";
import { U5_SYNTHETIC_CREDIT_POLICY } from "./organization-u5-credit-policy";
import { canonicalSemanticJson as C } from "./organization-canonical";
const H = (x: string) =>
    `sha256:${createHash("sha256").update(x).digest("hex")}`,
  resign = (record: any, changes: any = {}) => {
    const {
      authorityReceipt: _,
      custodyReceipt: __,
      payloadBytes: ___,
      payloadDigest: ____,
      classifierReceipt: _____,
      ...body
    } = record;
    void _;
    void __;
    void ___;
    void ____;
    void _____;
    return authenticateU5SyntheticEvidence({ ...body, ...changes });
  },
  fixture = () => {
    const u: any = createU4AuthenticatedTestFixture(),
      policy = U5_SYNTHETIC_CREDIT_POLICY,
      semanticOracleRegistry: any = createU5SyntheticSemanticOracleRegistry(
        u.inventory,
        u.calculus,
      ),
      kind = (d: string) =>
        d === "preserved"
          ? "preservation-proof"
          : d === "derived"
            ? "derivation-proof"
            : d === "lowered"
              ? "lowering-proof"
              : d === "extension"
                ? "extension-proof"
                : d === "opaque"
                  ? "interoperability-proof"
                  : d === "abstracted"
                    ? "observational-indistinguishability-proof"
                    : d === "unsupported"
                      ? "unsupported-diagnostic"
                      : "incompatibility-core",
      payload = (f: any, d: string, sub: any) => {
        const factBytes = C({
            factId: f.id,
            semantic: f.semantic,
            default: f.default,
          }),
          ids = [...f.mandatoryObservationIds].sort(),
          observations = ids.map((observationId: string) => ({
            observationId,
            sourceValue: true,
            targetValue: true,
          }));
        if (d === "preserved")
          return {
            sourceBytes: factBytes,
            targetBytes: factBytes,
            sourceDigest: H(factBytes),
            targetDigest: H(factBytes),
            mandatoryObservations: observations,
          };
        if (d === "derived") {
          const cut = Math.max(1, Math.floor(f.denotation.length / 2));
          return {
            premiseFactDigest: H(factBytes),
            nodes: [
              {
                id: "a",
                op: "literal",
                inputs: [],
                value: f.denotation.slice(0, cut),
              },
              {
                id: "b",
                op: "literal",
                inputs: [],
                value: f.denotation.slice(cut),
              },
              { id: "result", op: "concat", inputs: ["a", "b"], value: null },
            ],
            outputNodeId: "result",
            outputValue: f.denotation,
          };
        }
        if (d === "lowered")
          return {
            map: [{ nativePath: f.nativePath, targetPath: f.nativePath }],
            losses: [],
            mandatoryObservations: observations,
            opaqueFallback: null,
          };
        if (d === "extension")
          return {
            extensionClass: f.semantic.extensionClass,
            opaqueVersion: f.semantic.opaqueVersion,
            namespace: `${f.sourceId}/${f.semantic.extensionClass}/${f.semantic.opaqueVersion}`,
            classification: sub,
          };
        if (d === "opaque") {
          const request = { factId: f.id, operation: "invoke" },
            events = ids.map((observationId: string) => ({
              observationId,
              value: "observed",
            })),
            response = { factId: f.id, accepted: true, terminal: true };
          return {
            request,
            mandatoryObservationIds: ids,
            events,
            response,
            traceDigest: H(C({ request, events, response })),
          };
        }
        if (d === "abstracted") {
          const ids = [...f.mandatoryObservationIds].sort(),
            trace = ids.map((observationId: string) => ({
              observationId,
              value: true,
            }));
          return {
            preregisteredObservationIds: ids,
            preregistrationDigest: H(
              C({
                factId: f.id,
                observationIds: ids,
                calculusDigest: u.calculus.digest,
              }),
            ),
            sourceTrace: trace,
            abstractTrace: structuredClone(trace),
          };
        }
        if (d === "unsupported")
          return {
            diagnosticCode: "capability-absent",
            attemptedCapability: f.semantic.to,
            observationIds: [...f.mandatoryObservationIds],
          };
        return {
          candidateCapabilities: [
            {
              id: "candidate.from",
              assignments: { [f.semantic.domain]: f.semantic.from },
            },
            {
              id: "candidate.to",
              assignments: { [f.semantic.domain]: f.semantic.to },
            },
          ],
          evaluations: [
            {
              candidateId: "candidate.from",
              feasible: false,
              unsatisfiedClauseIndexes: [1],
            },
            {
              candidateId: "candidate.to",
              feasible: false,
              unsatisfiedClauseIndexes: [0],
            },
          ],
          minimalUnsatisfiedCore: [
            { key: f.semantic.domain, value: f.semantic.from },
            { key: f.semantic.domain, value: f.semantic.to },
          ],
        };
      },
      pair = (f: any, d: any = "preserved", sub: any = null) => {
        const evidenceId = `evidence.${f.id}.${d}.${sub ?? "none"}`,
          evidence = authenticateU5SyntheticEvidence({
            id: evidenceId,
            factId: f.id,
            sourceId: f.sourceId,
            evidenceVersion: 1,
            signatureDomain: "open-autonomy.u5-evidence.v1",
            disposition: d,
            kind: kind(d),
            dependencies: [],
            payload: payload(f, d, sub),
            oracleId: `oracle.${f.id}`,
            oracleDigest: semanticOracleRegistry.find(
              (x: any) => x.factId === f.id,
            ).digest,
            classifierOwnerId:
              d === "extension" ? `extension-classifier.${f.id}` : null,
            evidenceOwnerId: `owner-record.${f.id}`,
            authorityOwnerId: `evidence-authority.${f.id}`,
            custodianOwnerId: `evidence-custodian.${f.id}`,
            issuedAt: "2026-07-18T00:00:00.000Z",
          }),
          row = authenticateU5SyntheticLedgerRow({
            factId: f.id,
            sourceId: f.sourceId,
            disposition: d,
            extensionSubstratum: sub,
            evidenceOwnerId: `owner-record.${f.id}`,
            evidenceId,
            weight: f.criticality === "critical" ? 2 : 1,
            canonicalCreditWeight: ["preserved", "derived", "lowered"].includes(
              d,
            )
              ? f.criticality === "critical"
                ? 2
                : 1
              : 0,
          });
        return { row, evidence };
      },
      pairs = u.inventory.facts.map((f: any) => pair(f)),
      ledger = pairs.map((x: any) => x.row),
      evidenceRegistry = pairs.map((x: any) => x.evidence),
      owners = u.inventory.facts.map((f: any) => ({
        id: `owner-record.${f.id}`,
        factId: f.id,
        ownerId: `evidence-owner.${f.id}`,
      })),
      account = (rows: any[]) => ({
        factCount: rows.length,
        denominatorWeight: rows.reduce((n, r) => n + r.weight, 0),
        canonicalCreditWeight: rows.reduce(
          (n, r) => n + r.canonicalCreditWeight,
          0,
        ),
        strata: U5_DISPOSITIONS.map((disposition) => {
          const rs = rows.filter((r) => r.disposition === disposition);
          return {
            disposition,
            count: rs.length,
            weight: rs.reduce((n, r) => n + r.weight, 0),
            canonicalCreditWeight: rs.reduce(
              (n, r) => n + r.canonicalCreditWeight,
              0,
            ),
          };
        }),
        extensionSubstrata: U5_EXTENSION_SUBSTRATA.map(
          (extensionSubstratum) => {
            const rs = rows.filter(
              (r) =>
                r.disposition === "extension" &&
                r.extensionSubstratum === extensionSubstratum,
            );
            return {
              extensionSubstratum,
              count: rs.length,
              weight: rs.reduce((n, r) => n + r.weight, 0),
            };
          },
        ),
      }),
      body: any = {
        schema: "open-autonomy.u5-disposition-ledger.v1",
        fixtureKind: "synthetic",
        denominatorScope: "fixture-local",
        empiricalRegistration: false,
        closureClaim: false,
        assurancePromotionAllowed: false,
        inventoryDigest: u.inventory.digest,
        closureAttestationDigest: (attestation as any).digest,
        policyDigest: policy.digest,
        semanticOracleRegistry,
        evidenceOwners: owners,
        evidenceRegistry,
        ledger,
        accounting: account(ledger),
      };
    return {
      u,
      policy,
      attestation,
      pair,
      account,
      body,
      frozen: freezeU5DispositionLedger(
        body,
        u.inventory,
        u.calculus,
        u.sourceRegistry,
        u.trusted,
        attestation,
        policy,
      ),
    };
  };
const attack = (f: (x: any, z: any) => void, re = /U5/) => {
  const z = fixture(),
    x = structuredClone(z.body);
  f(x, z);
  expect(() =>
    freezeU5DispositionLedger(
      x,
      z.u.inventory,
      z.u.calculus,
      z.u.sourceRegistry,
      z.u.trusted,
      attestation,
      z.policy,
    ),
  ).toThrow(re);
};
export const createU5LedgerTestFixture = () => fixture();
test("freezes total synthetic credit ledger against U4 inventory and attestation", () => {
  const z = fixture(),
    v: any = verifyFrozenU5DispositionLedger(
      z.frozen,
      z.u.inventory,
      z.u.calculus,
      z.u.sourceRegistry,
      z.u.trusted,
      attestation,
      z.policy,
    );
  expect(v).toEqual(z.frozen);
  expect(v.accounting.factCount).toBe(z.u.inventory.facts.length);
  expect(Object.isFrozen(v.evidenceRegistry[0])).toBe(true);
});
test("property: exact credit lattice holds across every disposition and extension substratum", () => {
  for (const d of U5_DISPOSITIONS)
    for (const sub of d === "extension" ? U5_EXTENSION_SUBSTRATA : [null]) {
      const z = fixture(),
        pairs = z.u.inventory.facts.map((f: any) => z.pair(f, d, sub)),
        rows = pairs.map((x: any) => x.row),
        x = {
          ...z.body,
          evidenceRegistry: pairs.map((x: any) => x.evidence),
          ledger: rows,
          accounting: z.account(rows),
        };
      const v: any = freezeU5DispositionLedger(
        x,
        z.u.inventory,
        z.u.calculus,
        z.u.sourceRegistry,
        z.u.trusted,
        attestation,
        z.policy,
      );
      expect(v.accounting.canonicalCreditWeight).toBe(
        ["preserved", "derived", "lowered"].includes(d)
          ? v.accounting.denominatorWeight
          : 0,
      );
    }
});
test("rejects credit inflation relabel policy substitution and noncanonical canonical credit", () => {
  attack((x) => x.ledger[0].canonicalCreditWeight++);
  attack(
    (x) => (x.ledger[0].disposition = "opaque"),
    /reachability|row authentication/,
  );
  attack((x, z) => (x.policyDigest = H("forged")));
  for (const d of ["extension", "opaque", "abstracted"])
    attack((x, z) => {
      const p = z.pair(
        z.u.inventory.facts[0],
        d,
        d === "extension" ? "provider-local" : null,
      );
      x.ledger[0] = p.row;
      x.evidenceRegistry[0] = p.evidence;
      x.ledger[0].canonicalCreditWeight = x.ledger[0].weight;
    });
});
test("rejects authenticated semantic evidence replay across all eight dispositions", () => {
  for (let i = 0; i < U5_DISPOSITIONS.length; i++)
    attack((x, z) => {
      const target =
        i === U5_DISPOSITIONS.length - 1 ? "preserved" : U5_DISPOSITIONS[i + 1];
      const replay = z.pair(
        z.u.inventory.facts[i === U5_DISPOSITIONS.length - 1 ? 1 : 0],
        target,
        target === "extension" ? "provider-local" : null,
      );
      x.evidenceRegistry[0] = replay.evidence;
    }, /reachability|registry/);
});
test("rejects forged evidence bytes custody chronology and owner aliasing", () => {
  attack(
    (x) => (x.evidenceRegistry[0].payloadDigest = H("forged")),
    /semantic|authority authentication/,
  );
  attack(
    (x) => (x.evidenceRegistry[0].custodyReceipt = "0".repeat(64)),
    /custody authentication/,
  );
  attack((x) => {
    const {
      authorityReceipt: _,
      custodyReceipt: __,
      ...e
    } = x.evidenceRegistry[0];
    void _;
    void __;
    x.evidenceRegistry[0] = authenticateU5SyntheticEvidence({
      ...e,
      issuedAt: "2026-07-17T23:59:59.999Z",
    });
  }, /chronology/);
  attack((x) => {
    const {
      authorityReceipt: _,
      custodyReceipt: __,
      ...e
    } = x.evidenceRegistry[0];
    void _;
    void __;
    x.evidenceRegistry[0] = authenticateU5SyntheticEvidence({
      ...e,
      issuedAt: "not-a-date",
    });
  }, /chronology/);
  attack((x) => {
    const {
      authorityReceipt: _,
      custodyReceipt: __,
      ...e
    } = x.evidenceRegistry[0];
    void _;
    void __;
    x.evidenceRegistry[0] = authenticateU5SyntheticEvidence({
      ...e,
      custodianOwnerId: e.authorityOwnerId,
    });
  }, /separation|actor registry/);
  attack((x) => {
    const {
      authorityReceipt: _,
      custodyReceipt: __,
      ...e
    } = x.evidenceRegistry[1];
    void _;
    void __;
    x.evidenceRegistry[1] = authenticateU5SyntheticEvidence({
      ...e,
      authorityOwnerId: x.evidenceRegistry[0].authorityOwnerId,
    });
  }, /separation|actor registry/);
});
test("rejects random correctly signed payloads for every evidence discriminator", () => {
  for (const d of U5_DISPOSITIONS)
    attack((x, z) => {
      const p = z.pair(
        z.u.inventory.facts[0],
        d,
        d === "extension" ? "provider-local" : null,
      );
      x.ledger[0] = p.row;
      x.evidenceRegistry[0] = resign(p.evidence, { payload: { random: true } });
      x.accounting = z.account(x.ledger);
    }, /payload|semantics/);
});
test("rejects coherent re-signed semantic bypasses for all eight witnesses", () => {
  const check = (d: string, mutate: (p: any) => void) =>
    attack((x, z) => {
      const p = z.pair(
          z.u.inventory.facts[0],
          d,
          d === "extension" ? "provider-local" : null,
        ),
        payload = structuredClone(p.evidence.payload);
      mutate(payload);
      x.ledger[0] = p.row;
      x.evidenceRegistry[0] = resign(p.evidence, { payload });
      x.accounting = z.account(x.ledger);
    }, /payload|semantics/);
  check("preserved", (p) => {
    p.targetBytes = C({ different: true });
    p.targetDigest = H(p.targetBytes);
  });
  check("derived", (p) => {
    p.nodes = [
      { id: "result", op: "literal", inputs: [], value: p.outputValue },
    ];
    p.outputNodeId = "result";
  });
  check("lowered", (p) => {
    p.mandatoryObservations[0].targetValue = false;
  });
  check("extension", (p) => {
    p.extensionClass = "wrong-class";
  });
  check("opaque", (p) => {
    p.response.terminal = false;
    p.traceDigest = H(
      C({ request: p.request, events: p.events, response: p.response }),
    );
  });
  check("abstracted", (p) => {
    p.abstractTrace[0].value = false;
  });
  check("unsupported", (p) => {
    p.diagnosticCode = "anything";
  });
  check("inexpressible", (p) => {
    p.evaluations[0].feasible = true;
  });
});
test("rejects duplicate evaluation candidate IDs despite coherent evidence signature", () => {
  attack((x, z) => {
    const p = z.pair(z.u.inventory.facts[0], "inexpressible", null),
      payload = structuredClone(p.evidence.payload);
    payload.evaluations[1].candidateId = payload.evaluations[0].candidateId;
    payload.evaluations[1].unsatisfiedClauseIndexes = [1];
    x.ledger[0] = p.row;
    x.evidenceRegistry[0] = resign(p.evidence, { payload });
    x.accounting = z.account(x.ledger);
  }, /inexpressible evidence semantics/);
});
test("rejects re-signed preserved witnesses with omitted or divergent mandatory observations", () => {
  const check = (mutate: (p: any) => void) =>
    attack((x, z) => {
      const p = z.pair(z.u.inventory.facts[0], "preserved", null),
        payload = structuredClone(p.evidence.payload);
      mutate(payload);
      x.evidenceRegistry[0] = resign(p.evidence, { payload });
    }, /preservation payload|preserved evidence semantics/);
  check((p) => p.mandatoryObservations.pop());
  check((p) => {
    p.mandatoryObservations[0].targetValue =
      !p.mandatoryObservations[0].sourceValue;
  });
});
test("rejects evidence DAG cycles unreachable dependencies and surplus", () => {
  attack((x) => {
    x.evidenceRegistry[0] = resign(x.evidenceRegistry[0], {
      dependencies: [x.evidenceRegistry[1].id],
    });
    x.evidenceRegistry[1] = resign(x.evidenceRegistry[1], {
      dependencies: [x.evidenceRegistry[0].id],
    });
  }, /cycle/);
  attack((x) => {
    x.evidenceRegistry[0] = resign(x.evidenceRegistry[0], {
      dependencies: ["missing.evidence"],
    });
  }, /unreachable/);
  attack((x) =>
    x.evidenceRegistry.push(structuredClone(x.evidenceRegistry[0])),
  );
});
test("rejects oracle forgery substitution and evidence outside campaign chronology", () => {
  attack(
    (x) => (x.semanticOracleRegistry[0].data.denotation = "forged"),
    /oracle/,
  );
  attack((x) => {
    const e = x.evidenceRegistry[0];
    x.evidenceRegistry[0] = resign(e, {
      oracleId: x.semanticOracleRegistry[1].id,
      oracleDigest: x.semanticOracleRegistry[1].digest,
    });
  }, /semantic|oracle/);
  attack((x) => {
    const e = x.evidenceRegistry[0];
    x.evidenceRegistry[0] = resign(e, { issuedAt: "2026-07-19T00:00:00.000Z" });
  }, /chronology/);
});
test("requires an independent authenticated extension classifier", () => {
  attack((x, z) => {
    const p = z.pair(z.u.inventory.facts[0], "extension", "provider-local");
    x.ledger[0] = p.row;
    x.evidenceRegistry[0] = p.evidence;
    x.accounting = z.account(x.ledger);
    x.evidenceRegistry[0].classifierReceipt = "0".repeat(64);
  }, /classifier authentication/);
  attack((x, z) => {
    const p = z.pair(z.u.inventory.facts[0], "extension", "provider-local");
    x.ledger[0] = p.row;
    x.evidenceRegistry[0] = resign(p.evidence, {
      classifierOwnerId: p.evidence.authorityOwnerId,
    });
    x.accounting = z.account(x.ledger);
  }, /classifier owner separation/);
});
test("rejects unused derived dependencies and classifier-row substitution", () => {
  attack((x, z) => {
    const p = z.pair(z.u.inventory.facts[0], "derived", null);
    x.ledger[0] = p.row;
    x.evidenceRegistry[0] = resign(p.evidence, {
      dependencies: [x.evidenceRegistry[1].id],
    });
    x.accounting = z.account(x.ledger);
  }, /derived oracle-root dependency/);
  attack((x, z) => {
    const p = z.pair(z.u.inventory.facts[0], "extension", "provider-local"),
      payload = {
        ...p.evidence.payload,
        classification: "portable-standardized",
      };
    x.ledger[0] = p.row;
    x.evidenceRegistry[0] = resign(p.evidence, { payload });
    x.accounting = z.account(x.ledger);
  }, /classifier row binding/);
});
test("rejects duplicate omitted surplus facts and evidence owner alias or surplus", () => {
  attack((x) => x.ledger.pop());
  attack((x) => (x.ledger[1].factId = x.ledger[0].factId));
  attack((x) => x.ledger.push(structuredClone(x.ledger[0])));
  attack(
    (x, z) => (x.evidenceOwners[0].ownerId = z.policy.policyAuthority.ownerId),
  );
  attack((x) => (x.evidenceOwners[1].ownerId = x.evidenceOwners[0].ownerId));
  attack((x) => x.evidenceRegistry.pop());
  attack((x) => (x.ledger[1].evidenceId = x.ledger[0].evidenceId));
  attack((x) =>
    x.evidenceOwners.push({
      id: "surplus",
      factId: "surplus",
      ownerId: "surplus",
    }),
  );
});
test("rejects weight accounting redigest promotion resource and cycle attacks", () => {
  attack((x) => x.ledger[0].weight++);
  attack((x) => x.accounting.denominatorWeight++);
  attack((x) => (x.empiricalRegistration = true));
  attack((x) => (x.closureClaim = true));
  const z = fixture(),
    d: any = structuredClone(z.frozen);
  d.digest = H("bad");
  expect(() =>
    verifyFrozenU5DispositionLedger(
      d,
      z.u.inventory,
      z.u.calculus,
      z.u.sourceRegistry,
      z.u.trusted,
      attestation,
      z.policy,
    ),
  ).toThrow(/digest/);
  const h: any = structuredClone(z.body);
  h.ledger[0].factId = "x".repeat(100001);
  expect(() =>
    freezeU5DispositionLedger(
      h,
      z.u.inventory,
      z.u.calculus,
      z.u.sourceRegistry,
      z.u.trusted,
      attestation,
      z.policy,
    ),
  ).toThrow(/field/);
  const c: any = structuredClone(z.body);
  c.loop = c;
  expect(() =>
    freezeU5DispositionLedger(
      c,
      z.u.inventory,
      z.u.calculus,
      z.u.sourceRegistry,
      z.u.trusted,
      attestation,
      z.policy,
    ),
  ).toThrow(/cyclic/);
});
