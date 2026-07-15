import {describe,expect,test} from 'bun:test';
import {BubblewrapPluginExecutor,bubblewrapArguments,COMPILER_API_VERSION,createCompilerArtifact,MemoryCompilerArtifactCache,runCompilerBuild,runIsolatedPlugin,runStableCompiler,type CompilerResourceBudget,type StableCompilerPass} from './organization-compiler-api';
import {canonicalSemanticJson,semanticDigest} from './organization-canonical';
import {parseArtifactRoot} from './organization-artifact';
import {spawnSync} from 'node:child_process';
import golden from '../../../docs/compiler/golden-artifact-v1.json' with {type:'json'};
import {deriveAtomicObligations} from './organization-solver';

const capability={ambient:[] as const,readableInputs:[],writableOutputs:[]};
const pass=(id:string,configuration:unknown=null,delay=0):StableCompilerPass=>({id,version:'1.0.0',operation:'parse',input:'source',output:'source',inputKind:'generic',outputKind:'generic',capabilities:{...capability,ambient:[]},implementation:'artifact.project',configuration:{user:configuration,set:{[id]:true},delayMilliseconds:delay}});
const cacheKey='test-cache-authentication-key';
const budget:CompilerResourceBudget={maxMilliseconds:100,maxMemoryBytes:64_000_000,maxInputBytes:10000,maxOutputBytes:10000,maxDiagnostics:10,maxPasses:10,maxParallelism:2};

