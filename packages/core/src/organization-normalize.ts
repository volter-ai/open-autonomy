import type { AnnotationSet, OrganizationCatalogName, OrganizationIR } from './organization-ir';
import { canonicalSemanticJson, semanticDigest, type SemanticDigest } from './organization-canonical';
import {
  resolveOrganizationReferences,
  type ModuleId,
  type ResolvedModuleGraph,
} from './organization-modules';

export interface NormalizedSourceMapEntry {
  output: string;
  sources: Array<{ location: string; path: string }>;
}

export interface NormalizedOrganizationIR {
  schema: 'autonomy.normalized-organization.v1';
  root: ModuleId;
  modules: Record<string, OrganizationIR>;
  sourceMap: NormalizedSourceMapEntry[];
  digest: SemanticDigest;
}

export interface NormalizationResult {
  normalized?: NormalizedOrganizationIR;
  errors: string[];
}

const catalogs: OrganizationCatalogName[] = [
  'types', 'behaviors', 'tools', 'memories', 'capabilities', 'actors', 'units', 'relations', 'goals',
  'workTypes', 'initialWork', 'protocols', 'policies', 'budgets', 'decisions', 'artifacts',
];

/** Close, elaborate, canonicalize, and hash a resolved graph; re-normalizing a normal form is idempotent. */
export function normalizeOrganization(input: ResolvedModuleGraph | NormalizedOrganizationIR): NormalizationResult {
  if ('schema' in input && input.schema === 'autonomy.normalized-organization.v1') {
    const normalized = canonicalClone(input);
    normalized.digest = digestNormalized(normalized);
    normalized.sourceMap.sort((a, b) => compareText(a.output, b.output));
    return { normalized: canonicalClone(normalized), errors: [] };
  }
  const graph = input as ResolvedModuleGraph;
  const resolution = resolveOrganizationReferences(graph);
  if (resolution.errors.length) return { errors: resolution.errors };
  const modules: Record<string, OrganizationIR> = {};
  const sourceMap: NormalizedSourceMapEntry[] = [];
  for (const [moduleId, node] of Object.entries(graph.modules).sort(([a], [b]) => a.localeCompare(b))) {
    const organization = elaborateDefaults(structuredClone(node.module.organization));
    delete organization.imports;
    modules[moduleId] = organization;
    sourceMap.push({ output: `/modules/${escapePointer(moduleId)}`, sources: [{ location: node.module.location, path: '' }] });
    for (const catalog of catalogs) for (const id of Object.keys((organization[catalog] as Record<string, unknown> | undefined) ?? {}).sort()) {
      sourceMap.push({
        output: `/modules/${escapePointer(moduleId)}/${catalog}/${escapePointer(id)}`,
        sources: [{ location: node.module.location, path: `${catalog}.${id}` }],
      });
    }
  }
  for (const reference of resolution.references) {
    setPointer(modules[reference.module], reference.pointer, reference.target);
    sourceMap.push({
      output: `/modules/${escapePointer(reference.module)}${reference.pointer}`,
      sources: [reference.source, { location: reference.declaration.location, path: reference.declaration.path }],
    });
  }
  const draft: NormalizedOrganizationIR = {
    schema: 'autonomy.normalized-organization.v1', root: graph.root,
    modules: canonicalClone(modules), sourceMap: sourceMap.sort((a, b) => compareText(a.output, b.output)),
    digest: undefined as unknown as SemanticDigest,
  };
  draft.digest = digestNormalized(draft);
  return { normalized: canonicalClone(draft), errors: [] };
}

function digestNormalized(value: Pick<NormalizedOrganizationIR, 'root' | 'modules'>): SemanticDigest {
  const projection = {
    schema: 'autonomy.normalized-organization-semantics.v1', root: value.root,
    modules: Object.fromEntries(Object.entries(value.modules).map(([id, organization]) => [id, stripNonsemanticAnnotations(organization)])),
  };
  return semanticDigest(projection, 'autonomy.organization.v2');
}

