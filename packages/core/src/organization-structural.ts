import Ajv2020, { type ErrorObject } from 'ajv/dist/2020.js';
import schema from './generated/organization-ir-v2.schema.json' with { type: 'json' };
import type { OrganizationIR } from './organization-ir';

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
const validate = ajv.compile<OrganizationIR>(schema);

function describe(error: ErrorObject): string {
  const path = error.instancePath || '/';
  if (error.keyword === 'additionalProperties') {
    return `${path}: unknown member '${String(error.params.additionalProperty)}'`;
  }
  return `${path}: ${error.message ?? error.keyword}`;
}

/** Closed, generated structural grammar check performed before semantic validation. */
export function validateOrganizationStructure(value: unknown): { valid: boolean; errors: string[] } {
  const valid = validate(value);
  return { valid, errors: valid ? [] : (validate.errors ?? []).map(describe) };
}
