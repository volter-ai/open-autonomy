import type { ActorKind, AutonomyIR, DocumentRoles, IRAgent, Trigger } from './ir';
import { validateIR } from './ir';
import type { OrganizationIR } from './organization-ir';
import { validateOrganizationIR } from './organization-ir';
import {
  solveDeployment,
  type CompatibilityResult,
  type DeploymentIR,
  type SubstrateComponentManifest,
} from './organization-substrate';

export interface V1ActorProjection {
  behavior: string;
  capabilities: string[];
  triggers: Trigger[];
  kind?: ActorKind;
  timeout?: number;
  review?: string;
  prelaunch?: string;
  result?: { schema: Record<string, unknown> };
}

/** Deployment selection is external to OrganizationIR; actor projection is currently the v1 adapter seam. */
export interface V1LoweringOptions {
  deployment: DeploymentIR;
  components: Record<string, SubstrateComponentManifest>;
  targets: string[];
  codeHost?: 'github' | 'local-git';
  actors: Record<string, V1ActorProjection>;
  policy?: { maxConcurrent?: number; box: Record<string, unknown> };
  resources?: string[];
  documents?: { roles: DocumentRoles };
}

export interface V1LoweringResult {
  ir?: AutonomyIR;
  compatibility: CompatibilityResult;
  errors: string[];
}

/**
 * Project an organization into the deployed v1 runner profile only after the selected substrate composition
 * proves compatibility. v1 projection details remain an adapter seam until behavior/capability/activation
 * mappings are derived mechanically.
 */
export function lowerOrganizationToV1(source: OrganizationIR, options: V1LoweringOptions): V1LoweringResult {
  const sourceValidation = validateOrganizationIR(source);
  if (sourceValidation.errors.length) throw new Error(`invalid organization IR:\n  ${sourceValidation.errors.join('\n  ')}`);
  const compatibility = solveDeployment(source, options.deployment, options.components);
  const errors: string[] = [];
  if (!compatibility.status.startsWith('compatible')) {
    errors.push(`deployment is ${compatibility.status}`);
    return { compatibility, errors };
  }

  const actors: Record<string, IRAgent> = {};
  for (const [id, actor] of Object.entries(source.actors)) {
    const projection = options.actors[id];
    if (!projection) { errors.push(`actor '${id}' has no v1 projection`); continue; }
    actors[id] = {
      behavior: projection.behavior,
      capabilities: projection.capabilities,
      triggers: projection.triggers,
      kind: projection.kind ?? (actor.kind === 'human' ? 'human' : 'agent'),
      timeout: projection.timeout,
      review: projection.review,
      prelaunch: projection.prelaunch,
      result: projection.result,
    };
  }
  for (const id of Object.keys(options.actors)) if (!source.actors[id]) errors.push(`v1 projection names unknown source actor '${id}'`);
  if (errors.length) return { compatibility, errors };

  const ir: AutonomyIR = {
    schema: 'autonomy.ir.v1',
    targets: options.targets,
    codeHost: options.codeHost,
    agents: actors,
    policy: options.policy ?? { box: {} },
    resources: options.resources ?? [],
    documents: options.documents,
  };
  errors.push(...validateIR(ir));
  return errors.length ? { compatibility, errors } : { ir, compatibility, errors };
}
