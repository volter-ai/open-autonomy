import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { canonicalSemanticJson } from "./organization-canonical";
import type { PaperclipWorkerInteractionBridge } from "./organization-paperclip-bridges";
import type { PaperclipPollingEventSidecar } from "./organization-paperclip-event-sidecar";
import type { PaperclipEventIngestor } from "./organization-paperclip-events";
import type { PaperclipLiveProvider, PaperclipPortableBackup } from "./organization-paperclip-live-provider";
import { PaperclipOrganizationRuntime, type PaperclipRuntimeControl, type PaperclipRuntimeEvents, type PaperclipRuntimeLifecycle, type PaperclipRuntimeOptions, type PaperclipRuntimeParticipant, type RuntimeCheckpoint } from "./organization-paperclip-runtime";

/**
 * Boundary to the owner of a concrete Paperclip resource. Implementations must
 * reject resource ids outside their namespace and must never enumerate/delete
 * foreign resources. `invalidate` resets the actual backing checkpoint, while
 * `attest` durably records the state rebuilt at the requested runtime epoch.
 */
export interface PaperclipOwnedResourcePort {
  invalidate(resourceId: string, operationId: string, epoch: number): void;
  attest(resourceId: string, operationId: string, checkpoint: RuntimeCheckpoint): RuntimeCheckpoint;
  rebuild(resourceId: string, operationId: string, epoch: number): RuntimeCheckpoint;
  checkpoint(resourceId: string): RuntimeCheckpoint;
  cleanup(resourceId: string, operationId: string): string;
}

export interface PaperclipOwnedResourceHandle {
  /** Reset only this registered resource's concrete provider/store checkpoint. */
  invalidate(operationId:string,epoch:number):void;
  /** Recreate this owned credential/artifact and return its observed digest. */
  rebuild?(operationId:string,epoch:number):string;
  /** Remove only this registered resource's concrete files/credentials/artifacts. */
  cleanup(operationId:string):void;
}

type OwnedRegistryState={schema:"autonomy.paperclip-owned-resources.v1";namespace:string;generation:number;resources:Record<string,{status:"invalid"|"active"|"cleaned";epoch:number;digest?:string;operationId:string}>;digest:string;signature:string};

/** Disk-backed, signed, namespace-allowlisted ownership registry. It has no API
 * for discovering filesystem state: only explicitly registered handles can be
 * reset or removed, which makes deletion of foreign state unrepresentable. */
