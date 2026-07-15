import type { ValidateFunction } from 'ajv/dist/2020.js';
import { parseClosedYamlValue } from './organization-ir-yaml';
import type { OrganizationPackageLock, OrganizationPackageManifest, RegistrySnapshot } from './organization-package';
import { structuralErrors, validatePackageLock as lock, validatePackageManifest as manifest, validateRegistrySnapshot as snapshot } from './organization-package-structural';

function parse<T>(text: string, validate: ValidateFunction<T>, family: string): T {
  const value = parseClosedYamlValue(text);
  if (!validate(value)) throw new Error(`invalid ${family}:\n  ${structuralErrors(validate).join('\n  ')}`);
  return value as T;
}

export const parseOrganizationPackageManifest = (text: string) => parse<OrganizationPackageManifest>(text, manifest, 'organization package manifest');
export const parseOrganizationPackageLock = (text: string) => parse<OrganizationPackageLock>(text, lock, 'organization package lock');
export const parseRegistrySnapshot = (text: string) => parse<RegistrySnapshot>(text, snapshot, 'registry snapshot');
