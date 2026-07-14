import { parse as parseYaml } from 'yaml';
import {
  validateOrganizationIR,
  validateOrganizationStateIR,
  type OrganizationIR,
  type OrganizationStateIR,
} from './organization-ir';
import type { V1LoweringOptions } from './organization-compile';
import type { DeploymentIR, SubstrateComponentManifest } from './organization-substrate';
import { validateOrganizationProfile, type OrganizationProfileIR } from './organization-profile';

export function parseOrganizationIr(yamlText: string): OrganizationIR {
  const ir = parseYaml(yamlText) as OrganizationIR;
  const result = validateOrganizationIR(ir);
  if (result.errors.length) throw new Error(`invalid organization IR:\n  ${result.errors.join('\n  ')}`);
  return ir;
}

export function parseOrganizationStateIr(yamlText: string, definition?: OrganizationIR): OrganizationStateIR {
  const state = parseYaml(yamlText) as OrganizationStateIR;
  const result = validateOrganizationStateIR(state, definition);
  if (result.errors.length) throw new Error(`invalid organization state IR:\n  ${result.errors.join('\n  ')}`);
  return state;
}

export function parseV1LoweringOptions(yamlText: string): V1LoweringOptions {
  const document = parseYaml(yamlText) as DeploymentIR & {
    components: Record<string, SubstrateComponentManifest>;
    v1: Omit<V1LoweringOptions, 'deployment' | 'components'>;
  };
  const { components, v1, ...deployment } = document;
  const options: V1LoweringOptions = { ...v1, deployment, components };
  const errors: string[] = [];
  if (deployment.schema !== 'autonomy.deployment.v1') errors.push('schema must be autonomy.deployment.v1');
  if (!components || typeof components !== 'object') errors.push('components registry is required');
  if (!deployment.providers || typeof deployment.providers !== 'object') errors.push('providers are required');
  if (!Array.isArray(options.targets) || options.targets.length === 0) errors.push('targets must contain at least one target');
  if (!options.actors || typeof options.actors !== 'object') errors.push('actors mapping is required');
  for (const [id, actor] of Object.entries(options.actors ?? {})) {
    if (!actor.behavior) errors.push(`actors.${id}.behavior is required`);
    if (!Array.isArray(actor.capabilities)) errors.push(`actors.${id}.capabilities must be an array`);
    if (!Array.isArray(actor.triggers) || actor.triggers.length === 0) errors.push(`actors.${id}.triggers must not be empty`);
  }
  if (errors.length) throw new Error(`invalid v1 lowering options:\n  ${errors.join('\n  ')}`);
  return options;
}

export function parseOrganizationProfile(yamlText: string): OrganizationProfileIR {
  const profile = parseYaml(yamlText) as OrganizationProfileIR;
  const errors = validateOrganizationProfile(profile);
  if (errors.length) throw new Error(`invalid organization profile:\n  ${errors.join('\n  ')}`);
  return profile;
}
