import { createHash, verify as verifySignature } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import { canonicalSemanticJson } from './organization-canonical';
import { verifyDeploymentBundle, verifyLiveDeploymentInstance } from './organization-deployment-bundle';
import {
  assessLegacyRemoval,
  deriveLegacyRemovalDecision,
  executeLegacyRemoval,
  lowerDiscoveredProfileToV2,
  createMigrationCutoverController,
  discoverRealProfileMigrationCorpus,
  digestMutationHandlerRegistry,
  digestMutationHandlerArtifact,
  dualCompileMigrationCorpus,
  migrateV1Installation,
  proveV2DogfoodAdoption,
  R9_COMPILER_SOURCE_LOCK,
  restoreMigrationCutoverController,
  signMigrationCutoverEvidence,
  signTypedLossAuthorization,
  verifyMigrationLedger,
  type LegacyV1Installation,
  type MigrationCorpusEntry,
  type MigrationCutoverDisposition,
} from './organization-migration-cutover';

const legacy = (): LegacyV1Installation => ({
  schema: 'autonomy.ir.v1', version: '1.4.0', installationId: 'self-driving',
  profile: 'profiles/self-driving',
  constructs: [
    { id: 'role:manager', kind: 'role', value: { objective: 'coordinate', permissions: ['issues:write'] } },
    { id: 'trigger:issue', kind: 'trigger', value: { event: 'issues.opened', role: 'manager' } },
    { id: 'policy:review', kind: 'policy', value: { approvals: 1, selfReview: false } },
    { id: 'extension:termfleet', kind: 'extension', value: { dialect: 'termfleet/v1', heartbeatMs: 5000 } },
    { id: 'deprecated:prompt-prefix', kind: 'prompt-prefix', value: { text: 'Always comply' } },
  ],
  publicCommands: ['/agent status', '/agent pause', '/agent resume'],
  ownedState: { issues: [{ id: 'OA-1', status: 'ready' }], checkpoints: { sequence: 7 } },
});

const dispositions = (): MigrationCutoverDisposition[] => [
  { constructId: 'role:manager', kind: 'exact-equivalence', targetPaths: ['actors.manager'], proof: 'normalized-equality' },
  { constructId: 'trigger:issue', kind: 'exact-equivalence', targetPaths: ['workflows.issue-opened'], proof: 'trace-bisimulation' },
  { constructId: 'policy:review', kind: 'exact-equivalence', targetPaths: ['policies.review'], proof: 'decision-table-equality' },
  { constructId: 'extension:termfleet', kind: 'retained-dialect', targetPaths: ['extensions.termfleet'], dialect: 'termfleet/v1', roundTrip: true },
  { constructId: 'deprecated:prompt-prefix', kind: 'typed-loss', targetPaths: [], loss: { code: 'AUTHORITY_AMBIGUOUS', effect: 'prompt text does not confer authority', authorizationRequired: true } },
];

const migrationOptions = (source: LegacyV1Installation = legacy()) => ({
  dispositions: dispositions(),
  lossAuthorizations: [{
    token: 'approval:loss-default',
    sourceDigest: `sha256:${createHash('sha256').update(JSON.stringify(source)).digest('hex')}`,
    constructId: 'deprecated:prompt-prefix', lossCode: 'AUTHORITY_AMBIGUOUS',
    approvedBy: 'migration-owner', expiresAt: '2026-07-16T00:00:00Z',
  }],
  asOf: '2026-07-15T00:00:00Z',
});
const verifiedMigrationOptions=(source:LegacyV1Installation=legacy())=>{const statement={id:'loss-auth:default',sourceDigest:`sha256:${createHash('sha256').update(JSON.stringify(source)).digest('hex')}`,constructId:'deprecated:prompt-prefix',lossCode:'AUTHORITY_AMBIGUOUS',approvedBy:'migration-owner',expiresAt:'2026-07-16T00:00:00Z',nonce:`nonce:${Math.random()}`},authorization=signTypedLossAuthorization(statement,{signer:'security-owner',algorithm:'test-v1',sign:digest=>`sig:${digest}`});return{dispositions:dispositions(),signedLossAuthorizations:[authorization],authorizationVerifier:{now:()=>new Date('2026-07-15T00:00:00Z'),verify:(digest:string,signature:string)=>signature===`sig:${digest}`,consumeNonce:()=>true},verifier:{validateOrganization:()=>({valid:true,errors:[]}),verifyExactProof:()=>({valid:true,errors:[]}),resolveTargetPath:(root:unknown,path:string)=>path.split('.').reduce<any>((value,key)=>value?.[key],root)}};};

const corpus = (): MigrationCorpusEntry[] => [
  { id: 'self-driving', source: legacy(), declaredObservations: [
    { id: 'command-surface', projection: 'publicCommands' },
    { id: 'issue-routing', projection: 'trace.issue-assignment' },
    { id: 'review-decision', projection: 'trace.review-decision' },
    { id: 'owned-state', projection: 'state.owned' },
  ] },
  { id: 'simple-gh', source: { ...legacy(), installationId: 'simple-gh', profile: 'profiles/simple-gh' }, declaredObservations: [
    { id: 'command-surface', projection: 'publicCommands' },
    { id: 'owned-state', projection: 'state.owned' },
  ] },
];

describe('R9-SEM-1: versioned v1 frontend and total per-construct disposition', () => {
  test('migrates a supported version into valid Organization IR v2 with an exact total ledger', () => {
    const result = migrateV1Installation(legacy(), verifiedMigrationOptions());
    expect(result.organization.schema).toBe('autonomy.organization.v2');
    expect(result.frontend).toEqual({ sourceSchema: 'autonomy.ir.v1', sourceVersion: '1.4.0', frontendVersion: 'v1-to-v2/1' });
    expect(result.ledger.map((x) => x.constructId).sort()).toEqual(legacy().constructs.map((x) => x.id).sort());
    expect(new Set(result.ledger.map((x) => x.kind))).toEqual(new Set(['exact-equivalence', 'retained-dialect', 'typed-loss']));
    expect(verifyMigrationLedger(legacy(), result.organization, result.ledger)).toEqual({ valid: true, errors: [], untriaged: [] });
  });

  test('rejects unsupported source versions rather than guessing', () => {
    const source = legacy(); source.version = '0.2.0';
    expect(() => migrateV1Installation(source, { dispositions: dispositions() })).toThrow(/unsupported.*version/i);
  });

  test('detects silent construct loss, duplicate disposition, and an untriaged residual', () => {
    const cases = [
      dispositions().filter((x) => x.constructId !== 'policy:review'),
      [...dispositions(), dispositions()[0]!],
      [...dispositions(), { constructId: 'unknown', kind: 'rejection', reason: { code: 'UNKNOWN', message: 'unknown' } } as MigrationCutoverDisposition],
    ];
    for (const ledger of cases) {
      const migrated = migrateV1Installation(legacy(), verifiedMigrationOptions());
      expect(verifyMigrationLedger(legacy(), migrated.organization, ledger).valid).toBe(false);
    }
  });

  test('does not accept dishonest exact-equivalence or untyped loss claims', () => {
    const result = migrateV1Installation(legacy(), verifiedMigrationOptions());
    const lie = structuredClone(result.ledger);
    lie.find((x) => x.constructId === 'policy:review')!.proof = 'asserted-by-migrator';
    expect(verifyMigrationLedger(legacy(), result.organization, lie).errors.some((x) => /proof|equivalence/i.test(x))).toBe(true);
    const loss = structuredClone(result.ledger);
    const entry = loss.find((x) => x.constructId === 'deprecated:prompt-prefix')!;
    if (entry.kind === 'typed-loss') entry.loss.code = '';
    expect(verifyMigrationLedger(legacy(), result.organization, loss).valid).toBe(false);
  });

  test('retained dialect is lossless and round-trips exact source bytes; rejection is explicit and terminal', () => {
    const result = migrateV1Installation(legacy(), verifiedMigrationOptions());
    expect(result.retainedDialects['termfleet/v1']).toEqual(legacy().constructs.find((x) => x.id === 'extension:termfleet')!.value);
    const rejected = dispositions(); rejected[4] = { constructId: 'deprecated:prompt-prefix', kind: 'rejection', reason: { code: 'UNSAFE_AUTHORITY_TEXT', message: 'cannot migrate implicit authority' } };
    expect(() => migrateV1Installation(legacy(), { dispositions: rejected })).toThrow(/UNSAFE_AUTHORITY_TEXT/);
  });
});

