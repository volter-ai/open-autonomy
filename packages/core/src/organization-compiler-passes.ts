import type { OrganizationIR } from './organization-ir';
import type { OrganizationProfileIR, ProfileValue } from './organization-profile';
import { instantiateProfile } from './organization-profile';
import {
  resolveOrganizationModules,
  type LoadedOrganizationModule,
  type ModuleId,
  type ModuleResolverPolicy,
  type OrganizationModuleLoader,
  type ResolvedModuleGraph,
} from './organization-modules';
import { normalizeOrganization, type NormalizedOrganizationIR } from './organization-normalize';
import type { CompilerDiagnostic, CompilerPass } from './organization-compiler';

export function createProfileInstantiationPass(
  parameters: Record<string, ProfileValue>, location: string,
): CompilerPass<OrganizationProfileIR, OrganizationIR> {
  return {
    id: 'organization.profile.instantiate', input: 'source', output: 'source',
    run(profile) {
      const result = instantiateProfile(profile as OrganizationProfileIR, parameters);
      const diagnostics = result.errors.map((message) => profileDiagnostic(message, location));
      return {
        output: result.organization,
        diagnostics,
        sourceMap: result.organization ? [{
          output: 'compiler:/organization',
          sources: [
            { location, path: '/template' },
            ...result.variants.map((variant) => ({ location, path: `/variants/${escapePointer(variant)}` })),
          ],
        }] : [],
      };
    },
  };
}

export function createModuleResolutionPass(
  loader: OrganizationModuleLoader, policy: ModuleResolverPolicy = {},
): CompilerPass<LoadedOrganizationModule, ResolvedModuleGraph> {
  return {
    id: 'organization.modules.resolve', input: 'source', output: 'resolved',
    async run(root) {
      const result = await resolveOrganizationModules(root as LoadedOrganizationModule, loader, policy);
      return {
        output: result.graph,
        diagnostics: result.errors.map((message) => moduleDiagnostic(message, root as LoadedOrganizationModule)),
        sourceMap: result.graph ? Object.values(result.graph.modules).map((node) => ({
          output: `compiler:/modules/${encodeURIComponent(node.module.moduleId)}`,
          sources: [{ location: node.module.location, path: '' }],
        })) : [],
      };
    },
  };
}

export const organizationNormalizationPass: CompilerPass<ResolvedModuleGraph, NormalizedOrganizationIR> = {
  id: 'organization.normalize', input: 'resolved', output: 'normalized', requires: ['organization.modules.resolve'],
  run(graph) {
    const result = normalizeOrganization(graph as ResolvedModuleGraph);
    return {
      output: result.normalized,
      diagnostics: result.errors.map((message) => normalizationDiagnostic(message, graph as ResolvedModuleGraph)),
      sourceMap: result.normalized?.sourceMap.map((entry) => ({ output: `compiler:/normalized${entry.output}`, sources: entry.sources })) ?? [],
    };
  },
};

function profileDiagnostic(message: string, location: string): CompilerDiagnostic {
  const parameter = message.match(/parameter '([^']+)'/i)?.[1];
  const variant = message.match(/variant '([^']+)'/i)?.[1];
  return {
    code: message.includes('unbound profile parameter') ? 'OA-PROFILE-UNBOUND-PARAMETER'
      : message.includes('patch') || variant ? 'OA-PROFILE-PATCH-INVALID'
        : parameter ? 'OA-PROFILE-PARAMETER-INVALID' : 'OA-PROFILE-INVALID',
    severity: 'error', phase: 'organization.profile.instantiate', message,
    source: { location, path: variant ? `/variants/${escapePointer(variant)}` : parameter ? `/parameters/${escapePointer(parameter)}` : '/template' },
  };
}

function moduleDiagnostic(message: string, root: LoadedOrganizationModule): CompilerDiagnostic {
  const importName = message.match(/ import '([^']+)'/)?.[1];
  const code = message.startsWith('import cycle:') ? 'OA-MODULE-IMPORT-CYCLE'
    : message.includes('digest') ? 'OA-MODULE-INTEGRITY'
      : message.includes('exceeds') ? 'OA-MODULE-RESOURCE-LIMIT'
        : message.includes('namespace') ? 'OA-MODULE-NAMESPACE-INVALID'
          : 'OA-MODULE-RESOLUTION-FAILED';
  return {
    code, severity: 'error', phase: 'organization.modules.resolve', message,
    source: { location: root.location, path: importName ? `/imports/${escapePointer(importName)}` : '/imports' },
  };
}

function normalizationDiagnostic(message: string, graph: ResolvedModuleGraph): CompilerDiagnostic {
  const moduleId = message.match(/^module '([^']+)'/)?.[1];
  const semanticPath = message.match(/^module '[^']+' ([^:]+):/)?.[1];
  const node = moduleId ? graph.modules[moduleId as ModuleId] : undefined;
  return {
    code: message.includes('unresolved') ? 'OA-NORMALIZE-UNRESOLVED-REFERENCE'
      : message.includes('ambiguous') ? 'OA-NORMALIZE-AMBIGUOUS-REFERENCE' : 'OA-NORMALIZE-FAILED',
    severity: 'error', phase: 'organization.normalize', message,
    source: node ? { location: node.module.location, path: semanticPath } : undefined,
  };
}

function escapePointer(value: string): string { return value.replace(/~/g, '~0').replace(/\//g, '~1'); }
