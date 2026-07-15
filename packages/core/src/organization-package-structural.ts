import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import manifestSchema from './generated/organization-package-v1.schema.json' with { type: 'json' };
import lockSchema from './generated/organization-package-lock-v1.schema.json' with { type: 'json' };
import snapshotSchema from './generated/registry-snapshot-v1.schema.json' with { type: 'json' };
import type { OrganizationPackageLock, OrganizationPackageManifest, RegistrySnapshot } from './organization-package';

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
export const validatePackageManifest = ajv.compile<OrganizationPackageManifest>(manifestSchema);
export const validatePackageLock = ajv.compile<OrganizationPackageLock>(lockSchema);
export const validateRegistrySnapshot = ajv.compile<RegistrySnapshot>(snapshotSchema);

export function structuralErrors<T>(validate: ValidateFunction<T>): string[] {
  return (validate.errors ?? []).map(describe);
}

function describe(error: ErrorObject): string {
  if (error.keyword === 'additionalProperties') return `${error.instancePath || '/'}: unknown member '${String(error.params.additionalProperty)}'`;
  return `${error.instancePath || '/'}: ${error.message ?? error.keyword}`;
}
