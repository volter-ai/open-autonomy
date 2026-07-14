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
  entry('ExpressionDecl', 'language source resultType freeVariables effects analyzability', 'portable', 'implemented', 'dialect-tagged expression envelope with explicit portable-analysis boundary', 'P5'),
  entry('AnnotationSet', 'labels documentation provenance extensions', 'portable', 'partial', 'nonsemantic metadata, source assertions, and namespaced extension payload', 'P2'),
  entry('ImportDecl', 'source namespace format required symbols', 'portable', 'partial', 'module dependency, local namespace binding, and named-symbol visibility', 'P1'),
  entry('TypeDecl', 'schema', 'portable', 'partial', 'named structural data type', 'P5'),
  entry('BehaviorDecl', 'kind source inline inputs outputs instructions tools memories behaviors effects context', 'portable', 'implemented', 'typed reusable behavior and its declared dependencies', 'P5'),
  entry('BehaviorContextRequirement', 'required maximumTokens trust', 'portable', 'implemented', 'behavior-level contextual kind, resource, and trust requirements', 'P5'),
  entry('InstructionAssembly', 'precedence fragments conflict', 'portable', 'implemented', 'ordered instruction composition contract', 'P5'),
  entry('InstructionFragment', 'id role source text when priority layer', 'portable', 'implemented', 'provenanced conditional instruction contribution', 'P5'),
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
  entry('OrganizationValidationOptions', 'allowImportedReferences', 'compiler', 'implemented', 'explicit deferral of declared-namespace references to module closure', 'P1'),
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
  entry('MaterializationOptions', 'order', 'compiler', 'implemented', 'explicit legacy timestamp or prevalidated causal reducer ordering mode', 'P10'),
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
  entry('MigrationDisposition', 'source target disposition explanation', 'compiler', 'implemented', 'per-field preservation, transformation, default, or removal accounting', 'P4'),
  entry('MigrationStepResult', 'document dispositions sourceMap', 'compiler', 'implemented', 'one immutable migration output with loss and provenance accounting', 'P4'),
  entry('MigrationEdge', 'id kind from to lossy migrate validate', 'compiler', 'implemented', 'version-addressed artifact-family transformation contract', 'P4'),
  entry('MigrationPlan', 'kind from to steps lossy', 'compiler', 'implemented', 'deterministic migration path and aggregate loss marker', 'P4'),
  entry('MigrationOptions', 'allowLossy', 'compiler', 'implemented', 'explicit authorization for semantic loss', 'P4'),
  entry('MigrationResult', 'document plan dispositions sourceMap errors', 'compiler', 'implemented', 'atomic migration result or structured failure', 'P4'),
  entry('ReplayVersionPin', 'organizationDigest eventSchema reducerVersion compilerVersion', 'compiler', 'implemented', 'complete interpretation version set for historical trace replay', 'P4'),
  entry('ExpressionAnalysis', 'status language resultType freeVariables errors', 'compiler', 'implemented', 'portable analysis result or explicit opaque/invalid disposition', 'P5'),
  entry('ExpressionEvaluation', 'value analysis errors', 'compiler', 'implemented', 'side-effect-free portable expression evaluation result', 'P5'),
  entry('BehaviorContract', 'behavior inputs outputs effects tools memories context', 'compiler', 'implemented', 'composed typed behavior input, output, dependency, context, and effect contract', 'P5'),
  entry('EffectCoverage', 'effect status grants', 'compiler', 'implemented', 'authority coverage disposition for one required effect', 'P5'),
  entry('BehaviorAssignmentAnalysis', 'contract effects errors', 'compiler', 'implemented', 'actor-to-behavior authority and contract analysis', 'P5'),
  entry('AssembledInstruction', 'id layer role text source priority', 'compiler', 'implemented', 'stable instruction fragment in an explicit precedence linearization', 'P5'),
  entry('InstructionProgram', 'fragments digest errors', 'compiler', 'implemented', 'deterministic inspectable instruction assembly result', 'P5'),
  entry('InstructionAssemblyOptions', 'additional environment opaqueCondition', 'compiler', 'implemented', 'runtime instruction inputs and explicit opaque-condition policy', 'P5'),
  entry('ContextItem', 'id kind content tokens priority required trust evidence labels provenance', 'compiler', 'implemented', 'evidence- and trust-labeled contextual contribution', 'P5'),
  entry('ContextPlan', 'included excluded totalTokens errors', 'compiler', 'implemented', 'deterministic bounded context selection result', 'P5'),
  entry('InvocationPlan', 'actor behavior implementation instructions context tools authority effects', 'compiler', 'implemented', 'noncanonical inspectable execution plan separating identity, behavior, implementation, context, and authority', 'P5'),
  entry('ManifestEvidence', 'assurance source observedAt notes', 'compiler', 'implemented', 'epistemic disposition and provenance for one component claim', 'P6'),
  entry('VersionedSchema', 'id version schema', 'compiler', 'implemented', 'named versioned command, observation, configuration, or adapter endpoint schema', 'P6'),
  entry('InterfaceContract', 'id version transport commands observations authentication', 'compiler', 'implemented', 'versioned component interaction boundary', 'P6'),
  entry('StateFacetContract', 'state authority consistency delivery ordering idempotency recovery identity evidence', 'compiler', 'implemented', 'distributed state authority and delivery contract without convenient defaults', 'P6'),
  entry('FailureContract', 'detection healthCriterion recovery upgrade rollback evidence', 'compiler', 'implemented', 'health, failure, recovery, upgrade, and rollback claim', 'P6'),
  entry('TrustContract', 'principal zone enforcedBy credentials isolation evidence', 'compiler', 'implemented', 'enforcing principal, trust zone, credential flow, and isolation claim', 'P6'),
  entry('QuantityContract', 'value unit per attribution uncertainty effectiveAt evidence', 'compiler', 'implemented', 'unit-bearing capacity or cost claim with uncertainty and time basis', 'P6'),
  entry('TopologyContract', 'mode minimumInstances maximumInstances isolation placement evidence', 'compiler', 'implemented', 'component deployment topology, cardinality, placement, and isolation', 'P6'),
  entry('ManifestSignature', 'algorithm keyId value covers', 'compiler', 'implemented', 'origin signature metadata over a component content digest', 'P6'),
  entry('FacetProvision', 'facet operations interface properties evidence', 'compiler', 'implemented', 'partial multi-facet provision bound to an interface and evidence', 'P6'),
  entry('ComponentManifestV2', 'schema id version digest signatures configuration facets interfaces state trust failure topology capacity cost requires conflictsWith extensions', 'compiler', 'implemented', 'external typed multi-facet component contract', 'P6'),
  entry('AdapterContract', 'schema id version direction from to interfaceMappings identity causality retry conflicts preconditions postconditions losses reversible reverseAdapter enforcement evidence', 'compiler', 'implemented', 'directional typed semantic translation or enforcement contract', 'P6'),
  entry('ComponentValidationResult', 'errors warnings', 'compiler', 'implemented', 'component, adapter, or composition validation findings', 'P6'),
  entry('ComponentComposition', 'instances authorities coherence adapters', 'compiler', 'implemented', 'configured provider graph with explicit state owners and coherence protocols', 'P6'),
  entry('AtomicObligation', 'id path claim facet operation risk required state', 'compiler', 'implemented', 'one source-derived mandatory semantic realization claim', 'P7'),
  entry('AssumptionAcceptance', 'assumption acceptedBy scope expires untilVersion', 'compiler', 'implemented', 'identified scoped and bounded acceptance of a deployment assumption', 'P7'),
  entry('AssurancePolicy', 'minimum allowApproximation acceptedAssumptions asOf', 'compiler', 'implemented', 'risk-indexed minimum evidence and approximation policy', 'P7'),
  entry('ObligationWitness', 'obligation disposition provider facet evidence adapter assumptions losses errors', 'compiler', 'implemented', 'provider or adapter discharge with evidence, assumptions, loss, and errors', 'P7'),
  entry('CompatibilityLedger', 'obligations witnesses unresolved', 'compiler', 'implemented', 'complete atomic requirement-to-witness accounting', 'P7'),
  entry('DeploymentCandidateV2', 'composition ledger objective', 'compiler', 'implemented', 'independently checkable feasible composition and explicit objective vector', 'P7'),
  entry('SearchDomain', 'completeness maxCandidates preferredManifests', 'compiler', 'implemented', 'declared finite exhaustive or bounded heuristic solver domain and deterministic preferences', 'P7'),
  entry('DeploymentSearchResult', 'status candidates explored complete unsatisfiedCore coreMinimality errors', 'compiler', 'implemented', 'constructive candidates, exhaustion boundary, or classified incompatibility explanation', 'P7'),
  entry('SemanticContractIR', 'assumptions guarantees observations', 'compiler', 'implemented', 'assumption/guarantee and observable-event semantics for an internal lowering level', 'P8'),
  entry('ControlActorPlan', 'actor behaviors activation authority sourceObligations', 'compiler', 'implemented', 'target-independent actor control requirements and provenance', 'P8'),
  entry('ControlWorkPlan', 'workType states transitions authority sourceObligations', 'compiler', 'implemented', 'target-independent work transition control and authority', 'P8'),
  entry('ControlPlanIR', 'schema organization contract actors work enforcements', 'compiler', 'implemented', 'deployment-aware target-independent control form', 'P8'),
  entry('ExecutionStep', 'id actor behavior provider runtime endpoint isolation credentialRefs instructionRenderer sourceObligations', 'compiler', 'implemented', 'provider-bound runtime invocation template below organization semantics', 'P8'),
  entry('ExecutionPlanIR', 'schema organization contract steps stateAuthorities providerConfiguration', 'compiler', 'implemented', 'provider-configured execution form with runtime security boundaries', 'P8'),
  entry('LoweringDisposition', 'obligation disposition targets witness explanation', 'compiler', 'implemented', 'per-obligation preservation, weakening, rejection, or unresolved accounting', 'P8'),
  entry('ObservationProjection', 'source target relation', 'compiler', 'implemented', 'declared observation relation between adjacent semantic levels', 'P8'),
  entry('PreservationCertificate', 'pass from to assumptions guarantees requiredProgress observationProjections dispositions losses', 'compiler', 'implemented', 'checkable conditional preservation report for one lowering pass', 'P8'),
  entry('LoweringSourceRelation', 'output sources', 'compiler', 'implemented', 'many-to-many generated target to source obligation provenance', 'P8'),
  entry('LoweringResult', 'output sourceMap certificate newObligations losses errors', 'compiler', 'implemented', 'atomic lowering output, proof evidence, feedback obligations, losses, and failures', 'P8'),
  entry('ExecutionLoweringOptions', 'runtimes', 'compiler', 'implemented', 'runtime, endpoint, isolation, credential, renderer, and provider selection below Organization IR', 'P8'),
  entry('FixedPointLoweringResult', 'candidate control execution certificates obligations errors', 'compiler', 'implemented', 'closed deployment/lowering fixed point or backtracking failure evidence', 'P8'),
  entry('V1ExecutionLoweringOptions', 'targets codeHost policy resources', 'compiler', 'implemented', 'bounded native v1 emission environment', 'P8'),
  entry('V1ExecutionLoweringResult', 'output sourceMap certificate losses errors', 'compiler', 'implemented', 'mechanical bounded v1 target plus preservation evidence', 'P8'),
  entry('ControllerPrincipal', 'externalId actor scopes', 'observation', 'implemented', 'verified external principal mapping to durable actor and allowed operations', 'P9'),
  entry('ControllerWork', 'id title accountable assignees reviewer status priority createdSequence dispatchCount progress attempts activeClaim blockedQuestion retryBudget costBudget costConsumed repository', 'observation', 'implemented', 'durable managed work with distinct responsibility, control, progress, and resource state', 'P9'),
  entry('ControllerClaim', 'id work actor worker fence acquiredAt expiresAt status', 'observation', 'implemented', 'exclusive leased and fenced execution ownership', 'P9'),
  entry('ControllerAttempt', 'id work actor worker claim fence status startedAt endedAt session runtime isolation credentialScopes cost evidence', 'observation', 'implemented', 'bounded execution attempt with distinct runtime identities, security, economics, and evidence', 'P9'),
  entry('ControllerConversation', 'id transport channel thread relatedWork messages', 'observation', 'implemented', 'transport/thread correlation without equating conversation and work', 'P9'),
  entry('ControllerEffect', 'id kind idempotencyKey work payload status acknowledgedExternalId', 'observation', 'implemented', 'durable idempotent external-effect outbox record', 'P9'),
  entry('ControllerApproval', 'id work artifactDigest principal scope expiresAt used', 'observation', 'implemented', 'single-use scoped expiring artifact-bound approval', 'P9'),
  entry('ControllerMetrics', 'ticks queueDepth running progress cost latencySamples oscillations', 'observation', 'implemented', 'loop, queue, progress, economic, latency, and oscillation observability', 'P9'),
  entry('HermesControllerState', 'schema organization revision paused sequence principals work claims attempts conversations effects approvals seenEvents metrics', 'observation', 'implemented', 'restartable complete controller snapshot independent of hidden model context', 'P9'),
  entry('HermesControllerPolicy', 'workerCapacity reviewerCapacity claimTtl maxTicksWithoutProgress maxOscillations allowedRepositories requiredCompletionEvidence', 'compiler', 'implemented', 'admission, fencing, loop, repository, and verification enforcement bounds', 'P9'),
  entry('SlackEnvelope', 'eventId principal channel thread text at signatureVerified', 'observation', 'implemented', 'authenticated deduplicable Slack transport input', 'P9'),
  entry('ControllerTransition', 'state effects errors', 'compiler', 'implemented', 'pure controller state transition with explicit effects and failures', 'P9'),
  entry('HermesWorkerEvent', 'eventId kind work actor worker runId fence at session runtime isolation credentialScopes question cost artifactDigest evidence verdict', 'observation', 'implemented', 'fenced Hermes/worker lifecycle observation with identity, security, cost, and evidence', 'P9'),
  entry('HermesCommandPlan', 'executable argv idempotencyKey verify', 'compiler', 'implemented', 'shell-free Hermes CLI adapter command with mandatory post-state verification', 'P9'),
  entry('PortableEventV2', 'schema reducer id type at issuer actor subject parents correlation epistemic provenance evidence payload corrects retracts integrity', 'observation', 'implemented', 'versioned authenticated causal portable event with explicit epistemic and repair semantics', 'P10'),
  entry('EventAccessContract', 'type reads writes resolution authorityOrder', 'compiler', 'implemented', 'event read/write footprint and concurrent conflict arbitration contract', 'P10'),
  entry('EventIssuerPolicy', 'issuer eventTypes subjects requireAuthenticated', 'compiler', 'implemented', 'issuer authorization, subject binding, and authentication requirement', 'P10'),
  entry('CausalAcceptancePolicy', 'eventSchema reducer issuers contracts maximumEvents', 'compiler', 'implemented', 'version-pinned bounded event acceptance and concurrency policy', 'P10'),
  entry('AcceptedCausalHistory', 'schema eventSchema reducer events order active corrections retractions gaps', 'observation', 'implemented', 'immutable accepted DAG, canonical linearization, active repair projection, and gaps', 'P10'),
  entry('CausalAcceptanceResult', 'history pending duplicates errors', 'compiler', 'implemented', 'accepted history, partition-pending events, exact duplicates, or rejection evidence', 'P10'),
  entry('NativeObservation', 'provider schema version id at data provenance authenticated', 'observation', 'implemented', 'versioned provider-native observation before semantic lifting', 'P10'),
  entry('NativeLiftAdapter', 'id provider nativeSchema nativeVersion portableTypes lift', 'compiler', 'implemented', 'component-owned exact-schema lifting boundary', 'P10'),
  entry('LiftResult', 'event gap errors', 'compiler', 'implemented', 'portable event, explicit observability gap, or invalid adapter result', 'P10'),
  entry('CausalMaterializationResult', 'state history errors', 'compiler', 'implemented', 'portable state rebuilt from accepted causal history', 'P10'),
  entry('TraceConformanceReport', 'status lifecycle authority evidence budget protocol safety observabilityGaps livenessAssumptions', 'compiler', 'implemented', 'multi-property trace conformance with explicit unknown observability and liveness assumptions', 'P10'),
  entry('TemporalMonitor', 'id kind triggerType responseType bound clock fairnessAssumptions', 'compiler', 'implemented', 'bounded clock-explicit safety or response property with fairness assumptions', 'P10'),
  entry('TemporalFinding', 'monitor status counterexample assumptions', 'compiler', 'implemented', 'satisfied, violated, or finite-prefix-unknown temporal result with witness trace', 'P10'),
] as const;

