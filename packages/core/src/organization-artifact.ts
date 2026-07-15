import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import artifactIndex from './generated/artifact-schema-index.json' with { type: 'json' };
import adapter from './generated/adapter-v1.schema.json' with { type: 'json' };
import artifactSchemaIndex from './generated/artifact-schema-index-v1.schema.json' with { type: 'json' };
import autonomy from './generated/autonomy-ir-v1.schema.json' with { type: 'json' };
import component from './generated/component-v2.schema.json' with { type: 'json' };
import control from './generated/control-v1.schema.json' with { type: 'json' };
import deployment from './generated/deployment-v1.schema.json' with { type: 'json' };
import event from './generated/event-v2.schema.json' with { type: 'json' };
import execution from './generated/execution-v1.schema.json' with { type: 'json' };
import generatedManifest from './generated/generated-manifest-v1.schema.json' with { type: 'json' };
import hermesController from './generated/hermes-controller-v1.schema.json' with { type: 'json' };
import history from './generated/history-v1.schema.json' with { type: 'json' };
import nativePlan from './generated/native-plan-v1.schema.json' with { type: 'json' };
import normalizedOrganization from './generated/normalized-organization-v1.schema.json' with { type: 'json' };
import openAutonomyManifest from './generated/open-autonomy-manifest-v1.schema.json' with { type: 'json' };
import organization from './generated/organization-ir-v2.schema.json' with { type: 'json' };
import packageLock from './generated/organization-package-lock-v1.schema.json' with { type: 'json' };
import packageManifest from './generated/organization-package-v1.schema.json' with { type: 'json' };
import profile from './generated/organization-profile-v1.schema.json' with { type: 'json' };
import organizationState from './generated/organization-state-v1.schema.json' with { type: 'json' };
import registrySnapshot from './generated/registry-snapshot-v1.schema.json' with { type: 'json' };
import runtimeLedger from './generated/runtime-ledger-v1.schema.json' with { type: 'json' };
import upgradePlan from './generated/upgrade-plan-v1.schema.json' with { type: 'json' };
import { parseClosedYamlValue, parseOrganizationIr } from './organization-ir-yaml';

const schemas: Record<string, object> = {
  'autonomy.adapter.v1': adapter,
  'autonomy.artifact-schema-index.v1': artifactSchemaIndex,
  'autonomy.component.v2': component,
  'autonomy.control.v1': control,
  'autonomy.deployment.v1': deployment,
  'autonomy.event.v2': event,
  'autonomy.execution.v1': execution,
  'autonomy.hermes-controller.v1': hermesController,
  'autonomy.history.v1': history,
  'autonomy.ir.v1': autonomy,
  'autonomy.native-plan.v1': nativePlan,
  'autonomy.normalized-organization.v1': normalizedOrganization,
  'autonomy.organization.v2': organization,
  'autonomy.package-lock.v1': packageLock,
  'autonomy.package.v1': packageManifest,
  'autonomy.profile.v1': profile,
  'autonomy.registry-snapshot.v1': registrySnapshot,
  'autonomy.state.v1': organizationState,
  'open-autonomy.autonomy.v1': openAutonomyManifest,
  'open-autonomy.generated.v1': generatedManifest,
  'open-autonomy.runtime-ledger.v1': runtimeLedger,
  'open-autonomy.upgrade-plan.v1': upgradePlan,
};

const indexed = new Set(artifactIndex.artifacts.map((entry) => entry.schema));
if (indexed.size !== artifactIndex.artifacts.length || Object.keys(schemas).some((schema) => !indexed.has(schema)) || [...indexed].some((schema) => !schemas[schema]))
  throw new Error('artifact validator registry differs from generated artifact schema index');

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
const validators = new Map(Object.entries(schemas).map(([schema, definition]) => [schema, ajv.compile(definition)]));

export type ParsedArtifactRoot = { schema: string; value: Record<string, unknown> };

export function parseArtifactRoot(text: string): ParsedArtifactRoot {
  const value = parseClosedYamlValue(text);
  if (!isRecord(value) || typeof value.schema !== 'string') throw new Error('artifact root requires a string schema discriminator');
  const schema = value.schema;
  const validate = validators.get(schema);
  if (!validate) throw new Error(`unsupported artifact root schema '${schema}'`);
  if (!validate(value)) throw new Error(`invalid '${schema}' artifact: ${describeErrors(validate).join('; ')}`);
  if (schema === 'autonomy.organization.v2') parseOrganizationIr(text);
  return { schema, value };
}

export function artifactFieldPointers(value: Record<string, unknown>): string[] {
  const pointers: string[] = [];
  const visit = (current: unknown, pointer: string): void => {
    if (pointer) pointers.push(pointer);
    if (Array.isArray(current)) current.forEach((item, index) => visit(item, `${pointer}/${index}`));
    else if (isRecord(current)) for (const key of Object.keys(current).sort(compareText)) visit(current[key], `${pointer}/${escapePointer(key)}`);
  };
  visit(value, '');
  return pointers;
}

function describeErrors(validate: ValidateFunction): string[] {
  return (validate.errors ?? []).map((error) => `${error.instancePath || '/'}: ${error.message ?? error.keyword}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapePointer(value: string): string { return value.replaceAll('~', '~0').replaceAll('/', '~1'); }
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
