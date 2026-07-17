import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
export const U2_SYNTHETIC_POPULATION_SCHEMA =
    "open-autonomy.u2-synthetic-population.v2" as const,
  U2_FACET_FAMILIES = [
    "control-work",
    "scheduling",
    "execution-session",
    "model",
    "interaction",
    "storage",
    "identity-secrets",
    "policy",
    "observation",
    "lifecycle",
  ] as const;
export type U2FacetFamily = (typeof U2_FACET_FAMILIES)[number];
type Sha = `sha256:${string}`;
type Identity = { id: string; evidenceLabel: "synthetic-fixture-assertion" };
export type U2Owner = Identity;
export type U2Implementation = Identity;
export type U2Provider = Identity & {
  ownerId: string;
  implementationId: string;
};
export type U2RemoteService = Identity & {
  serviceId: string;
  version: string;
  ownerId: string;
  providerId: string;
};
export type U2Interface = {
  interfaceId: string;
  version: string;
  transport: "function" | "cli" | "http" | "mcp" | "database" | "event";
  evidenceLabel: "synthetic-fixture-assertion";
  operations: string[];
};
export type U2FacetProvision = {
  family: U2FacetFamily;
  operations: string[];
  interfaceId: string;
};
export type U2Component = {
  componentId: string;
  providerId: string;
  version: string;
  ownerId: string;
  implementationId: string;
  requiresInterfaces: string[];
  conflictsWith: string[];
  remoteServiceId: string | null;
  remoteServiceVersion: string | null;
  facets: U2FacetProvision[];
  forcingFeatures: string[];
};
export type U2CompositionRef = {
  instanceId: string;
  componentId: string;
  providerId: string;
  version: string;
  ownerId: string;
  implementationId: string;
  remoteServiceId: string | null;
  remoteServiceVersion: string | null;
};
export type U2Composition = {
  compositionId: string;
  structuralFamily: string;
  implementationId: string;
  corpus: "development" | "holdout";
  weight: number;
  components: U2CompositionRef[];
  forcingFeatures: string[];
  multiProvider: boolean;
};
export type U2ExclusionWitness =
  | {
      code: "component-conflict";
      leftComponentId: string;
      rightComponentId: string;
    }
  | {
      code: "missing-required-interface";
      componentId: string;
      interfaceId: string;
    };
export type U2ForcingFeature = {
  id: string;
  semanticRequirement: string;
  witness: {
    componentId: string;
    facetFamily: U2FacetFamily;
    operation: string;
    interfaceId: string;
  };
};
export type U2Opportunity = {
  opportunityId: string;
  componentIds: string[];
  disposition: "meaningful" | "excluded";
  compositionId: string | null;
  exclusion: U2ExclusionWitness | null;
};
export type U2SyntheticPopulation = {
  schema: typeof U2_SYNTHETIC_POPULATION_SCHEMA;
  fixtureKind: "synthetic";
  denominatorScope: "fixture-local";
  empiricalRegistration: false;
  closureClaim: false;
  opportunityGenerator: "all-lexicographically-ordered-three-component-subsets";
  meaningfulCompositionRule: "meaningful-iff-requires-interfaces-satisfied-and-no-symmetric-component-conflict";
  holdoutStructuralFamily: string;
  forcingFeatures: U2ForcingFeature[];
  owners: U2Owner[];
  providers: U2Provider[];
  implementations: U2Implementation[];
  remoteServices: U2RemoteService[];
  interfaces: U2Interface[];
  components: U2Component[];
  compositions: U2Composition[];
  opportunities: U2Opportunity[];
};
export type FrozenU2SyntheticPopulation = U2SyntheticPopulation & {
  digest: Sha;
};
const canon = (x: unknown) => canonicalSemanticJson(x),
  hash = (x: unknown) =>
    `sha256:${createHash("sha256")
      .update(`${U2_SYNTHETIC_POPULATION_SCHEMA}\0${canon(x)}`)
      .digest("hex")}` as Sha,
  cmp = (a: string, b: string) => Buffer.from(a).compare(Buffer.from(b)),
  keys = (x: object, k: string[], l: string) => {
    if (canon(Object.keys(x).sort()) !== canon([...k].sort()))
      throw Error(`${l} schema must be exact`);
  },
  valid = (x: unknown) =>
    typeof x === "string" && /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(x),
  ordered = (x: string[]) =>
    x.length === new Set(x).size && canon(x) === canon([...x].sort(cmp)),
  index = <T extends { id: string }>(xs: T[], label: string) => {
    const m = new Map<string, T>();
    for (const x of xs) {
      keys(x, [...Object.keys(x)], label);
      if (!valid(x.id) || m.has(x.id)) throw Error(`${label} identity invalid`);
      m.set(x.id, x);
    }
    return m;
  },
  triples = (ids: string[]) => {
    const out: string[][] = [];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        for (let k = j + 1; k < ids.length; k++)
          out.push([ids[i]!, ids[j]!, ids[k]!]);
    return out;
  },
  oppId = canonicalU2OpportunityId,
  freeze = <T>(x: T): T => {
    if (x && typeof x === "object" && !Object.isFrozen(x)) {
      Object.values(x as object).forEach(freeze);
      Object.freeze(x);
    }
    return x;
  };
