/** Machine-checked B0 inventory. Entries account for language surface; they do not prove runtime preservation. */
export type CoverageDomain = 'portable' | 'dialect-bound' | 'compiler' | 'observation';
export type CoverageMaturity = 'implemented' | 'partial' | 'declared';
export type PunchlistOwner = 'B0' | `P${number}`;

export interface SemanticCoverageEntry {
  interface: string;
  fields: readonly string[];
  domain: CoverageDomain;
  maturity: CoverageMaturity;
  denotation: string;
  owner: PunchlistOwner;
}

const entry = (
  interfaceName: string, fields: string, domain: CoverageDomain,
  maturity: CoverageMaturity, denotation: string, owner: PunchlistOwner,
): SemanticCoverageEntry => ({ interface: interfaceName, fields: fields.split(' '), domain, maturity, denotation, owner });

export const ORGANIZATION_SEMANTIC_COVERAGE: readonly SemanticCoverageEntry[] = [
  entry('SourceRef', 'uri digest mediaType', 'portable', 'partial', 'content address or location with optional integrity and media type', 'P1'),
  entry('AnnotationSet', 'labels documentation provenance extensions', 'portable', 'partial', 'nonsemantic metadata, source assertions, and namespaced extension payload', 'P2'),
  entry('ImportDecl', 'source namespace format required', 'portable', 'declared', 'module dependency and local namespace binding', 'P1'),
  entry('TypeDecl', 'schema', 'portable', 'partial', 'named structural data type', 'P5'),
  entry('BehaviorDecl', 'kind source inline inputs outputs instructions tools memories behaviors', 'portable', 'partial', 'typed reusable behavior and its declared dependencies', 'P5'),
  entry('InstructionAssembly', 'precedence fragments conflict', 'portable', 'declared', 'ordered instruction composition contract', 'P5'),
  entry('InstructionFragment', 'id role source text when priority', 'portable', 'declared', 'provenanced conditional instruction contribution', 'P5'),
  entry('ToolDecl', 'input output effects protocol endpoint idempotency', 'portable', 'partial', 'typed callable capability and effect contract', 'P5'),
  entry('MemoryDecl', 'kind scope retention consistency source schema', 'portable', 'declared', 'scoped retained information facility', 'P5'),
  entry('EffectDecl', 'resource action mode reversible', 'portable', 'declared', 'abstract externally relevant effect', 'P5'),
  entry('ActorDecl', 'kind behaviors memberOf reportsTo capabilities constraints activation capacity implementation', 'portable', 'partial', 'durable organizational principal and its roles, authority, and capacity', 'P5'),
  entry('CapabilityGrant', 'capability scope conditions budget delegable attenuation expires', 'portable', 'partial', 'scoped conditional authority grant', 'P12'),
  entry('CapabilityDecl', 'resourceKinds actions effects risk', 'portable', 'partial', 'abstract authority/effect vocabulary', 'P12'),
  entry('ResourceSelector', 'kind ids labels expression', 'portable', 'declared', 'set of resources selected by structural or dialect predicate', 'P5'),
  entry('CapacityDecl', 'concurrent queue rate', 'portable', 'declared', 'actor service-capacity bounds', 'P12'),
  entry('ImplementationChoice', 'when substrate model runtime configuration', 'dialect-bound', 'declared', 'ranked or conditional implementation hint, not actor identity', 'P8'),
  entry('ActivationDecl', 'kind expression eventType protocol workType parameters', 'portable', 'partial', 'condition that makes actor behavior eligible to run', 'P8'),
  entry('UnitDecl', 'kind parent members purpose goals policies decisionRules', 'portable', 'partial', 'organizational collective and topology membership', 'P12'),
  entry('RelationDecl', 'kind from to protocol constraints', 'portable', 'partial', 'typed organizational relation between principals', 'P12'),
  entry('GoalDecl', 'statement parent owner horizon priority measures constraints statusPolicy', 'portable', 'partial', 'intended outcome, ownership, hierarchy, and observations', 'P12'),
  entry('MeasureDecl', 'name type target direction observation', 'portable', 'declared', 'goal observation and comparison objective', 'P12'),
  entry('WorkTypeDecl', 'input output lifecycle assignment retry verification context requiredCapabilities', 'portable', 'partial', 'durable work contract and control policies', 'P12'),
  entry('LifecycleDecl', 'initial terminal states transitions', 'portable', 'implemented', 'labeled work-state transition system', 'P12'),
  entry('StateDecl', 'category invariant', 'portable', 'partial', 'named lifecycle state and invariant predicates', 'P12'),
  entry('TransitionDecl', 'from to event guard authority effects', 'portable', 'partial', 'guarded and authorized lifecycle edge', 'P12'),
  entry('AssignmentPolicy', 'mode candidates selector exclusive lease', 'portable', 'declared', 'work assignment and ownership acquisition contract', 'P7'),
  entry('RetryPolicy', 'maxAttempts maxElapsed backoff deduplicateBy retryWhen exhaustion', 'portable', 'declared', 'bounded retry and exhaustion behavior', 'P12'),
  entry('VerificationPolicy', 'required verifier independent criteria evidence', 'portable', 'partial', 'acceptance evidence and separation-of-duty contract', 'P12'),
  entry('ContextPolicy', 'include exclude maximumTokens compaction', 'portable', 'declared', 'information admitted to work execution context', 'P5'),
  entry('WorkItemDecl', 'type title goal parent dependencies accountable assignees input initialState', 'portable', 'partial', 'seed durable work instance', 'P12'),
  entry('ProtocolDecl', 'roles messages sessions transport', 'portable', 'partial', 'typed multiparty interaction contract', 'P12'),
  entry('MessageDecl', 'from to schema effects correlation', 'portable', 'declared', 'typed protocol message and organizational effects', 'P12'),
  entry('SessionTypeDecl', 'initial terminal states', 'portable', 'declared', 'protocol session transition system', 'P12'),
  entry('PolicyDecl', 'kind appliesTo rule enforcement violation', 'portable', 'declared', 'governance rule, enforcement mode, and violation response', 'P12'),
  entry('BudgetDecl', 'resource limit unit period parent onExhaustion', 'portable', 'partial', 'nested typed resource bound and exhaustion response', 'P12'),
  entry('DecisionRuleDecl', 'method participants quorum tieBreak output', 'portable', 'declared', 'collective or individual decision procedure', 'P12'),
  entry('ArtifactTypeDecl', 'mediaType schema mutable versioned retention', 'portable', 'declared', 'artifact representation and lifecycle contract', 'P10'),
  entry('CompilerRequirements', 'guarantees requirements preferredSubstrates forbiddenSubstrates lossPolicy extensions', 'compiler', 'partial', 'explicit compatibility and loss constraints without selecting a deployment', 'P7'),
  entry('SemanticConstraint', 'property operator value', 'compiler', 'partial', 'property constraint interpreted by compatibility analysis', 'P7'),
  entry('OrganizationIR', 'schema name version imports types behaviors tools memories capabilities actors units relations goals workTypes initialWork protocols policies budgets decisions artifacts compiler', 'portable', 'partial', 'target-independent organization definition and linked catalogs', 'P2'),
  entry('OrganizationStateIR', 'schema organization revision observedAt work attempts claims conversations decisions artifacts budgetUsage events', 'observation', 'partial', 'versioned materialized operational observation', 'P10'),
  entry('WorkItemState', 'type state goal parent dependencies accountable assignees currentAttempts input output createdAt updatedAt', 'observation', 'partial', 'observed durable work instance', 'P10'),
  entry('AttemptState', 'work actor implementation status startedAt endedAt session result failure evidence', 'observation', 'partial', 'bounded execution attempt observation', 'P10'),
  entry('ClaimState', 'work actor acquiredAt expiresAt heartbeatAt token status', 'observation', 'partial', 'ownership or lease observation independent of attempt', 'P10'),
  entry('ConversationState', 'protocol participants externalRef status relatedWork messages', 'observation', 'declared', 'portable conversation correlated with external transport', 'P10'),
  entry('DecisionState', 'rule question participants status outcome rationale evidence', 'observation', 'partial', 'observed decision and supporting evidence', 'P10'),
  entry('ArtifactState', 'type uri digest version producedBy relatedWork', 'observation', 'partial', 'observed artifact identity and provenance links', 'P10'),
  entry('BudgetUsageState', 'budget consumed reserved asOf', 'observation', 'partial', 'observed resource reservation and consumption', 'P10'),
  entry('OrganizationEvent', 'id type at actor subject causation correlation data', 'observation', 'partial', 'portable causally linked operational observation envelope', 'P10'),
  entry('ValidationResult', 'errors warnings', 'compiler', 'implemented', 'legacy human-readable validation result', 'P3'),
  entry('ProfileParameter', 'type description required default enum minimum maximum pattern items', 'portable', 'implemented', 'typed profile-family parameter domain', 'B0'),
  entry('ProfileCondition', 'parameter operator value', 'portable', 'implemented', 'deterministic profile variant predicate', 'B0'),
  entry('ProfilePatch', 'operation path value', 'portable', 'partial', 'ordered organization-template transformation', 'P5'),
  entry('ProfileVariant', 'description when patches', 'portable', 'partial', 'conditional ordered specialization', 'P5'),
  entry('OrganizationProfileIR', 'schema name version description source parameters template variants', 'portable', 'partial', 'typed family of organizations', 'P5'),
  entry('ProfileInstantiation', 'organization parameters variants errors', 'compiler', 'implemented', 'profile instantiation result and applied-variant record', 'B0'),
  entry('FeatureProvision', 'realization interface mechanism properties', 'compiler', 'partial', 'legacy component feature assertion', 'P6'),
  entry('SubstrateComponentManifest', 'id version provides requires conflictsWith configuration', 'compiler', 'partial', 'legacy multi-facet provider declaration', 'P6'),
  entry('ProviderInstance', 'component configuration', 'compiler', 'partial', 'configured component instance', 'P6'),
  entry('DeploymentBinding', 'feature provider through interface', 'compiler', 'partial', 'selected provider/adapter route for one feature', 'P7'),
  entry('DeploymentIR', 'schema name providers bindings authorities', 'compiler', 'partial', 'selected composed realization and authoritative state ownership', 'P7'),
  entry('SemanticRequirement', 'feature paths required acceptable constraints authoritativeState', 'compiler', 'partial', 'legacy derived compatibility requirement', 'P7'),
  entry('CompatibilityDiagnostic', 'feature status provider message', 'compiler', 'partial', 'legacy compatibility explanation', 'P3'),
  entry('CompatibilityResult', 'status requirements selections diagnostics', 'compiler', 'partial', 'legacy deployment compatibility report', 'P7'),
  entry('MaterializationResult', 'state errors', 'compiler', 'partial', 'all-or-nothing sequential state reduction result', 'P10'),
  entry('V1ActorProjection', 'behavior capabilities triggers kind timeout review prelaunch result', 'compiler', 'partial', 'temporary explicit adapter from v2 actor to v1 runner actor', 'P8'),
  entry('V1LoweringOptions', 'deployment components targets codeHost actors policy resources documents', 'compiler', 'partial', 'temporary combined deployment and v1 emission configuration', 'P8'),
  entry('V1LoweringResult', 'ir compatibility errors', 'compiler', 'partial', 'v1 emission plus compatibility report', 'P8'),
] as const;