export class DiskPaperclipOwnedResourcePort implements PaperclipOwnedResourcePort {
  private readonly path:string;
  constructor(root:string,private readonly namespace:string,private readonly trust:{sign(digest:string):string;verify(digest:string,signature:string):boolean},private readonly handles:Readonly<Record<string,PaperclipOwnedResourceHandle>>){
    if(!namespace||!Object.keys(handles).length)throw new Error("owned Paperclip namespace and handles required");
    mkdirSync(root,{recursive:true});this.path=resolve(root,`${createHash("sha256").update(namespace).digest("hex")}.owned.json`);if(!this.load())this.write(undefined,{schema:"autonomy.paperclip-owned-resources.v1",namespace,generation:1,resources:{}});
  }
  invalidate(resourceId:string,operationId:string,epoch:number){this.handle(resourceId).invalidate(operationId,epoch);this.mutate(s=>{const prior=s.resources[resourceId];if(prior?.operationId===operationId&&prior.status==="invalid"&&prior.epoch===epoch)return;s.resources[resourceId]={status:"invalid",epoch,operationId};});}
  attest(resourceId:string,operationId:string,checkpoint:RuntimeCheckpoint){this.handle(resourceId);if(!validCheckpoint(checkpoint))throw new Error("invalid owned resource checkpoint");this.mutate(s=>{const prior=s.resources[resourceId];if(prior ? prior.status!=="invalid"||prior.epoch!==checkpoint.epoch : checkpoint.epoch!==0)throw new Error("owned resource was not invalidated for epoch");s.resources[resourceId]={status:"active",epoch:checkpoint.epoch,digest:checkpoint.digest,operationId};});return this.checkpoint(resourceId);}
  rebuild(resourceId:string,operationId:string,epoch:number){const handle=this.handle(resourceId);if(!handle.rebuild)throw new Error(`owned Paperclip resource ${resourceId} has no rebuild operation`);const digest=handle.rebuild(operationId,epoch);return this.attest(resourceId,operationId,{epoch,digest});}
  checkpoint(resourceId:string){this.handle(resourceId);const row=this.current().resources[resourceId];if(!row||row.status!=="active"||!row.digest)throw new Error(`owned Paperclip resource ${resourceId} has no active checkpoint`);return{epoch:row.epoch,digest:row.digest};}
  cleanup(resourceId:string,operationId:string){this.handle(resourceId).cleanup(operationId);this.mutate(s=>{const prior=s.resources[resourceId];if(prior?.status==="cleaned"&&prior.operationId===operationId)return;s.resources[resourceId]={status:"cleaned",epoch:prior?.epoch??0,operationId};});return hash({namespace:this.namespace,resourceId,operationId,status:"cleaned"});}
  private handle(id:string){const value=this.handles[id];if(!value)throw new Error(`foreign Paperclip resource ${id} is not owned by ${this.namespace}`);return value;}
  private load(){try{return JSON.parse(readFileSync(this.path,"utf8")) as OwnedRegistryState}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return undefined;throw error}}
  private current(){const state=this.load();if(!state)throw new Error("owned resource registry missing");const{digest,signature,...body}=state,expected=hash(body);if(state.schema!=="autonomy.paperclip-owned-resources.v1"||state.namespace!==this.namespace||digest!==expected||!this.trust.verify(expected,signature))throw new Error("owned resource registry authentication failed");return state;}
  private mutate(change:(state:OwnedRegistryState)=>void){for(let attempt=0;attempt<12;attempt++){const old=this.current(),next=structuredClone(old);change(next);next.generation++;if(this.write(old.generation,next))return;}throw new Error("owned resource registry CAS contention");}
  private write(expected:number|undefined,input:Omit<OwnedRegistryState,"digest"|"signature">|OwnedRegistryState){const lock=acquireOwnedRegistryLock(`${this.path}.lock`);try{if(this.load()?.generation!==expected)return false;const{digest:_d,signature:_s,...body}=input as OwnedRegistryState,digest=hash(body),next={...body,digest,signature:this.trust.sign(digest)},temp=`${this.path}.${process.pid}.${Date.now()}.tmp`,out=openSync(temp,"wx",0o600);try{writeFileSync(out,canonicalSemanticJson(next),"utf8");fsyncSync(out)}finally{closeSync(out)}renameSync(temp,this.path);const directory=openSync(dirname(this.path),"r");try{fsyncSync(directory)}finally{closeSync(directory)}return true}finally{releaseOwnedRegistryLock(lock.path,lock.token)}}
}

function registryProcessStart(pid:number){try{return readFileSync(`/proc/${pid}/stat`,"utf8").split(" ")[21]??"unknown"}catch{return"unknown"}}
function registryProcessAlive(pid:number,start:string){try{process.kill(pid,0);return registryProcessStart(pid)===start}catch{return false}}
function releaseOwnedRegistryLock(path:string,token:string){try{const current=JSON.parse(readFileSync(resolve(path,"owner.json"),"utf8")) as{token?:string};if(current.token!==token)return;const moved=`${path}.release.${process.pid}.${Math.random()}`;renameSync(path,moved);const observed=JSON.parse(readFileSync(resolve(moved,"owner.json"),"utf8")) as{token?:string};if(observed.token===token)rmSync(moved,{recursive:true,force:true});else if(!existsSync(path))renameSync(moved,path)}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error}}
function acquireOwnedRegistryLock(path:string){for(let attempt=0;attempt<1000;attempt++){const token=`${process.pid}:${Date.now()}:${Math.random()}`;try{mkdirSync(path,{mode:0o700});writeFileSync(resolve(path,"owner.json"),canonicalSemanticJson({pid:process.pid,start:registryProcessStart(process.pid),token}),{mode:0o600});return{path,token}}catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;try{const owner=JSON.parse(readFileSync(resolve(path,"owner.json"),"utf8")) as{pid:number;start:string;token:string};if(!registryProcessAlive(owner.pid,owner.start)){releaseOwnedRegistryLock(path,owner.token);continue}}catch(inspect){if((inspect as NodeJS.ErrnoException).code!=="ENOENT")throw inspect}Bun.sleepSync(10)}}throw new Error("owned resource registry lock timeout")}

