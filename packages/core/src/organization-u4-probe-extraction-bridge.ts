import { createHash } from "node:crypto";
import { canonicalSemanticJson as C } from "./organization-canonical";
import { projectU3ObservationSourceValue, type U3TraceEvaluationContract } from "./organization-u3-observation-evaluator";
import type { FrozenU3ObservationCalculus } from "./organization-u3-observation-calculus";
import { verifyFrozenU4SourceInventory, type FrozenU4SourceInventory, type FrozenU4SyntheticSourceRegistry, type U4TrustedVerificationInputs } from "./organization-u4-source-inventory";
import { freezeU4VerifiedProbeBundle, type FrozenU4VerifiedProbeBundle, type U4ProbeVerificationMaterial } from "./organization-u4-probe-protocol";
import { verifyU4EvidenceExtraction, type U4EvidenceExtraction, type U4ExtractionSpecification } from "./organization-u4-evidence-extractor";
import { createU4AutomaticTriangulation, type U4AutomaticTriangulation, type U4TriangulationInput } from "./organization-u4-triangulation";

type Sha=`sha256:${string}`;
const SCHEMA="open-autonomy.u4-probe-extraction-bridge.v1" as const;
const H=(x:string|Uint8Array)=>`sha256:${createHash("sha256").update(x).digest("hex")}` as Sha;
const at=(value:unknown,path:string)=>{let x:any=value;if(path==="")return x;for(const raw of path.slice(1).split("/")){const k=raw.replace(/~1/g,"/").replace(/~0/g,"~");if(x===null||typeof x!=="object"||!Object.prototype.hasOwnProperty.call(x,k))throw Error("U4 bridge stdout pointer invalid");x=x[k]}return x};
const freeze=<T>(v:T):T=>{const q:any[]=[v];while(q.length){const x=q.pop();if(x&&typeof x==="object"&&!Object.isFrozen(x)){q.push(...Object.values(x));Object.freeze(x)}}return v};

export type U4ProbeExtractionWitness={
  id:string; invocationId:string; repetition:number; factId:string; semanticSlotId:string;
  disposition:"credited"|"noncredit"; gapReason:string|null; propositionJson:string|null;
  stdoutJsonPointer:string; observationIds:string[]; sourceEventIds:string[];
  runtimeCandidateId:string; sourceBehaviorCandidateId:string;
};
export type U4ProbeExtractionBridge={schema:typeof SCHEMA;inventoryDigest:Sha;probeBundleDigest:Sha;extractionDigest:Sha;witnesses:U4ProbeExtractionWitness[];closureEligible:boolean;gapWitnessIds:string[];digest:Sha};
const QUALIFIED_SCHEMA="open-autonomy.u4-bridge-qualified-triangulation.v1" as const;
export type U4BridgeQualifiedTriangulation={schema:typeof QUALIFIED_SCHEMA;bridgeDigest:Sha;probeBundleDigest:Sha;witnessIds:string[];witnessDenominatorDigest:Sha;triangulationDigest:Sha;triangulation:U4AutomaticTriangulation;digest:Sha};

/** Replays every authenticated lower-level input and constructs the exact
 * execution×fact projection denominator used by the closure triangulation path. */
