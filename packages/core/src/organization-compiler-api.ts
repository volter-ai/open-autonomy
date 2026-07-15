import { canonicalSemanticJson, semanticDigest, type SemanticDigest } from './organization-canonical';
import type { CompilerDiagnostic, CompilerLevel, CompilerPassResult, PassObligation, PassSourceRelation } from './organization-compiler';
import { spawn } from 'node:child_process';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { executeOrganizationBuiltin, type OrganizationBuiltinId } from './organization-compiler-builtins';
import { parseArtifactRoot } from './organization-artifact';

export const COMPILER_API_VERSION = '1.0.0';
export const COMPILER_ARTIFACT_SCHEMA = 'autonomy.compiler-artifact.v1' as const;
export type CompilerOperation = 'parse'|'link'|'normalize'|'analyze'|'solve'|'lower'|'emit'|'lift'|'replay';
export type CompilerArtifactKind='source-text'|'organization'|'module-bundle'|'resolved-organization'|'normalized-organization'|'analysis-report'|'deployment-search'|'control-plan'|'execution-plan'|'native-plan'|'native-observation'|'portable-event-batch'|'causal-history'|'generic';
export type CompilerCapability = 'clock'|'filesystem-read'|'filesystem-write'|'network'|'process'|'secret';

export interface CompilerArtifact<T = unknown> {
  schema: string;
  apiVersion: typeof COMPILER_API_VERSION;
  operation: CompilerOperation;
  kind:CompilerArtifactKind;
  level: CompilerLevel;
  mediaType: string;
  producer: { id:string; version:string };
  inputs: SemanticDigest[];
  content: T;
  observations?:{diagnostics:CompilerDiagnostic[];sourceMap:PassSourceRelation[];obligations:PassObligation[]};
  digest: SemanticDigest;
}
/** Non-generic wire root used by the generated artifact protocol schema. */
export interface CompilerArtifactProtocol {
  schema:typeof COMPILER_ARTIFACT_SCHEMA;apiVersion:typeof COMPILER_API_VERSION;operation:CompilerOperation;kind:CompilerArtifactKind;level:CompilerLevel;mediaType:string;producer:{id:string;version:string};inputs:SemanticDigest[];content:unknown;observations?:{diagnostics:CompilerDiagnostic[];sourceMap:PassSourceRelation[];obligations:PassObligation[]};digest:SemanticDigest;
}
export interface CompilerResourceBudget { maxMilliseconds:number; maxMemoryBytes:number; maxInputBytes:number; maxOutputBytes:number; maxDiagnostics:number; maxPasses:number; maxParallelism:number }
export interface CompilerPassCapabilities { ambient: CompilerCapability[]; readableInputs:string[]; writableOutputs:string[] }
export interface StableCompilerPass<I=unknown,O=unknown> {
  id:string; version:string; operation:CompilerOperation; input:CompilerLevel; output:CompilerLevel;
  inputKind:CompilerArtifactKind;outputKind:CompilerArtifactKind;
  requires?:string[]; capabilities:CompilerPassCapabilities; configuration?:unknown;
  accounting?:{sourceObligations:string[];losses:string[]};
  /** Closed audited implementation id. Arbitrary callbacks are never accepted at this boundary. */
  implementation:'artifact.project'|'artifact.diagnostic'|OrganizationBuiltinId;
}
export interface StablePassContext { signal:AbortSignal; budget:Readonly<CompilerResourceBudget>; completedPasses:ReadonlySet<string>; emitDiagnostic(value:CompilerDiagnostic):void }
export interface AuthenticatedCacheEntry { artifact:CompilerArtifact; authentication:string }
export interface CompilerArtifactCache { get(key:string):Promise<AuthenticatedCacheEntry|undefined>|AuthenticatedCacheEntry|undefined; put(key:string,value:Readonly<AuthenticatedCacheEntry>):Promise<void>|void }
export interface StableCompilerRequest { input:CompilerArtifact; passes:StableCompilerPass[]; budget?:Partial<CompilerResourceBudget>; signal?:AbortSignal; cache?:CompilerArtifactCache; cacheAuthenticationKey?:string; redact?:string[]; onDiagnostic?:(value:Readonly<CompilerDiagnostic>)=>void }
export interface StableCompilerResult { artifact?:CompilerArtifact; diagnostics:CompilerDiagnostic[]; executed:string[]; cacheHits:string[]; cacheKeys:string[] }
export interface CompilerBuildNode { id:string; input:string; pass:StableCompilerPass }
export interface CompilerBuildRequest { inputs:Record<string,CompilerArtifact>; nodes:CompilerBuildNode[]; budget?:Partial<CompilerResourceBudget>; signal?:AbortSignal; cache?:CompilerArtifactCache;cacheAuthenticationKey?:string; redact?:string[]; onDiagnostic?:(node:string,value:Readonly<CompilerDiagnostic>)=>void }
export interface CompilerBuildResult { artifacts:Record<string,CompilerArtifact>; diagnostics:Array<{node:string;diagnostic:CompilerDiagnostic}>; executed:string[]; cacheHits:string[] }