describe('R9-REF-1: real-profile dual compilation and observational differential', () => {
  test('dual-compiles the complete declared corpus and proves equal declared observations', () => {
    const report = dualCompileMigrationCorpus(corpus(), { dispositions: dispositions() });
    expect(report.profiles.map((x) => x.id).sort()).toEqual(['self-driving', 'simple-gh']);
    expect(report.profiles.every((x) => x.v1InstallationDigest && x.v2InstallationDigest)).toBe(true);
    expect(report.profiles.flatMap((x) => x.observations).every((x) => x.status === 'equivalent')).toBe(true);
    expect(report.untriagedResiduals).toEqual([]);
  });

  test('reports installation, public-command, state, and behavior drift against its observation id', () => {
    for (const drift of ['drop-command', 'change-owned-state', 'reroute-issue', 'weaken-review'] as const) {
      const report = dualCompileMigrationCorpus(corpus(), { dispositions: dispositions(), adversarialV2Drift: drift });
      expect(report.equivalent).toBe(false);
      expect(report.profiles.some((x) => x.observations.some((o) => o.status === 'different' && o.witness))).toBe(true);
    }
  });

  test('cannot call undeclared output differences equivalent or leave them as an untriaged residual', () => {
    const report = dualCompileMigrationCorpus(corpus(), { dispositions: dispositions(), adversarialV2Drift: 'extra-effect' });
    expect(report.equivalent).toBe(false);
    expect(report.untriagedResiduals.length).toBeGreaterThan(0);
    expect(() => report.assertReadyForShadow()).toThrow(/residual|observation/i);
  });
});

describe('R9-EVO-1: durable staged and reversible cutover', () => {
  const ready = () => dualCompileMigrationCorpus(corpus(), { dispositions: dispositions() });
  const trustPolicy={trustedSigners:{manager:{algorithms:['test-v1'],verify:(digest:string,signature:string)=>signature===`sig:${digest}`}}};
  const advance=(controller:ReturnType<typeof createMigrationCutoverController>,report:ReturnType<typeof ready>,to:'shadow'|'canary'|'cutover'|'rollback',payload:Record<string,unknown>,id:string,extra:Record<string,unknown>={})=>controller.transition({to,evidence:signMigrationCutoverEvidence({id,corpusDigest:report.corpusDigest,priorStateDigest:controller.stateDigest,from:controller.state.phase,to,payload},{signer:'manager',algorithm:'test-v1',sign:digest=>`sig:${digest}`}),...extra},trustPolicy);
  const restore=(controller:ReturnType<typeof createMigrationCutoverController>)=>{const snapshot=controller.snapshot();return restoreMigrationCutoverController(snapshot,{verify:value=>value===snapshot,replay:()=>snapshot.state});};

  test('enforces shadow -> canary -> cutover and explicit evidence gates durably across restart', () => {
    const report=ready();let controller = createMigrationCutoverController({ corpusReport: report, initialRuntime: 'v1', ownedState: legacy().ownedState, publicCommands: legacy().publicCommands });
    expect(controller.state.phase).toBe('legacy');
    controller = advance(controller,report,'shadow',{differentialReport:report.digest},'e:shadow');controller=restore(controller);
    controller = advance(controller,report,'canary',{shadowTrace:'trace:equivalent',fraction:0.1},'e:canary');controller=restore(controller);
    controller = advance(controller,report,'cutover',{canaryTrace:'trace:healthy',rollbackDrill:'drill:passed'},'e:cutover');
    expect(controller.state.activeRuntime).toBe('v2');
    expect(controller.state.publicCommands).toEqual(legacy().publicCommands);
    expect(controller.state.ownedState).toEqual(legacy().ownedState);
    expect(controller.journal.map((x) => x.to)).toEqual(['shadow', 'canary', 'cutover']);
  });

  test('rejects bypassed, reordered, or unevidenced stages and command/state drift', () => {
    const report=ready(),controller = createMigrationCutoverController({ corpusReport: report, initialRuntime: 'v1', ownedState: legacy().ownedState, publicCommands: legacy().publicCommands });
    expect(() => advance(controller,report,'cutover',{canaryTrace:'x',rollbackDrill:'x'},'bad:1')).toThrow(/shadow|stage/i);
    expect(() => advance(controller,report,'canary',{shadowTrace:'',fraction:1},'bad:2')).toThrow(/shadow|stage|evidence/i);
    expect(() => advance(controller,report,'shadow',{differentialReport:report.digest},'bad:3',{publicCommands:['/new-command']})).toThrow(/command/i);
    expect(() => advance(controller,report,'shadow',{differentialReport:report.digest},'bad:4',{ownedState:{}})).toThrow(/state/i);
  });

  test('rollback preserves and translates work accepted after cutover', () => {
    const report=ready();let controller = createMigrationCutoverController({ corpusReport: report, initialRuntime: 'v1', ownedState: legacy().ownedState, publicCommands: legacy().publicCommands });
    controller=advance(controller,report,'shadow',{differentialReport:report.digest},'r:1');controller=advance(controller,report,'canary',{shadowTrace:'trace:clean',fraction:0.1},'r:2');controller=advance(controller,report,'cutover',{canaryTrace:'trace:healthy',rollbackDrill:'drill:passed'},'r:3');
    controller = controller.recordOwnedMutation({ id: 'event:8', operation: 'issue-created', value: { id: 'OA-2', status: 'ready' } });
    const rolledBack = advance(controller,report,'rollback',{reason:'v2 regression',targetRuntimeDigest:'sha256:legacy-runtime'},'r:4');
    expect(rolledBack.state.activeRuntime).toBe('v1');
    expect(rolledBack.state.ownedState.issues).toContainEqual({ id: 'OA-2', status: 'ready' });
    expect(rolledBack.journal.some((x) => x.eventId === 'event:8' && x.appliedBy === 'v1')).toBe(true);
  });

  test('legacy removal requires explicit, independently checkable criteria and is irreversible', () => {
    const complete = {
      zeroUntriagedResiduals: true, fullCorpusEquivalent: true, shadowWindowPassed: true,
      canaryPassed: true, rollbackDrillPassed: true, publicCommandsPreserved: true,
      ownedStatePreserved: true, canonicalDogfoodV2Observed: true, rollbackRetentionSatisfied: true,
    };
    expect(assessLegacyRemoval(complete).removable).toBe(true);
    expect(assessLegacyRemoval(complete).unmet).toEqual([]);
    for (const criterion of Object.keys(complete) as Array<keyof typeof complete>) {
      expect(assessLegacyRemoval({ ...complete, [criterion]: false }).removable).toBe(false);
    }
  });
});

describe('R9-DOG-1: canonical observed v2 dogfood proof', () => {
  const proof = () => ({
    schema: 'autonomy.dogfood-adoption-proof.v1' as const,
    canonicalInstallation: 'self-driving', repository: 'open-autonomy',
    canonicalSourceDigest: 'sha256:source', organizationDigest: 'sha256:organization',
    desiredBundleDigest: 'sha256:v2-bundle', runningBundleDigest: 'sha256:v2-bundle',
    compiler: { generation: 'v2' as const, digest: 'sha256:v2-compiler' },
    runtime: { generation: 'v2' as const, digest: 'sha256:v2-runtime' },
    liveInstanceBinding:{bundleDigest:'sha256:v2-bundle',releaseDigest:'sha256:release',instanceId:'dogfood'},
    observations: [{kind:'process',issuer:'inspector',signature:'p',subjectBundleDigest:'sha256:v2-bundle',releaseDigest:'sha256:release',instanceId:'dogfood',compilerDigest:'sha256:v2-compiler',runtimeDigest:'sha256:v2-runtime'},{kind:'effect',canonical:true,command:'/agent status',issuer:'inspector',signature:'e',subjectBundleDigest:'sha256:v2-bundle',releaseDigest:'sha256:release',instanceId:'dogfood',compilerDigest:'sha256:v2-compiler',runtimeDigest:'sha256:v2-runtime'}],
    legacyBypassObserved: false,
  });
  const external={canonical:{repository:'open-autonomy',installation:'self-driving',sourceDigest:'sha256:source',organizationDigest:'sha256:organization',expectedBundleDigest:'sha256:v2-bundle'},verifyR8LiveInstance:()=>({valid:true,errors:[],compilerDigest:'sha256:v2-compiler',runtimeDigest:'sha256:v2-runtime',organizationDigest:'sha256:organization'}),trustedV2:{compilerDigests:['sha256:v2-compiler'],runtimeDigests:['sha256:v2-runtime']},verifyObservation:()=>({valid:true,errors:[]})};

  test('proves canonical work actually executed through the immutable observed v2 path', () => {
    expect(proveV2DogfoodAdoption(proof(),external).adopted).toBe(true);
  });

  test('rejects false adoption from desired config, self-assertion, v1 compiler/runtime, digest mismatch, or hidden bypass', () => {
    const mutations: Array<(x: ReturnType<typeof proof>) => void> = [
      (x) => { x.observations = []; },
      (x) => { x.observations = x.observations.filter(item=>item.kind!=='process'); },
      (x) => { x.runningBundleDigest = 'sha256:other'; },
      (x) => { x.legacyBypassObserved = true; },
      (x) => { x.canonicalInstallation = 'noncanonical'; },
    ];
    for (const mutate of mutations) {
      const candidate = proof(); mutate(candidate);
      expect(proveV2DogfoodAdoption(candidate,external).adopted).toBe(false);
    }
  });
});

