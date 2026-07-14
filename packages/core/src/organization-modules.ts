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
  const slash = reference.indexOf('/');
  const namespace = slash < 0 ? undefined : reference.slice(0, slash);
  const localId = slash < 0 ? reference : reference.slice(slash + 1);
  const fromNode = graph.modules[from];
  const targetModule = namespace ? fromNode?.imports[namespace] : from;
  if (!targetModule || !localId || localId.includes('/')) return undefined;
  const catalogValue = graph.modules[targetModule]?.module.organization[catalog];
  if (!catalogValue || typeof catalogValue !== 'object' || !(localId in catalogValue)) return undefined;
  return qualifyDeclaration(targetModule, String(catalog), localId);
}

/** Utility for loaders to validate a pinned source when both expected and actual digest are available. */
export function assertImportDigest(source: SourceRef, loaded: LoadedOrganizationModule): void {
  if (source.digest && loaded.digest !== source.digest)
    throw new Error(`digest mismatch for '${source.uri}': expected ${source.digest}, got ${loaded.digest ?? 'unavailable'}`);
}

export function importNamespace(localName: string, declaration: ImportDecl): string {
  return declaration.namespace ?? localName;
}