const defaults:CompilerResourceBudget={maxMilliseconds:30_000,maxMemoryBytes:536_870_912,maxInputBytes:16_777_216,maxOutputBytes:16_777_216,maxDiagnostics:1_000,maxPasses:256,maxParallelism:8};

export function createCompilerArtifact<T>(operation:CompilerOperation, level:CompilerLevel, content:T, producer={id:'open-autonomy',version:COMPILER_API_VERSION}, inputs:SemanticDigest[]=[], observations?:CompilerArtifact['observations'],kind:CompilerArtifactKind='generic'):CompilerArtifact<T> {
  const body={schema:COMPILER_ARTIFACT_SCHEMA,apiVersion:COMPILER_API_VERSION,operation,kind,level,mediaType:'application/json',producer,inputs:structuredClone(inputs),content:structuredClone(content),...(observations?{observations:structuredClone(observations)}:{})};
  return deepFreeze({...body,digest:semanticDigest(body,'compiler-artifact-v1')}) as CompilerArtifact<T>;
}
export function verifyCompilerArtifact(value:CompilerArtifact):string[] {
  const errors:string[]=[];
  try{parseArtifactRoot(canonicalSemanticJson(value));}catch(error){errors.push(error instanceof Error?error.message:String(error));}
  if(value.schema!==COMPILER_ARTIFACT_SCHEMA) errors.push('unsupported compiler artifact schema');
  if(value.apiVersion!==COMPILER_API_VERSION) errors.push('unsupported compiler API version');
  const {digest,...body}=value;
  if(canonicalSemanticJson(semanticDigest(body,'compiler-artifact-v1'))!==canonicalSemanticJson(digest)) errors.push('compiler artifact digest mismatch');
  return errors;
}
export class MemoryCompilerArtifactCache implements CompilerArtifactCache {
  readonly #values=new Map<string,AuthenticatedCacheEntry>();
  get(key:string){const value=this.#values.get(key);return value?structuredClone(value):undefined;}
  put(key:string,value:Readonly<AuthenticatedCacheEntry>){this.#values.set(key,structuredClone(value) as AuthenticatedCacheEntry);}
  get size(){return this.#values.size;}
}

export async function runStableCompiler(request:StableCompilerRequest):Promise<StableCompilerResult>{
  const budget={...defaults,...request.budget}; const diagnostics:CompilerDiagnostic[]=[]; const executed:string[]=[]; const cacheHits:string[]=[]; const cacheKeys:string[]=[];let fatalObserved=false;
  const started=performance.now(); let current=structuredClone(request.input); const completed=new Set<string>();
  const emit=(diagnostic:CompilerDiagnostic)=>{if(diagnostic.severity==='error')fatalObserved=true;if(diagnostics.length>=budget.maxDiagnostics)return;const clean=sanitize(diagnostic,request.redact??[]);const frozen=deepFreeze(clean);diagnostics.push(frozen as CompilerDiagnostic);request.onDiagnostic?.(frozen);};
  const fail=(code:string,message:string,phase='compiler')=>emit({code,severity:'error',phase,message});
  if(Object.values(budget).some(value=>!Number.isSafeInteger(value)||value<=0)){fail('OA-API-INVALID-BUDGET','all compiler resource budgets must be positive safe integers');return {diagnostics,executed,cacheHits,cacheKeys};}
  if(verifyCompilerArtifact(current).length){fail('OA-API-INVALID-ARTIFACT',verifyCompilerArtifact(current).join('; '));return {diagnostics,executed,cacheHits,cacheKeys};}
  let declaredBytes:number;try{declaredBytes=bytes(request.passes);}catch(error){fail('OA-API-INVALID-PASS',error instanceof Error?error.message:String(error));return{diagnostics,executed,cacheHits,cacheKeys};}
  if(bytes(current)+declaredBytes>budget.maxInputBytes){fail('OA-API-INPUT-LIMIT',`artifact and pass declarations exceed ${budget.maxInputBytes} bytes`);return {diagnostics,executed,cacheHits,cacheKeys};}
  if(request.passes.length>budget.maxPasses){fail('OA-API-PASS-LIMIT',`pass count exceeds ${budget.maxPasses}`);return {diagnostics,executed,cacheHits,cacheKeys};}
  for(const pass of request.passes){
    if(request.signal?.aborted){fail('OA-API-CANCELLED','compilation cancelled',pass.id);break;}
    if(performance.now()-started>budget.maxMilliseconds){fail('OA-API-TIME-LIMIT',`time exceeds ${budget.maxMilliseconds}ms`,pass.id);break;}
    if(pass.input!==current.level||pass.inputKind!==current.kind){fail('OA-API-LEVEL-MISMATCH',`pass requires ${pass.input}/${pass.inputKind} but artifact is ${current.level}/${current.kind}`,pass.id);break;}
    const contract=validateStageContract(pass,current);if(contract){fail('OA-API-STAGE-CONTRACT',contract,pass.id);break;}
    const missing=(pass.requires??[]).filter(id=>!completed.has(id));if(missing.length){fail('OA-API-MISSING-PASS',`missing required passes: ${missing.sort().join(', ')}`,pass.id);break;}
    if(pass.capabilities.ambient.length){fail('OA-API-AMBIENT-AUTHORITY',`in-process pass requests ambient capabilities: ${pass.capabilities.ambient.sort().join(', ')}`,pass.id);break;}
    const key=semanticDigest({apiVersion:COMPILER_API_VERSION,pass:{id:pass.id,version:pass.version,operation:pass.operation,input:pass.input,output:pass.output,inputKind:pass.inputKind,outputKind:pass.outputKind,implementation:pass.implementation,configuration:pass.configuration??null,accounting:pass.accounting??null,capabilities:pass.capabilities},input:current.digest},'compiler-cache-key-v1').value;cacheKeys.push(key);
    const cached=await request.cache?.get(key);
    if(cached){const authenticated=request.cacheAuthenticationKey&&verifyCacheAuthentication(key,cached,request.cacheAuthenticationKey);const artifact=cached.artifact;const errors=verifyCompilerArtifact(artifact);const provenance=canonicalSemanticJson(artifact.inputs)===canonicalSemanticJson([current.digest])&&artifact.producer.id===pass.id&&artifact.producer.version===pass.version&&artifact.operation===pass.operation;if(!authenticated||errors.length||artifact.level!==pass.output||artifact.kind!==pass.outputKind||!provenance){fail('OA-API-CACHE-CORRUPT',!authenticated?'cache authentication failed':errors.join('; ')||'cached artifact provenance mismatch',pass.id);break;}for(const item of artifact.observations?.diagnostics??[])emit(item);current=structuredClone(artifact);cacheHits.push(pass.id);completed.add(pass.id);continue;}
    const controller=new AbortController();const relay=()=>controller.abort(request.signal?.reason);request.signal?.addEventListener('abort',relay,{once:true});
    const passDiagnostics:CompilerDiagnostic[]=[];
    let timedOut=false;let timeout:ReturnType<typeof setTimeout>|undefined;const remaining=Math.max(0,budget.maxMilliseconds-(performance.now()-started));timeout=setTimeout(()=>{timedOut=true;controller.abort('time limit');},remaining);
    let result:CompilerPassResult<unknown>;
    try{const immutable=deepFreeze(structuredClone(current));result=await executeBuiltin(pass,immutable,{signal:controller.signal,budget:deepFreeze({...budget}),completedPasses:readonlySet(completed),emitDiagnostic:value=>{passDiagnostics.push(sanitize(value,request.redact??[]));emit(value);}});}
    catch(error){result={diagnostics:[{code:timedOut?'OA-API-TIME-LIMIT':controller.signal.aborted?'OA-API-CANCELLED':'OA-API-PASS-THREW',severity:'error',phase:pass.id,message:error instanceof Error?error.message:String(error)}]};}
    finally{clearTimeout(timeout);request.signal?.removeEventListener('abort',relay);}
    if(controller.signal.aborted&&!(result.diagnostics??[]).some(item=>item.severity==='error'))result={diagnostics:[{code:timedOut?'OA-API-TIME-LIMIT':'OA-API-CANCELLED',severity:'error',phase:pass.id,message:timedOut?'compiler time limit exceeded':'compilation cancelled'}]};
    for(const item of result.diagnostics??[]){passDiagnostics.push(sanitize(item,request.redact??[]));emit(item);}if(fatalObserved||result.output===undefined)break;
    const declaredAccounting:PassObligation[]=[...(pass.accounting?.sourceObligations??[]).map((claim,index)=>({id:`${pass.id}:source:${index}`,claim,status:'created' as const,evidence:'stable-pass-accounting'})),...(pass.accounting?.losses??[]).map((claim,index)=>({id:`${pass.id}:loss:${index}`,claim:`declared loss: ${claim}`,status:'created' as const,evidence:'stable-pass-accounting'}))];
    const next=createCompilerArtifact(pass.operation,pass.output,result.output,{id:pass.id,version:pass.version},[current.digest],{diagnostics:passDiagnostics,sourceMap:result.sourceMap??[],obligations:[...(result.obligations??[]),...declaredAccounting]},pass.outputKind);
    if(bytes(next)>budget.maxOutputBytes){fail('OA-API-OUTPUT-LIMIT',`output exceeds ${budget.maxOutputBytes} bytes`,pass.id);break;}
    current=next;executed.push(pass.id);completed.add(pass.id);if(request.cache){if(!request.cacheAuthenticationKey){fail('OA-API-CACHE-KEY-REQUIRED','cache authentication key is required',pass.id);break;}await request.cache.put(key,{artifact:current,authentication:cacheAuthentication(key,current,request.cacheAuthenticationKey)});}
  }
  return {artifact:fatalObserved?undefined:deepFreeze(structuredClone(current)) as CompilerArtifact,diagnostics:[...diagnostics],executed,cacheHits,cacheKeys};
}

/** Deterministic artifact DAG scheduler. Ready nodes and merged observations are ordered by stable node id, never completion time. */
export async function runCompilerBuild(request:CompilerBuildRequest):Promise<CompilerBuildResult>{
  const budget={...defaults,...request.budget};const artifacts=structuredClone(request.inputs);const pending=new Map(request.nodes.map(node=>[node.id,node]));const diagnostics:CompilerBuildResult['diagnostics']=[];const executed:string[]=[];const cacheHits:string[]=[];
  if(Object.values(budget).some(value=>!Number.isSafeInteger(value)||value<=0))return{artifacts:{},diagnostics:[{node:'compiler',diagnostic:{code:'OA-API-INVALID-BUDGET',severity:'error',phase:'compiler',message:'all compiler resource budgets must be positive safe integers'}}],executed,cacheHits};
  if(pending.size!==request.nodes.length)throw new Error('duplicate compiler build node id');
  while(pending.size){
    const ready=[...pending.values()].filter(node=>artifacts[node.input]).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
    if(!ready.length){diagnostics.push({node:'compiler',diagnostic:{code:'OA-API-DAG-BLOCKED',severity:'error',phase:'compiler',message:`unresolved build inputs: ${[...pending.values()].map(n=>`${n.id}<-${n.input}`).sort().join(', ')}`}});break;}
    for(let offset=0;offset<ready.length;offset+=budget.maxParallelism){
      const batch=ready.slice(offset,offset+budget.maxParallelism);
      const results=await Promise.all(batch.map(async node=>({node,result:await runStableCompiler({input:artifacts[node.input]!,passes:[node.pass],budget,signal:request.signal,cache:request.cache,cacheAuthenticationKey:request.cacheAuthenticationKey,redact:request.redact,onDiagnostic:value=>request.onDiagnostic?.(node.id,value)})})));
      for(const {node,result} of results.sort((a,b)=>a.node.id<b.node.id?-1:1)){
        pending.delete(node.id);for(const diagnostic of result.diagnostics)diagnostics.push({node:node.id,diagnostic});
        if(result.artifact)artifacts[node.id]=result.artifact;executed.push(...result.executed.map(id=>`${node.id}:${id}`));cacheHits.push(...result.cacheHits.map(id=>`${node.id}:${id}`));
      }
    }
  }
  return{artifacts:Object.fromEntries(Object.entries(artifacts).sort(([a],[b])=>a<b?-1:a>b?1:0)),diagnostics,executed,cacheHits};
}

export interface IsolatedPluginRequest { plugin:{id:string;version:string;executable:string}; artifact:CompilerArtifact; capabilities:CompilerPassCapabilities; budget:CompilerResourceBudget }
export interface IsolatedPluginExecutor { execute(request:Readonly<IsolatedPluginRequest>,signal?:AbortSignal):Promise<CompilerPassResult<unknown>> }
export async function runIsolatedPlugin(request:IsolatedPluginRequest,executor:IsolatedPluginExecutor,signal?:AbortSignal):Promise<CompilerPassResult<unknown>>{
  if(verifyCompilerArtifact(request.artifact).length)return{diagnostics:[{code:'OA-PLUGIN-INVALID-ARTIFACT',severity:'error',phase:request.plugin.id,message:'invalid input artifact'}]};
  if(request.capabilities.ambient.includes('secret'))return{diagnostics:[{code:'OA-PLUGIN-SECRET-DENIED',severity:'error',phase:request.plugin.id,message:'plugins cannot receive deployment secrets'}]};
  return executor.execute(deepFreeze(structuredClone(request)),signal);
}
export function bubblewrapArguments(request:IsolatedPluginRequest):string[]{
  const args=['--die-with-parent','--new-session','--unshare-all','--clearenv','--ro-bind',request.plugin.executable,'/plugin','--proc','/proc','--dev','/dev'];
  for(const path of [...request.capabilities.readableInputs].sort())args.push('--ro-bind',path,path);
  for(const path of [...request.capabilities.writableOutputs].sort())args.push('--bind',path,path);
  if(request.capabilities.ambient.includes('network'))args.push('--share-net');
  return [...args,'/plugin'];
}
export class BubblewrapPluginExecutor implements IsolatedPluginExecutor {
  async execute(request:Readonly<IsolatedPluginRequest>,signal?:AbortSignal):Promise<CompilerPassResult<unknown>>{
    return new Promise(resolve=>{
      const child=spawn('prlimit',[`--as=${request.budget.maxMemoryBytes}`,`--cpu=${Math.max(1,Math.ceil(request.budget.maxMilliseconds/1000))}`,'--','bwrap',...bubblewrapArguments(request as IsolatedPluginRequest)],{env:{PATH:'/usr/bin:/bin'},stdio:['pipe','pipe','pipe']});let stdout='';let stderr='';let settled=false;
      const finish=(result:CompilerPassResult<unknown>)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);resolve(result);};
      const cancel=()=>{child.kill('SIGKILL');finish({diagnostics:[{code:'OA-PLUGIN-CANCELLED',severity:'error',phase:request.plugin.id,message:'isolated plugin cancelled'}]});};
      signal?.addEventListener('abort',cancel,{once:true});
      const timer=setTimeout(()=>{child.kill('SIGKILL');finish({diagnostics:[{code:'OA-PLUGIN-TIME-LIMIT',severity:'error',phase:request.plugin.id,message:`isolated plugin exceeded ${request.budget.maxMilliseconds}ms`}]});},request.budget.maxMilliseconds);
      child.stdout.on('data',(chunk:Buffer)=>{stdout+=chunk.toString();if(Buffer.byteLength(stdout)>request.budget.maxOutputBytes){child.kill('SIGKILL');finish({diagnostics:[{code:'OA-PLUGIN-OUTPUT-LIMIT',severity:'error',phase:request.plugin.id,message:'isolated plugin output limit exceeded'}]});}});
      child.stderr.on('data',(chunk:Buffer)=>{if(Buffer.byteLength(stderr)<4096)stderr+=chunk.toString();});
      child.on('error',error=>finish({diagnostics:[{code:'OA-PLUGIN-ISOLATION-FAILED',severity:'error',phase:request.plugin.id,message:error.message}]}));
      child.on('close',code=>{if(settled)return;if(code!==0)return finish({diagnostics:[{code:'OA-PLUGIN-FAILED',severity:'error',phase:request.plugin.id,message:`isolated plugin exited ${code}: ${stderr.slice(0,512)}`} ]});try{finish(JSON.parse(stdout) as CompilerPassResult<unknown>);}catch{finish({diagnostics:[{code:'OA-PLUGIN-PROTOCOL',severity:'error',phase:request.plugin.id,message:'isolated plugin returned invalid JSON'}]});}});
      child.stdin.end(canonicalSemanticJson({schema:'autonomy.plugin-request.v1',artifact:request.artifact,budget:request.budget}));
    });
  }
}
async function executeBuiltin(pass:StableCompilerPass,input:Readonly<CompilerArtifact>,context:StablePassContext):Promise<CompilerPassResult<unknown>>{
  const config=(pass.configuration??{}) as Record<string,unknown>;
  if(pass.implementation==='artifact.project'){
    const delay=typeof config.delayMilliseconds==='number'?config.delayMilliseconds:0;
    if(delay>0)await new Promise<void>((resolve,reject)=>{const timer=setTimeout(resolve,delay);context.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('cancelled'));},{once:true});});
    if(context.signal.aborted)throw new Error('cancelled');
    const set=isRecord(config.set)?config.set:{};return{output:{...(isRecord(input.content)?input.content:{}),...structuredClone(set)}};
  }
  if(pass.implementation==='artifact.diagnostic'){
    for(const value of Array.isArray(config.stream)?config.stream:[])context.emitDiagnostic(value as CompilerDiagnostic);
    return{output:structuredClone(config.output),diagnostics:structuredClone(Array.isArray(config.diagnostics)?config.diagnostics:[]) as CompilerDiagnostic[]};
  }
  if(pass.implementation.startsWith('organization.'))return executeOrganizationBuiltin(pass.implementation as OrganizationBuiltinId,input,config,context);
  throw new Error(`unknown audited compiler implementation '${String((pass as {implementation?:unknown}).implementation)}'`);
}
function cacheAuthentication(key:string,artifact:CompilerArtifact,secret:string):string{return createHmac('sha256',secret).update(canonicalSemanticJson({key,digest:artifact.digest})).digest('hex');}
function verifyCacheAuthentication(key:string,entry:AuthenticatedCacheEntry,secret:string):boolean{const expected=cacheAuthentication(key,entry.artifact,secret);try{return timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(entry.authentication,'hex'));}catch{return false;}}
function bytes(value:unknown){return Buffer.byteLength(canonicalSemanticJson(value));}
function sanitize(value:CompilerDiagnostic,secrets:string[]):CompilerDiagnostic{const text=(input:string)=>secrets.filter(Boolean).reduce((out,s)=>out.split(s).join('[REDACTED]'),input).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u001B]/g,c=>`\\u${c.charCodeAt(0).toString(16).padStart(4,'0')}`);return{...structuredClone(value),message:text(value.message),related:value.related?.map(x=>({...x,message:text(x.message)}))};}
function readonlySet<T>(source:Set<T>):ReadonlySet<T>{const values=[...source];return Object.freeze({get size(){return values.length;},has:(v:T)=>source.has(v),entries:()=>source.entries(),keys:()=>source.keys(),values:()=>source.values(),[Symbol.iterator]:()=>source[Symbol.iterator](),forEach:(cb:(value:T,value2:T,set:ReadonlySet<T>)=>void,thisArg?:unknown)=>source.forEach(v=>cb.call(thisArg,v,v,readonlySet(source))) });}
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value);}
function validateStageContract(pass:StableCompilerPass,input:CompilerArtifact):string|undefined{
  if(pass.implementation==='artifact.project'||pass.implementation==='artifact.diagnostic')return pass.operation===input.operation&&pass.input===pass.output&&pass.inputKind===pass.outputKind?undefined:'generic artifact built-ins must preserve operation, level, and kind';
  const fixed:Partial<Record<OrganizationBuiltinId,[CompilerOperation,CompilerLevel,CompilerLevel,CompilerArtifactKind,CompilerArtifactKind]>>={
    'organization.parse':['parse','source','source','source-text','organization'],'organization.link':['link','source','resolved','module-bundle','resolved-organization'],'organization.normalize':['normalize','resolved','normalized','resolved-organization','normalized-organization'],'organization.analyze':['analyze','normalized','normalized','normalized-organization','analysis-report'],'organization.solve':['solve','normalized','control','normalized-organization','deployment-search'],'organization.emit':['emit','execution','native','execution-plan','native-plan'],'organization.lift':['lift','native','control','native-observation','portable-event-batch'],'organization.replay':['replay','control','control','portable-event-batch','causal-history'],
  };
  let expected=fixed[pass.implementation as OrganizationBuiltinId];
  if(pass.implementation==='organization.lower')expected=String((pass.configuration as any)?.phase)==='organization-to-control'?['lower','control','control','deployment-search','control-plan']:String((pass.configuration as any)?.phase)==='control-to-execution'?['lower','control','execution','control-plan','execution-plan']:['lower','execution','native','execution-plan','native-plan'];
  return expected&&pass.operation===expected[0]&&pass.input===expected[1]&&pass.output===expected[2]&&pass.inputKind===expected[3]&&pass.outputKind===expected[4]?undefined:`${pass.implementation} requires ${expected?.join('/')??'a registered stage contract'}`;
}
function deepFreeze<T>(value:T):Readonly<T>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value as Record<string,unknown>))deepFreeze(child);}return value;}