export function createU4ProbeExtractionBridge(
  inventory:FrozenU4SourceInventory, calculus:FrozenU3ObservationCalculus,
  registry:FrozenU4SyntheticSourceRegistry, trusted:U4TrustedVerificationInputs,
  aggregate:{bundle:FrozenU4VerifiedProbeBundle;materials:U4ProbeVerificationMaterial[];u3Contract:U3TraceEvaluationContract},
  extraction:U4EvidenceExtraction, specification:U4ExtractionSpecification,
):U4ProbeExtractionBridge{
  const inv=verifyFrozenU4SourceInventory(inventory,calculus,registry,trusted);
  const {digest:_,...bundleBody}=aggregate.bundle;void _;
  const bundle=freezeU4VerifiedProbeBundle(bundleBody as any,aggregate.materials,inv,calculus,aggregate.u3Contract,trusted,registry);
  if(bundle.digest!==aggregate.bundle.digest)throw Error("U4 bridge probe replay mismatch");
  const ext=verifyU4EvidenceExtraction(extraction,inv,calculus,registry,trusted,specification);
  const materials=new Map(aggregate.materials.map(m=>[m.invocationId,m]));
  const witnesses:U4ProbeExtractionWitness[]=[];
  for(const execution of bundle.executions){
    const c=bundle.plan.cases.find(x=>x.id===execution.run.caseId)!;
    const eventOwners=new Map<string,string|null>();
    let stdout:unknown=null;
    if(execution.disposition==="credited"){
      try{stdout=JSON.parse(Buffer.from(execution.run.stdoutBase64,"base64").toString("utf8"))}catch{throw Error("U4 bridge credited stdout invalid")}
    }
    const material=materials.get(execution.invocationId);
    for(const binding of c.factResultBindings){
      const runtime=ext.candidates.filter(x=>x.factId===binding.factId&&x.slotId===binding.semanticSlotId&&x.provenanceKind==="runtime-probe");
      const behavior=ext.candidates.filter(x=>x.factId===binding.factId&&x.slotId===binding.semanticSlotId&&x.provenanceKind==="source-behavior");
      if(runtime.length!==1||behavior.length!==1)throw Error("U4 bridge extraction candidate mismatch");
      let propositionJson:string|null=null,eventIds:string[]=[];
      if(execution.disposition==="credited"){
        if(!execution.join||!material)throw Error("U4 bridge credited witness missing");
        const events=material.u3Input.source.events.filter(e=>binding.observationIds.includes(e.observationId));
        eventIds=events.map(e=>e.id).sort();
        if(!events.length||eventIds.some(id=>!execution.join!.sourceEventIds.includes(id))||new Set(events.map(e=>e.observationId)).size!==binding.observationIds.length)throw Error("U4 bridge fact event closure invalid");
        for(const eventId of eventIds){const owner=eventOwners.get(eventId);if(owner!==undefined&&(!owner||owner!==binding.sharedProjectionEquivalenceId))throw Error("U4 bridge cross-fact event reuse");eventOwners.set(eventId,binding.sharedProjectionEquivalenceId)}
        const native=at(stdout,binding.stdoutJsonPointer);
        const projectedValues=events.map(event=>C(projectU3ObservationSourceValue(calculus,event.observationId,native)));
        if(new Set(projectedValues).size!==1)throw Error("U4 bridge fact observation projection disagreement");
        const projected=projectedValues[0];
        for(const event of events)if(C(projectU3ObservationSourceValue(calculus,event.observationId,event.payload))!==projected)throw Error("U4 bridge stdout source projection disagreement");
        if(runtime[0].propositionJson!==projected||behavior[0].propositionJson!==projected)throw Error("U4 bridge extraction probe candidate mismatch");
        propositionJson=projected;
      }
      const base={invocationId:execution.invocationId,repetition:execution.run.repetition,factId:binding.factId,semanticSlotId:binding.semanticSlotId,disposition:execution.disposition,gapReason:execution.disposition==="noncredit"?execution.noncreditReason:null,propositionJson,stdoutJsonPointer:binding.stdoutJsonPointer,observationIds:[...binding.observationIds],sourceEventIds:eventIds,runtimeCandidateId:runtime[0].id,sourceBehaviorCandidateId:behavior[0].id};
      witnesses.push({id:`witness.${H(`${SCHEMA}\0${C(base)}`).slice(7)}`,...base});
    }
  }
  witnesses.sort((a,b)=>a.id.localeCompare(b.id));
  const keys=new Set<string>(),values=new Map<string,string>();
  for(const w of witnesses){const k=`${w.invocationId}\0${w.factId}\0${w.semanticSlotId}`;if(keys.has(k))throw Error("U4 bridge witness tuple duplicate");keys.add(k);if(w.propositionJson!==null){const fk=`${w.factId}\0${w.semanticSlotId}`,old=values.get(fk);if(old!==undefined&&old!==w.propositionJson)throw Error("U4 bridge contradictory repetitions");values.set(fk,w.propositionJson)}}
  const expected=bundle.executions.flatMap(e=>bundle.plan.cases.find(c=>c.id===e.run.caseId)!.factResultBindings.map(b=>`${e.invocationId}\0${b.factId}\0${b.semanticSlotId}`));
  if(keys.size!==expected.length||expected.some(k=>!keys.has(k)))throw Error("U4 bridge witness denominator invalid");
  const gapWitnessIds=witnesses.filter(w=>w.disposition==="noncredit").map(w=>w.id);
  const body={schema:SCHEMA,inventoryDigest:inv.digest,probeBundleDigest:bundle.digest,extractionDigest:ext.digest,witnesses,closureEligible:gapWitnessIds.length===0,gapWitnessIds};
  return freeze({...body,digest:H(`${SCHEMA}\0${C(body)}`)});
}