describe('R9 adversarial review cycle 2: independently bound migration and cutover evidence', () => {
  test('ledger verification resolves every claimed target path against the actual migrated document', () => {
    const migrated = migrateV1Installation(legacy(), verifiedMigrationOptions());
    expect(verifyMigrationLedger(legacy(), {} as typeof migrated.organization, migrated.ledger).valid).toBe(false);

    const deleted = structuredClone(migrated.organization);
    delete (deleted as unknown as Record<string, unknown>).actors;
    const deletedResult = verifyMigrationLedger(legacy(), deleted, migrated.ledger);
    expect(deletedResult.valid).toBe(false);
    expect(deletedResult.errors.some((error) => /actors\.manager|target path|resolve/i.test(error))).toBe(true);

    const forged = structuredClone(migrated.ledger);
    forged.find((entry) => entry.constructId === 'role:manager')!.targetPaths = ['actors.does-not-exist'];
    expect(verifyMigrationLedger(legacy(), migrated.organization, forged).valid).toBe(false);
  });

  test('typed loss requires a scoped authorization token bound to source, construct, and loss code', () => {
    const source = legacy();
    expect(() => migrateV1Installation(source, { dispositions: dispositions() })).toThrow(/strict.*verifier|authorization/i);
    const authorized = migrateV1Installation(source, verifiedMigrationOptions(source));
    expect(authorized.ledger.find((entry) => entry.constructId === 'deprecated:prompt-prefix')?.kind).toBe('typed-loss');
  });

  test('the real-profile corpus is discovered from repository inputs and invokes both real compiler frontends', async () => {
    const discovered = await discoverRealProfileMigrationCorpus({ repositoryRoot: '../../..', profilesDirectory: 'profiles' });
    expect(discovered.entries.length).toBeGreaterThan(1);
    expect(discovered.entries.some((entry) => entry.id === 'self-driving')).toBe(true);
    expect(discovered.entries.every((entry) => entry.provenance.sourcePath.startsWith('profiles/'))).toBe(true);
    expect(discovered.entries.every((entry) => entry.provenance.sourceDigest.startsWith('sha256:'))).toBe(true);

    const calls: string[] = [];
    const report = await dualCompileMigrationCorpus(discovered.entries, {
      dispositions: dispositions(),
      compileV1: async (entry: typeof discovered.entries[number]) => { calls.push(`v1:${entry.id}`); return discovered.compileV1(entry); },
      compileV2: async (entry: typeof discovered.entries[number]) => { calls.push(`v2:${entry.id}`); return discovered.compileV2(entry); },
      expectedCompilerDigests: { v1: discovered.legacyCompiler.digest, v2: discovered.v2Compiler.digest },
      executionVerifier: discovered.executionVerifier,
    });
    expect(calls.sort()).toEqual(discovered.entries.flatMap((entry) => [`v1:${entry.id}`, `v2:${entry.id}`]).sort());
    expect(report.compilerProvenance.v1.digest).toMatch(/^sha256:/);
    expect(report.compilerProvenance.v2.digest).toMatch(/^sha256:/);
    expect(report.corpusDigest).toBe(discovered.corpusDigest);
    expect(report.equivalent).toBe(true);
    expect(report.profiles.every((profile) => profile.observations.map((observation) => observation.id).sort().join(',') === ['command-surface','installation-files','owned-state','routing-review-effects'].sort().join(','))).toBe(true);
  }, 15_000);

  test('restore derives readiness and checkpoint state by authenticated replay, rejecting forged fields', () => {
    const report = dualCompileMigrationCorpus(corpus(), { dispositions: dispositions() });
    const controller = createMigrationCutoverController({ corpusReport: report, initialRuntime: 'v1', ownedState: legacy().ownedState, publicCommands: legacy().publicCommands });
    const snapshot = controller.snapshot();
    const checkpointTrust={verify:(value:unknown)=>value===snapshot,replay:()=>snapshot.state};
    const forgedReady = structuredClone(snapshot);
    (forgedReady as unknown as Record<string, unknown>).corpusReady = true;
    (forgedReady as unknown as Record<string, unknown>).corpusDigest = 'sha256:attacker';
    expect(() => restoreMigrationCutoverController(forgedReady,checkpointTrust)).toThrow(/checkpoint|trust|corpus|digest|replay/i);

    const forgedState = structuredClone(snapshot);
    (forgedState.state.ownedState as { checkpoints: { sequence: number } }).checkpoints.sequence = 999;
    expect(() => restoreMigrationCutoverController(forgedState,checkpointTrust)).toThrow(/checkpoint|state|trust|replay|digest/i);
  });

  test('transition evidence is signed and digest-bound to corpus, prior state, target stage, and payload', () => {
    const report = dualCompileMigrationCorpus(corpus(), { dispositions: dispositions() });
    const controller = createMigrationCutoverController({ corpusReport: report, initialRuntime: 'v1', ownedState: legacy().ownedState, publicCommands: legacy().publicCommands });
    const evidence = signMigrationCutoverEvidence({
      id: 'evidence:shadow', corpusDigest: report.corpusDigest, priorStateDigest: controller.stateDigest,
      from: 'legacy', to: 'shadow', payload: { differentialReport: report.digest },
    }, { signer: 'release-manager', algorithm: 'sha256-test-v1', sign: (digest) => `signed:${digest}` });
    const trustPolicy = { trustedSigners: { 'release-manager': { algorithms: ['sha256-test-v1'], verify: (digest: string, signature: string) => signature === `signed:${digest}` } } };
    expect(controller.transition({ to: 'shadow', evidence }, trustPolicy).state.phase).toBe('shadow');
    for (const field of ['corpusDigest', 'priorStateDigest', 'to'] as const) {
      const forged = structuredClone(evidence);
      (forged.statement as unknown as Record<string, unknown>)[field] = 'attacker';
      expect(() => controller.transition({ to: 'shadow', evidence: forged }, trustPolicy)).toThrow(/signature|digest|binding/i);
    }
    const unsigned = structuredClone(evidence); unsigned.signature = '';
    expect(() => controller.transition({ to: 'shadow', evidence: unsigned }, trustPolicy)).toThrow(/signature/i);
  });

  test('checkpoint replay rejects arbitrary journal mutation and duplicate event identities', () => {
    const report = dualCompileMigrationCorpus(corpus(), { dispositions: dispositions() });
    let controller = createMigrationCutoverController({ corpusReport: report, initialRuntime: 'v1', ownedState: legacy().ownedState, publicCommands: legacy().publicCommands });
    controller = controller.recordOwnedMutation({ id: 'event:8', operation: 'issue-created', value: { id: 'OA-2', status: 'ready' } });
    expect(() => controller.recordOwnedMutation({ id: 'event:8', operation: 'issue-created', value: { id: 'OA-EVIL', status: 'ready' } })).toThrow(/duplicate|event:8|replay/i);
    const snapshot = controller.snapshot();
    const checkpointTrust={verify:(value:unknown)=>value===snapshot,replay:()=>snapshot.state};
    const forged = structuredClone(snapshot);
    forged.journal.find((entry) => entry.eventId === 'event:8')!.value = { id: 'OA-EVIL', status: 'done' };
    expect(() => restoreMigrationCutoverController(forged,checkpointTrust)).toThrow(/checkpoint|trust|integrity|journal|replay|digest/i);
  });

  test('legacy-removal assessment fails closed on missing or additional criteria', () => {
    expect(assessLegacyRemoval({} as Parameters<typeof assessLegacyRemoval>[0]).removable).toBe(false);
    const valid = {
      zeroUntriagedResiduals: true, fullCorpusEquivalent: true, shadowWindowPassed: true,
      canaryPassed: true, rollbackDrillPassed: true, publicCommandsPreserved: true,
      ownedStatePreserved: true, canonicalDogfoodV2Observed: true, rollbackRetentionSatisfied: true,
    };
    const extra = { ...valid, attackerOverride: true };
    const result = assessLegacyRemoval(extra as unknown as Parameters<typeof assessLegacyRemoval>[0]);
    expect(result.removable).toBe(false);
    expect(result.unexpected).toEqual(['attackerOverride']);
    expect([...result.evaluated].sort() as string[]).toEqual(Object.keys(valid).sort());
  });

  test('dogfood adoption requires signed independent observations and an R8-verified live release binding', () => {
    const adopted = {
      schema: 'autonomy.dogfood-adoption-proof.v1' as const,
      canonicalInstallation: 'self-driving', repository: 'open-autonomy',
      canonicalSourceDigest: 'sha256:source', organizationDigest: 'sha256:organization',
      desiredBundleDigest: 'sha256:v2-bundle', runningBundleDigest: 'sha256:v2-bundle',
      compiler: { generation: 'v2' as const, digest: 'sha256:v2-compiler' },
      runtime: { generation: 'v2' as const, digest: 'sha256:v2-runtime' },
      observations: [{
        kind: 'process', source: 'independent-inspector', issuer: 'inspector-1',
        subjectBundleDigest: 'sha256:v2-bundle', releaseDigest: 'sha256:release',
        compilerDigest: 'sha256:v2-compiler', runtimeDigest: 'sha256:v2-runtime', instanceId: 'dogfood-01',
        signature: 'verified-process-signature',canonical:false,command:'',
      },{
        kind: 'effect', source: 'independent-inspector', issuer: 'inspector-1',canonical:true,command:'/agent status',
        subjectBundleDigest: 'sha256:v2-bundle', releaseDigest: 'sha256:release',
        compilerDigest: 'sha256:v2-compiler', runtimeDigest: 'sha256:v2-runtime', instanceId: 'dogfood-01',
        signature: 'verified-observation-signature',
      }],
      liveInstanceBinding: {
        verification: { valid: true, verifier: 'r8-independent-verifier' },
        bundleDigest: 'sha256:v2-bundle', releaseDigest: 'sha256:release', instanceId: 'dogfood-01',
      },
      observationTrust: { trustedIssuers: ['inspector-1'], verify: () => true },
      legacyBypassObserved: false,
    };
    const externalFor=(value:typeof adopted)=>({canonical:{repository:'open-autonomy',installation:'self-driving',sourceDigest:'sha256:source',organizationDigest:'sha256:organization',expectedBundleDigest:'sha256:v2-bundle'},verifyR8LiveInstance:()=>({valid:value.liveInstanceBinding.verification.valid,errors:value.liveInstanceBinding.verification.valid?[]:['invalid'],compilerDigest:'sha256:v2-compiler',runtimeDigest:'sha256:v2-runtime',organizationDigest:'sha256:organization'}),trustedV2:{compilerDigests:['sha256:v2-compiler'],runtimeDigests:['sha256:v2-runtime']},verifyObservation:(observation:typeof value.observations[number])=>{const valid=observation.source==='independent-inspector'&&Boolean(observation.signature)&&value.observationTrust.trustedIssuers.includes(observation.issuer)&&value.observationTrust.verify()&&observation.subjectBundleDigest===value.liveInstanceBinding.bundleDigest&&observation.releaseDigest===value.liveInstanceBinding.releaseDigest;return{valid,errors:valid?[]:['invalid']};}});
    expect(proveV2DogfoodAdoption(adopted,externalFor(adopted)).adopted).toBe(true);
    const attacks: Array<(value: typeof adopted) => void> = [
      (x) => { x.observations[0]!.source = 'runtime-self-report'; },
      (x) => { x.observations[0]!.source = 'attacker'; },
      (x) => { x.observations[0]!.signature = ''; },
      (x) => { x.observations[0]!.subjectBundleDigest = 'sha256:other'; },
      (x) => { x.observations[0]!.releaseDigest = 'sha256:other'; },
      (x) => { x.liveInstanceBinding.verification.valid = false; },
      (x) => { x.liveInstanceBinding.bundleDigest = 'sha256:other'; },
      (x) => { x.observationTrust.verify = () => false; },
    ];
    for (const attack of attacks) {
      const forged = JSON.parse(JSON.stringify(adopted)) as typeof adopted;
      forged.observationTrust.verify = adopted.observationTrust.verify;
      attack(forged);
      expect(proveV2DogfoodAdoption(forged,externalFor(forged)).adopted).toBe(false);
    }
  });
});

