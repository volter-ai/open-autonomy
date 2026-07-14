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
  entry('ImportDecl', 'source namespace format required symbols', 'portable', 'partial', 'module dependency, local namespace binding, and named-symbol visibility', 'P1'),
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
  entry('LoadedOrganizationModule', 'moduleId location organization digest bytes', 'compiler', 'implemented', 'loader result separating canonical identity, retrieval provenance, content, integrity, and resource size', 'P1'),
  entry('OrganizationModuleLoader', 'load', 'compiler', 'implemented', 'effect boundary for module retrieval and relative resolution', 'P1'),
  entry('ModuleResolutionLimits', 'maxModules maxDepth', 'compiler', 'implemented', 'module graph node and depth resource bounds', 'P1'),
  entry('ModuleResolverPolicy', 'allowedSchemes requireDigestForSchemes maxTotalBytes', 'compiler', 'implemented', 'import scheme, integrity, and byte-bound policy', 'P1'),
  entry('ImportBinding', 'module localName source symbols', 'compiler', 'implemented', 'local alias binding to canonical module and named visibility', 'P1'),
  entry('ResolvedModuleNode', 'module imports', 'compiler', 'implemented', 'one loaded module and its resolved import environment', 'P1'),
  entry('ResolvedModuleGraph', 'root modules', 'compiler', 'implemented', 'closed bounded module graph', 'P1'),
  entry('ModuleResolutionResult', 'graph errors', 'compiler', 'implemented', 'all-or-nothing module graph resolution result', 'P1'),
  entry('ResolvedReferenceUse', 'module path authored target source declaration pointer', 'compiler', 'implemented', 'sort-checked reference edge with authored and declaration provenance', 'P1'),
  entry('ReferenceResolutionResult', 'references errors', 'compiler', 'implemented', 'all reference closure edges or deterministic failures', 'P1'),
  entry('SemanticDigest', 'algorithm canonicalization domain value', 'compiler', 'implemented', 'domain-separated versioned structural digest', 'P2'),
  entry('CanonicalizationPolicy', 'nonsemanticKeys', 'compiler', 'implemented', 'explicit caller-selected semantic exclusion policy', 'P2'),
  entry('NormalizedSourceMapEntry', 'output sources', 'compiler', 'implemented', 'many-to-many normalized-output provenance relation', 'P2'),
  entry('NormalizedOrganizationIR', 'schema root modules sourceMap digest', 'compiler', 'implemented', 'closed canonical compiler form plus nonsemantic source map and digest', 'P2'),
  entry('NormalizationResult', 'normalized errors', 'compiler', 'implemented', 'all-or-nothing normalization result', 'P2'),
  entry('SourceSpan', 'location path start end', 'compiler', 'implemented', 'authored or generated source location and optional text coordinates', 'P3'),
  entry('RelatedDiagnostic', 'message source', 'compiler', 'implemented', 'secondary source-linked diagnostic context', 'P3'),
  entry('FixSuggestion', 'message replacement', 'compiler', 'implemented', 'non-authoritative proposed repair', 'P3'),
  entry('CompilerDiagnostic', 'code severity message phase source related suggestion', 'compiler', 'implemented', 'stable machine-readable compiler finding', 'P3'),
  entry('PassSourceRelation', 'output sources', 'compiler', 'partial', 'many-to-many pass output/source provenance relation', 'P3'),
  entry('PassObligation', 'id claim status evidence', 'compiler', 'partial', 'pass-created or discharged semantic obligation', 'P3'),
  entry('CompilerPassResult', 'output diagnostics sourceMap obligations', 'compiler', 'implemented', 'typed pass output and accounting channels', 'P3'),
  entry('CompilerPassContext', 'completedPasses', 'compiler', 'implemented', 'immutable set of satisfied pass dependencies', 'P3'),
  entry('CompilerPass', 'id input output requires provider run', 'compiler', 'implemented', 'typed partial transformation registered by core or provider', 'P3'),
  entry('PassRunRecord', 'pass input output sourceMap obligations', 'compiler', 'implemented', 'inspectable execution receipt for one pass', 'P3'),
  entry('CompilerPipelineResult', 'output level diagnostics passes', 'compiler', 'implemented', 'pipeline output or failure with deterministic evidence', 'P3'),
  entry('CompilerExecutionPolicy', 'maxDiagnostics redact', 'compiler', 'implemented', 'diagnostic resource and disclosure boundary', 'P3'),
] as const;

export interface AuditResidual {
  id: string;
  finding: string;
  owner: PunchlistOwner;
}