export function canonicalU2OpportunityId(ids: readonly string[]) {
  return `triple|${ids.map((x) => `${Buffer.byteLength(x, "utf8")}:${x}`).join("|")}`;
}
export function freezeU2SyntheticPopulation(
  v: U2SyntheticPopulation,
): FrozenU2SyntheticPopulation {
  keys(
    v,
    [
      "schema",
      "fixtureKind",
      "denominatorScope",
      "empiricalRegistration",
      "closureClaim",
      "opportunityGenerator",
      "meaningfulCompositionRule",
      "holdoutStructuralFamily",
      "forcingFeatures",
      "owners",
      "providers",
      "implementations",
      "remoteServices",
      "interfaces",
      "components",
      "compositions",
      "opportunities",
    ],
    "U2 population",
  );
  if (
    v.schema !== U2_SYNTHETIC_POPULATION_SCHEMA ||
    v.fixtureKind !== "synthetic" ||
    v.denominatorScope !== "fixture-local" ||
    v.empiricalRegistration ||
    v.closureClaim ||
    v.opportunityGenerator !==
      "all-lexicographically-ordered-three-component-subsets" ||
    v.meaningfulCompositionRule !==
      "meaningful-iff-requires-interfaces-satisfied-and-no-symmetric-component-conflict" ||
    !valid(v.holdoutStructuralFamily) ||
    !v.forcingFeatures.length ||
    !ordered(v.forcingFeatures.map((x) => x.id))
  )
    throw Error("U2 synthetic boundary invalid");
  const owners = index(v.owners, "owner"),
    implementations = index(v.implementations, "implementation"),
    providers = index(v.providers, "provider");
  if (
    !ordered(v.owners.map((x) => x.id)) ||
    !ordered(v.providers.map((x) => x.id)) ||
    !ordered(v.implementations.map((x) => x.id))
  )
    throw Error("identity registry order invalid");
  for (const x of v.owners) {
    keys(x, ["id", "evidenceLabel"], "owner");
    if (x.evidenceLabel !== "synthetic-fixture-assertion")
      throw Error("owner evidence invalid");
  }
  for (const x of v.implementations) {
    keys(x, ["id", "evidenceLabel"], "implementation");
    if (x.evidenceLabel !== "synthetic-fixture-assertion")
      throw Error("implementation evidence invalid");
  }
  for (const p of v.providers) {
    keys(p, ["id", "ownerId", "implementationId", "evidenceLabel"], "provider");
    if (
      p.evidenceLabel !== "synthetic-fixture-assertion" ||
      !owners.has(p.ownerId) ||
      !implementations.has(p.implementationId)
    )
      throw Error("provider registry join invalid");
  }
  const services = new Map<string, U2RemoteService>();
  for (const s of v.remoteServices) {
    keys(
      s,
      ["id", "serviceId", "version", "ownerId", "providerId", "evidenceLabel"],
      "remote service",
    );
    if (
      s.id !== s.serviceId ||
      !valid(s.id) ||
      !s.version.trim() ||
      s.version !== s.version.trim() ||
      s.evidenceLabel !== "synthetic-fixture-assertion" ||
      services.has(s.id) ||
      providers.get(s.providerId)?.ownerId !== s.ownerId
    )
      throw Error("remote service registry invalid");
    services.set(s.id, s);
  }
  const interfaces = new Map<string, U2Interface>();
  if (
    !ordered(v.remoteServices.map((x) => x.id)) ||
    !ordered(v.interfaces.map((x) => x.interfaceId))
  )
    throw Error("service/interface registry order invalid");
  for (const x of v.interfaces) {
    keys(
      x,
      ["interfaceId", "version", "transport", "evidenceLabel", "operations"],
      "interface",
    );
    if (
      !valid(x.interfaceId) ||
      !x.version.trim() ||
      x.version !== x.version.trim() ||
      !x.operations.length ||
      !ordered(x.operations) ||
      x.operations.some((o) => !valid(o)) ||
      !(
        ["function", "cli", "http", "mcp", "database", "event"] as string[]
      ).includes(x.transport) ||
      x.evidenceLabel !== "synthetic-fixture-assertion" ||
      interfaces.has(x.interfaceId)
    )
      throw Error("interface invalid");
    interfaces.set(x.interfaceId, x);
  }
  const components = new Map<string, U2Component>(),
    facetPopulation = new Set<U2FacetFamily>(),
    providedForcing = new Set<string>();
  if (
    !ordered(v.components.map((x) => x.componentId)) ||
    !ordered(v.compositions.map((x) => x.compositionId))
  )
    throw Error("component/composition order invalid");
  for (const c of v.components) {
    keys(
      c,
      [
        "componentId",
        "providerId",
        "version",
        "ownerId",
        "implementationId",
        "requiresInterfaces",
        "conflictsWith",
        "remoteServiceId",
        "remoteServiceVersion",
        "facets",
        "forcingFeatures",
      ],
      "component",
    );
    const p = providers.get(c.providerId),
      service =
        c.remoteServiceId === null
          ? undefined
          : services.get(c.remoteServiceId);
    if (
      !valid(c.componentId) ||
      components.has(c.componentId) ||
      !c.version.trim() ||
      c.version !== c.version.trim() ||
      !c.requiresInterfaces.length ||
      !ordered(c.requiresInterfaces) ||
      !ordered(c.conflictsWith) ||
      c.requiresInterfaces.some((x) => !interfaces.has(x)) ||
      c.conflictsWith.some((x) => !valid(x) || x === c.componentId) ||
      !p ||
      p.ownerId !== c.ownerId ||
      p.implementationId !== c.implementationId ||
      (c.remoteServiceId === null
        ? c.remoteServiceVersion !== null
        : !service ||
          c.remoteServiceVersion !== service.version ||
          service.providerId !== c.providerId ||
          service.ownerId !== c.ownerId) ||
      !c.facets.length ||
      !ordered(c.forcingFeatures) ||
      c.forcingFeatures.some((x) => !v.forcingFeatures.some((f) => f.id === x))
    )
      throw Error("component identity/service invalid");
    const seen = new Set<string>();
    if (
      canon(c.facets.map((x) => x.family)) !==
      canon(
        [...c.facets]
          .sort((a, b) => cmp(a.family, b.family))
          .map((x) => x.family),
      )
    )
      throw Error("facet order invalid");
    for (const f of c.facets) {
      keys(f, ["family", "operations", "interfaceId"], "facet provision");
      if (
        !U2_FACET_FAMILIES.includes(f.family) ||
        seen.has(f.family) ||
        !f.operations.length ||
        !ordered(f.operations) ||
        !interfaces.has(f.interfaceId) ||
        f.operations.some(
          (o) =>
            !valid(o) || !interfaces.get(f.interfaceId)!.operations.includes(o),
        )
      )
        throw Error("facet provision invalid");
      seen.add(f.family);
      facetPopulation.add(f.family);
    }
    c.forcingFeatures.forEach((x) => providedForcing.add(x));
    components.set(c.componentId, c);
  }
  for (const c of components.values())
    for (const other of c.conflictsWith)
      if (
        !components.has(other) ||
        !components.get(other)!.conflictsWith.includes(c.componentId)
      )
        throw Error("component conflicts must be symmetric");
  if (
    canon([...facetPopulation].sort()) !==
      canon([...U2_FACET_FAMILIES].sort()) ||
    canon([...providedForcing].sort()) !==
      canon(v.forcingFeatures.map((x) => x.id))
  )
    throw Error("component facet/forcing coverage invalid");
  for (const f of v.forcingFeatures) {
    keys(f, ["id", "semanticRequirement", "witness"], "forcing feature");
    keys(
      f.witness,
      ["componentId", "facetFamily", "operation", "interfaceId"],
      "forcing witness",
    );
    const c = components.get(f.witness.componentId),
      facet = c?.facets.find(
        (x) =>
          x.family === f.witness.facetFamily &&
          x.interfaceId === f.witness.interfaceId,
      );
    if (
      !valid(f.id) ||
      !valid(f.semanticRequirement) ||
      !c ||
      !c.forcingFeatures.includes(f.id) ||
      !facet ||
      !facet.operations.includes(f.witness.operation) ||
      !interfaces
        .get(f.witness.interfaceId)
        ?.operations.includes(f.witness.operation)
    )
      throw Error("forcing feature witness invalid");
  }
  const compositions = new Map<string, U2Composition>(),
    families = new Map<string, string>(),
    corpusFacets = new Set<U2FacetFamily>(),
    compositionForcing = new Set<string>();
  let threeOwner = 0,
    multi = 0;
  for (const c of v.compositions) {
    keys(
      c,
      [
        "compositionId",
        "structuralFamily",
        "implementationId",
        "corpus",
        "weight",
        "components",
        "forcingFeatures",
        "multiProvider",
      ],
      "composition",
    );
    if (
      !valid(c.compositionId) ||
      !valid(c.structuralFamily) ||
      !valid(c.implementationId) ||
      compositions.has(c.compositionId) ||
      !implementations.has(c.implementationId) ||
      !(c.corpus === "development" || c.corpus === "holdout") ||
      !Number.isSafeInteger(c.weight) ||
      c.weight <= 0 ||
      c.components.length !== 3
    )
      throw Error("composition invalid");
    const ids: string[] = [],
      instances = new Set<string>(),
      ps = new Set<string>(),
      os = new Set<string>(),
      derivedForcing = new Set<string>();
    for (const r of c.components) {
      keys(
        r,
        [
          "instanceId",
          "componentId",
          "providerId",
          "version",
          "ownerId",
          "implementationId",
          "remoteServiceId",
          "remoteServiceVersion",
        ],
        "composition ref",
      );
      const x = components.get(r.componentId);
      if (
        !valid(r.instanceId) ||
        instances.has(r.instanceId) ||
        !x ||
        r.providerId !== x.providerId ||
        r.version !== x.version ||
        r.ownerId !== x.ownerId ||
        r.implementationId !== x.implementationId ||
        r.remoteServiceId !== x.remoteServiceId ||
        r.remoteServiceVersion !== x.remoteServiceVersion ||
        false
      )
        throw Error("composition exact identity join invalid");
      instances.add(r.instanceId);
      ids.push(r.componentId);
      ps.add(r.providerId);
      os.add(r.ownerId);
      x.facets.forEach((f) => corpusFacets.add(f.family));
      x.forcingFeatures.forEach((f) => derivedForcing.add(f));
    }
    if (
      !ordered(ids) ||
      c.multiProvider !== ps.size >= 2 ||
      !ordered(c.forcingFeatures) ||
      canon(c.forcingFeatures) !== canon([...derivedForcing].sort(cmp)) ||
      (c.structuralFamily === v.holdoutStructuralFamily) !==
        (c.corpus === "holdout")
    )
      throw Error("composition derivation invalid");
    c.forcingFeatures.forEach((x) => compositionForcing.add(x));
    if (c.multiProvider) multi++;
    if (os.size >= 3) threeOwner++;
    const prior = families.get(c.structuralFamily);
    if (prior && prior !== c.implementationId)
      throw Error("family implementation drift");
    families.set(c.structuralFamily, c.implementationId);
    compositions.set(c.compositionId, c);
  }
  if (
    families.size < 5 ||
    new Set(families.values()).size < 5 ||
    threeOwner < 2 ||
    multi < 1 ||
    !families.has(v.holdoutStructuralFamily) ||
    canon([...corpusFacets].sort()) !== canon([...U2_FACET_FAMILIES].sort()) ||
    canon([...compositionForcing].sort()) !==
      canon(v.forcingFeatures.map((x) => x.id))
  )
    throw Error("fixture structural/facet/forcing floor invalid");
  const generated = triples([...components.keys()].sort(cmp)),
    seenOpp = new Set<string>(),
    meaningful = new Set<string>();
  if (v.opportunities.length !== generated.length)
    throw Error("opportunity universe cardinality invalid");
  for (let i = 0; i < generated.length; i++) {
    const ids = generated[i]!,
      o = v.opportunities[i]!;
    keys(
      o,
      [
        "opportunityId",
        "componentIds",
        "disposition",
        "compositionId",
        "exclusion",
      ],
      "opportunity",
    );
    if (
      o.opportunityId !== oppId(ids) ||
      canon(o.componentIds) !== canon(ids) ||
      seenOpp.has(o.opportunityId)
    )
      throw Error("opportunity universe order/identity invalid");
    seenOpp.add(o.opportunityId);
    const selected = ids.map((x) => components.get(x)!),
      provided = new Set(
        selected.flatMap((c) => c.facets.map((f) => f.interfaceId)),
      ),
      conflict = ids
        .flatMap((a, ai) => ids.slice(ai + 1).map((b) => [a, b] as const))
        .find(([a, b]) => components.get(a)!.conflictsWith.includes(b)),
      missing = selected.flatMap((c) =>
        c.requiresInterfaces
          .filter((x) => !provided.has(x))
          .map((interfaceId) => ({ componentId: c.componentId, interfaceId })),
      )[0],
      isMeaningful = !conflict && !missing;
    if (isMeaningful) {
      if (
        o.disposition !== "meaningful" ||
        !o.compositionId ||
        o.exclusion !== null ||
        meaningful.has(o.compositionId)
      )
        throw Error("meaningful opportunity invalid");
      const c = compositions.get(o.compositionId),
        actual = c && [...c.components.map((x) => x.componentId)].sort(cmp);
      if (!c || canon(actual) !== canon(ids))
        throw Error("meaningful composition join invalid");
      meaningful.add(o.compositionId);
    } else {
      if (
        o.disposition !== "excluded" ||
        o.compositionId !== null ||
        !o.exclusion
      )
        throw Error("excluded opportunity invalid");
      const expected = conflict
        ? {
            code: "component-conflict",
            leftComponentId: conflict[0],
            rightComponentId: conflict[1],
          }
        : missing
          ? { code: "missing-required-interface", ...missing }
          : null;
      if (!expected || canon(o.exclusion) !== canon(expected))
        throw Error("exclusion constraint witness invalid");
    }
  }
  if (meaningful.size !== compositions.size)
    throw Error("meaningful composition denominator incomplete");
  const exact = (
      actual: Iterable<string>,
      expected: Iterable<string>,
      label: string,
    ) => {
      if (
        canon([...new Set(actual)].sort(cmp)) !==
        canon([...new Set(expected)].sort(cmp))
      )
        throw Error(`surplus or unreachable ${label}`);
    },
    usedProviders = [...components.values()].map((x) => x.providerId),
    usedOwners = [...providers.values()].map((x) => x.ownerId),
    usedImpl = [...providers.values()]
      .map((x) => x.implementationId)
      .concat(v.compositions.map((x) => x.implementationId)),
    usedServices = [...components.values()].flatMap((x) =>
      x.remoteServiceId ? [x.remoteServiceId] : [],
    ),
    usedInterfaces = [...components.values()].flatMap((x) =>
      x.facets.map((f) => f.interfaceId).concat(x.requiresInterfaces),
    );
  exact(usedProviders, providers.keys(), "provider");
  exact(usedOwners, owners.keys(), "owner");
  exact(usedImpl, implementations.keys(), "implementation");
  exact(usedServices, services.keys(), "service");
  exact(usedInterfaces, interfaces.keys(), "interface");
  const body = structuredClone(v);
  return freeze({ ...body, digest: hash(body) });
}
export function verifyFrozenU2SyntheticPopulation(
  v: FrozenU2SyntheticPopulation,
) {
  keys(
    v,
    [
      "schema",
      "fixtureKind",
      "denominatorScope",
      "empiricalRegistration",
      "closureClaim",
      "opportunityGenerator",
      "meaningfulCompositionRule",
      "holdoutStructuralFamily",
      "forcingFeatures",
      "owners",
      "providers",
      "implementations",
      "remoteServices",
      "interfaces",
      "components",
      "compositions",
      "opportunities",
      "digest",
    ],
    "frozen U2 population",
  );
  const { digest, ...body } = v,
    f = freezeU2SyntheticPopulation(body);
  if (digest !== f.digest) throw Error("U2 digest mismatch");
  return f;
}