type LiveProvider = Pick<PaperclipLiveProvider, "deploy" | "health" | "exportPortableBackup">;
type EventIngestor = Pick<PaperclipEventIngestor, "initialize" | "current" | "sync">;
type EventSidecar = Pick<PaperclipPollingEventSidecar, "poll" | "snapshot">;
type InteractionBridge = Pick<PaperclipWorkerInteractionBridge, "snapshot">;

export class PaperclipLiveProviderRuntimeControl implements PaperclipRuntimeControl {
  constructor(private readonly provider: LiveProvider, private readonly owned: PaperclipOwnedResourcePort, private readonly resourceId = "control") {}
  deploy() { const state=this.provider.deploy();this.seed(state.digest);return state; }
  health() { return this.provider.health(); }
  exportPortableBackup(): PaperclipPortableBackup { return this.provider.exportPortableBackup(); }
  invalidateCheckpoint(operationId: string, epoch: number) { this.owned.invalidate(this.resourceId, operationId, epoch); }
  rebuildCheckpoint(operationId: string, epoch: number) { const state=this.provider.deploy(); this.attest(operationId,epoch,state.digest); return state; }
  checkpoint() { return this.owned.checkpoint(this.resourceId); }
  cleanupOwned(operationId: string) { return this.owned.cleanup(this.resourceId, operationId); }
  private attest(operationId:string,epoch:number,digest:string){const observed=this.owned.attest(this.resourceId,operationId,{epoch,digest});assertCheckpoint(observed,epoch,digest);}
  private seed(digest:string){try{this.owned.checkpoint(this.resourceId)}catch{this.attest("runtime:initial-control",0,digest)}}
}

export class PaperclipEventIngestorRuntimeEvents implements PaperclipRuntimeEvents {
  constructor(private readonly ingestor: EventIngestor, private readonly owned: PaperclipOwnedResourcePort, private readonly resourceId = "events") {}
  initialize(){const state=this.ingestor.initialize();this.seed(state.digest);return state;}
  current(){return this.ingestor.current();}
  sync(limit?:number){return this.ingestor.sync(limit);}
  invalidateCheckpoint(operationId:string,epoch:number){this.owned.invalidate(this.resourceId,operationId,epoch);}
  rebuildCheckpoint(operationId:string,epoch:number){const state=this.ingestor.initialize();this.attest(operationId,epoch,state.digest);return state;}
  checkpoint(){return this.owned.checkpoint(this.resourceId);}
  cleanupOwned(operationId:string){return this.owned.cleanup(this.resourceId,operationId);}
  private attest(operationId:string,epoch:number,digest:string){const observed=this.owned.attest(this.resourceId,operationId,{epoch,digest});assertCheckpoint(observed,epoch,digest);}
  private seed(digest:string){try{this.owned.checkpoint(this.resourceId)}catch{this.attest("runtime:initial-events",0,digest)}}
}

abstract class OwnedParticipant implements PaperclipRuntimeParticipant {
  abstract kind: PaperclipRuntimeParticipant["kind"];
  constructor(public readonly id:string,protected readonly owned:PaperclipOwnedResourcePort,protected readonly resourceId:string){}
  invalidateCheckpoint(operationId:string,epoch:number){this.owned.invalidate(this.resourceId,operationId,epoch);}
  checkpoint(){return this.owned.checkpoint(this.resourceId);}
  cleanupOwned(operationId:string){return this.owned.cleanup(this.resourceId,operationId);}
  protected attest(operationId:string,epoch:number,digest:string){const result=this.owned.attest(this.resourceId,operationId,{epoch,digest});assertCheckpoint(result,epoch,digest);return result;}
  abstract rebuildCheckpoint(operationId:string,epoch:number):RuntimeCheckpoint;
}