describe('R9 adversarial review cycle 3: external verification and replay semantics', () => {
  test('a deliberately wrong real v2 compiler result is observationally different', async () => {
    const discovered = await discoverRealProfileMigrationCorpus({ repositoryRoot: '../../..', profilesDirectory: 'profiles' });
    const report = await dualCompileMigrationCorpus(discovered.entries, {
      dispositions: dispositions(),
      compileV1: discovered.compileV1,
      compileV2: async (entry: typeof discovered.entries[number]) => ({ ...(await discovered.compileV2(entry)) as Record<string, unknown>, 'attacker-extra-file': { content: 'wrong' } }),
      expectedCompilerDigests: { v1: discovered.legacyCompiler.digest, v2: discovered.v2Compiler.digest },
      executionVerifier: discovered.executionVerifier,
    });
    expect(report.equivalent).toBe(false);
    expect(report.profiles.every((profile) => profile.v1InstallationDigest !== profile.v2InstallationDigest)).toBe(true);
    expect(report.profiles.some((profile) => profile.observations.some((observation) => observation.status === 'different'))).toBe(true);
  });

  test('semantic ledger replay rejects changed values, prototype paths, and invalid Organization IR', () => {
    const source = legacy();
    const migrated = migrateV1Installation(source, verifiedMigrationOptions(source));
    const strict = {
      validateOrganization: (value: unknown) => ({ valid: Boolean((value as { schema?: string })?.schema === 'autonomy.organization.v2' && (value as { actors?: unknown })?.actors), errors: ['invalid OrganizationIR'] }),
      verifyEquivalence: ({ sourceValue, targetValue, proof }: { sourceValue: unknown; targetValue: unknown; proof: string }) =>
        proof === 'normalized-equality' && JSON.stringify(sourceValue) === JSON.stringify((targetValue as { inline?: unknown })?.inline ?? targetValue),
    };
    expect(verifyMigrationLedger(source, migrated.organization, migrated.ledger, strict).valid).toBe(true);
    const changed = structuredClone(migrated.organization);
    (changed.behaviors!.manager as { inline?: unknown }).inline = { objective: 'attacker changed semantics' };
    expect(verifyMigrationLedger(source, changed, migrated.ledger, strict).valid).toBe(false);
    const prototype = structuredClone(migrated.ledger);
    prototype[0]!.targetPaths = ['actors.__proto__.constructor'];
    expect(verifyMigrationLedger(source, migrated.organization, prototype, strict).valid).toBe(false);
    expect(verifyMigrationLedger(source, {} as typeof migrated.organization, migrated.ledger, strict).errors.some((error) => /OrganizationIR/i.test(error))).toBe(true);
  });

  test('typed-loss authorization is externally signed, verifier-clock bounded, and replay protected', () => {
    const source = legacy();
    const statement = {
      id: 'loss-auth:1', sourceDigest: `sha256:${createHash('sha256').update(JSON.stringify(source)).digest('hex')}`,
      constructId: 'deprecated:prompt-prefix', lossCode: 'AUTHORITY_AMBIGUOUS',
      approvedBy: 'migration-owner', expiresAt: '2026-07-16T00:00:00Z', nonce: 'nonce-1',
    };
    const authorization = signTypedLossAuthorization(statement, { signer: 'security-owner', algorithm: 'test-v1', sign: (digest) => `sig:${digest}` });
    const used = new Set<string>();
    const verifier = {
      now: () => new Date('2026-07-15T00:00:00Z'),
      verify: (digest: string, signature: string, signer: string) => signer === 'security-owner' && signature === `sig:${digest}`,
      consumeNonce: (nonce: string) => { if (used.has(nonce)) return false; used.add(nonce); return true; },
    };
    const strictVerifier=verifiedMigrationOptions(source).verifier;
    expect(migrateV1Installation(source, { dispositions: dispositions(), signedLossAuthorizations: [authorization], authorizationVerifier: verifier,verifier:strictVerifier }).organization.schema).toBe('autonomy.organization.v2');
    expect(() => migrateV1Installation(source, { dispositions: dispositions(), signedLossAuthorizations: [authorization], authorizationVerifier: verifier,verifier:strictVerifier })).toThrow(/replay|nonce|authorization/i);
    const expiredVerifier = { ...verifier, now: () => new Date('2026-07-17T00:00:00Z'), consumeNonce: () => true };
    expect(() => migrateV1Installation(source, { dispositions: dispositions(), signedLossAuthorizations: [authorization], authorizationVerifier: expiredVerifier,verifier:strictVerifier })).toThrow(/expired|authorization/i);
    expect(() => migrateV1Installation(source, { dispositions: dispositions(), signedLossAuthorizations: [authorization],verifier:strictVerifier })).toThrow(/external.*verifier|authorization/i);
  });

  test('transition trust is mandatory, raw evidence is rejected, and evidence IDs cannot replay', () => {
    const report = dualCompileMigrationCorpus(corpus(), { dispositions: dispositions() });
    const controller = createMigrationCutoverController({ corpusReport: report, initialRuntime: 'v1', ownedState: legacy().ownedState, publicCommands: legacy().publicCommands });
    expect(() => controller.transition({ to: 'shadow', evidence: { differentialReport: report.digest } })).toThrow(/signed|trust|evidence/i);
    const evidence = signMigrationCutoverEvidence({ id: 'transition:1', corpusDigest: report.corpusDigest, priorStateDigest: controller.stateDigest, from: 'legacy', to: 'shadow', payload: { differentialReport: report.digest } }, { signer: 'manager', algorithm: 'test-v1', sign: (digest) => `sig:${digest}` });
    expect(() => controller.transition({ to: 'shadow', evidence })).toThrow(/trust/i);
    const trustPolicy = { trustedSigners: { manager: { algorithms: ['test-v1'], verify: (digest: string, signature: string) => signature === `sig:${digest}` } } };
    const shadow = controller.transition({ to: 'shadow', evidence }, trustPolicy);
    const replay = signMigrationCutoverEvidence({ ...evidence.statement, priorStateDigest: shadow.stateDigest, from: 'shadow', to: 'canary', payload: { shadowTrace: 'ok', fraction: 0.1 } }, { signer: 'manager', algorithm: 'test-v1', sign: (digest) => `sig:${digest}` });
    expect(() => shadow.transition({ to: 'canary', evidence: replay }, trustPolicy)).toThrow(/duplicate.*transition:1|evidence.*replay/i);
  });

  test('restore uses external checkpoint trust and replay, rejecting a forgery with recomputed public hash', () => {
    const report = dualCompileMigrationCorpus(corpus(), { dispositions: dispositions() });
    const controller = createMigrationCutoverController({ corpusReport: report, initialRuntime: 'v1', ownedState: legacy().ownedState, publicCommands: legacy().publicCommands });
    const snapshot = controller.snapshot();
    const forged = structuredClone(snapshot);
    forged.state.publicCommands.push('/attacker');
    forged.snapshotDigest = `sha256:${createHash('sha256').update(JSON.stringify({ state: forged.state, journal: forged.journal, corpusReady: forged.corpusReady, corpusDigest: forged.corpusDigest, initialState: forged.initialState })).digest('hex')}`;
    const checkpointTrust = { verify: (checkpoint: unknown) => checkpoint === snapshot, replay: () => snapshot.state };
    expect(() => restoreMigrationCutoverController(forged, checkpointTrust)).toThrow(/checkpoint|trust|replay/i);
    expect(restoreMigrationCutoverController(snapshot, checkpointTrust).state).toEqual(snapshot.state);
    expect(() => restoreMigrationCutoverController(snapshot)).toThrow(/checkpoint.*trust/i);
  });

  test('arbitrary owned mutations use explicit reducers and rollback translators that execute on v1', () => {
    const executions: string[] = [];
    const handlers = {
      v2: { reduce: (state: any, event: any) => ({ ...state, custom: [...(state.custom ?? []), event.value] }) },
      rollbackToV1: {
        translate: (event: any) => ({ ...event, operation: 'legacy-custom' }),
        apply: (state: any, event: any) => { executions.push(`v1:${event.operation}`); return { ...state, custom: [...(state.custom ?? []), event.value] }; },
      },
    };
    const report = dualCompileMigrationCorpus(corpus(), { dispositions: dispositions() });
    let controller = createMigrationCutoverController({ corpusReport: report, initialRuntime: 'v1', ownedState: legacy().ownedState, publicCommands: legacy().publicCommands, mutationHandlers: handlers });
    const trustPolicy = { trustedSigners: { manager: { algorithms: ['test-v1'], verify: (digest: string, signature: string) => signature === `sig:${digest}` } } };
    const advance = (to: 'shadow'|'canary'|'cutover'|'rollback', payload: Record<string, unknown>, id: string) => {
      const evidence = signMigrationCutoverEvidence({ id, corpusDigest: report.corpusDigest, priorStateDigest: controller.stateDigest, from: controller.state.phase, to, payload }, { signer: 'manager', algorithm: 'test-v1', sign: (digest) => `sig:${digest}` });
      controller = controller.transition({ to, evidence }, trustPolicy);
    };
    advance('shadow', { differentialReport: report.digest }, 'e:1'); advance('canary', { shadowTrace: 'ok', fraction: 0.1 }, 'e:2'); advance('cutover', { canaryTrace: 'ok', rollbackDrill: 'ok' }, 'e:3');
    controller = controller.recordOwnedMutation({ id: 'event:custom', operation: 'custom-domain-operation', value: { x: 1 } });
    advance('rollback', { reason: 'drill', targetRuntimeDigest: 'sha256:v1' }, 'e:4');
    expect(executions).toEqual(['v1:legacy-custom']);
    expect(controller.state.ownedState.custom).toContainEqual({ x: 1 });
  });

  test('legacy removal is derived from concrete artifacts and executing it is irreversible', () => {
    const criteria=Object.fromEntries(['zeroUntriagedResiduals','fullCorpusEquivalent','shadowWindowPassed','canaryPassed','rollbackDrillPassed','publicCommandsPreserved','ownedStatePreserved','canonicalDogfoodV2Observed','rollbackRetentionSatisfied'].map(key=>[key,true])),artifacts={corpusReport:{digest:'sha256:report',signature:'sig'},controllerJournal:{digest:'sha256:journal',signature:'sig'},dogfoodProof:{digest:'sha256:dogfood',signature:'sig'}},verifier={verify:()=>true,deriveCriteria:()=>({criteria,errors:[]})};
    const decision = deriveLegacyRemovalDecision({artifacts,verifier});
    expect(decision.removable).toBe(true);
    const values=new Map<string,unknown>(),tombstoneStore={putIfAbsent:(key:string,value:unknown)=>{if(values.has(key))return false;values.set(key,value);return true;}},authorization={decisionDigest:decision.digest,signature:'signed'},authorizationTrust={verify:()=>true};
    const removed = executeLegacyRemoval(decision, { legacyRuntimeDigest: 'sha256:v1', authorization,authorizationTrust,tombstoneStore });
    expect(removed.status).toBe('removed');
    expect(() => executeLegacyRemoval(decision, { legacyRuntimeDigest: 'sha256:v1', authorization,authorizationTrust,tombstoneStore })).toThrow(/already|irreversible/i);
    expect(deriveLegacyRemovalDecision({artifacts,verifier:{...verifier,deriveCriteria:()=>({criteria:{...criteria,canaryPassed:false},errors:['not ready']})}}).removable).toBe(false);
  });

  test('dogfood proof has no embedded or legacy fallback: both external R8 and observation verifiers are mandatory', () => {
    const proof = {
      schema: 'autonomy.dogfood-adoption-proof.v1', canonicalInstallation: 'self-driving', repository: 'open-autonomy',
      canonicalSourceDigest:'sha256:source',organizationDigest:'sha256:organization',
      desiredBundleDigest: 'sha256:bundle', runningBundleDigest: 'sha256:bundle', compiler: { generation: 'v2', digest: 'sha256:compiler' },
      runtime: { generation: 'v2', digest: 'sha256:runtime' }, legacyBypassObserved: false,
      liveInstanceBinding: { bundleDigest: 'sha256:bundle', releaseDigest: 'sha256:release', instanceId: 'dogfood-1' },
      observations: [{kind:'process',issuer:'observer',signature:'p',subjectBundleDigest:'sha256:bundle',releaseDigest:'sha256:release',instanceId:'dogfood-1',compilerDigest:'sha256:compiler',runtimeDigest:'sha256:runtime'},{kind:'effect',canonical:true,command:'/agent status',issuer:'observer',signature:'e',subjectBundleDigest:'sha256:bundle',releaseDigest:'sha256:release',instanceId:'dogfood-1',compilerDigest:'sha256:compiler',runtimeDigest:'sha256:runtime'}],
    };
    const external = { canonical:{repository:'open-autonomy',installation:'self-driving',sourceDigest:'sha256:source',organizationDigest:'sha256:organization',expectedBundleDigest:'sha256:bundle'},verifyR8LiveInstance: () => ({ valid: true, errors: [],compilerDigest:'sha256:compiler',runtimeDigest:'sha256:runtime',organizationDigest:'sha256:organization' }),trustedV2:{compilerDigests:['sha256:compiler'],runtimeDigests:['sha256:runtime']}, verifyObservation: () => ({ valid: true, errors: [] }) };
    expect(proveV2DogfoodAdoption(proof, external).adopted).toBe(true);
    expect(() => proveV2DogfoodAdoption(proof)).toThrow(/external.*verifier/i);
    expect(proveV2DogfoodAdoption(proof, { ...external, verifyR8LiveInstance: () => ({ valid: false, errors: ['forged'] }) }).adopted).toBe(false);
    expect(proveV2DogfoodAdoption(proof, { ...external, verifyObservation: () => ({ valid: false, errors: ['unsigned'] }) }).adopted).toBe(false);
  });
});