export interface AuditResidual {
  id: string;
  finding: string;
  owner: PunchlistOwner;
}

/** B0 residual parking is closed: every known gap has a punch-list owner. */
export const ORGANIZATION_AUDIT_RESIDUALS: readonly AuditResidual[] = [
  { id: 'OAIR-R001', finding: 'imports, namespaces, canonical module identity, and integrity are declared but unresolved', owner: 'P1' },
  { id: 'OAIR-R002', finding: 'normalization, canonical serialization, semantic hashing, and source maps are absent', owner: 'P2' },
  { id: 'OAIR-R003', finding: 'diagnostics are strings and compiler passes have no typed framework', owner: 'P3' },
  { id: 'OAIR-R004', finding: 'schema migration and replay-version framework is absent', owner: 'P4' },
  { id: 'OAIR-R005', finding: 'expression, behavior, instruction, context, and profile-patch semantics are incomplete', owner: 'P5' },
  { id: 'OAIR-R006', finding: 'component manifests lack typed interfaces, state, failure, trust, capacity, cost, and adapter contracts', owner: 'P6' },
  { id: 'OAIR-R007', finding: 'requirements are catalog-level feature flags rather than atomic semantic obligations', owner: 'P7' },
  { id: 'OAIR-R008', finding: 'compatibility has no assurance policy, certificates, constructive search, or unsatisfied cores', owner: 'P7' },
  { id: 'OAIR-R009', finding: 'v1 lowering relies on handwritten actor projection and has no staged contract-preserving IR', owner: 'P8' },
  { id: 'OAIR-R010', finding: 'Hermes/Slack/coding-worker composed deployment is not implemented end to end', owner: 'P9' },
  { id: 'OAIR-R011', finding: 'state reducer is sequential and lacks causal DAG, evidence, authorization, corrections, and conformance', owner: 'P10' },
  { id: 'OAIR-R012', finding: 'identical canonical organization has not been proven on a dissimilar second substrate', owner: 'P11' },
  { id: 'OAIR-R013', finding: 'formal lifecycle, authority, protocol, information-flow, resource, and loop analyses are absent', owner: 'P12' },
  { id: 'OAIR-R014', finding: 'external standard mappings lack versioned semantic coverage and loss reports', owner: 'P13' },
] as const;

