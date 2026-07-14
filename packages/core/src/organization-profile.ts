import type { OrganizationIR, SourceRef } from './organization-ir';
import { validateOrganizationIR } from './organization-ir';

export type ProfileValue = string | number | boolean | null | ProfileValue[] | { [key: string]: ProfileValue };

export interface ProfileParameter {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  required?: boolean;
  default?: ProfileValue;
  enum?: ProfileValue[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
  items?: Omit<ProfileParameter, 'default' | 'required'>;
}

export interface ProfileCondition {
  parameter: string;
  operator: 'eq' | 'neq' | 'in' | 'gte' | 'lte';
  value: ProfileValue;
}

export interface ProfilePatch {
  operation: 'set' | 'merge' | 'append' | 'remove';
  /** JSON Pointer into the instantiated OrganizationIR. */
  path: string;
  value?: unknown;
}

export interface ProfileVariant {
  description?: string;
  when: ProfileCondition[];
  patches: ProfilePatch[];
}

/** A profile is a parameterized family of OrganizationIR modules, not a substrate recipe. */
export interface OrganizationProfileIR {
  schema: 'autonomy.profile.v1';
  name: string;
  version?: string;
  description?: string;
  source?: SourceRef;
  parameters?: Record<string, ProfileParameter>;
  template: OrganizationIR;
  variants?: Record<string, ProfileVariant>;
}

export interface ProfileInstantiation {
  organization?: OrganizationIR;
  parameters: Record<string, ProfileValue>;
  variants: string[];
  errors: string[];
}

const wholeParameter = /^\$\{\{\s*params\.([A-Za-z][A-Za-z0-9_-]*)\s*\}\}$/;
const embeddedParameter = /\$\{\{\s*params\.([A-Za-z][A-Za-z0-9_-]*)\s*\}\}/g;

export function validateOrganizationProfile(profile: OrganizationProfileIR): string[] {
  const errors: string[] = [];
  if (profile.schema !== 'autonomy.profile.v1') errors.push(`bad profile schema: ${String(profile.schema)}`);
  if (!profile.name?.trim()) errors.push('profile name is required');
  if (!profile.template || typeof profile.template !== 'object') errors.push('profile template is required');
  for (const [name, parameter] of Object.entries(profile.parameters ?? {})) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) errors.push(`parameters.${name}: invalid name`);
    if (parameter.default !== undefined) errors.push(...validateParameterValue(name, parameter.default, parameter));
    if (parameter.pattern) {
      try { new RegExp(parameter.pattern); } catch { errors.push(`parameters.${name}.pattern is not a valid regular expression`); }
    }
  }
  for (const [name, variant] of Object.entries(profile.variants ?? {})) {
    if (!variant.when?.length) errors.push(`variants.${name}.when must not be empty`);
    if (!variant.patches?.length) errors.push(`variants.${name}.patches must not be empty`);
    for (const condition of variant.when ?? [])
      if (!profile.parameters?.[condition.parameter]) errors.push(`variants.${name}.when: unknown parameter '${condition.parameter}'`);
    for (const [index, patch] of (variant.patches ?? []).entries()) {
      if (!patch.path.startsWith('/')) errors.push(`variants.${name}.patches[${index}].path must be a JSON Pointer`);
      if (patch.operation !== 'remove' && patch.value === undefined) errors.push(`variants.${name}.patches[${index}].value is required`);
    }
  }
  return errors;
}

