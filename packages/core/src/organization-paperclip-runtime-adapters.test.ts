import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DiskPaperclipBridgeStore, PaperclipWorkerInteractionBridge, type PaperclipBridgeCall } from "./organization-paperclip-bridges";
import { DiskPaperclipSidecarStore, PaperclipPollingEventSidecar } from "./organization-paperclip-event-sidecar";
import { DiskPaperclipEventStore, PaperclipEventIngestor, paperclipEventManifestDigest, type PaperclipEventManifest } from "./organization-paperclip-events";
import { DiskPaperclipProviderStateStore, PaperclipLiveProvider, paperclipManifestDigest, type PaperclipManifest } from "./organization-paperclip-live-provider";
import { digestContext, type WorkerLaunch } from "./organization-harness-worker";
import { MemoryPaperclipRuntimeJournalStore, type PaperclipRuntimeLifecycle } from "./organization-paperclip-runtime";
import { createPaperclipOrganizationRuntime, DiskPaperclipOwnedResourcePort, type PaperclipOwnedResourceHandle } from "./organization-paperclip-runtime-adapters";

const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})});
const trust={sign:(digest:string)=>`sig:${digest}`,verify:(digest:string,signature:string)=>signature===`sig:${digest}`};
const sha=(value:string)=>`sha256:${createHash("sha256").update(value).digest("hex")}`;