describe('R5 stable compiler artifact protocol',()=>{
  test('pins API, seals immutable artifacts, and rejects forged cache values',async()=>{
    expect(COMPILER_API_VERSION).toBe('1.0.0');const input=createCompilerArtifact('parse','source',{value:1});expect(Object.isFrozen(input)).toBe(true);
    const cache=new MemoryCompilerArtifactCache();const first=await runStableCompiler({input,passes:[pass('one')],cache,cacheAuthenticationKey:cacheKey});expect(first.diagnostics).toEqual([]);expect(first.executed).toEqual(['one']);
    const second=await runStableCompiler({input,passes:[pass('one')],cache,cacheAuthenticationKey:cacheKey});expect(second.cacheHits).toEqual(['one']);expect(canonicalSemanticJson(second.artifact)).toBe(canonicalSemanticJson(first.artifact));
    const corrupt={artifact:{...first.artifact!,content:{changed:true}},authentication:'00'};const hostile={get(){return corrupt;},put(){}};expect((await runStableCompiler({input,passes:[pass('one')],cache:hostile,cacheAuthenticationKey:cacheKey})).diagnostics[0]?.code).toBe('OA-API-CACHE-CORRUPT');
  });
  test('publishes every stage operation through one schema-validated envelope and equivalent CLI',()=>{
    for(const operation of ['parse','link','normalize','analyze','solve','lower','emit','lift','replay'] as const){const artifact=createCompilerArtifact(operation,'source',{operation});expect(parseArtifactRoot(JSON.stringify(artifact)).schema).toBe('autonomy.compiler-artifact.v1');}
    const expected=createCompilerArtifact('parse','source',{hello:'world'});expect(canonicalSemanticJson(expected)).toBe(canonicalSemanticJson(golden));const cli=spawnSync('bun',['bin/organization-compiler-api.ts'],{input:JSON.stringify({operation:'wrap',stage:'parse',level:'source',content:{hello:'world'}}),encoding:'utf8'});expect(cli.status).toBe(0);expect(JSON.parse(cli.stdout).artifact).toEqual(expected);
  });
  test('wire verification rejects digest-valid artifacts outside the generated closed schema',()=>{const valid=createCompilerArtifact('parse','source',{});const {digest:_,...base}=valid;const body={...base,operation:'evil',mediaType:'garbage',producer:{id:'',version:''}};const hostile={...body,digest:semanticDigest(body,'compiler-artifact-v1')} as any;const cli=spawnSync('bun',['bin/organization-compiler-api.ts'],{input:JSON.stringify({operation:'verify',artifact:hostile}),encoding:'utf8'});expect(cli.status).toBe(1);});
  test('executes substantive parse, link, and normalize built-ins with enforced stage transitions',async()=>{
    const source=JSON.stringify({schema:'autonomy.organization.v2',name:'builtins',behaviors:{work:{kind:'prompt',inline:'root#not-a-reference/value'}},actors:{worker:{kind:'agent',behaviors:['work']}}});
    const parsePass:StableCompilerPass={id:'parse',version:'1',operation:'parse',input:'source',output:'source',inputKind:'source-text',outputKind:'organization',capabilities:{...capability,ambient:[]},implementation:'organization.parse'};
    const parsed=await runStableCompiler({input:createCompilerArtifact('parse','source',source,undefined,[],undefined,'source-text'),passes:[parsePass]});expect(parsed.artifact?.content).toMatchObject({name:'builtins'});
    const root={moduleId:'root',location:'mem:/root',organization:parsed.artifact!.content};const linkPass:StableCompilerPass={id:'link',version:'1',operation:'link',input:'source',output:'resolved',inputKind:'module-bundle',outputKind:'resolved-organization',capabilities:{...capability,ambient:[]},implementation:'organization.link'};
    const linked=await runStableCompiler({input:createCompilerArtifact('link','source',{root,modules:{}},undefined,[],undefined,'module-bundle'),passes:[linkPass]});expect((linked.artifact?.content as any).root).toBe('root');
    const normalizePass:StableCompilerPass={id:'normalize',version:'1',operation:'normalize',input:'resolved',output:'normalized',inputKind:'resolved-organization',outputKind:'normalized-organization',capabilities:{...capability,ambient:[]},implementation:'organization.normalize'};const normalized=await runStableCompiler({input:linked.artifact!,passes:[normalizePass]});expect((normalized.artifact?.content as any).schema).toBe('autonomy.normalized-organization.v1');
    const analyzePass:StableCompilerPass={id:'analyze',version:'1',operation:'analyze',input:'normalized',output:'normalized',inputKind:'normalized-organization',outputKind:'analysis-report',capabilities:{...capability,ambient:[]},implementation:'organization.analyze',configuration:{environment:{bounds:{maximumStates:10,maximumDepth:5},closedWorld:[]}}};const analyzed=await runStableCompiler({input:normalized.artifact!,passes:[analyzePass]});expect(Array.isArray(analyzed.artifact?.content)).toBe(true);
    const solvePass:StableCompilerPass={id:'solve',version:'1',operation:'solve',input:'normalized',output:'control',inputKind:'normalized-organization',outputKind:'deployment-search',capabilities:{...capability,ambient:[]},implementation:'organization.solve',configuration:{}};expect((await runStableCompiler({input:analyzed.artifact!,passes:[solvePass]})).diagnostics[0]?.code).toBe('OA-API-LEVEL-MISMATCH');
    const solved=await runStableCompiler({input:normalized.artifact!,passes:[{...solvePass,configuration:{manifests:{},adapters:{},policy:{minimum:{low:'asserted',medium:'asserted',high:'asserted',critical:'asserted'},allowApproximation:false,acceptedAssumptions:[]},domain:{completeness:'finite-exhaustive',maxCandidates:10}}}]});expect((solved.artifact?.content as any).organization.behaviors.work.inline).toBe('root#not-a-reference/value');expect((solved.artifact?.content as any).organization.actors.worker.behaviors).toEqual(['work']);
    const organization=parsed.artifact!.content as any;const obligations=deriveAtomicObligations(organization);const candidate={composition:{instances:{},adapters:[],authorities:{}},ledger:{obligations,witnesses:[],unresolved:[]},objective:{approximations:0,assumptions:0,preferencePenalty:0,unknownEconomics:0,estimatedCost:0,estimatedLatency:0,negativeCapacity:0,providerCount:0,key:''}};const search=createCompilerArtifact('solve','control',{organization,search:{candidates:[candidate]}},undefined,[],undefined,'deployment-search');const lowerPass:StableCompilerPass={id:'lower',version:'1',operation:'lower',input:'control',output:'control',inputKind:'deployment-search',outputKind:'control-plan',capabilities:{...capability,ambient:[]},implementation:'organization.lower',configuration:{phase:'organization-to-control'}};const lowered=await runStableCompiler({input:search,passes:[lowerPass]});expect(lowered.diagnostics).toEqual([]);expect((lowered.artifact?.content as any).control.schema).toBe('autonomy.control.v1');
    expect((await runStableCompiler({input:linked.artifact!,passes:[{...normalizePass,output:'native'}]})).diagnostics[0]?.code).toBe('OA-API-STAGE-CONTRACT');
    const cli=spawnSync('bun',['bin/organization-compiler-api.ts'],{input:JSON.stringify({operation:'execute',artifact:createCompilerArtifact('parse','source',source,undefined,[],undefined,'source-text'),pass:parsePass}),encoding:'utf8'});expect(cli.status).toBe(0);expect(JSON.parse(cli.stdout).artifact.content.name).toBe('builtins');
  });
  test('makes clean, incremental, and warm-cache builds equivalent while version/config alter keys',async()=>{
    const input=createCompilerArtifact('parse','source',{value:1});const cache=new MemoryCompilerArtifactCache();const clean=await runStableCompiler({input,passes:[pass('one',{mode:1})]});const incremental=await runStableCompiler({input,passes:[pass('one',{mode:1})],cache,cacheAuthenticationKey:cacheKey});const warm=await runStableCompiler({input,passes:[pass('one',{mode:1})],cache,cacheAuthenticationKey:cacheKey});
    expect(canonicalSemanticJson(clean.artifact)).toBe(canonicalSemanticJson(incremental.artifact));expect(canonicalSemanticJson(warm.artifact)).toBe(canonicalSemanticJson(clean.artifact));expect(warm.cacheHits).toEqual(['one']);
    const changed=await runStableCompiler({input,passes:[pass('one',{mode:2})]});expect(changed.cacheKeys).not.toEqual(clean.cacheKeys);
  });
  test('schedules artifact DAG branches deterministically across serial and parallel delay order',async()=>{
    const input=createCompilerArtifact('parse','source',{value:1});
    const nodes=[{id:'z',input:'root',pass:pass('z',null,1)},{id:'a',input:'root',pass:pass('a',null,15)},{id:'child',input:'a',pass:pass('child')}];
    const serial=await runCompilerBuild({inputs:{root:input},nodes,budget:{maxParallelism:1}});const parallel=await runCompilerBuild({inputs:{root:input},nodes,budget:{maxParallelism:8}});
    expect(canonicalSemanticJson(serial.artifacts)).toBe(canonicalSemanticJson(parallel.artifacts));expect(serial.diagnostics).toEqual(parallel.diagnostics);expect(Object.keys(parallel.artifacts)).toEqual(['a','child','root','z']);
  });
  test('rejects invalid DAG budgets before scheduling',async()=>{const result=await runCompilerBuild({inputs:{root:createCompilerArtifact('parse','source',{})},nodes:[{id:'x',input:'root',pass:pass('x')}],budget:{maxParallelism:0}});expect(result.diagnostics[0]?.diagnostic.code).toBe('OA-API-INVALID-BUDGET');});
  test('streams already bounded, escaped, and redacted diagnostics',async()=>{
    const seen:any[]=[];const noisy:StableCompilerPass={...pass('noisy'),implementation:'artifact.diagnostic',configuration:{stream:[{code:'X',severity:'warning',phase:'noisy',message:'secret\u001b'}],output:{ok:true},diagnostics:[{code:'Y',severity:'warning',phase:'noisy',message:'extra'}]}};
    const result=await runStableCompiler({input:createCompilerArtifact('parse','source',{}),passes:[noisy],budget:{maxDiagnostics:1},redact:['secret'],onDiagnostic:d=>seen.push(d)});expect(seen).toHaveLength(1);expect(seen[0].message).toBe('[REDACTED]\\u001b');expect(result.diagnostics).toHaveLength(1);expect(canonicalSemanticJson(result.artifact)).not.toContain('secret');
  });
  test('diagnostic transcript bounds never suppress fatal control state or cache output',async()=>{
    const fatal:StableCompilerPass={...pass('fatal'),implementation:'artifact.diagnostic',configuration:{stream:[{code:'W',severity:'warning',phase:'fatal',message:'first'}],output:{accepted:true},diagnostics:[{code:'E',severity:'error',phase:'fatal',message:'must fail'}]}};const cache=new MemoryCompilerArtifactCache();const result=await runStableCompiler({input:createCompilerArtifact('parse','source',{}),passes:[fatal],budget:{maxDiagnostics:1},cache,cacheAuthenticationKey:cacheKey});expect(result.artifact).toBeUndefined();expect(result.diagnostics).toHaveLength(1);expect(cache.size).toBe(0);
  });
  test('enforces cancellation, byte limits, pass limits, and denies ambient in-process authority',async()=>{
    const input=createCompilerArtifact('parse','source',{});const controller=new AbortController();controller.abort();expect((await runStableCompiler({input,passes:[pass('x')],signal:controller.signal})).diagnostics[0]?.code).toBe('OA-API-CANCELLED');
    expect((await runStableCompiler({input,passes:[pass('slow',null,50)],budget:{maxMilliseconds:5}})).diagnostics[0]?.code).toBe('OA-API-TIME-LIMIT');
    expect((await runStableCompiler({input,passes:[pass('x')],budget:{maxInputBytes:1}})).diagnostics[0]?.code).toBe('OA-API-INPUT-LIMIT');
    expect((await runStableCompiler({input,passes:[pass('x')],budget:{maxParallelism:0}})).diagnostics[0]?.code).toBe('OA-API-INVALID-BUDGET');
    const ambient={...pass('ambient'),capabilities:{...capability,ambient:['filesystem-read' as const]}};expect((await runStableCompiler({input,passes:[ambient]})).diagnostics[0]?.code).toBe('OA-API-AMBIENT-AUTHORITY');
  });
  test('arbitrary in-process callbacks are outside the closed built-in boundary',async()=>{
    const input=createCompilerArtifact('parse','source',{nested:{value:1}});const forged={...pass('forged'),implementation:'caller.javascript',run(){return{output:{secret:process.env.R5_AMBIENT}};}} as unknown as StableCompilerPass;expect((await runStableCompiler({input,passes:[forged]})).diagnostics[0]?.code).toBe('OA-API-INVALID-PASS');expect((input.content as any).nested.value).toBe(1);
  });
  test('isolated plugin boundary denies secrets and constructs a closed bubblewrap namespace',async()=>{
    const request={plugin:{id:'hostile',version:'1',executable:'/tmp/plugin'},artifact:createCompilerArtifact('parse','source',{}),capabilities:{ambient:[],readableInputs:['/tmp/in'],writableOutputs:['/tmp/out']},budget};
    let invoked=false;const executor={async execute(){invoked=true;return{output:{ok:true}};}};expect((await runIsolatedPlugin({...request,capabilities:{...request.capabilities,ambient:['secret'] as const}},executor)).diagnostics?.[0]?.code).toBe('OA-PLUGIN-SECRET-DENIED');expect(invoked).toBe(false);
    const args=bubblewrapArguments(request);expect(args).toContain('--unshare-all');expect(args).toContain('--clearenv');expect(args).not.toContain('--share-net');expect(args).toContain('--ro-bind');
  });
  test('hostile native plugin cannot observe secret, host files, network, or external executables',async()=>{
    const executable=`/tmp/oa-hostile-plugin-${process.pid}`;const compile=spawnSync('gcc',['-static','-O2','docs/compiler/fixtures/hostile-plugin.c','-o',executable]);expect(compile.status).toBe(0);
    const request={plugin:{id:'hostile-live',version:'1',executable},artifact:createCompilerArtifact('parse','source',{}),capabilities:{ambient:[],readableInputs:[],writableOutputs:[]},budget};
    const prior=process.env.OA_DEPLOYMENT_SECRET;process.env.OA_DEPLOYMENT_SECRET='must-not-cross-boundary';
    try{const result=await runIsolatedPlugin(request,new BubblewrapPluginExecutor());expect(result.diagnostics??[]).toEqual([]);expect(result.output).toEqual({environment:false,filesystem:false,network:false,externalProcess:false});}finally{if(prior===undefined)delete process.env.OA_DEPLOYMENT_SECRET;else process.env.OA_DEPLOYMENT_SECRET=prior;spawnSync('rm',['-f',executable]);}
  });
  test('isolated plugin memory and noncooperative wall time are kernel bounded',async()=>{
    const executable=`/tmp/oa-resource-plugin-${process.pid}`;const infinite=`${executable}-infinite`;expect(spawnSync('gcc',['-static','-O2','docs/compiler/fixtures/resource-plugin.c','-o',executable]).status).toBe(0);expect(spawnSync('gcc',['-static','-O2','-DINFINITE','docs/compiler/fixtures/resource-plugin.c','-o',infinite]).status).toBe(0);
    const base={plugin:{id:'resource-live',version:'1',executable},artifact:createCompilerArtifact('parse','source',{}),capabilities:{ambient:[],readableInputs:[],writableOutputs:[]},budget:{...budget,maxMemoryBytes:16_000_000,maxMilliseconds:100}};
    try{expect((await runIsolatedPlugin(base,new BubblewrapPluginExecutor())).output).toEqual({memoryDenied:true});const result=await runIsolatedPlugin({...base,plugin:{...base.plugin,executable:infinite},budget:{...base.budget,maxMilliseconds:25}},new BubblewrapPluginExecutor());expect(result.diagnostics?.[0]?.code).toBe('OA-PLUGIN-TIME-LIMIT');
    }finally{spawnSync('rm',['-f',executable,infinite]);}
  });
});
