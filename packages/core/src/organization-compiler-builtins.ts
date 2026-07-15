import type {CompilerPassResult} from './organization-compiler';
import type {CompilerArtifact,StablePassContext} from './organization-compiler-api';
import {parseOrganizationIr} from './organization-ir-yaml';
import {resolveOrganizationModules,type LoadedOrganizationModule,type OrganizationModuleLoader,type ResolvedModuleGraph} from './organization-modules';
import {normalizeOrganization} from './organization-normalize';
import {analyzeOrganization,type AnalysisEnvironment} from './organization-analysis';
import {solveDeploymentV2,type AssurancePolicy,type SearchDomain} from './organization-solver';
import type {AdapterContract,ComponentManifestV2} from './organization-component';
import {emitExecutableArtifact,lowerControlToExecution,lowerExecutionToV1,lowerOrganizationToControl,type ExecutionLoweringOptions,type FixedPointLoweringResult,type V1ExecutionLoweringOptions} from './organization-lowering';
import {acceptCausalHistory,liftNativeObservation,materializeCausalHistory,type CausalAcceptancePolicy,type NativeLiftAdapter,type NativeObservation,type PortableEventV2} from './organization-causal-state';
import type {OrganizationIR} from './organization-ir';

export type OrganizationBuiltinId='organization.parse'|'organization.link'|'organization.normalize'|'organization.analyze'|'organization.solve'|'organization.lower'|'organization.emit'|'organization.lift'|'organization.replay';

export async function executeOrganizationBuiltin(id:OrganizationBuiltinId,input:Readonly<CompilerArtifact>,config:Record<string,unknown>,context:StablePassContext):Promise<CompilerPassResult<unknown>>{
  if(context.signal.aborted)throw new Error('cancelled');
  try{
    if(id==='organization.parse')return{output:parseOrganizationIr(String(input.content))};
    if(id==='organization.link'){
      const value=input.content as {root:LoadedOrganizationModule;modules:Record<string,LoadedOrganizationModule>};const loader:OrganizationModuleLoader={async load(source){const found=value.modules[source.uri];if(!found)throw new Error(`missing declared module '${source.uri}'`);return structuredClone(found);}};
      const result=await resolveOrganizationModules(value.root,loader,(config.policy??{}) as Record<string,never>);return result.graph?{output:result.graph}:{diagnostics:errors(id,result.errors)};
    }
    if(id==='organization.normalize'){const result=normalizeOrganization(input.content as ResolvedModuleGraph);return result.normalized?{output:result.normalized,sourceMap:result.normalized.sourceMap.map(x=>({output:x.output,sources:x.sources}))}:{diagnostics:errors(id,result.errors)};}
    if(id==='organization.analyze')return{output:analyzeOrganization(organization(input.content),config.environment as AnalysisEnvironment)};
    if(id==='organization.solve'){const definition=organization(input.content);return{output:{organization:definition,search:solveDeploymentV2(definition,(config.manifests??{}) as Record<string,ComponentManifestV2>,(config.adapters??{}) as Record<string,AdapterContract>,config.policy as AssurancePolicy,config.domain as SearchDomain)}};}
    if(id==='organization.lower'){
      const phase=String(config.phase);const value=input.content as any;
      if(phase==='organization-to-control'){const candidate=value.search?.candidates?.[Number(config.candidateIndex??0)];if(!candidate)return{diagnostics:errors(id,['deployment search has no selected compatible candidate'])};const result=lowerOrganizationToControl(value.organization,candidate);return result.output?{output:{organization:value.organization,candidate,control:result.output}}:{diagnostics:errors(id,result.errors)};}
      if(phase==='control-to-execution'){const result=lowerControlToExecution(value.control,value.candidate,config.options as ExecutionLoweringOptions);return result.output?{output:{organization:value.organization,candidate:value.candidate,execution:result.output},obligations:result.newObligations.map(x=>({id:x.id,claim:x.claim,status:'created' as const}))}:{diagnostics:errors(id,result.errors)};}
      if(phase==='execution-to-v1'){const result=lowerExecutionToV1(value.organization,value.execution,config.options as V1ExecutionLoweringOptions);return result.output?{output:result.output}:{diagnostics:errors(id,result.errors)};}
      return{diagnostics:errors(id,[`unsupported lowering phase '${phase}'`])};
    }
    if(id==='organization.emit'){const value=input.content as any;const result=emitExecutableArtifact({execution:value.execution,candidate:value.candidate,certificates:[],obligations:[],errors:[]} as FixedPointLoweringResult);return result.artifact?{output:result.artifact}:{diagnostics:errors(id,result.errors)};}
    if(id==='organization.lift'){
      const observation=input.content as NativeObservation;const declaration=config.adapter as Omit<NativeLiftAdapter,'lift'>;const event=config.event as Omit<PortableEventV2,'integrity'>;const adapter:NativeLiftAdapter={...declaration,lift:()=>structuredClone(event)};const result=liftNativeObservation(observation,adapter);return result.event?{output:[result.event]}:{diagnostics:errors(id,result.errors.length?result.errors:[result.gap??'lifting gap'])};
    }
    const accepted=acceptCausalHistory(input.content as PortableEventV2[],config.policy as CausalAcceptancePolicy);if(!accepted.history)return{diagnostics:errors(id,accepted.errors.length?accepted.errors:['causal history remains pending'])};return{output:config.definition?{history:accepted.history,materialized:materializeCausalHistory(config.definition as OrganizationIR,accepted.history)}:accepted.history};
  }catch(error){return{diagnostics:errors(id,[error instanceof Error?error.message:String(error)])};}
}
function errors(phase:string,messages:string[]){return messages.map(message=>({code:'OA-BUILTIN-FAILED',severity:'error' as const,phase,message}));}
function organization(value:unknown):OrganizationIR{
  const normalized=value as {root?:string;modules?:Record<string,OrganizationIR>;sourceMap?:Array<{output:string;sources:unknown[]}>};
  if(!normalized.root||!normalized.modules?.[normalized.root])return structuredClone(value) as OrganizationIR;
  const result=structuredClone(normalized.modules[normalized.root]);const modulePointer=`/modules/${escapePointer(normalized.root)}`;const prefix=`${normalized.root}#`;
  for(const relation of normalized.sourceMap??[]){if(relation.sources.length<2||!relation.output.startsWith(`${modulePointer}/`))continue;const pointer=relation.output.slice(modulePointer.length);const current=getPointer(result,pointer);if(typeof current==='string'&&current.startsWith(prefix))setPointer(result,pointer,current.slice(current.indexOf('/',prefix.length)+1));}
  return result;
}
function pointerTokens(pointer:string){return pointer.slice(1).split('/').map(token=>token.replace(/~1/g,'/').replace(/~0/g,'~'));}
function getPointer(root:any,pointer:string){return pointerTokens(pointer).reduce((value,token)=>value?.[token],root);}
function setPointer(root:any,pointer:string,value:unknown){const tokens=pointerTokens(pointer);let current=root;for(const token of tokens.slice(0,-1))current=current[token];current[tokens.at(-1)!]=value;}
function escapePointer(value:string){return value.replace(/~/g,'~0').replace(/\//g,'~1');}
