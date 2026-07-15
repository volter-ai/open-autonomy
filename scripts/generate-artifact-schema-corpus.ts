#!/usr/bin/env bun
import { writeFileSync } from 'node:fs';

const ir = 'packages/core/src/organization-ir.ts';
const artifacts = [
  ['autonomy.organization.v2', 'OrganizationIR', [ir], 'organization-ir-v2.schema.json'],
  ['autonomy.ir.v1', 'AutonomyIR', ['packages/core/src/ir.ts'], 'autonomy-ir-v1.schema.json'],
  ['open-autonomy.autonomy.v1', 'OAManifest', ['packages/core/src/ir.ts', 'packages/core/src/manifest.ts'], 'open-autonomy-manifest-v1.schema.json'],
  ['autonomy.state.v1', 'OrganizationStateIR', [ir], 'organization-state-v1.schema.json'],
  ['autonomy.profile.v1', 'OrganizationProfileIR', [ir, 'packages/core/src/organization-profile.ts'], 'organization-profile-v1.schema.json'],
  ['autonomy.deployment.v1', 'DeploymentIR', [ir, 'packages/core/src/organization-substrate.ts'], 'deployment-v1.schema.json'],
  ['autonomy.component.v2', 'ComponentManifestV2', ['packages/core/src/organization-canonical.ts', 'packages/core/src/organization-component.ts'], 'component-v2.schema.json'],
  ['autonomy.adapter.v1', 'AdapterContract', ['packages/core/src/organization-canonical.ts', 'packages/core/src/organization-component.ts'], 'adapter-v1.schema.json'],
  ['autonomy.event.v2', 'PortableEventV2', [ir, 'packages/core/src/organization-canonical.ts', 'packages/core/src/organization-causal-state.ts'], 'event-v2.schema.json'],
  ['autonomy.history.v1', 'AcceptedCausalHistory', [ir, 'packages/core/src/organization-canonical.ts', 'packages/core/src/organization-causal-state.ts'], 'history-v1.schema.json'],
  ['autonomy.normalized-organization.v1', 'NormalizedOrganizationIR', [ir, 'packages/core/src/organization-canonical.ts', 'packages/core/src/organization-modules.ts', 'packages/core/src/organization-normalize.ts'], 'normalized-organization-v1.schema.json'],
  ['autonomy.control.v1', 'ControlPlanIR', [ir, 'packages/core/src/organization-canonical.ts', 'packages/core/src/organization-component.ts', 'packages/core/src/organization-solver.ts', 'packages/core/src/organization-lowering.ts'], 'control-v1.schema.json'],
  ['autonomy.execution.v1', 'ExecutionPlanIR', [ir, 'packages/core/src/organization-canonical.ts', 'packages/core/src/organization-component.ts', 'packages/core/src/organization-solver.ts', 'packages/core/src/organization-lowering.ts'], 'execution-v1.schema.json'],
  ['autonomy.native-plan.v1', 'NativePlanIR', [ir, 'packages/core/src/organization-canonical.ts', 'packages/core/src/organization-component.ts', 'packages/core/src/organization-solver.ts', 'packages/core/src/organization-lowering.ts'], 'native-plan-v1.schema.json'],
  ['open-autonomy.runtime-ledger.v1', 'RuntimeLedgerCorpus', ['packages/core/src/organization-runtime-ledger.ts'], 'runtime-ledger-v1.schema.json'],
  ['autonomy.hermes-controller.v1', 'HermesControllerState', ['packages/core/src/organization-hermes-controller.ts'], 'hermes-controller-v1.schema.json'],
  ['autonomy.package.v1', 'OrganizationPackageManifest', ['packages/core/src/organization-package.ts'], 'organization-package-v1.schema.json'],
  ['autonomy.package-lock.v1', 'OrganizationPackageLock', ['packages/core/src/organization-package.ts'], 'organization-package-lock-v1.schema.json'],
  ['autonomy.registry-snapshot.v1', 'RegistrySnapshot', ['packages/core/src/organization-package.ts'], 'registry-snapshot-v1.schema.json'],
  ['autonomy.artifact-schema-index.v1', 'ArtifactSchemaIndex', ['packages/core/src/organization-package.ts'], 'artifact-schema-index-v1.schema.json'],
  ['open-autonomy.upgrade-plan.v1', 'UpgradePlan', ['packages/core/src/upgrade.ts'], 'upgrade-plan-v1.schema.json'],
  ['open-autonomy.generated.v1', 'GeneratedManifest', ['packages/core/src/file-manifest.ts'], 'generated-manifest-v1.schema.json'],
  ['autonomy.conformance-manifest.v1', 'ConformanceTestManifest', ['packages/core/src/organization-conformance.ts'], 'conformance-manifest-v1.schema.json'],
  ['autonomy.conformance-result.v1', 'ConformanceResultBundle', ['packages/core/src/organization-conformance.ts'], 'conformance-result-v1.schema.json'],
  ['autonomy.conformance-mutations.v1', 'ConformanceMutationManifest', ['packages/core/src/organization-conformance.ts'], 'conformance-mutations-v1.schema.json'],
  ['autonomy.compiler-artifact.v1', 'CompilerArtifactProtocol', ['packages/core/src/organization-canonical.ts', 'packages/core/src/organization-compiler.ts', 'packages/core/src/organization-compiler-api.ts'], 'compiler-artifact-v1.schema.json'],
  ['autonomy.deployment-planning-certificate.v1', 'DeploymentPlanningCertificate', ['packages/core/src/organization-deployment-solver.ts', 'packages/core/src/organization-deployment-certificate.ts'], 'deployment-planning-certificate-v1.schema.json'],
  ['autonomy.deployment-bundle-input.v1', 'DeploymentBundleInput', [ir, 'packages/core/src/organization-deployment-solver.ts', 'packages/core/src/organization-deployment-bundle.ts'], 'deployment-bundle-input-v1.schema.json'],
  ['autonomy.deployment-bundle.v1', 'DeploymentBundleManifest', [ir, 'packages/core/src/organization-deployment-solver.ts', 'packages/core/src/organization-deployment-bundle.ts'], 'deployment-bundle-v1.schema.json'],
  ['autonomy.deployment-release.v1', 'DeploymentRelease', [ir, 'packages/core/src/organization-deployment-solver.ts', 'packages/core/src/organization-deployment-bundle.ts'], 'deployment-release-v1.schema.json'],
  ['autonomy.live-deployment-instance.v1', 'LiveDeploymentInstance', [ir, 'packages/core/src/organization-deployment-solver.ts', 'packages/core/src/organization-deployment-bundle.ts'], 'live-deployment-instance-v1.schema.json'],
] as const;

for (const [, root, sources, filename] of artifacts) {
  const result = Bun.spawnSync(['bun', 'scripts/generate-organization-schema.ts', sources.join(','), root, `packages/core/src/generated/${filename}`], { stdout: 'inherit', stderr: 'inherit' });
  if (result.exitCode !== 0) process.exit(result.exitCode);
}
writeFileSync('packages/core/src/generated/artifact-schema-index.json', `${JSON.stringify({
  schema: 'autonomy.artifact-schema-index.v1',
  artifacts: artifacts.map(([schema, root, , filename]) => ({ schema, root, filename })),
}, null, 2)}\n`);