export interface AuditResidual {
  id: string;
  finding: string;
  owner: PunchlistOwner;
}

/** B0 residual parking is closed: every known gap has a punch-list owner. */
export const ORGANIZATION_AUDIT_RESIDUALS: readonly AuditResidual[] = [
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
  { id: 'B0-ALG-1', claim: 'profile patch ordering and conflicts have a complete algebra', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-profile.test.ts deterministic ordered last-writer and organization-behavior.test.ts instruction identity/conflict laws' },
  { id: 'B0-ALG-2', claim: 'successful sequential state materialization composes over trace prefixes', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-state.test.ts prefix composition fixture' },
  { id: 'B0-DIST-1', claim: 'state/claim declarations do not imply unimplemented distributed guarantees', disposition: 'preserved', assurance: 'property-tested', evidence: 'P6 explicit unknown state contracts and P10 causal conflict/reconciliation fixtures' },
  { id: 'B0-SEC-1', claim: 'every declared capability and policy names a technical enforcement boundary', disposition: 'preserved', assurance: 'statically-checked', evidence: 'TrustContract and enforcement AdapterContract require enforcing principals and trust zones; deployment discharge remains P7' },
  { id: 'B0-PROV-1', claim: 'source assertions are distinguishable from independently verified evidence', disposition: 'preserved', assurance: 'property-tested', evidence: 'PortableEventV2 epistemic/evidence statuses and P10 reported-success counterexample' },
  { id: 'B0-REF-1', claim: 'v2 to v1 lowering accounts for every atomic source obligation', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-lowering.test.ts staged control/execution and bounded mechanical v1 coverage checks' },
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

export const ORGANIZATION_P4_OBLIGATIONS: readonly BaselineObligation[] = [
  { id: 'P4-SEM-1', claim: 'every migration step accounts for transformed and removed fields', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-migrate.test.ts dispositions and unaccounted-removal rejection' },
  { id: 'P4-REF-1', claim: 'lossless claims are round-trip tested and lossy paths require explicit authorization', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-migrate.test.ts rename round trip and loss authorization' },
  { id: 'P4-PROV-1', claim: 'migration outputs carry source relations and transformation explanations', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-migrate.test.ts v1-to-v2 source map and dispositions' },
  { id: 'P4-EVO-1', claim: 'artifact families have independent deterministic version graphs and unsupported edges reject', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-migrate.test.ts organization/state independent no-path fixtures' },
  { id: 'P4-EVO-2', claim: 'historical replay pins organization, event, reducer, and compiler interpretation versions', disposition: 'preserved', assurance: 'statically-checked', evidence: 'ReplayVersionPin and organization-migrate.test.ts complete key fixture' },
  { id: 'P4-OPS-1', claim: 'pure document migration is immutable and atomic with no partial document on step failure', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-migrate.test.ts input immutability and failure behavior; live-state migration is out of this pure registry scope' },
] as const;

export const ORGANIZATION_P5_OBLIGATIONS: readonly BaselineObligation[] = [
  { id: 'P5-SEM-1', claim: 'behavior denotes typed inputs, outputs, effects, dependencies, and contextual requirements', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-behavior.test.ts composed behavior contract fixtures' },
  { id: 'P5-TYP-1', claim: 'behavior substitution preserves input acceptance, promised outputs, and effect containment', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-behavior.test.ts substitution counterexamples' },
  { id: 'P5-SEM-2', claim: 'portable analysis is applied only to the defined bounded expression dialect', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-expression.test.ts portable, opaque, invalid, and generated evaluation fixtures' },
  { id: 'P5-CTX-1', claim: 'instruction and context assembly are deterministic under explicit precedence, policy, and token estimates', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-behavior.test.ts permutation, precedence, filter, and token-bound fixtures' },
  { id: 'P5-EPI-1', claim: 'reported, observed, inferred, assumed, attested, and verified context remain distinguishable', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-behavior.test.ts evidence/trust/provenance preservation fixture' },
  { id: 'P5-SEC-1', claim: 'instruction assembly does not confer authority for privileged effects', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-behavior.test.ts unauthorized invocation rejection despite available instructions/context' },
  { id: 'P5-ORG-1', claim: 'actor identity, behavior, and runtime implementation remain separate', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-behavior.test.ts invocation plan identity/behavior/implementation fixture' },
  { id: 'P5-ALG-1', claim: 'instruction assembly defines stable identity, order, conflict, permutation, and idempotence behavior', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-behavior.test.ts instruction algebra fixtures' },
  { id: 'P5-ADV-1', claim: 'untrusted context retains its trust class and cannot become instruction or capability authority through formatting', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-behavior.test.ts injected Slack-like context and authority-isolation fixture' },
] as const;

export const ORGANIZATION_P6_OBLIGATIONS: readonly BaselineObligation[] = [
  { id: 'P6-DIST-1', claim: 'each state facet explicitly declares authority, consistency, delivery, ordering, idempotency, recovery, and identity semantics', disposition: 'preserved', assurance: 'statically-checked', evidence: 'StateFacetContract plus semantic coverage AST guard and unknown-preservation catalog test' },
  { id: 'P6-DIST-2', claim: 'cross-provider bridges declare identity, causality, retry, and conflict translation', disposition: 'preserved', assurance: 'property-tested', evidence: 'AdapterContract and organization-component.test.ts Slack bridge and coherence counterexamples' },
  { id: 'P6-SEC-1', claim: 'guarantee claims name enforcing principals, trust zones, credential flow, isolation, and evidence class', disposition: 'preserved', assurance: 'property-tested', evidence: 'TrustContract validation and missing-boundary fixtures' },
  { id: 'P6-OPS-1', claim: 'version, configuration, health, upgrade, rollback, failure, recovery, topology, and cardinality are representable', disposition: 'preserved', assurance: 'property-tested', evidence: 'ComponentManifestV2 validators and health/cardinality counterexamples' },
  { id: 'P6-ECO-1', claim: 'capacity and cost have units, attribution, time basis, uncertainty, and observation time where volatile', disposition: 'preserved', assurance: 'property-tested', evidence: 'QuantityContract and volatile quantity counterexample' },
  { id: 'P6-INT-1', claim: 'commands, observations, configuration, and adapter endpoints use versioned schemas and explicit interface mappings', disposition: 'preserved', assurance: 'property-tested', evidence: 'VersionedSchema, InterfaceContract, AdapterContract, and initial catalog validation' },
  { id: 'P6-ADV-1', claim: 'component content is digest-sealed and asserted or signed origin is not treated as claim truth', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-component.test.ts manifest substitution and attestation-warning fixtures' },
  { id: 'P6-ADP-1', claim: 'adapter direction, preconditions, postconditions, loss, translation, and reversibility are explicit', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-component.test.ts false inverse, implicit loss, and endpoint inversion fixtures' },
] as const;

export const ORGANIZATION_P7_OBLIGATIONS: readonly BaselineObligation[] = [
  { id: 'P7-CSP-1', claim: 'every emitted candidate independently revalidates all supported mandatory constraints', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-solver.test.ts revalidates every exhaustive-search candidate' },
  { id: 'P7-CSP-2', claim: 'completeness is limited to declared finite exhaustive domains and bounded exhaustion never means incompatible', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-solver.test.ts zero-bound exhaustion and finite-domain fixtures' },
  { id: 'P7-CSP-3', claim: 'incompatibility is returned only with a classified valid atomic witness core; unexplained global failure is undetermined', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-solver.test.ts assurance contradiction core and SearchResult coreMinimality' },
  { id: 'P7-REF-1', claim: 'each semantic leaf induces an atomic obligation discharged by a provider/interface witness under explicit assumptions', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-solver.test.ts leaf derivation, witness ledger, and independent validation' },
  { id: 'P7-DIST-1', claim: 'authority, consistency, identity, ordering, recovery, and overlapping ownership constrain the global candidate', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-solver witness state checks and split-brain manual-candidate fixture' },
  { id: 'P7-SEC-1', claim: 'high-risk witnesses require an evidenced enforcing principal and trust zone before economic optimization', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-solver witness trust checks and component trust validation' },
  { id: 'P7-ECO-1', claim: 'feasible candidates use an explicit lexicographic preference, uncertainty, cost, latency, capacity, and provider-count vector', disposition: 'preserved', assurance: 'statically-checked', evidence: 'DeploymentCandidateV2 objective and compareObjective ordering after unresolved filtering' },
  { id: 'P7-EPI-1', claim: 'witnesses retain claim evidence and asserted claims require identified scoped nonexpired acceptance', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-solver.test.ts accepted/unaccepted assertion fixtures' },
  { id: 'P7-DET-1', claim: 'equal pinned inputs and objective policy yield stable candidate ordering', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-solver.test.ts reversed-registry deterministic objective sequence' },
] as const;

export const ORGANIZATION_P8_OBLIGATIONS: readonly BaselineObligation[] = [
  { id: 'P8-SEM-1', claim: 'control and execution levels declare assumptions, guarantees, required progress, and observable schemas', disposition: 'preserved', assurance: 'statically-checked', evidence: 'SemanticContractIR, ControlPlanIR, ExecutionPlanIR, and semantic coverage AST guard' },
  { id: 'P8-REF-1', claim: 'lowering preserves source safety and required progress under explicit assumptions or reports weakening', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-lowering.test.ts complete dispositions and new progress-obligation validation' },
  { id: 'P8-REF-2', claim: 'preservation certificates compose only across aligned levels, discharged assumptions, and observation maps', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-lowering.test.ts level, assumption, and observation mismatch counterexamples' },
  { id: 'P8-COMP-1', claim: 'every atomic source obligation has a target mapping or compilation fails', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-lowering.test.ts ledger omission, disposition equality, and bounded v1 rejection fixtures' },
  { id: 'P8-COMP-2', claim: 'lowering-created obligations trigger candidate backtracking and executable emission requires fixed-point closure', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-lowering.test.ts insecure-first candidate backtracking and no-emission fixture' },
  { id: 'P8-SEC-1', claim: 'credentials, endpoints, isolation, provider configuration, and prompt rendering appear only below Organization IR', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-lowering.test.ts source immutability and execution-step boundary fixture' },
  { id: 'P8-PROV-1', claim: 'control, execution, and v1 targets retain many-to-many source obligation and provider provenance', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-lowering.test.ts source maps, step obligations, witnesses, and v1 certificate fixture' },
] as const;

export const ORGANIZATION_P9_OBLIGATIONS: readonly BaselineObligation[] = [
  { id: 'P9-DIST-1', claim: 'restart, duplicate delivery, delay, worker loss, and reassignment preserve acknowledged effects and fenced exclusive ownership', disposition: 'preserved', assurance: 'live-observed', evidence: 'organization-hermes-controller.test.ts fault schedule plus docs/evidence/P9-HERMES-LIVE-TRACE.md runs 1-4' },
  { id: 'P9-CTRL-1', claim: 'the controller loop has progress metrics, tick/retry/cost/oscillation bounds, and terminal escalation', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-hermes-controller.test.ts stalled loop and positive-cost exhaustion fixtures' },
  { id: 'P9-QUE-1', claim: 'worker and reviewer admission reserve independent capacity and use deterministic least-dispatched FIFO ordering', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-hermes-controller.test.ts overload, reservation, fairness, and reviewer-capacity fixtures' },
  { id: 'P9-HCI-1', claim: 'signed Slack messages classify and correlate questions, answers, mutations, commands, new work, or recoverable ambiguity', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-hermes-controller.test.ts complete intent grammar, wrong-question, and replay fixtures' },
  { id: 'P9-SEC-1', claim: 'Slack identity, repository scope, credentials, completion evidence, review, and artifact approval are enforced at typed boundaries', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-hermes-controller.test.ts signature, scope, forged evidence, self-review, and approval fixtures' },
  { id: 'P9-OPS-1', claim: 'pause, inspect, repair, effect failure, restart, and recovery use durable state rather than hidden conversation memory', disposition: 'preserved', assurance: 'live-observed', evidence: 'snapshot/restart tests and independent Hermes CLI process observations in P9-HERMES-LIVE-TRACE.md' },
  { id: 'P9-ECO-1', claim: 'cost, latency, queue depth, attempts, and progress attribute to durable work and enforce limits', disposition: 'preserved', assurance: 'property-tested', evidence: 'ControllerMetrics/Attempt fields and organization-hermes-controller.test.ts cost/queue/progress fixtures' },
  { id: 'P9-ADV-1', claim: 'forged completion, prompt-like Slack text, replay, stale fencing, stale approval, and shell payloads fail safely', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-hermes-controller.test.ts attack corpus and shell-free Hermes argv plan' },
  { id: 'P9-ORG-1', claim: 'manager state, accountable actor, assignee, claimant actor, worker, session, runtime, and reviewer remain distinct', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-hermes-controller.test.ts identity separation and independent-review fixtures' },
] as const;

export const ORGANIZATION_P10_OBLIGATIONS: readonly BaselineObligation[] = [
  { id: 'P10-ALG-1', claim: 'successful causal materialization composes over every accepted trace prefix', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-causal-state.test.ts prefix-then-append versus whole-history replay' },
  { id: 'P10-ALG-2', claim: 'causally independent events commute by access contract or invoke explicit deterministic arbitration/rejection', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-causal-state.test.ts reordered commuting work and conflicting artifact fixtures' },
  { id: 'P10-TEMP-1', claim: 'temporal properties declare finite bounds, clocks, fairness assumptions, and finite-prefix unknown', disposition: 'preserved', assurance: 'property-tested', evidence: 'TemporalMonitor and organization-causal-state.test.ts open/closed observation fixtures' },
  { id: 'P10-DIST-1', claim: 'duplicate, reorder, late arrival, correction, retraction, and partition reconciliation have versioned semantics', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-causal-state.test.ts duplicate/reorder/pending/correction/retraction corpus' },
  { id: 'P10-EPI-1', claim: 'assertion, report, observation, inference, attestation, and verification remain distinct', disposition: 'preserved', assurance: 'property-tested', evidence: 'PortableEventV2 epistemic/evidence graph and reported completion rejection fixture' },
  { id: 'P10-DB-1', claim: 'portable state rebuilds from accepted history under pinned event/reducer versions', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-causal-state.test.ts serialized history differential replay and snapshot equality' },
  { id: 'P10-SEC-1', claim: 'event identity, issuer authorization, integrity, subject binding, provenance, authentication, and replay are independently checked', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-causal-state.test.ts corrupt, unauthorized, wrong-subject, unsigned, and duplicate fixtures' },
  { id: 'P10-REF-1', claim: 'exact native schema adapters lift to conforming portable traces or explicit gaps without guessed meaning', disposition: 'preserved', assurance: 'property-tested', evidence: 'organization-causal-state.test.ts exact Hermes adapter, unknown-version/kind gaps, and conformance report' },
] as const;