describe("R16 production Paperclip runtime ownership adapter",()=>{
  test("resets and cleans allowlisted disk stores across reconstruction without deleting foreign state",()=>{
    const root=mkdtempSync(join(tmpdir(),"paperclip-owned-"));roots.push(root);
    const providerRoot=join(root,"provider"),eventRoot=join(root,"events"),sidecarRoot=join(root,"sidecar"),bridgeRoot=join(root,"bridge");
    const provider=new DiskPaperclipProviderStateStore(providerRoot),events=new DiskPaperclipEventStore(eventRoot),sidecar=new DiskPaperclipSidecarStore(sidecarRoot),bridge=new DiskPaperclipBridgeStore(bridgeRoot);
    provider.compareAndSwap("deployment",undefined,{sequence:1} as any);events.compareAndSwap("deployment",undefined,{generation:1} as any);sidecar.compareAndSwap("deployment",undefined,{version:1} as any);bridge.compareAndSwap("deployment",undefined,{version:1} as any);
    const paths={control:join(providerRoot,`${createHash("sha256").update("deployment").digest("hex")}.json`),events:join(eventRoot,"deployment.json"),sidecar:join(sidecarRoot,"deployment.json"),bridge:join(bridgeRoot,`${createHash("sha256").update("deployment").digest("hex")}.json`)};
    const foreign=join(root,"foreign-sentinel");writeFileSync(foreign,"foreign");
    const handles=Object.fromEntries(Object.entries(paths).map(([id,path])=>[id,{invalidate(){rmSync(path,{force:true})},cleanup(){rmSync(path,{force:true})}} satisfies PaperclipOwnedResourceHandle]));
    let owned=new DiskPaperclipOwnedResourcePort(join(root,"registry"),"tenant/deployment",trust,handles);
    for(const [id,path] of Object.entries(paths)){owned.invalidate(id,`restore:${id}`,1);expect(existsSync(path)).toBeFalse();owned.attest(id,`restore:${id}`,{epoch:1,digest:sha(id)});}
    owned=new DiskPaperclipOwnedResourcePort(join(root,"registry"),"tenant/deployment",trust,handles);
    expect(owned.checkpoint("bridge")).toEqual({epoch:1,digest:sha("bridge")});
    expect(()=>owned.cleanup("foreign","teardown")).toThrow(/foreign Paperclip resource/);
    for(const id of Object.keys(paths))expect(owned.cleanup(id,"teardown")).toMatch(/^sha256:/);
    expect(existsSync(foreign)).toBeTrue();
  });

  test("composes actual provider, ingestor, sidecar, and bridge through restore, rollback, and teardown",()=>{
    const root=mkdtempSync(join(tmpdir(),"paperclip-composed-"));roots.push(root);
    const deployment="deployment", company="company", baseUrl="http://127.0.0.1:43211/", commit="90f85a7d11c517b1d09db90dbec97f4de7d96b83";
    const providerRoot=join(root,"provider"),eventRoot=join(root,"events"),sidecarRoot=join(root,"sidecar"),bridgeRoot=join(root,"bridge");
    const providerStore=new DiskPaperclipProviderStateStore(providerRoot), eventStore=new DiskPaperclipEventStore(eventRoot), sidecarStore=new DiskPaperclipSidecarStore(sidecarRoot), bridgeStore=new DiskPaperclipBridgeStore(bridgeRoot);
    const providerBody:Omit<PaperclipManifest,"manifestDigest">={schema:"autonomy.paperclip-live-provider.v1",deploymentId:deployment,baseUrl,companyId:company,controlAuthBinding:"secret://board",workerAuthBinding:"secret://worker",source:{repository:"https://github.com/paperclipai/paperclip.git",releaseVersion:"0.3.1",commit,treeDigest:sha("tree"),lockDigest:sha("lock")},controlProviderId:"paperclip-control",workerProviderId:"paperclip-worker",interactionProviderId:"paperclip-interaction",eventSchema:"paperclip.sidecar-events.v1",assumptions:[]};
    const providerManifest={...providerBody,manifestDigest:paperclipManifestDigest(providerBody)};
    const providerNative={endpoint:()=>baseUrl,verifySource:()=>true,request:(input:any)=>input.path==="/api/health"?{status:200,body:{status:"ok",version:"0.3.1",serverInfo:{git:{fullSha:commit}}},headers:{}}:{status:404,body:{},headers:{}}};
    const provider=new PaperclipLiveProvider(providerManifest,providerNative,{signState:(d)=>`provider:${d}`,verifyState:(d,s)=>s===`provider:${d}`},providerStore);
    const eventBody:Omit<PaperclipEventManifest,"manifestDigest">={schema:"autonomy.paperclip-events.v1",deploymentId:deployment,companyId:company,baseEndpoint:baseUrl,authBinding:"secret://consumer",eventSchema:"paperclip.sidecar-events.v1",adapter:{id:"poller",implementationDigest:sha("poller"),endpoint:"http://127.0.0.1:4317/"},health:{gitSha:commit,version:"0.3.1",baseEndpoint:baseUrl}};
    const eventManifest={...eventBody,manifestDigest:paperclipEventManifestDigest(eventBody)};
    const pollNative={request:({path}:any)=>path.includes("/activity")||path.includes("/issues?")||path.includes("/approvals")||path.includes("/heartbeat-runs")?{status:200,body:[]}:{status:404,body:{}}};
    const sidecar=new PaperclipPollingEventSidecar(eventManifest,pollNative,"secret://native",sidecarStore,{sign:(d)=>`sidecar:${d}`,verify:(d,s)=>s===`sidecar:${d}`});
    const ingestor=new PaperclipEventIngestor(eventManifest,{sign:(d)=>`event:${d}`,verify:(d,s)=>s===`event:${d}`,authenticateManifest:()=>true,verifySnapshot:()=>true},eventStore,sidecar);
    const context:WorkerLaunch["context"]=[],launch:WorkerLaunch={identity:{tenant:"tenant",deployment,actor:"actor",behavior:"code",attempt:"attempt",claim:"claim",worker:"worker",repository:"repo",worktree:"/work",account:"account",credentialRef:"credential",model:"model",modelEndpoint:"endpoint",modelVersion:"v1"},fence:1,context,contextDigest:digestContext(context),authority:{worktree:"/work",sandboxId:"sandbox",processCommands:[],networkHosts:[],repository:"repo",credentialRefs:["credential"],models:["model"]},tokenBudget:10,costBudgetMicros:10,outputSchema:"schema"};
    const bridgeTrust={signState:(d:string)=>`bridge:${d}`,verifyState:(d:string,s:string)=>s===`bridge:${d}`,verifyInteraction:()=>true};
    const bridgePort={perform:(call:PaperclipBridgeCall)=>({effectId:call.effectId,operation:call.operation,durable:true as const,duplicate:false,nativeId:`native:${call.operation}`,state:call.operation==="question-publish"?"pending":"active",binding:{tenant:"tenant",deployment,issueId:"issue",runId:"run",executionDigest:String(call.payload.executionDigest),fence:1,worker:"worker"}})};
    const makeBridge=()=>new PaperclipWorkerInteractionBridge(launch,"issue","run",{board:"cap:board",agent:"cap:agent",interaction:"cap:interaction"},bridgePort,bridgeTrust,bridgeStore),bridge=makeBridge();
    const providerPath=join(providerRoot,`${createHash("sha256").update(deployment).digest("hex")}.json`),eventPath=join(eventRoot,`${deployment}.json`),sidecarPath=join(sidecarRoot,`${deployment}.json`),bridgePath=join(bridgeRoot,`${createHash("sha256").update(bridge.id).digest("hex")}.json`),credentialPath=join(root,"credential"),artifactPath=join(root,"artifact"),foreign=join(root,"foreign");
    writeFileSync(credentialPath,"credential");writeFileSync(artifactPath,"artifact");writeFileSync(foreign,"foreign");
    const handle=(path:string):PaperclipOwnedResourceHandle=>({invalidate(){rmSync(path,{force:true})},rebuild(_operationId,epoch){writeFileSync(path,`rebuilt:${epoch}`);return sha(`rebuilt:${epoch}`)},cleanup(){rmSync(path,{force:true})}});
    const owned=new DiskPaperclipOwnedResourcePort(join(root,"registry"),"tenant/deployment",trust,{control:handle(providerPath),events:handle(eventPath),"sidecar:poller":handle(sidecarPath),"bridge:worker":handle(bridgePath),"credential:key":handle(credentialPath),"artifact:backup":handle(artifactPath)});
    const pin:any={repository:"repo",commit,treeDigest:sha("tree"),lockDigest:sha("lock"),executableDigest:sha("source"),builtExecutableDigest:sha("built"),dependencyDigest:sha("deps")};
    let lifecycleState:any={schema:"autonomy.paperclip-deployment-state.v1",deploymentId:deployment,sequence:1,fence:0,lifecycleGeneration:0,restoreEpoch:0,status:"stopped",pin,digest:sha("lifecycle-1"),signature:"signed"};
    const observation=()=>({launchFence:lifecycleState.fence,running:lifecycleState.status==="running",pid:lifecycleState.status==="running"?42:null,endpoint:baseUrl.slice(0,-1),dataDir:join(root,"data"),pin,healthy:lifecycleState.status==="running"});
    const transition=(restore=false)=>{lifecycleState={...lifecycleState,sequence:lifecycleState.sequence+1,fence:lifecycleState.fence+1,lifecycleGeneration:lifecycleState.lifecycleGeneration+1,restoreEpoch:lifecycleState.restoreEpoch+(restore?1:0),status:"running",digest:sha(`lifecycle-${lifecycleState.sequence+1}`)};return lifecycleState};
    const lifecycle:PaperclipRuntimeLifecycle={initialize:()=>lifecycleState,start:()=>transition(),inspect:()=>({state:lifecycleState,observed:observation()}),restart:()=>transition(),backup:()=>lifecycleState,restore:()=>transition(true),upgrade:()=>transition(true),rollback:()=>transition(true),teardown:()=>{lifecycleState={...lifecycleState,status:"destroyed",sequence:lifecycleState.sequence+1,digest:sha("destroyed")}}};
    const factory=()=>createPaperclipOrganizationRuntime({runtimeId:"tenant/deployment",trust,store:new MemoryPaperclipRuntimeJournalStore(),lifecycle,provider,eventIngestor:ingestor,ownedResources:owned,sidecars:[{id:"poller",sidecar}],bridges:[{id:"worker",bridge,rebuild:makeBridge}],credentials:[{id:"key"}],artifacts:[{id:"backup"}]});
    const {runtime}=factory();
    expect(runtime.deploy("deploy").epoch).toBe(0);
    expect(runtime.restore("restore").epoch).toBe(1);
    expect(runtime.rollback("rollback").epoch).toBe(2);
    expect(existsSync(providerPath)).toBeTrue();expect(existsSync(eventPath)).toBeTrue();expect(existsSync(sidecarPath)).toBeTrue();expect(existsSync(bridgePath)).toBeTrue();
    expect(existsSync(credentialPath)).toBeTrue();expect(existsSync(artifactPath)).toBeTrue();
    expect(runtime.teardown("teardown").operation).toBe("teardown");
    expect(existsSync(providerPath)).toBeFalse();expect(existsSync(eventPath)).toBeFalse();expect(existsSync(sidecarPath)).toBeFalse();expect(existsSync(bridgePath)).toBeFalse();expect(existsSync(credentialPath)).toBeFalse();expect(existsSync(artifactPath)).toBeFalse();expect(existsSync(foreign)).toBeTrue();
  });
});