export function instantiateProfile(
  profile: OrganizationProfileIR,
  supplied: Record<string, ProfileValue> = {},
): ProfileInstantiation {
  const errors = validateOrganizationProfile(profile);
  const parameters: Record<string, ProfileValue> = {};
  for (const [name, declaration] of Object.entries(profile.parameters ?? {})) {
    const value = supplied[name] ?? declaration.default;
    if (value === undefined) {
      if (declaration.required) errors.push(`parameter '${name}' is required`);
      continue;
    }
    errors.push(...validateParameterValue(name, value, declaration));
    parameters[name] = structuredClone(value);
  }
  for (const name of Object.keys(supplied)) if (!profile.parameters?.[name]) errors.push(`unknown parameter '${name}'`);
  if (errors.length) return { parameters, variants: [], errors };

  let organization = substituteParameters(structuredClone(profile.template), parameters) as OrganizationIR;
  const variants: string[] = [];
  for (const [name, variant] of Object.entries(profile.variants ?? {})) {
    if (!variant.when.every((condition) => matchesCondition(parameters[condition.parameter], condition))) continue;
    variants.push(name);
    for (const patch of variant.patches) {
      try {
        organization = applyProfilePatch(organization, {
          ...patch,
          value: substituteParameters(structuredClone(patch.value), parameters),
        });
      } catch (error) {
        errors.push(`variant '${name}': ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  const validation = validateOrganizationIR(organization);
  errors.push(...validation.errors.map((x) => `instantiated organization: ${x}`));
  return errors.length ? { parameters, variants, errors } : { organization, parameters, variants, errors };
}

export function applyProfilePatch(organization: OrganizationIR, patch: ProfilePatch): OrganizationIR {
  const root = structuredClone(organization) as unknown;
  const parts = parsePointer(patch.path);
  if (parts.length === 0) {
    if (patch.operation !== 'set' && patch.operation !== 'merge') throw new Error('root patch supports only set or merge');
    return (patch.operation === 'merge' ? deepMerge(root, patch.value) : structuredClone(patch.value)) as OrganizationIR;
  }
  let parent: unknown = root;
  for (const part of parts.slice(0, -1)) {
    if (!parent || typeof parent !== 'object' || !(part in parent)) throw new Error(`patch path does not exist: ${patch.path}`);
    parent = (parent as Record<string, unknown>)[part];
  }
  if (!parent || typeof parent !== 'object') throw new Error(`patch parent is not an object: ${patch.path}`);
  const key = parts.at(-1)!;
  const record = parent as Record<string, unknown>;
  switch (patch.operation) {
    case 'set': record[key] = structuredClone(patch.value); break;
    case 'merge': record[key] = deepMerge(record[key], patch.value); break;
    case 'append': {
      if (!Array.isArray(record[key])) throw new Error(`append target is not an array: ${patch.path}`);
      record[key] = [...record[key] as unknown[], structuredClone(patch.value)];
      break;
    }
    case 'remove':
      if (!(key in record)) throw new Error(`remove target does not exist: ${patch.path}`);
      delete record[key];
      break;
  }
  return root as OrganizationIR;
}

function validateParameterValue(name: string, value: ProfileValue, declaration: ProfileParameter): string[] {
  const errors: string[] = [];
  const actual = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  const typeOk = declaration.type === 'integer' ? typeof value === 'number' && Number.isInteger(value) : actual === declaration.type;
  if (!typeOk) return [`parameter '${name}' must be ${declaration.type}`];
  if (declaration.enum && !declaration.enum.some((x) => JSON.stringify(x) === JSON.stringify(value))) errors.push(`parameter '${name}' is not an allowed value`);
  if (typeof value === 'number' && declaration.minimum !== undefined && value < declaration.minimum) errors.push(`parameter '${name}' must be >= ${declaration.minimum}`);
  if (typeof value === 'number' && declaration.maximum !== undefined && value > declaration.maximum) errors.push(`parameter '${name}' must be <= ${declaration.maximum}`);
  if (typeof value === 'string' && declaration.pattern && !new RegExp(declaration.pattern).test(value)) errors.push(`parameter '${name}' does not match ${declaration.pattern}`);
  if (Array.isArray(value) && declaration.items)
    value.forEach((item, index) => errors.push(...validateParameterValue(`${name}[${index}]`, item, declaration.items as ProfileParameter)));
  return errors;
}

function substituteParameters(value: unknown, parameters: Record<string, ProfileValue>): unknown {
  if (typeof value === 'string') {
    const whole = value.match(wholeParameter);
    if (whole) {
      if (!(whole[1] in parameters)) throw new Error(`unbound profile parameter '${whole[1]}'`);
      return structuredClone(parameters[whole[1]]);
    }
    return value.replace(embeddedParameter, (_, name: string) => {
      if (!(name in parameters)) throw new Error(`unbound profile parameter '${name}'`);
      const replacement = parameters[name];
      return typeof replacement === 'string' || typeof replacement === 'number' || typeof replacement === 'boolean'
        ? String(replacement) : JSON.stringify(replacement);
    });
  }
  if (Array.isArray(value)) return value.map((x) => substituteParameters(x, parameters));
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, substituteParameters(child, parameters)]));
  return value;
}

function matchesCondition(actual: ProfileValue | undefined, condition: ProfileCondition): boolean {
  switch (condition.operator) {
    case 'eq': return JSON.stringify(actual) === JSON.stringify(condition.value);
    case 'neq': return JSON.stringify(actual) !== JSON.stringify(condition.value);
    case 'in': return Array.isArray(condition.value) && condition.value.some((x) => JSON.stringify(x) === JSON.stringify(actual));
    case 'gte': return typeof actual === 'number' && typeof condition.value === 'number' && actual >= condition.value;
    case 'lte': return typeof actual === 'number' && typeof condition.value === 'number' && actual <= condition.value;
  }
}

function parsePointer(pointer: string): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new Error(`invalid JSON Pointer '${pointer}'`);
  return pointer.slice(1).split('/').map((x) => x.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function deepMerge(left: unknown, right: unknown): unknown {
  if (!left || typeof left !== 'object' || Array.isArray(left) || !right || typeof right !== 'object' || Array.isArray(right))
    return structuredClone(right);
  const result = structuredClone(left) as Record<string, unknown>;
  for (const [key, value] of Object.entries(right as Record<string, unknown>)) result[key] = key in result ? deepMerge(result[key], value) : structuredClone(value);
  return result;
}