function elaborateDefaults(ir: OrganizationIR): OrganizationIR {
  ir.types ??= {}; ir.behaviors ??= {}; ir.tools ??= {}; ir.memories ??= {}; ir.capabilities ??= {};
  ir.units ??= {}; ir.relations ??= {}; ir.goals ??= {}; ir.workTypes ??= {}; ir.initialWork ??= {};
  ir.protocols ??= {}; ir.policies ??= {}; ir.budgets ??= {}; ir.decisions ??= {}; ir.artifacts ??= {};
  for (const behavior of Object.values(ir.behaviors)) {
    behavior.inputs ??= {}; behavior.outputs ??= {}; behavior.tools ??= []; behavior.memories ??= []; behavior.behaviors ??= [];
  }
  for (const actor of Object.values(ir.actors)) {
    actor.memberOf ??= []; actor.reportsTo ??= []; actor.capabilities ??= []; actor.constraints ??= [];
    actor.activation ??= []; actor.implementation ??= [];
  }
  for (const unit of Object.values(ir.units)) {
    unit.members ??= []; unit.goals ??= []; unit.policies ??= []; unit.decisionRules ??= [];
  }
  for (const relation of Object.values(ir.relations)) relation.constraints ??= [];
  for (const goal of Object.values(ir.goals)) { goal.measures ??= []; goal.constraints ??= []; }
  for (const work of Object.values(ir.workTypes)) {
    work.requiredCapabilities ??= [];
    for (const transition of work.lifecycle.transitions) transition.authority ??= [];
  }
  for (const work of Object.values(ir.initialWork)) { work.dependencies ??= []; work.assignees ??= []; }
  for (const protocol of Object.values(ir.protocols)) protocol.roles ??= [];
  for (const policy of Object.values(ir.policies)) policy.appliesTo ??= [];
  for (const decision of Object.values(ir.decisions)) decision.participants ??= [];
  return ir;
}

function stripNonsemanticAnnotations(ir: OrganizationIR): OrganizationIR {
  const copy = structuredClone(ir);
  strip(copy);
  for (const value of Object.values(copy.types ?? {})) strip(value);
  for (const value of Object.values(copy.behaviors ?? {})) {
    strip(value); value.instructions?.fragments.forEach(strip);
  }
  for (const value of Object.values(copy.tools ?? {})) strip(value);
  for (const value of Object.values(copy.memories ?? {})) strip(value);
  for (const value of Object.values(copy.actors)) { strip(value); value.capabilities?.forEach(strip); }
  for (const value of Object.values(copy.units ?? {})) strip(value);
  for (const value of Object.values(copy.relations ?? {})) strip(value);
  for (const value of Object.values(copy.goals ?? {})) strip(value);
  for (const value of Object.values(copy.workTypes ?? {})) {
    strip(value); Object.values(value.lifecycle.states).forEach(strip); value.lifecycle.transitions.forEach(strip);
  }
  for (const value of Object.values(copy.initialWork ?? {})) strip(value);
  for (const value of Object.values(copy.protocols ?? {})) { strip(value); Object.values(value.messages).forEach(strip); }
  for (const value of Object.values(copy.policies ?? {})) strip(value);
  for (const value of Object.values(copy.budgets ?? {})) strip(value);
  for (const value of Object.values(copy.decisions ?? {})) strip(value);
  for (const value of Object.values(copy.artifacts ?? {})) strip(value);
  return copy;
}

function strip(value: AnnotationSet): void {
  delete value.documentation;
  delete value.provenance;
}

function setPointer(root: unknown, pointer: string, value: unknown): void {
  const tokens = pointer.slice(1).split('/').map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = root as Record<string, unknown>;
  for (const token of tokens.slice(0, -1)) current = current[token] as Record<string, unknown>;
  current[tokens.at(-1)!] = value;
}

function canonicalClone<T>(value: T): T {
  return JSON.parse(canonicalSemanticJson(value)) as T;
}

function escapePointer(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
