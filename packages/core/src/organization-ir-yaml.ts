import { isAlias, parse as parseYaml, parseDocument, visit } from 'yaml';
import {
  validateOrganizationIR,
  validateOrganizationStateIR,
  type OrganizationIR,
  type OrganizationStateIR,
} from './organization-ir';
import type { V1LoweringOptions } from './organization-compile';
import type { DeploymentIR, SubstrateComponentManifest } from './organization-substrate';
import { validateOrganizationProfile, type OrganizationProfileIR } from './organization-profile';
import { validateOrganizationStructure } from './organization-structural';

export function parseClosedYamlValue(yamlText: string): unknown {
  const document = parseDocument(yamlText, { schema: 'core', strict: true, uniqueKeys: true });
  if (document.errors.length) throw new Error(`invalid YAML:\n  ${document.errors.map((error) => error.message).join('\n  ')}`);
  const forbidden: string[] = [];
  visit(document, (_key, node) => {
    if (isAlias(node)) forbidden.push('aliases are not allowed');
    if (typeof node === 'object' && node !== null && 'anchor' in node && node.anchor)
      forbidden.push(`anchor '${String(node.anchor)}' is not allowed`);
    if (typeof node === 'object' && node !== null && 'tag' in node && node.tag)
      forbidden.push(`explicit tag '${String(node.tag)}' is not allowed`);
  });
  if (forbidden.length) throw new Error(`invalid YAML:\n  ${[...new Set(forbidden)].join('\n  ')}`);
  const value = document.toJS({ maxAliasCount: 0 });
  assertJsonValue(value, '/');
  return value;
}

function assertJsonValue(value: unknown, path: string): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path}: non-finite numbers are not allowed`);
    return;
  }
  if (Array.isArray(value)) return value.forEach((item, index) => assertJsonValue(item, `${path}/${index}`));
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) assertJsonValue(item, `${path}/${key}`);
    return;
  }
  throw new Error(`${path}: value is not JSON-representable`);
}

export function parseOrganizationIr(yamlText: string): OrganizationIR {
  const value = parseClosedYamlValue(yamlText);
  const structural = validateOrganizationStructure(value);
  if (!structural.valid) throw new Error(`invalid organization IR structure:\n  ${structural.errors.join('\n  ')}`);
  const ir = value as OrganizationIR;
  const result = validateOrganizationIR(ir, { allowImportedReferences: true });
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