export function verifyU4ProbeExtractionBridge(value:U4ProbeExtractionBridge,...args:Parameters<typeof createU4ProbeExtractionBridge>){const expected=createU4ProbeExtractionBridge(...args);if(C(value)!==C(expected))throw Error("U4 bridge replay mismatch");return expected}

/** This is the only U4 closure-capable triangulation entrypoint. The lower-level
 * triangulator remains useful for synthetic topology tests but cannot discharge
 * probe/source-behavior obligations without this replayed bridge. */
export function createU4BridgeVerifiedTriangulation(
  bridge:U4ProbeExtractionBridge,
  inventory:FrozenU4SourceInventory, calculus:FrozenU3ObservationCalculus,
  registry:FrozenU4SyntheticSourceRegistry, trusted:U4TrustedVerificationInputs,
  aggregate:{bundle:FrozenU4VerifiedProbeBundle;materials:U4ProbeVerificationMaterial[];u3Contract:U3TraceEvaluationContract},
  extraction:U4EvidenceExtraction, specification:U4ExtractionSpecification,
  triangulationInput:U4TriangulationInput,
){
  const verified=verifyU4ProbeExtractionBridge(bridge,inventory,calculus,registry,trusted,aggregate,extraction,specification);
  if(!verified.closureEligible)throw Error("U4 bridge closure has noncredit gaps");
  const triangulation=createU4AutomaticTriangulation(extraction,inventory,calculus,registry,trusted,specification,triangulationInput),witnessIds=verified.witnesses.map(w=>w.id).sort(),witnessDenominatorDigest=H(`open-autonomy.u4-bridge-witness-denominator.v1\0${C(verified.witnesses.map(w=>({id:w.id,invocationId:w.invocationId,repetition:w.repetition,factId:w.factId,semanticSlotId:w.semanticSlotId,disposition:w.disposition})).sort((a,b)=>a.id.localeCompare(b.id)))}`);const body={schema:QUALIFIED_SCHEMA,bridgeDigest:verified.digest,probeBundleDigest:verified.probeBundleDigest,witnessIds,witnessDenominatorDigest,triangulationDigest:triangulation.digest,triangulation};return freeze({...body,digest:H(`${QUALIFIED_SCHEMA}\0${C(body)}`)});
}
export function verifyU4BridgeQualifiedTriangulation(value:U4BridgeQualifiedTriangulation,bridge:U4ProbeExtractionBridge,inventory:FrozenU4SourceInventory,calculus:FrozenU3ObservationCalculus,registry:FrozenU4SyntheticSourceRegistry,trusted:U4TrustedVerificationInputs,aggregate:{bundle:FrozenU4VerifiedProbeBundle;materials:U4ProbeVerificationMaterial[];u3Contract:U3TraceEvaluationContract},extraction:U4EvidenceExtraction,specification:U4ExtractionSpecification,triangulationInput:U4TriangulationInput){const expected=createU4BridgeVerifiedTriangulation(bridge,inventory,calculus,registry,trusted,aggregate,extraction,specification,triangulationInput);if(C(value)!==C(expected))throw Error("U4 bridge qualified triangulation replay mismatch");return expected}