/** B0 residual parking is closed: every known gap has a punch-list owner. */
export const ORGANIZATION_AUDIT_RESIDUALS: readonly AuditResidual[] = [
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

export const ORGANIZATION_P1_OBLIGATIONS: readonly BaselineObligation[] = [
  { id: 'P1-SEM-1', claim: 'module linking preserves declaration meaning and named-symbol visibility', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-modules.test.ts named visibility and disjoint composition' },
  { id: 'P1-TYP-1', claim: 'successful graphs close every declared reference at its required sort', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-modules.test.ts local/namespaced closure and wrong-sort cases' },
  { id: 'P1-ALG-1', claim: 'disjoint import composition has identity, associativity, and order independence', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-modules.test.ts generated disjoint import signatures' },
  { id: 'P1-ALG-2', claim: 'namespace alias renaming preserves qualified nominal identity', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-modules.test.ts alias-independent identities' },
  { id: 'P1-GRA-1', claim: 'module resolution terminates within declared depth, node, and byte bounds and reports cycles', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-modules.test.ts cycle and bound fixtures' },
  { id: 'P1-SEC-1', claim: 'resolver scheme, integrity, and resource policy fails closed before unsafe load', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-modules.test.ts URI policy, digest substitution, and bounds' },
  { id: 'P1-PROV-1', claim: 'resolved references retain authored-use and declaration-site provenance', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-modules.test.ts cross-module source/declaration locations' },
  { id: 'P1-EVO-1', claim: 'logical identity is distinct from retrieval location and structural digest', disposition: 'preserved', assurance: 'statically-checked', evidence: 'ModuleId, LoadedOrganizationModule.location, and digest are separate fields' },
  { id: 'P1-ADV-1', claim: 'namespace squatting, non-ASCII confusables, identity substitution, and graph exhaustion fail closed', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-modules.test.ts namespace ambiguity, ASCII identifiers, digest/location collisions, and bounds' },
] as const;

export const ORGANIZATION_P2_OBLIGATIONS: readonly BaselineObligation[] = [
  { id: 'P2-SEM-1', claim: 'elaboration preserves declared meaning under the documented default and reference rules', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-normalize.test.ts closed form/default and semantic mutation corpus; preservation remains tested, not proved' },
  { id: 'P2-ALG-1', claim: 'normalization is idempotent', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-normalize.test.ts re-normalization equality' },
  { id: 'P2-ALG-2', claim: 'irrelevant object order does not change canonical output or digest while array order remains semantic', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-canonical.test.ts generated key permutations and ordered arrays' },
  { id: 'P2-ALG-3', claim: 'namespace alpha-renaming yields equal normalized modules and semantic digest', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-normalize.test.ts alias-renaming fixture' },
  { id: 'P2-COMP-1', claim: 'invalid closed-reference input cannot return a partial successful normal form', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-normalize.test.ts unresolved reference fixture' },
  { id: 'P2-PROV-1', claim: 'source maps are separate from semantic digest and retain many-to-many reference origins', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-normalize.test.ts imported-reference source relation and annotation hash invariance' },
  { id: 'P2-ADV-1', claim: 'canonicalization rejects ambiguous runtime values and retains semantic labels/extensions/opaque content', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-canonical.test.ts cycles/nonfinite/undefined and organization-normalize.test.ts opaque content' },
  { id: 'P2-DET-1', claim: 'digest records canonicalization algorithm, semantic domain, and normalized pinned module content', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-canonical.test.ts domain/version framing plus P1 pinned import policy' },
] as const;

export const ORGANIZATION_P3_OBLIGATIONS: readonly BaselineObligation[] = [
  { id: 'P3-TYP-1', claim: 'passes declare input/output levels and dependencies', disposition: 'preserved', assurance: 'statically-checked', evidence: 'CompilerPass type plus runtime plugin level/dependency checks' },
  { id: 'P3-COMP-1', claim: 'passes receive immutable clones and are deterministic over declared inputs', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-compiler.test.ts mutation rejection and caller-input preservation' },
  { id: 'P3-COMP-2', claim: 'fatal pass failure prevents dependent emission while independent analyses continue', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-compiler.test.ts fatal pipeline and sibling analysis fixtures' },
  { id: 'P3-PROV-1', claim: 'many-to-many source relations compose and real profile/module diagnostics project to authored paths', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-compiler.test.ts composition plus organization-compiler-passes.test.ts real passes' },
  { id: 'P3-OPS-1', claim: 'diagnostics have stable codes, deterministic order, JSON shape, and resource bounds', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-compiler.test.ts sorting and diagnostic-limit fixtures' },
  { id: 'P3-ADV-1', claim: 'diagnostic rendering escapes controls and policy redacts named secrets', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-compiler.test.ts ANSI/control and redaction fixture' },
  { id: 'P3-EXT-1', claim: 'provider passes register without product branches and collisions fail closed', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-compiler.test.ts provider registry fixture' },
] as const;
