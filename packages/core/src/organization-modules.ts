import type { ImportDecl, OrganizationIR, SourceRef } from './organization-ir';

export type ModuleId = string & { readonly __moduleId: unique symbol };
export type QualifiedDeclarationId = string & { readonly __qualifiedDeclarationId: unique symbol };

export interface LoadedOrganizationModule {
  /** Stable logical identity; must not be an absolute machine path or local import alias. */
  moduleId: ModuleId;
  /** Retrieval location used only to resolve this module's relative imports and provenance. */
  location: string;
  organization: OrganizationIR;
  digest?: string;
}

export interface OrganizationModuleLoader {
  load(source: SourceRef, importer?: LoadedOrganizationModule): Promise<LoadedOrganizationModule>;
}

export interface ModuleResolutionLimits {
  maxModules?: number;
  maxDepth?: number;
}

export interface ResolvedModuleNode {
  module: LoadedOrganizationModule;
  /** Local alias -> stable imported module identity. */
  imports: Record<string, ModuleId>;
}

export interface ResolvedModuleGraph {
  root: ModuleId;
  modules: Record<ModuleId, ResolvedModuleNode>;
}

export interface ModuleResolutionResult {
  graph?: ResolvedModuleGraph;
  errors: string[];
}

export interface ResolvedReferenceUse {
  module: ModuleId;
  path: string;
  authored: string;
  target: QualifiedDeclarationId;
}

export interface ReferenceResolutionResult {
  references: ResolvedReferenceUse[];
  errors: string[];
}

const moduleIdPattern = /^[A-Za-z][A-Za-z0-9._/-]*$/;
const namespacePattern = /^[A-Za-z][A-Za-z0-9._-]*$/;

export function qualifyDeclaration(moduleId: ModuleId, catalog: string, declarationId: string): QualifiedDeclarationId {
  return `${moduleId}#${catalog}/${declarationId}` as QualifiedDeclarationId;
}