export type SemanticDisposition = 'preserved' | 'adapter-realized' | 'approximated' | 'rejected' | 'unresolved';
export type AssuranceStatus =
  | 'proved' | 'statically-checked' | 'model-checked' | 'property-tested' | 'conformance-tested'
  | 'live-observed' | 'externally-attested' | 'assumed' | 'unknown';

export interface BaselineObligation {
  id: string;
  claim: string;
  disposition: SemanticDisposition;
  assurance: AssuranceStatus;
  evidence?: string;
  residual?: string;
}

/** Actual B0 assurance accounting for the implementation as it exists, not desired future strength. */
export const ORGANIZATION_BASELINE_OBLIGATIONS: readonly BaselineObligation[] = [
  { id: 'B0-SEM-1', claim: 'every current public interface field is present in the semantic coverage registry', disposition: 'preserved', assurance: 'statically-checked', evidence: 'organization-coverage.test.ts exported-interface AST comparison' },
  { id: 'B0-SEM-2', claim: 'profile, organization, deployment, compiler result, and operational state remain distinct artifacts', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-profile.test.ts full flow and separate YAML parsers' },
  { id: 'B0-TYP-1', claim: 'current portable references resolve only to their declared semantic sort', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-ir.test.ts dangling and wrong-catalog reference fixtures' },
  { id: 'B0-ALG-1', claim: 'profile patch ordering and conflicts have a complete algebra', disposition: 'unresolved', assurance: 'unknown', residual: 'OAIR-R005' },
  { id: 'B0-ALG-2', claim: 'successful sequential state materialization composes over trace prefixes', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-state.test.ts prefix composition fixture' },
  { id: 'B0-DIST-1', claim: 'state/claim declarations do not imply unimplemented distributed guarantees', disposition: 'unresolved', assurance: 'assumed', residual: 'OAIR-R011' },
  { id: 'B0-SEC-1', claim: 'every declared capability and policy names a technical enforcement boundary', disposition: 'unresolved', assurance: 'unknown', residual: 'OAIR-R006' },
  { id: 'B0-PROV-1', claim: 'source assertions are distinguishable from independently verified evidence', disposition: 'unresolved', assurance: 'unknown', residual: 'OAIR-R011' },
  { id: 'B0-REF-1', claim: 'v2 to v1 lowering accounts for every atomic source obligation', disposition: 'unresolved', assurance: 'property-tested', evidence: 'organization-compile.test.ts covers catalog-level features only', residual: 'OAIR-R007' },
  { id: 'B0-RES-1', claim: 'every B0 audit gap has a unique later punch-list owner', disposition: 'preserved', assurance: 'statically-checked', evidence: 'organization-coverage.test.ts residual ownership checks' },
] as const;
