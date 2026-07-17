import { expect, test } from "bun:test";
import {
  freezeU2SyntheticPopulation,
  verifyFrozenU2SyntheticPopulation,
  U2_FACET_FAMILIES,
  canonicalU2OpportunityId,
  aggregateU2FixtureWeights,
  type U2SyntheticPopulation,
} from "./organization-u2-synthetic-population";
const ev = "synthetic-fixture-assertion" as const,
  cmp = (a: string, b: string) => Buffer.from(a).compare(Buffer.from(b));
function fixture(): U2SyntheticPopulation {
  const owners = Array.from({ length: 15 }, (_, i) => ({
      id: `o${i}`,
      evidenceLabel: ev,
    })),
    implementations = Array.from({ length: 20 }, (_, i) => ({
      id: `impl${i}`,
      evidenceLabel: ev,
    })),
    providers = Array.from({ length: 15 }, (_, i) => ({
      id: `p${i}`,
      ownerId: `o${i}`,
      implementationId: `impl${i}`,
      evidenceLabel: ev,
    })),
    interfaces = Array.from({ length: 15 }, (_, i) => ({
      interfaceId: `if${String(i).padStart(2, "0")}`,
      version: "1",
      transport: "function" as const,
      evidenceLabel: ev,
      operations: [`op${String(i).padStart(2, "0")}`],
    })).sort((a, b) => cmp(a.interfaceId, b.interfaceId)),
    remoteServices = [0, 3, 6, 9, 12].map((i) => ({
      id: `svc${i}`,
      serviceId: `svc${i}`,
      version: "1",
      ownerId: `o${i}`,
      providerId: `p${i}`,
      evidenceLabel: ev,
    })),
    components = Array.from({ length: 15 }, (_, i) => ({
      componentId: `c${String(i).padStart(2, "0")}`,
      providerId: `p${i}`,
      version: `1.0.${i}`,
      ownerId: `o${i}`,
      implementationId: `impl${i}`,
      requiresInterfaces: Array.from(
        { length: 3 },
        (_, j) => `if${String(Math.floor(i / 3) * 3 + j).padStart(2, "0")}`,
      ),
      conflictsWith: Array.from({ length: 15 }, (_, j) => j)
        .filter((j) => Math.floor(j / 3) !== Math.floor(i / 3))
        .map((j) => `c${String(j).padStart(2, "0")}`),
      remoteServiceId: i % 3 === 0 ? `svc${i}` : null,
      remoteServiceVersion: i % 3 === 0 ? "1" : null,
      facets: [
        {
          family: U2_FACET_FAMILIES[i % 10]!,
          operations: [`op${String(i).padStart(2, "0")}`],
          interfaceId: `if${String(i).padStart(2, "0")}`,
        },
      ],
      forcingFeatures: i === 0 ? ["force-a"] : i === 3 ? ["force-b"] : [],
    })),
    compositions = Array.from({ length: 5 }, (_, g) => {
      const cs = components.slice(g * 3, g * 3 + 3);
      return {
        compositionId: `cell${g}`,
        structuralFamily: `family${g}`,
        implementationId: `impl${15 + g}`,
        corpus: g === 4 ? ("holdout" as const) : ("development" as const),
        weight: g + 1,
        components: cs.map((c, j) => ({
          instanceId: `i${j}`,
          componentId: c.componentId,
          providerId: c.providerId,
          version: c.version,
          ownerId: c.ownerId,
          implementationId: c.implementationId,
          remoteServiceId: c.remoteServiceId,
          remoteServiceVersion: c.remoteServiceVersion,
        })),
        forcingFeatures: [
          ...new Set(cs.flatMap((c) => c.forcingFeatures)),
        ].sort(cmp),
        multiProvider: true,
      };
    }),
    opportunities: any[] = [];
  for (let i = 0; i < components.length; i++)
    for (let j = i + 1; j < components.length; j++)
      for (let k = j + 1; k < components.length; k++) {
        const xs = [components[i]!, components[j]!, components[k]!],
          ids = xs.map((x) => x.componentId),
          same =
            Math.floor(i / 3) === Math.floor(j / 3) &&
            Math.floor(j / 3) === Math.floor(k / 3),
          pairs = ids.flatMap((a, ai) =>
            ids.slice(ai + 1).map((b) => [a, b] as const),
          ),
          [left, right] = pairs.find(([a, b]) =>
            components
              .find((x) => x.componentId === a)!
              .conflictsWith.includes(b),
          ) ?? ["", ""];
        opportunities.push({
          opportunityId: canonicalU2OpportunityId(ids),
          componentIds: ids,
          disposition: same ? "meaningful" : "excluded",
          compositionId: same ? `cell${Math.floor(i / 3)}` : null,
          exclusion: same
            ? null
            : {
                code: "component-conflict",
                leftComponentId: left,
                rightComponentId: right,
              },
        });
      }
  return {
    schema: "open-autonomy.u2-synthetic-population.v2",
    fixtureKind: "synthetic",
    denominatorScope: "fixture-local",
    empiricalRegistration: false,
    closureClaim: false,
    opportunityGenerator:
      "all-lexicographically-ordered-three-component-subsets",
    meaningfulCompositionRule:
      "meaningful-iff-requires-interfaces-satisfied-and-no-symmetric-component-conflict",
    holdoutStructuralFamily: "family4",
    forcingFeatures: [
      {
        id: "force-a",
        semanticRequirement: "require-control",
        witness: {
          componentId: "c00",
          facetFamily: "control-work",
          operation: "op00",
          interfaceId: "if00",
        },
      },
      {
        id: "force-b",
        semanticRequirement: "require-model",
        witness: {
          componentId: "c03",
          facetFamily: "model",
          operation: "op03",
          interfaceId: "if03",
        },
      },
    ],
    owners: owners.sort((a, b) => cmp(a.id, b.id)),
    providers: providers.sort((a, b) => cmp(a.id, b.id)),
    implementations: implementations.sort((a, b) => cmp(a.id, b.id)),
    remoteServices: remoteServices.sort((a, b) => cmp(a.id, b.id)),
    interfaces,
    components,
    compositions,
    opportunities,
  };
}
test("freezes exhaustive synthetic U2 opportunity universe", () => {
  const f = freezeU2SyntheticPopulation(fixture());
  expect(verifyFrozenU2SyntheticPopulation(f)).toEqual(f);
  expect(f.opportunities).toHaveLength(455);
  expect(
    f.opportunities.filter((x) => x.disposition === "meaningful"),
  ).toHaveLength(5);
});
test("aggregates exact frozen meaningful-composition weights",()=>{const f=freezeU2SyntheticPopulation(fixture());expect(aggregateU2FixtureWeights(f)).toEqual({numerator:15,denominator:15,totalMeaningfulOpportunities:5});for(const weight of[0,-1,1.5,Number.MAX_SAFE_INTEGER]){const x=structuredClone(f)as any;x.compositions[0].weight=weight;expect(()=>aggregateU2FixtureWeights(x)).toThrow()}const x=structuredClone(f)as any;x.opportunities.find((o:any)=>o.disposition==="meaningful").compositionId="cell1";expect(()=>aggregateU2FixtureWeights(x)).toThrow("bijection")});
test("opportunity tuple encoding is injective across hyphen boundaries", () => {
  const a = canonicalU2OpportunityId(["a", "b", "c-d"]),
    b = canonicalU2OpportunityId(["a", "b-c", "d"]);
  expect(a).not.toBe(b);
  expect(a).toBe("triple|1:a|1:b|3:c-d");
});
const attacks: [string, (x: any) => void][] = [
  ["three-owner floor collapse with conserved joins",x=>{const remove=new Set<string>();for(let g=0;g<4;g++){const base=`o${g*3}`;for(const i of[g*3+1,g*3+2]){const old=`o${i}`;remove.add(old);x.providers.find((p:any)=>p.id===`p${i}`).ownerId=base;x.components.find((c:any)=>c.componentId===`c${String(i).padStart(2,"0")}`).ownerId=base;for(const c of x.compositions)for(const r of c.components)if(r.componentId===`c${String(i).padStart(2,"0")}`)r.ownerId=base}}x.owners=x.owners.filter((o:any)=>!remove.has(o.id))}],
  ["opportunity omission", (x) => x.opportunities.pop()],
  ["opportunity surplus", (x) => x.opportunities.push(x.opportunities[0])],
  ["opportunity reorder", (x) => x.opportunities.reverse()],
  [
    "post-result relabel",
    (x) => {
      const o = x.opportunities.find(
        (y: any) => y.disposition === "meaningful",
      );
      o.disposition = "excluded";
      o.compositionId = null;
      o.exclusion = {
        code: "cross-compatibility-class",
        leftComponentId: o.componentIds[0],
        rightComponentId: o.componentIds[1],
        leftClass: "class0",
        rightClass: "class0",
      };
    },
  ],
  [
    "free-form exclusion",
    (x) =>
      (x.opportunities.find(
        (o: any) => o.disposition === "excluded",
      ).exclusion = { code: "failed-result" }),
  ],
  [
    "witness substitution",
    (x) =>
      (x.opportunities.find(
        (o: any) => o.disposition === "excluded",
      ).exclusion.leftClass = "wrong"),
  ],
  [
    "forcing injection",
    (x) => x.compositions[0].forcingFeatures.push("force-b"),
  ],
  ["forcing omission", (x) => (x.compositions[0].forcingFeatures = [])],
  ["service version substitution", (x) => (x.remoteServices[0].version = "2")],
  [
    "service join substitution",
    (x) => (x.components[0].remoteServiceId = "svc3"),
  ],
  ["provider owner drift", (x) => (x.providers[0].ownerId = "o1")],
  [
    "provider implementation drift",
    (x) => (x.providers[0].implementationId = "impl1"),
  ],
  ["evidence label drift", (x) => (x.owners[0].evidenceLabel = "empirical")],
  [
    "empty facet operations",
    (x) => (x.components[0].facets[0].operations = []),
  ],
  [
    "unknown interface",
    (x) => (x.components[0].facets[0].interfaceId = "missing"),
  ],
  [
    "corpus facet omission",
    (x) => {
      x.components[9].facets[0].family = "control-work";
    },
  ],
  ["multi-provider lie", (x) => (x.compositions[0].multiProvider = false)],
  [
    "family alias",
    (x) =>
      (x.compositions[4].implementationId = x.compositions[3].implementationId),
  ],
  ["holdout removal", (x) => (x.compositions[4].corpus = "development")],
  ["empirical claim", (x) => (x.empiricalRegistration = true)],
  ["missing requirements", (x) => (x.components[0].requiresInterfaces = [])],
  ["asymmetric conflict", (x) => x.components[0].conflictsWith.shift()],
  [
    "unsupported facet operation",
    (x) => (x.components[0].facets[0].operations = ["unsupported"]),
  ],
  [
    "unsupported forcing witness operation",
    (x) => (x.forcingFeatures[0].witness.operation = "unsupported"),
  ],
  ["empty component id", (x) => (x.components[0].componentId = "")],
  ["whitespace operation", (x) => (x.interfaces[0].operations = ["  "])],
  ["whitespace version", (x) => (x.interfaces[0].version = " 1")],
  [
    "surplus owner",
    (x) => x.owners.push({ id: "surplus-owner", evidenceLabel: ev }),
  ],
  [
    "surplus provider",
    (x) =>
      x.providers.push({
        id: "surplus-provider",
        ownerId: "o0",
        implementationId: "impl0",
        evidenceLabel: ev,
      }),
  ],
  [
    "surplus implementation",
    (x) => x.implementations.push({ id: "surplus-impl", evidenceLabel: ev }),
  ],
  [
    "surplus service",
    (x) =>
      x.remoteServices.push({
        id: "surplus-service",
        serviceId: "surplus-service",
        version: "1",
        ownerId: "o0",
        providerId: "p0",
        evidenceLabel: ev,
      }),
  ],
  [
    "surplus interface",
    (x) =>
      x.interfaces.push({
        interfaceId: "surplus-interface",
        version: "1",
        transport: "function",
        evidenceLabel: ev,
        operations: ["surplus-op"],
      }),
  ],
  ["registry reorder", (x) => x.owners.reverse()],
  ["composition ref reorder", (x) => x.compositions[0].components.reverse()],
  [
    "facet reorder",
    (x) => {
      x.components[0].facets.push({
        family: "scheduling",
        operations: ["op01"],
        interfaceId: "if01",
      });
      x.components[0].facets.reverse();
    },
  ],
];
for (const [name, mutate] of attacks)
  test(`rejects ${name}`, () => {
    const x = fixture();
    mutate(x);
    expect(() => freezeU2SyntheticPopulation(x)).toThrow();
  });
test("rejects surplus owner registry key", () => {
  const x = fixture();
  (x.owners[0] as any).surplus = true;
  expect(() => freezeU2SyntheticPopulation(x)).toThrow(
    "owner schema must be exact",
  );
});
test("rejects surplus implementation registry key", () => {
  const x = fixture();
  (x.implementations[0] as any).surplus = true;
  expect(() => freezeU2SyntheticPopulation(x)).toThrow(
    "implementation schema must be exact",
  );
});