describe('R9 adversarial review cycle 4: native v2 semantics and durable external proofs', () => {
  test('discovered migration builds native v2 without embedding the whole v1 IR and certifies construct coverage', async () => {
    const discovered = await discoverRealProfileMigrationCorpus({ repositoryRoot: '../../..', profilesDirectory: 'profiles' });
    const entry = discovered.entries.find((candidate) => candidate.id === 'self-driving')!;
    const lowered = await lowerDiscoveredProfileToV2(entry, {
      compiler: discovered.v2Compiler,
      assurancePolicy: discovered.assurancePolicy,
      dispositions: discovered.dispositionsFor(entry),
    });
    const serialized = JSON.stringify(lowered.organization);
    expect(serialized).not.toContain('v1Frontend');
    expect(serialized).not.toContain(JSON.stringify(entry.v1Ir));
    expect(lowered.artifact.schema).toBe('autonomy.v2-installation.v1');
    expect(lowered.certificate.compiler.generation).toBe('v2');
    expect(lowered.certificate.compiler.digest).toMatch(/^sha256:/);
    expect(lowered.certificate.sourceConstructs.sort()).toEqual(entry.source.constructs.map((construct) => construct.id).sort());
    expect(lowered.certificate.constructWitnesses.every((witness) => witness.targetArtifactPaths.length === 0 && witness.causality === 'whole-installation-round-trip' && witness.installationWitnessDigest.startsWith('sha256:'))).toBe(true);
    const semanticWitnesses = lowered.certificate.constructWitnesses.filter((witness) => witness.constructId.startsWith('role:') || witness.constructId.startsWith('trigger:'));
    expect(semanticWitnesses.every((witness) => witness.organizationPaths.length > 0 && witness.solverObligations.length > 0 && witness.loweringTargets.length > 0)).toBe(true);
    expect(lowered.certificate.preservation.map((pass) => `${pass.from}->${pass.to}`)).toEqual(['organization->control', 'control->execution', 'organization->execution', 'execution->native']);
    expect(lowered.certificate.deploymentCandidate).toContain('coding-worker-runtime');
    expect(lowered.certificate.v1RuntimeDependency).toBe(true);
    expect(lowered.certificate.retainedRuntimeAbi).toBe('autonomy.ir.v1');
    expect(lowered.certificate.directLegacyCompilerDependency).toBe(false);
    expect(lowered.certificate.provenanceChain.map((stage) => stage.stage)).toEqual(['v1-source', 'v2-frontend', 'compiler-invocation', 'organization-ir', 'deployment-solver', 'fixed-point-lowering', 'autonomy.ir.v1-target-abi', 'pinned-substrate-backend', 'native-installation']);
    expect(lowered.certificate.provenanceChain.every((stage) => stage.digest.startsWith('sha256:'))).toBe(true);
  });

  test('production migration requires a strict verifier and replays every exact proof class', () => {
    const source = legacy();
    const proofCalls: string[] = [];
    const strictVerifier = {
      validateOrganization: () => ({ valid: true, errors: [] }),
      verifyExactProof: (request: { proof: string }) => { proofCalls.push(request.proof); return { valid: true, errors: [] }; },
      resolveTargetPath: (root: unknown, path: string) => path.split('.').reduce<any>((value, key) => value?.[key], root),
    };
    expect(() => migrateV1Installation(source, migrationOptions(source))).toThrow(/strict.*verifier|verification/i);
    const result = migrateV1Installation(source, { ...verifiedMigrationOptions(source), verifier: strictVerifier });
    expect(result.organization.schema).toBe('autonomy.organization.v2');
    expect(proofCalls.sort()).toEqual(['decision-table-equality', 'normalized-equality', 'trace-bisimulation'].sort());
    const dishonest = { ...strictVerifier, verifyExactProof: ({ proof }: { proof: string }) => ({ valid: proof !== 'trace-bisimulation', errors: ['trace differs'] }) };
    expect(() => migrateV1Installation(source, { ...verifiedMigrationOptions(source), verifier: dishonest })).toThrow(/trace differs|equivalence/i);
  });

  test('unsigned loss authorization and caller-owned asOf are rejected', () => {
    const source = legacy();
    const strictVerifier = { validateOrganization: () => ({ valid: true, errors: [] }), verifyExactProof: () => ({ valid: true, errors: [] }), resolveTargetPath: () => ({}) };
    expect(() => migrateV1Installation(source, { ...migrationOptions(source), verifier: strictVerifier })).toThrow(/unsigned|authorization verifier/i);
    const unsigned = migrationOptions(source);
    expect(() => migrateV1Installation(source, { ...unsigned, verifier: strictVerifier, authorizationVerifier: { verify: () => true }, asOf: '1900-01-01T00:00:00Z' })).toThrow(/signed|clock|verifier/i);
  });

  test('differential compiler invokes an evaluator for every declared projection', async () => {
    const entries = corpus();
    const evaluated: string[] = [];
    const evaluators = Object.fromEntries(entries.flatMap((entry) => entry.declaredObservations).map((observation) => [observation.projection, ({ v1, v2 }: { v1: any; v2: any }) => {
      evaluated.push(observation.projection);
      return v1?.observations?.[observation.projection] === v2?.observations?.[observation.projection]
        ? { status: 'equivalent' as const } : { status: 'different' as const, witness: observation.projection };
    }]));
    const compileV1 = async () => ({ observations: Object.fromEntries(Object.keys(evaluators).map((key) => [key, 'same'])) });
    const compileV2 = async () => ({ observations: Object.fromEntries(Object.keys(evaluators).map((key) => [key, 'same'])), unobservedMetadata: 'extra' });
    const report = await dualCompileMigrationCorpus(entries, { dispositions: dispositions(), compileV1, compileV2, observationEvaluators: evaluators, outputDispositions: [{ path: 'unobservedMetadata', kind: 'retained-dialect' }] });
    expect(evaluated.sort()).toEqual(entries.flatMap((entry) => entry.declaredObservations.map((observation) => observation.projection)).sort());
    expect(report.equivalent).toBe(true);
    const drift = await dualCompileMigrationCorpus(entries, { dispositions: dispositions(), compileV1, compileV2: async () => ({ observations: { ...Object.fromEntries(Object.keys(evaluators).map((key) => [key, 'same'])), publicCommands: 'changed' } }), observationEvaluators: evaluators, outputDispositions: [] });
    expect(drift.equivalent).toBe(false);
    expect(drift.profiles.some((profile) => profile.observations.some((observation) => observation.id === 'command-surface' && observation.status === 'different'))).toBe(true);
  });

  test('restart requires an external versioned mutation-handler registry and retains custom rollback semantics', () => {
    const calls: string[] = [];
    const handler = {
      reduceV2: (state: any, event: any) => ({ ...state, custom: [...(state.custom ?? []), event.value] }),
      translateToV1: (event: any) => ({ ...event, operation: 'legacy-custom' }),
      applyV1: (state: any, event: any) => { calls.push(event.operation); return { ...state, custom: [...(state.custom ?? []), event.value] }; },
    };
    const moduleBytes = new TextEncoder().encode('export default mutationHandlers/custom-domain-operation@1');
    const artifactDigest = digestMutationHandlerArtifact(moduleBytes);
    const artifactUri = 'pkg://mutation-handlers/custom-domain-operation@1';
    const loader = { load: () => ({ uri: artifactUri, bytes: moduleBytes }) };
    const evaluator = { evaluateVerifiedModule: () => handler };
    const registryWithoutDigest = {
      version: 'mutation-handlers/v1',
      handlers: { 'custom-domain-operation': {
        artifact: { uri: artifactUri, digest: artifactDigest },
      } },
    };
    const registry = { ...registryWithoutDigest, digest: digestMutationHandlerRegistry(registryWithoutDigest) };
    const report = dualCompileMigrationCorpus(corpus(), { dispositions: dispositions() });
    const controller = createMigrationCutoverController({ corpusReport: report, initialRuntime: 'v1', ownedState: legacy().ownedState, publicCommands: legacy().publicCommands, mutationHandlerRegistry: registry, mutationHandlerLoader: loader, mutationHandlerEvaluator: evaluator });
    const snapshot = controller.snapshot();
    const trustFor = (checkpoint: typeof snapshot) => ({ verify: () => true, replay: () => checkpoint.state });
    expect(() => restoreMigrationCutoverController(snapshot, trustFor(snapshot))).toThrow(/handler.*registry|version/i);
    expect(() => restoreMigrationCutoverController(snapshot, trustFor(snapshot), { ...registry, digest: 'sha256:other' }, loader, evaluator)).toThrow(/handler.*digest|registry/i);
    let restored = restoreMigrationCutoverController(snapshot, trustFor(snapshot), registry, loader, evaluator);
    restored = restored.recordOwnedMutation({ id: 'custom:1', operation: 'custom-domain-operation', value: { x: 1 } });
    const mutatedSnapshot = restored.snapshot();
    const afterMutation = restoreMigrationCutoverController(mutatedSnapshot, trustFor(mutatedSnapshot), registry, loader, evaluator);
    expect(afterMutation.state.ownedState.custom).toContainEqual({ x: 1 });
    expect(afterMutation.mutationHandlerRegistryDigest).toBe(registry.digest);
    const maliciousLoader = { load: () => ({ uri: artifactUri, bytes: new TextEncoder().encode('attacker module') }) };
    expect(() => createMigrationCutoverController({ corpusReport: report, initialRuntime: 'v1', ownedState: legacy().ownedState, publicCommands: legacy().publicCommands, mutationHandlerRegistry: registry, mutationHandlerLoader: maliciousLoader, mutationHandlerEvaluator: { evaluateVerifiedModule: () => ({ ...handler, reduceV2: () => ({ compromised: true }) }) } })).toThrow(/artifact.*bytes|digest/i);
  });

  test('removal consumes verified signed artifacts and persists an irreversible tombstone across restart', () => {
    const artifacts = {
      corpusReport: { digest: 'sha256:report', signature: 'sig:report' },
      controllerJournal: { digest: 'sha256:journal', signature: 'sig:journal', terminalPhase: 'cutover' },
      dogfoodProof: { digest: 'sha256:dogfood', signature: 'sig:dogfood', adopted: true },
    };
    const criteria = Object.fromEntries(['zeroUntriagedResiduals','fullCorpusEquivalent','shadowWindowPassed','canaryPassed','rollbackDrillPassed','publicCommandsPreserved','ownedStatePreserved','canonicalDogfoodV2Observed','rollbackRetentionSatisfied'].map(key => [key, true]));
    const verifier = { verify: (artifact: { digest: string; signature: string }) => artifact.signature === `sig:${artifact.digest.replace('sha256:', '')}`, deriveCriteria: () => ({ criteria, errors: [] }) };
    const decision = deriveLegacyRemovalDecision({ artifacts, verifier });
    expect(decision.removable).toBe(true);
    const tombstones = new Map<string, unknown>();
    const store = { putIfAbsent: (key: string, value: unknown) => { if (tombstones.has(key)) return false; tombstones.set(key, value); return true; }, get: (key: string) => tombstones.get(key) };
    const authorization = { signer: 'release-owner', decisionDigest: decision.digest, signature: `authorized:${decision.digest}` };
    const authorizationTrust = { verify: (value: typeof authorization) => value.signature === `authorized:${value.decisionDigest}` };
    expect(executeLegacyRemoval(decision, { legacyRuntimeDigest: 'sha256:v1', authorization, authorizationTrust, tombstoneStore: store }).status).toBe('removed');
    expect(() => executeLegacyRemoval(decision, { legacyRuntimeDigest: 'sha256:v1', authorization, authorizationTrust, tombstoneStore: store })).toThrow(/already|tombstone|irreversible/i);
    expect(() => executeLegacyRemoval({ ...decision, digest: 'sha256:forged' }, { legacyRuntimeDigest: 'sha256:v1', authorization, authorizationTrust, tombstoneStore: store })).toThrow(/decision|authorization|forged/i);
    expect(store.get('sha256:v1')).toBeDefined();
  });

  test('dogfood requires externally verified trusted-v2 identities plus process and canonical effect observations', () => {
    const proof = {
      schema: 'autonomy.dogfood-adoption-proof.v1', canonicalInstallation: 'self-driving', repository: 'open-autonomy',
      canonicalSourceDigest: 'sha256:source', organizationDigest: 'sha256:organization',
      desiredBundleDigest: 'sha256:bundle', runningBundleDigest: 'sha256:bundle', legacyBypassObserved: false,
      observations: [{ kind: 'process', signature: 'p', subjectBundleDigest: 'sha256:bundle', releaseDigest: 'sha256:release', instanceId: 'dogfood-1', compilerDigest: 'sha256:v2-compiler', runtimeDigest: 'sha256:v2-runtime' }, { kind: 'effect', command: '/agent status', canonical: true, signature: 'e', subjectBundleDigest: 'sha256:bundle', releaseDigest: 'sha256:release', instanceId: 'dogfood-1', compilerDigest: 'sha256:v2-compiler', runtimeDigest: 'sha256:v2-runtime' }],
      liveInstanceBinding: { instanceId: 'dogfood-1', bundleDigest: 'sha256:bundle', releaseDigest: 'sha256:release' },
    };
    const external = {
      canonical: { repository: 'open-autonomy', installation: 'self-driving', sourceDigest: 'sha256:source', organizationDigest: 'sha256:organization', expectedBundleDigest: 'sha256:bundle' },
      verifyR8LiveInstance: () => ({ valid: true, compilerDigest: 'sha256:v2-compiler', runtimeDigest: 'sha256:v2-runtime', releaseDigest: 'sha256:release', organizationDigest: 'sha256:organization' }),
      trustedV2: { compilerDigests: ['sha256:v2-compiler'], runtimeDigests: ['sha256:v2-runtime'] },
      verifyObservation: (observation: { signature: string }) => ({ valid: Boolean(observation.signature), errors: [] }),
    };
    expect(proveV2DogfoodAdoption(proof, external).adopted).toBe(true);
    expect(proveV2DogfoodAdoption({ ...proof, observations: proof.observations.filter((item) => item.kind !== 'process') }, external).adopted).toBe(false);
    expect(proveV2DogfoodAdoption({ ...proof, observations: proof.observations.filter((item) => item.kind !== 'effect') }, external).adopted).toBe(false);
    expect(proveV2DogfoodAdoption(proof, { ...external, trustedV2: { ...external.trustedV2, runtimeDigests: [] } }).adopted).toBe(false);
  });
});