export class PaperclipSidecarRuntimeParticipant extends OwnedParticipant {
  readonly kind="sidecar" as const;
  constructor(id:string,private readonly sidecar:EventSidecar,owned:PaperclipOwnedResourcePort,resourceId=`sidecar:${id}`){super(id,owned,resourceId);}
  rebuildCheckpoint(operationId:string,epoch:number){this.sidecar.poll();return this.attest(operationId,epoch,hash(this.sidecar.snapshot()));}
}

export class PaperclipBridgeRuntimeParticipant extends OwnedParticipant {
  readonly kind="bridge" as const;
  private bridge:InteractionBridge;
  constructor(id:string,bridge:InteractionBridge,private readonly rebuild:()=>InteractionBridge,owned:PaperclipOwnedResourcePort,resourceId=`bridge:${id}`){super(id,owned,resourceId);this.bridge=bridge;}
  rebuildCheckpoint(operationId:string,epoch:number){this.bridge=this.rebuild();return this.attest(operationId,epoch,hash(this.bridge.snapshot()));}
  currentBridge(){return this.bridge;}
}

export class PaperclipOwnedCleanupParticipant extends OwnedParticipant {
  constructor(id:string,readonly kind:"credential"|"artifact",owned:PaperclipOwnedResourcePort,resourceId=`${kind}:${id}`){super(id,owned,resourceId);}
  rebuildCheckpoint(operationId:string,epoch:number){return this.owned.rebuild(this.resourceId,operationId,epoch);}
}

export interface PaperclipOrganizationRuntimeFactoryOptions extends PaperclipRuntimeOptions {
  lifecycle: PaperclipRuntimeLifecycle;
  provider: LiveProvider;
  eventIngestor: EventIngestor;
  ownedResources: PaperclipOwnedResourcePort;
  sidecars?: Array<{id:string;sidecar:EventSidecar;resourceId?:string}>;
  bridges?: Array<{id:string;bridge:InteractionBridge;rebuild:()=>InteractionBridge;resourceId?:string}>;
  credentials?: Array<{id:string;resourceId?:string}>;
  artifacts?: Array<{id:string;resourceId?:string}>;
}

export function createPaperclipOrganizationRuntime(options:PaperclipOrganizationRuntimeFactoryOptions){
  const {lifecycle,provider,eventIngestor,ownedResources,sidecars=[],bridges=[],credentials=[],artifacts=[],...runtimeOptions}=options;
  const control=new PaperclipLiveProviderRuntimeControl(provider,ownedResources);
  const events=new PaperclipEventIngestorRuntimeEvents(eventIngestor,ownedResources);
  const participants:PaperclipRuntimeParticipant[]=[
    ...sidecars.map(v=>new PaperclipSidecarRuntimeParticipant(v.id,v.sidecar,ownedResources,v.resourceId)),
    ...bridges.map(v=>new PaperclipBridgeRuntimeParticipant(v.id,v.bridge,v.rebuild,ownedResources,v.resourceId)),
    ...credentials.map(v=>new PaperclipOwnedCleanupParticipant(v.id,"credential",ownedResources,v.resourceId)),
    ...artifacts.map(v=>new PaperclipOwnedCleanupParticipant(v.id,"artifact",ownedResources,v.resourceId)),
  ];
  for(const participant of participants){try{participant.checkpoint()}catch{participant.rebuildCheckpoint(`runtime:initial:${participant.kind}:${participant.id}`,0)}}
  const runtime=new PaperclipOrganizationRuntime(lifecycle,control,events,{...runtimeOptions,participants:[...(runtimeOptions.participants??[]),...participants]});
  return {runtime,control,events,participants};
}

function assertCheckpoint(value:RuntimeCheckpoint,epoch:number,digest:string){if(value.epoch!==epoch||value.digest!==digest||!/^sha256:[a-f0-9]{64}$/.test(digest))throw new Error("owned Paperclip resource attestation mismatch");}
function validCheckpoint(value:RuntimeCheckpoint){return Number.isSafeInteger(value.epoch)&&value.epoch>=0&&/^sha256:[a-f0-9]{64}$/.test(value.digest);}
function hash(value:unknown){return `sha256:${createHash("sha256").update(canonicalSemanticJson(value)).digest("hex")}`;}