/** Resolve a bounded import graph through an effect-injected loader. No filesystem/network access occurs here. */
export async function resolveOrganizationModules(
  root: LoadedOrganizationModule,
  loader: OrganizationModuleLoader,
  limits: ModuleResolutionLimits = {},
): Promise<ModuleResolutionResult> {
  const maxModules = limits.maxModules ?? 256;
  const maxDepth = limits.maxDepth ?? 32;
  const errors: string[] = [];
  const modules = new Map<ModuleId, ResolvedModuleNode>();
  const active: ModuleId[] = [];

  const visit = async (loaded: LoadedOrganizationModule, depth: number): Promise<void> => {
    if (!moduleIdPattern.test(loaded.moduleId)) {
      errors.push(`module '${loaded.moduleId}': invalid canonical module id`);
      return;
    }
    if (depth > maxDepth) {
      errors.push(`module '${loaded.moduleId}': import depth exceeds ${maxDepth}`);
      return;
    }
    const cycleAt = active.indexOf(loaded.moduleId);
    if (cycleAt >= 0) {
      errors.push(`import cycle: ${[...active.slice(cycleAt), loaded.moduleId].join(' -> ')}`);
      return;
    }
    const prior = modules.get(loaded.moduleId);
    if (prior) {
      if (prior.module.digest && loaded.digest && prior.module.digest !== loaded.digest)
        errors.push(`module '${loaded.moduleId}': canonical identity resolved to conflicting digests`);
      return;
    }
    if (modules.size >= maxModules) {
      errors.push(`module graph exceeds ${maxModules} modules`);
      return;
    }

    const node: ResolvedModuleNode = { module: loaded, imports: {} };
    modules.set(loaded.moduleId, node);
    active.push(loaded.moduleId);
    const namespaces = new Set<string>();
    const imports = Object.entries(loaded.organization.imports ?? {}).sort(([a], [b]) => a.localeCompare(b));
    for (const [localName, declaration] of imports) {
      const namespace = declaration.namespace ?? localName;
      if (!namespacePattern.test(namespace)) {
        errors.push(`module '${loaded.moduleId}' import '${localName}': invalid namespace '${namespace}'`);
        continue;
      }
      if (namespaces.has(namespace)) {
        errors.push(`module '${loaded.moduleId}': duplicate namespace '${namespace}'`);
        continue;
      }
      namespaces.add(namespace);
      try {
        const imported = await loader.load(declaration.source, loaded);
        assertImportDigest(declaration.source, imported);
        node.imports[namespace] = imported.moduleId;
        await visit(imported, depth + 1);
      } catch (error) {
        if (declaration.required === false) continue;
        errors.push(`module '${loaded.moduleId}' import '${localName}': ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    active.pop();
  };

  await visit(root, 0);
  if (errors.length) return { errors: [...new Set(errors)].sort() };
  const ordered = [...modules.entries()].sort(([a], [b]) => a.localeCompare(b));
  return { graph: { root: root.moduleId, modules: Object.fromEntries(ordered) as Record<ModuleId, ResolvedModuleNode> }, errors: [] };
}

/** Resolve a local `id` or namespaced `alias/id` to stable identity without rewriting the authored reference. */
export function resolveQualifiedReference(
  graph: ResolvedModuleGraph,
  from: ModuleId,
  catalog: keyof OrganizationIR,
  reference: string,
): QualifiedDeclarationId | undefined {
  const fromNode = graph.modules[from];
  const slash = reference.indexOf('/');
  const possibleNamespace = slash < 0 ? undefined : reference.slice(0, slash);
  const namespace = possibleNamespace && fromNode?.imports[possibleNamespace] ? possibleNamespace : undefined;
  const localId = namespace ? reference.slice(slash + 1) : reference;
  const targetModule = namespace ? fromNode?.imports[namespace] : from;
  if (!targetModule || !localId) return undefined;
  const catalogValue = graph.modules[targetModule]?.module.organization[catalog];
  if (!catalogValue || typeof catalogValue !== 'object' || !(localId in catalogValue)) return undefined;
  return qualifyDeclaration(targetModule, String(catalog), localId);
}

type Catalog = 'types' | 'behaviors' | 'tools' | 'memories' | 'capabilities' | 'actors' | 'units'
  | 'goals' | 'workTypes' | 'initialWork' | 'protocols' | 'policies' | 'budgets' | 'decisions' | 'artifacts';

interface RawReference { path: string; authored: string; catalogs: Catalog[]; }

/** Resolve and sort-check every catalog reference presently declared by OrganizationIR. */
export function resolveOrganizationReferences(graph: ResolvedModuleGraph): ReferenceResolutionResult {
  const errors: string[] = [];
  const references: ResolvedReferenceUse[] = [];
  for (const [moduleId, node] of Object.entries(graph.modules).sort(([a], [b]) => a.localeCompare(b)) as Array<[ModuleId, ResolvedModuleNode]>) {
    const ambiguousPrefixes = new Set(Object.keys(node.imports));
    for (const [catalog, values] of organizationCatalogs(node.module.organization)) {
      for (const id of Object.keys(values ?? {})) {
        const prefix = id.split('/')[0];
        if (id.includes('/') && ambiguousPrefixes.has(prefix))
          errors.push(`module '${moduleId}' ${catalog}.${id}: local id is ambiguous with namespace '${prefix}'`);
      }
    }
    for (const use of collectReferences(node.module.organization)) {
      const matches = use.catalogs.flatMap((catalog) => {
        const target = resolveQualifiedReference(graph, moduleId, catalog, use.authored);
        return target ? [{ catalog, target }] : [];
      });
      if (matches.length === 0) {
        errors.push(`module '${moduleId}' ${use.path}: unresolved ${use.catalogs.join(' or ')} reference '${use.authored}'`);
        continue;
      }
      if (matches.length > 1) {
        errors.push(`module '${moduleId}' ${use.path}: ambiguous reference '${use.authored}' matches ${matches.map((x) => x.catalog).join(', ')}`);
        continue;
      }
      references.push({ module: moduleId, path: use.path, authored: use.authored, target: matches[0].target });
    }
  }
  references.sort((a, b) => `${a.module}:${a.path}`.localeCompare(`${b.module}:${b.path}`));
  return { references, errors: [...new Set(errors)].sort() };
}

function organizationCatalogs(ir: OrganizationIR): Array<[Catalog, Record<string, unknown> | undefined]> {
  return [
    ['types', ir.types], ['behaviors', ir.behaviors], ['tools', ir.tools], ['memories', ir.memories],
    ['capabilities', ir.capabilities], ['actors', ir.actors], ['units', ir.units], ['goals', ir.goals],
    ['workTypes', ir.workTypes], ['initialWork', ir.initialWork], ['protocols', ir.protocols],
    ['policies', ir.policies], ['budgets', ir.budgets], ['decisions', ir.decisions], ['artifacts', ir.artifacts],
  ];
}

function collectReferences(ir: OrganizationIR): RawReference[] {
  const out: RawReference[] = [];
  const add = (path: string, value: string | undefined, ...catalogs: Catalog[]) => {
    if (value) out.push({ path, authored: value, catalogs });
  };
  const adds = (path: string, values: string[] | undefined, ...catalogs: Catalog[]) =>
    (values ?? []).forEach((value, index) => add(`${path}[${index}]`, value, ...catalogs));
  for (const [id, value] of Object.entries(ir.behaviors ?? {})) {
    Object.entries(value.inputs ?? {}).forEach(([name, ref]) => add(`behaviors.${id}.inputs.${name}`, ref, 'types'));
    Object.entries(value.outputs ?? {}).forEach(([name, ref]) => add(`behaviors.${id}.outputs.${name}`, ref, 'types'));
    adds(`behaviors.${id}.tools`, value.tools, 'tools'); adds(`behaviors.${id}.memories`, value.memories, 'memories');
    adds(`behaviors.${id}.behaviors`, value.behaviors, 'behaviors');
  }
  for (const [id, value] of Object.entries(ir.actors)) {
    adds(`actors.${id}.behaviors`, value.behaviors, 'behaviors'); adds(`actors.${id}.memberOf`, value.memberOf, 'units');
    adds(`actors.${id}.reportsTo`, value.reportsTo, 'actors', 'units'); adds(`actors.${id}.constraints`, value.constraints, 'policies');
    value.capabilities?.forEach((grant, index) => { add(`actors.${id}.capabilities[${index}].capability`, grant.capability, 'capabilities'); add(`actors.${id}.capabilities[${index}].budget`, grant.budget, 'budgets'); });
    value.activation?.forEach((activation, index) => { add(`actors.${id}.activation[${index}].protocol`, activation.protocol, 'protocols'); add(`actors.${id}.activation[${index}].workType`, activation.workType, 'workTypes'); });
  }
  for (const [id, value] of Object.entries(ir.units ?? {})) {
    add(`units.${id}.parent`, value.parent, 'units'); adds(`units.${id}.members`, value.members, 'actors', 'units');
    adds(`units.${id}.goals`, value.goals, 'goals'); adds(`units.${id}.policies`, value.policies, 'policies'); adds(`units.${id}.decisionRules`, value.decisionRules, 'decisions');
  }
  for (const [id, value] of Object.entries(ir.relations ?? {})) {
    add(`relations.${id}.from`, value.from, 'actors', 'units'); add(`relations.${id}.to`, value.to, 'actors', 'units');
    add(`relations.${id}.protocol`, value.protocol, 'protocols'); adds(`relations.${id}.constraints`, value.constraints, 'policies');
  }
  for (const [id, value] of Object.entries(ir.goals ?? {})) {
    add(`goals.${id}.parent`, value.parent, 'goals'); add(`goals.${id}.owner`, value.owner, 'actors', 'units');
    adds(`goals.${id}.constraints`, value.constraints, 'policies'); value.measures?.forEach((measure, index) => add(`goals.${id}.measures[${index}].type`, measure.type, 'types'));
  }
  for (const [id, value] of Object.entries(ir.workTypes ?? {})) {
    adds(`workTypes.${id}.requiredCapabilities`, value.requiredCapabilities, 'capabilities');
    adds(`workTypes.${id}.assignment.candidates`, value.assignment?.candidates, 'actors', 'units');
    adds(`workTypes.${id}.verification.verifier`, value.verification?.verifier, 'actors', 'units');
    add(`workTypes.${id}.context.compaction`, value.context?.compaction, 'behaviors');
    value.lifecycle.transitions.forEach((transition, index) => adds(`workTypes.${id}.lifecycle.transitions[${index}].authority`, transition.authority, 'capabilities'));
  }
  for (const [id, value] of Object.entries(ir.initialWork ?? {})) {
    add(`initialWork.${id}.type`, value.type, 'workTypes'); add(`initialWork.${id}.goal`, value.goal, 'goals');
    add(`initialWork.${id}.parent`, value.parent, 'initialWork'); adds(`initialWork.${id}.dependencies`, value.dependencies, 'initialWork');
    add(`initialWork.${id}.accountable`, value.accountable, 'actors', 'units'); adds(`initialWork.${id}.assignees`, value.assignees, 'actors', 'units');
  }
  for (const [id, value] of Object.entries(ir.budgets ?? {})) add(`budgets.${id}.parent`, value.parent, 'budgets');
  for (const [id, value] of Object.entries(ir.decisions ?? {})) adds(`decisions.${id}.participants`, value.participants, 'actors', 'units');
  return out;
}

/** Utility for loaders to validate a pinned source when both expected and actual digest are available. */
export function assertImportDigest(source: SourceRef, loaded: LoadedOrganizationModule): void {
  if (source.digest && loaded.digest !== source.digest)
    throw new Error(`digest mismatch for '${source.uri}': expected ${source.digest}, got ${loaded.digest ?? 'unavailable'}`);
}

export function importNamespace(localName: string, declaration: ImportDecl): string {
  return declaration.namespace ?? localName;
}