describe('R9 adversarial review cycle 5: certified retained ABI and identity binding', () => {
  test('real-profile lowering refuses incomplete dispositions and unpinned assurance', async () => {
    const discovered = await discoverRealProfileMigrationCorpus({ repositoryRoot: '../../..', profilesDirectory: 'profiles' });
    const entry = discovered.entries.find((candidate) => candidate.id === 'self-driving')!;
    await expect(lowerDiscoveredProfileToV2(entry, { compiler: discovered.v2Compiler, assurancePolicy: discovered.assurancePolicy, dispositions: [] })).rejects.toThrow(/exactly one disposition/i);
    await expect(lowerDiscoveredProfileToV2(entry, { compiler: discovered.v2Compiler, assurancePolicy: { ...discovered.assurancePolicy, acceptedAssumptions: [] }, dispositions: discovered.dispositionsFor(entry) })).rejects.toThrow(/assurance policy/i);
  });

  test('compiler identity pins frontend, lowering, solver, catalog, and both substrate backends', async () => {
    const discovered = await discoverRealProfileMigrationCorpus({ repositoryRoot: '../../..', profilesDirectory: 'profiles' });
    const sources = Object.keys(discovered.v2Compiler.sourceDigests);
    for (const required of ['packages/core/src/ir.ts', 'packages/core/src/ir-yaml.ts', 'packages/core/src/organization-ir.ts', 'packages/core/src/organization-canonical.ts', 'packages/core/src/organization-component-catalog.ts', 'packages/core/src/organization-lowering.ts', 'packages/core/src/organization-migration-cutover.ts', 'packages/core/src/organization-solver.ts', 'packages/substrate-github/src/emit.ts', 'packages/substrate-local/src/emit.ts']) expect(sources).toContain(required);
    expect(discovered.v2Compiler.catalogDigest).toMatch(/^sha256:/);
    expect(discovered.v2Compiler.digest).toMatch(/^sha256:/);
  });

  test('compiler identity is closed over the explicit R9 dependency surface, not future core modules or tests', async () => {
    const discovered = await discoverRealProfileMigrationCorpus({ repositoryRoot: '../../..', profilesDirectory: 'profiles' });
    const locked = Object.keys(discovered.v2Compiler.sourceDigests).sort();

    expect(locked).toEqual([...R9_COMPILER_SOURCE_LOCK].sort());
    expect(locked).toContain('packages/core/src/organization-solver.ts');
    expect(locked).toContain('packages/core/src/organization-lowering.ts');
    expect(locked).toContain('packages/substrate-github/src/runtime/runner.ts');
    expect(locked).toContain('packages/substrate-local/src/runner-frontend.ts');
    expect(locked).not.toContain('packages/core/src/organization-runtime-ledger.ts');
    expect(locked.some((path) => path.endsWith('.test.ts'))).toBe(false);

    // Adding a future module to packages/core/src cannot affect discovery: the
    // identity is a pure function of these locked path/digest pairs plus the
    // separately pinned catalog, rather than a directory listing.
    const rediscovered = await discoverRealProfileMigrationCorpus({ repositoryRoot: '../../..', profilesDirectory: 'profiles' });
    expect(rediscovered.v2Compiler.sourceDigests).toEqual(discovered.v2Compiler.sourceDigests);
    expect(rediscovered.v2Compiler.digest).toBe(discovered.v2Compiler.digest);
  });

  test('shadow readiness is bound to independently pinned compiler and certificate execution evidence', async () => {
    const discovered = await discoverRealProfileMigrationCorpus({ repositoryRoot: '../../..', profilesDirectory: 'profiles' });
    const entry = discovered.entries.find((candidate) => candidate.id === 'self-driving')!;
    const expectedCompilerDigests = { v1: discovered.legacyCompiler.digest, v2: discovered.v2Compiler.digest };
    const good = await dualCompileMigrationCorpus([entry], { dispositions: discovered.dispositionsFor(entry), compileV1: discovered.compileV1, compileV2: discovered.compileV2, expectedCompilerDigests, executionVerifier: discovered.executionVerifier });
    good.assertReadyForShadow();
    expect(good.compilerProvenance.v2.digest).toBe(discovered.v2Compiler.digest);
    const substituted = await dualCompileMigrationCorpus([entry], { dispositions: discovered.dispositionsFor(entry), compileV1: discovered.compileV1, compileV2: async (value: typeof entry) => { const result = await discovered.compileV2(value) as any; result.compilerEvidence.compilerDigest = 'sha256:substituted'; result.compilerEvidence.certificateDigest = 'sha256:substituted-certificate'; return result; }, expectedCompilerDigests, executionVerifier: discovered.executionVerifier });
    expect(substituted.equivalent).toBe(false);
    expect(() => substituted.assertReadyForShadow()).toThrow(/provenance|residual/i);
    expect(substituted.digest).not.toBe(good.digest);
  });

  test('real differential probes command, nonempty state, and routing/review/effect behavior independently', async () => {
    const discovered = await discoverRealProfileMigrationCorpus({ repositoryRoot: '../../..', profilesDirectory: 'profiles' });
    const entry = discovered.entries.find((candidate) => candidate.id === 'self-driving')!;
    const v1 = await discovered.compileV1(entry) as any, v2 = await discovered.compileV2(entry) as any;
    expect(v1.ownedState).toEqual(v2.ownedState);
    expect(v1.ownedState.issues.length).toBeGreaterThan(1);
    expect(v1.behavior).toEqual(v2.behavior);
    expect(Object.values(v1.commandSurface).some((surface: any) => surface.agentRunnerCli.length > 0)).toBe(true);
    const report = await dualCompileMigrationCorpus([entry], { dispositions: discovered.dispositionsFor(entry), compileV1: discovered.compileV1, compileV2: async (value: typeof entry) => { const result = await discovered.compileV2(value) as any; const target = Object.keys(result.rawOutputs)[0]!; result.rawOutputs[target].generated['scripts/runner.ts'] = result.rawOutputs[target].generated['scripts/runner.ts'].replace("if (cmd === 'launch')", "if (cmd === 'removed-launch')"); return result; }, expectedCompilerDigests: { v1: discovered.legacyCompiler.digest, v2: discovered.v2Compiler.digest }, executionVerifier: discovered.executionVerifier });
    expect(report.equivalent).toBe(false);
    expect(report.profiles[0]?.observations.find((observation) => observation.id === 'command-surface')?.status).toBe('different');
  });

  test('removal requires the entire closed criterion set, not an aggregate verifier boolean', () => {
    const artifacts = { corpus: { digest: 'sha256:corpus', signature: 'valid' } };
    const verifier = { verify: () => true, deriveCriteria: () => ({ criteria: { zeroUntriagedResiduals: true }, errors: [] }) };
    const decision = deriveLegacyRemovalDecision({ artifacts, verifier });
    expect(decision.removable).toBe(false);
    expect(assessLegacyRemoval(decision.criteria).unmet.length).toBeGreaterThan(0);
    expect(() => deriveLegacyRemovalDecision({ artifacts, verifier: { ...verifier, deriveCriteria: () => ({ allSatisfied: true }) } })).toThrow(/closed criteria/i);
  });

  test('dogfood observations cannot be replayed from another bundle, release, instance, compiler, or runtime', () => {
    const binding = { instanceId: 'dogfood-1', bundleDigest: 'sha256:bundle', releaseDigest: 'sha256:release' };
    const identity = { subjectBundleDigest: binding.bundleDigest, releaseDigest: binding.releaseDigest, instanceId: binding.instanceId, compilerDigest: 'sha256:compiler', runtimeDigest: 'sha256:runtime' };
    const proof = { schema: 'autonomy.dogfood-adoption-proof.v1', canonicalInstallation: 'self-driving', repository: 'open-autonomy', canonicalSourceDigest: 'sha256:source', organizationDigest: 'sha256:organization', desiredBundleDigest: binding.bundleDigest, runningBundleDigest: binding.bundleDigest, legacyBypassObserved: false, liveInstanceBinding: binding, observations: [{ kind: 'process', signature: 'p', ...identity }, { kind: 'effect', command: '/agent status', canonical: true, signature: 'e', ...identity }] };
    const external = { canonical: { repository: 'open-autonomy', installation: 'self-driving', sourceDigest: 'sha256:source', organizationDigest: 'sha256:organization', expectedBundleDigest: binding.bundleDigest }, verifyR8LiveInstance: () => ({ valid: true, compilerDigest: identity.compilerDigest, runtimeDigest: identity.runtimeDigest, releaseDigest: identity.releaseDigest, organizationDigest: 'sha256:organization' }), trustedV2: { compilerDigests: [identity.compilerDigest], runtimeDigests: [identity.runtimeDigest] }, verifyObservation: () => ({ valid: true, errors: [] }) };
    expect(proveV2DogfoodAdoption(proof, external).adopted).toBe(true);
    for (const field of ['subjectBundleDigest', 'releaseDigest', 'instanceId', 'compilerDigest', 'runtimeDigest'] as const) {
      const forged = structuredClone(proof); (forged.observations[0] as any)[field] = `sha256:other-${field}`;
      expect(proveV2DogfoodAdoption(forged, external).adopted).toBe(false);
    }
    expect(proveV2DogfoodAdoption({ ...proof, canonicalSourceDigest: 'sha256:other-source' }, external).adopted).toBe(false);
    expect(proveV2DogfoodAdoption({ ...proof, organizationDigest: 'sha256:other-organization' }, external).adopted).toBe(false);
    expect(proveV2DogfoodAdoption({ ...proof, desiredBundleDigest: 'sha256:other-bundle', runningBundleDigest: 'sha256:other-bundle', liveInstanceBinding: { ...binding, bundleDigest: 'sha256:other-bundle' } }, external).adopted).toBe(false);
  });

  test('committed dogfood evidence verifies an externally observed emitted-runtime process and durable canonical effect', () => {
    const evidence = JSON.parse(readFileSync('docs/evidence/r9-repository-dogfood.json', 'utf8')) as any;
    const publicKey = readFileSync('docs/trust/r9-observer-public.pem', 'utf8');
    const envelope = structuredClone(evidence.deployment.envelope); envelope.bundle.bytes = Uint8Array.from(Buffer.from(envelope.bundle.bytesBase64, 'base64')); delete envelope.bundle.bytesBase64;
    const deploymentTrust = { requiredSigners: ['repository-r9-observer'], trustedSigners: { 'repository-r9-observer': { algorithms: ['Ed25519'], verify: (value: string, signature: string) => verifySignature(null, Buffer.from(value), publicKey, Buffer.from(signature, 'base64')) } }, rejectUnknownArtifacts: true, rejectSecrets: true };
    expect(verifyDeploymentBundle(envelope, deploymentTrust).valid).toBe(true);
    expect(verifyLiveDeploymentInstance(evidence.deployment.instance, evidence.deployment.release, envelope, deploymentTrust).valid).toBe(true);
    const verified = new Map(evidence.externalObservations.map((attestation: any) => {
      const bytes = Buffer.from(canonicalSemanticJson(attestation.statement));
      return [attestation.digest, attestation.digest === `sha256:${createHash('sha256').update(bytes).digest('hex')}` && verifySignature(null, bytes, publicKey, Buffer.from(attestation.signature, 'base64'))];
    }));
    const observations = evidence.externalObservations.map((attestation: any) => ({ ...attestation.statement, attestationDigest: attestation.digest }));
    const proof = { schema: 'autonomy.dogfood-adoption-proof.v1', canonicalInstallation: evidence.profile.id, repository: evidence.repository, canonicalSourceDigest: evidence.bindings.sourceDigest, organizationDigest: evidence.bindings.organizationDigest, desiredBundleDigest: evidence.bindings.bundleDigest, runningBundleDigest: evidence.bindings.bundleDigest, legacyBypassObserved: false, liveInstanceBinding: { bundleDigest: evidence.bindings.bundleDigest, releaseDigest: evidence.bindings.releaseDigest, instanceId: evidence.bindings.instanceId }, observations };
    const result = proveV2DogfoodAdoption(proof, { canonical: { repository: evidence.repository, installation: evidence.profile.id, sourceDigest: evidence.bindings.sourceDigest, organizationDigest: evidence.bindings.organizationDigest, expectedBundleDigest: evidence.bindings.bundleDigest }, trustedV2: { compilerDigests: [evidence.deployment.instance.compilerDigest], runtimeDigests: [evidence.bindings.runtimeDigest] }, verifyR8LiveInstance: () => { const checked = verifyLiveDeploymentInstance(evidence.deployment.instance, evidence.deployment.release, envelope, deploymentTrust); return { ...checked, organizationDigest: evidence.deployment.instance.organizationDigest, compilerDigest: evidence.deployment.instance.compilerDigest, runtimeDigest: evidence.bindings.runtimeDigest, releaseDigest: evidence.deployment.instance.releaseDigest }; }, verifyObservation: (observation: any) => ({ valid: verified.get(observation.attestationDigest) === true && observation.organizationDigest === evidence.bindings.organizationDigest, errors: [] }) });
    expect(result.adopted).toBe(true);
    expect(observations.some((value: any) => value.kind === 'process')).toBe(true);
    expect(observations.some((value: any) => value.kind === 'effect' && value.workId === 'r9-canonical-live-effect')).toBe(true);
    expect(evidence.cutover.checkpoint.state.activeRuntime).toBe('v2');
    const forged = structuredClone(evidence.cutover.canary); forged.statement.payload.fraction = 0.9; const forgedBytes = Buffer.from(canonicalSemanticJson(forged.statement)); forged.digest = `sha256:${createHash('sha256').update(forgedBytes).digest('hex')}`;
    expect(verifySignature(null, Buffer.from(forged.digest), publicKey, Buffer.from(forged.signature, 'base64'))).toBe(false);
  });
});
