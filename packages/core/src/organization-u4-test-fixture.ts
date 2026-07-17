import { createHash, createHmac } from "node:crypto";
import { canonicalSemanticJson as C } from "./organization-canonical";
import {createU4ExtractionLocator,signU4ExtractionSpecification,type U4ExtractionSpecification} from "./organization-u4-evidence-extractor";
import { U3_OBSERVATION_CALCULUS_SCHEMA,U3_PREDECESSORS,U3_TAXONOMY,freezeU3ObservationCalculus,type U3ObservationCalculus } from "./organization-u3-observation-calculus";
import { U4_FACT_TAXONOMY,U4_SOURCE_INVENTORY_SCHEMA,U4_U3_ANCHORS,U4_V9_CHRONOLOGY_ANCHOR,computeU4SourceInventoryDigest,computeU4SyntheticSourceRegistryDigest,computeU4PropositionDigest,computeU4ConflictResolutionDigest,computeU4NativeSchemaDigest,computeU4AdjudicationEvidenceDigest,freezeU4SyntheticSourceRegistry,freezeU4SourceInventory,verifyFrozenU4SourceInventory,verifyU4TaxonomyCoherence,verifyU4U3GitCustody,type U4SourceInventory,type U4TrustedVerificationInputs } from "./organization-u4-source-inventory";
const H=(x:string|Uint8Array)=>("sha256:"+createHash("sha256").update(x).digest("hex")) as any;
const S = (c: string) => `sha256:${c.repeat(64)}` as any,
  sort = <T extends { id: string }>(x: T[]) =>
    x.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const u3Fixture = (): U3ObservationCalculus => {
  const observations: any[] = U3_TAXONOMY.map((taxonomy, i) => ({
    id: `obs-${taxonomy}`,
    taxonomy,
    subjectSort: i % 2 ? "provider" : "component",
    subjectKind: "work",
    providerId: `provider-${i}`,
    componentId: i % 2 ? null : `component-${i}`,
    nativeSchemaId: "event-schema",
    nativeSchemaVersion: "1",
    valueSchemaId: "event-schema",
    valueSchemaVersion: "1",
    sourceProjectionId: "identity",
    unit: "event",
    clock: "monotonic",
    window: "trace",
    dedupKey: `event-key-${i}`,
    completeness: "complete",
    evidencePolicyId: "signed-evidence",
    authenticationPolicyId: "signature",
    missing: "unknown",
    applicability: [
      {
        stratumId: "coding",
        status: "mandatory",
        predicateId: "always",
        evidenceDigest: null,
        reason: null,
      },
    ],
  }));
  observations.push({
    ...structuredClone(observations[0]),
    id: "obs-optional-detail",
    dedupKey: "optional-key",
    applicability: [
      {
        stratumId: "coding",
        status: "optional",
        predicateId: "always",
        evidenceDigest: null,
        reason: null,
      },
    ],
  });
  sort(observations);
  const comparisons = sort(
      observations.map((o) => ({
        id: `comparison-${o.id}`,
        left: {
          observationId: o.id,
          subjectKind: o.subjectKind,
          schemaId: o.valueSchemaId,
          schemaVersion: o.valueSchemaVersion,
        },
        right: {
          observationId: o.id,
          subjectKind: o.subjectKind,
          schemaId: o.valueSchemaId,
          schemaVersion: o.valueSchemaVersion,
        },
        sourceProjectionId: "identity",
        targetProjectionId: "identity",
        direction: "symmetric" as const,
        operator: "equal" as const,
        missing: "unknown" as const,
      })),
    ),
    variances = sort(
      comparisons.map((c) => ({
        id: `variance-${c.id}`,
        comparisonId: c.id,
        operator: "accept-within" as const,
        metric: "exact" as const,
        unit: "event",
        clock: "monotonic" as const,
        window: "trace" as const,
        aggregation: "identity" as const,
        missing: "unknown" as const,
        bound: 0,
        minimumSamples: 2,
      })),
    ),
    mandatory = observations
      .filter((o) => o.id !== "obs-optional-detail")
      .map((o) => o.id),
    all = observations.map((o) => o.id),
    cids = (ids: string[]) => ids.map((id) => `comparison-${id}`).sort(),
    vids = (ids: string[]) =>
      cids(ids)
        .map((id) => `variance-${id}`)
        .sort();
  return {
    schema: U3_OBSERVATION_CALCULUS_SCHEMA,
    fixtureKind: "synthetic",
    denominatorScope: "fixture-local",
    empiricalRegistration: false,
    closureClaim: false,
    campaignId: "organization-universality-2026-v9",
    predecessors: structuredClone(U3_PREDECESSORS) as any,
    schemas: [
      {
        id: "event-schema",
        version: "1",
        mediaType: "application/json",
        schemaSha256: S("a"),
      },
    ],
    predicates: [
      { id: "always", version: "1", operator: "always", argument: "" },
    ],
    projections: [
      {
        id: "identity",
        version: "1",
        operator: "identity",
        argument: "",
        inputSchemaId: "event-schema",
        inputSchemaVersion: "1",
        outputSchemaId: "event-schema",
        outputSchemaVersion: "1",
      },
    ],
    evidencePolicies: [
      {
        id: "signed-evidence",
        required: true,
        minimum: "verification",
        referenceSchemaId: "event-schema",
        referenceSchemaVersion: "1",
      },
    ],
    authenticationPolicies: [
      {
        id: "signature",
        required: true,
        mechanism: "mac",
        trustRootSha256: S("b"),
      },
    ],
    strata: [{ id: "coding" }],
    observations,
    comparisons,
    variances,
    profiles: [
      {
        id: "base",
        lineageId: "coding-lineage",
        version: "1.0.0",
        stratumId: "coding",
        parentIds: [],
        observationIds: mandatory,
        comparisonIds: cids(mandatory),
        varianceIds: vids(mandatory),
        forbiddenLossObservationIds: mandatory,
        unknownPolicy: "report",
      },
      {
        id: "strict",
        lineageId: "coding-lineage",
        version: "1.1.0",
        stratumId: "coding",
        parentIds: ["base"],
        observationIds: all,
        comparisonIds: cids(all),
        varianceIds: vids(all),
        forbiddenLossObservationIds: all,
        unknownPolicy: "reject",
      },
    ],
    profilePairs: [
      {
        leftProfileId: "base",
        rightProfileId: "strict",
        kind: "right-refines-left",
        reason:
          "strict adds the applicable optional detail and rejects unknown values",
        witnessDigest: S("c"),
      },
    ],
  };
};
const calculus=()=>freezeU3ObservationCalculus(u3Fixture(),{requireFixtureDigest:false});
const key=(id:string)=>Buffer.from(id.padEnd(32,"!")).subarray(0,32);
const mac=(id:string,d:string,b:unknown)=>createHmac("sha256",key(id)).update(d).update("\0").update(C(b)).digest("hex");
const authoritySpecs:any[]=[["a-adjudicator","adjudication-owner","independent-adjudicator"],["a-behavior","behavior-owner","source-behavior-observer"],["a-custody","custody-owner","evidence-custodian"],["a-freezer","freezer-owner","inventory-freezer"],["a-frontend","frontend","frontend"],["a-probe","probe-owner","runtime-probe-operator"],["a-schema","schema-owner","native-schema-publisher"],["a-semantic","semantic-owner","semantic-inventory-authority"],["a-spec","spec-owner","official-spec-publisher"]];
const registry=()=>{const body:any={schema:"open-autonomy.u4-synthetic-source-registry.v1",fixtureKind:"synthetic",populationBoundary:"synthetic-fixture-only-external-u1-release-deferred",genericRegistryRelease:"deferred-external-validation",u1BoundaryStatus:"implementation-complete-external-validation-deferred",sources:[{id:"source",sourceSystemId:"synthetic-system",nativeVersion:"1",sourceOwnerId:"implementer",stratumId:"coding",profileId:"base",taxonomyFloors:U4_FACT_TAXONOMY.map((taxonomy,i)=>({taxonomy,minimum:i===0?"critical":"noncritical",rationale:"Synthetic "+taxonomy+" floor"}))}]};return freezeU4SyntheticSourceRegistry(body);};
const inventory=():U4SourceInventory=>{
 const authorities=authoritySpecs.map(([id,ownerId,role])=>({id,ownerId,role,trustRootSha256:H(key(id)),verificationKeyDigest:H(key(id))}));
 const provenance:any[]=[["p-behavior","source-behavior","a-behavior"],["p-probe","runtime-probe","a-probe"],["p-schema","native-schema","a-schema"],["p-spec","official-spec","a-spec"]].map(([id,kind,producerAuthorityId])=>{const custodyAuthorityId="a-custody",sourceId="source",nativeSchemaId=kind==="native-schema"?"native":null,b=Buffer.from(kind==="native-schema"?'{\"type\":\"boolean\"}':'{\"claim\":true}'),p:any={id,sourceId,nativeSchemaId,kind,producerAuthorityId,custodyAuthorityId,sourceVersion:"1",mediaType:"application/json",acquiredAt:"2026-07-17T04:00:00.000Z",bytesBase64:b.toString("base64"),byteLength:b.length,sha256:H(b)};const body={id:p.id,sourceId,nativeSchemaId,kind:p.kind,sourceVersion:p.sourceVersion,mediaType:p.mediaType,acquiredAt:p.acquiredAt,sha256:p.sha256};p.bodyReceipt=mac(producerAuthorityId,"u4-provenance-body",body);p.custodyReceipt=mac(custodyAuthorityId,"u4-provenance-custody",{...body,producerAuthorityId,bytesBase64:p.bytesBase64});return p;});
 const domains:any={authority:"authority",configuration:"configuration",evidence:"evidence",extensions:"extension",failure:"failure",lifecycle:"lifecycle",omissions:"context",resource:"resource",runtime:"runtime","safety-security":"safety-security"};
 const defs:any[]=U4_FACT_TAXONOMY.flatMap(t=>t==="prompt-context"?["prompt","skill","context","tool","memory","harness","model"].map(d=>[t,d]):[[t,domains[t]]]);
 const facts:any[]=defs.map(([taxonomy,domain]:any,i:number)=>{const path="/"+taxonomy+"/"+domain,id="source."+taxonomy+"."+H(path).slice(7,23),abs=taxonomy==="omissions";const f:any={id,sourceId:"source",taxonomy,nativePath:path,nativeSchemaId:"native",nativeSchemaVersion:"1",denotation:"Exact "+taxonomy+" "+domain+" denotation",default:abs?{status:"absent",valueJson:null}:{status:"present",valueJson:"true"},absence:abs?"unsupported":null,criticality:i===0?"critical":"noncritical",mandatoryObservationIds:["obs-timing"],provenanceIds:["p-behavior","p-probe","p-schema","p-spec"],conflictIds:[],semantic:{relation:taxonomy==="failure"?"fails-with":taxonomy==="lifecycle"?"transitions":taxonomy==="extensions"?"extends":taxonomy==="omissions"?"omits":"declares",from:"source",to:taxonomy+":"+domain,domain,extensionClass:taxonomy==="extensions"?"vendor-hook":null,opaqueVersion:taxonomy==="extensions"?"vendor-v7":null},factReceipt:"",criticalityEvidence:{rationale:"Synthetic "+taxonomy+" floor",authorityId:"a-semantic",evidenceProvenanceId:"p-spec",receipt:"",sourceFloor:i===0?"critical":"noncritical"}};f.criticalityEvidence.receipt=mac("a-semantic","u4-criticality",{factId:f.id,criticality:f.criticality,rationale:f.criticalityEvidence.rationale,evidenceProvenanceId:"p-spec",sourceFloor:f.criticalityEvidence.sourceFloor});f.factReceipt=mac("a-semantic","u4-fact",{...f,factReceipt:undefined,criticalityEvidence:{...f.criticalityEvidence,receipt:undefined}});return f;}).sort((a,b)=>a.id.localeCompare(b.id));
 const critical=facts.find(f=>f.criticality==="critical"),ep=provenance.find(p=>p.id==="p-behavior"),leftProposition=C("boolean"),rightProposition=C("disabled"),conflict:any={id:"conflict-critical",factId:critical.id,leftProvenanceId:"p-schema",leftJsonPointer:"/type",rightProvenanceId:"p-spec",rightJsonPointer:"/claim",leftProposition,leftValueDigest:computeU4PropositionDigest(leftProposition),rightProposition,rightValueDigest:computeU4PropositionDigest(rightProposition),status:"adjudicated",criticality:"critical",adjudicatorAuthorityId:"a-adjudicator",resolutionKind:"choose-right",resolutionProposition:rightProposition,resolutionDigest:computeU4ConflictResolutionDigest("choose-right",rightProposition),adjudicationEvidenceProvenanceId:"p-behavior",adjudicationEvidenceDigest:null,adjudicationReceipt:""};const evidenceBody={...conflict,adjudicationEvidenceDigest:undefined,adjudicationReceipt:undefined,evidenceProvenanceSha256:ep.sha256};conflict.adjudicationEvidenceDigest=computeU4AdjudicationEvidenceDigest(evidenceBody);conflict.adjudicationReceipt=mac("a-adjudicator","u4-adjudication",{...conflict,adjudicationReceipt:undefined});
 const dimensions:any[]=U4_FACT_TAXONOMY.map(t=>({sourceId:"source",taxonomy:t,status:"represented",factIds:facts.filter(f=>f.taxonomy===t).map(f=>f.id)})).sort((a,b)=>(a.sourceId+"\0"+a.taxonomy).localeCompare(b.sourceId+"\0"+b.taxonomy));
 const calc=calculus(),reg=registry(),schemaBytes=Buffer.from('{"type":"boolean"}'),schemaDigest=computeU4NativeSchemaDigest({type:"boolean"}),schema:any={id:"native",version:"1",sourceId:"source",pathPrefix:"/",valueShape:{type:"boolean"},schemaBytesBase64:schemaBytes.toString("base64"),schemaSha256:H(schemaBytes),semanticSchemaDigest:schemaDigest,producerAuthorityId:"a-schema",custodyAuthorityId:"a-custody",producerReceipt:"",custodyReceipt:""};schema.producerReceipt=mac("a-schema","u4-native-schema",{id:schema.id,version:schema.version,sourceId:schema.sourceId,pathPrefix:schema.pathPrefix,schemaSha256:schema.schemaSha256,semanticSchemaDigest:schema.semanticSchemaDigest});schema.custodyReceipt=mac("a-custody","u4-native-schema-custody",{id:schema.id,schemaBytesBase64:schema.schemaBytesBase64,schemaSha256:schema.schemaSha256,producerAuthorityId:schema.producerAuthorityId});const v:any={schema:U4_SOURCE_INVENTORY_SCHEMA,fixtureKind:"synthetic",denominatorScope:"fixture-local",empiricalRegistration:false,closureClaim:false,campaignId:"organization-universality-2026-v9",u3Anchors:structuredClone(U4_U3_ANCHORS),sourceRegistryDigest:reg.digest,calculusDigest:calc.digest,assurance:{level:"synthetic-contract-only",externalTruth:"deferred",promotionAllowed:false},authorities,sources:[{id:"source",sourceSystemId:"synthetic-system",sourceImplementerOwnerId:"implementer",frontendOwnerId:"frontend",stratumId:"coding",profileId:"base",factIds:facts.map(f=>f.id)}],provenance,nativeSchemas:[schema],facts,conflicts:[],chronology:facts.map(f=>({id:"chronology-"+f.id,factId:f.id,observedAt:"2025-12-01T00:00:00.000Z",frozenAt:"2025-12-31T00:00:00.000Z",postResultMutation:false})).sort((a,b)=>a.id.localeCompare(b.id)),dimensions,residualFactIds:[],chronologyPolicy:{claimDigest:U4_V9_CHRONOLOGY_ANCHOR.claimDigest,cutoffAt:U4_V9_CHRONOLOGY_ANCHOR.cutoffAt,frontendOutcomeNotBefore:"2026-08-01T00:00:00.000Z"},freezerAuthorityId:"a-freezer",frontendAuthorityId:"a-frontend",freezeReceipt:""};v.freezeReceipt=mac("a-freezer","u4-freeze",{inventoryDigest:computeU4SourceInventoryDigest({...v,freezeReceipt:""}),calculusDigest:v.calculusDigest,sourceRegistryDigest:v.sourceRegistryDigest,frontendOutcomeNotBefore:v.chronologyPolicy.frontendOutcomeNotBefore});return v;
};
const trustedFor=(v:any):U4TrustedVerificationInputs=>({authorityKeys:authoritySpecs.map(([authorityId,ownerId,role])=>({authorityId,ownerId,role,keyBase64:key(authorityId).toString("base64"),verificationKeyDigest:H(key(authorityId))})).sort((a,b)=>a.authorityId.localeCompare(b.authorityId)),chronology:{...v.chronologyPolicy,freezerAuthorityId:v.freezerAuthorityId,receipt:v.freezeReceipt}});
export function createU4AuthenticatedTestFixture(scenario:"base"|"critical-gap"|"noncritical-gap"="base"){const raw:any=inventory(),calculusValue=calculus(),sourceRegistry=registry();if(scenario!=="base"){const target=raw.facts.find((f:any)=>scenario==="critical-gap"?f.criticality==="critical":f.criticality==="noncritical"),base=raw.provenance.find((p:any)=>p.id==="p-probe"),bytes=Buffer.from([0xff,0x00,0x81,0x42]),id=`p-probe-opaque-${target.id}`;const p:any={...base,id,mediaType:"application/octet-stream",bytesBase64:bytes.toString("base64"),byteLength:bytes.length,sha256:H(bytes)};const body={id:p.id,sourceId:p.sourceId,nativeSchemaId:p.nativeSchemaId,kind:p.kind,sourceVersion:p.sourceVersion,mediaType:p.mediaType,acquiredAt:p.acquiredAt,sha256:p.sha256};p.bodyReceipt=mac(p.producerAuthorityId,"u4-provenance-body",body);p.custodyReceipt=mac(p.custodyAuthorityId,"u4-provenance-custody",{...body,producerAuthorityId:p.producerAuthorityId,bytesBase64:p.bytesBase64});raw.provenance.push(p);raw.provenance.sort((a:any,b:any)=>a.id.localeCompare(b.id));target.provenanceIds=target.provenanceIds.map((x:string)=>x==="p-probe"?id:x).sort();target.factReceipt=mac("a-semantic","u4-fact",{...target,factReceipt:undefined,criticalityEvidence:{...target.criticalityEvidence,receipt:undefined}})}let trusted=trustedFor(raw);raw.freezeReceipt=mac("a-freezer","u4-freeze",{inventoryDigest:computeU4SourceInventoryDigest({...raw,freezeReceipt:""}),calculusDigest:raw.calculusDigest,sourceRegistryDigest:raw.sourceRegistryDigest,frontendOutcomeNotBefore:raw.chronologyPolicy.frontendOutcomeNotBefore});trusted=trustedFor(raw);const frozenInventory=freezeU4SourceInventory(raw,calculusValue,sourceRegistry,trusted);return{rawInventory:raw,inventory:frozenInventory,calculus:calculusValue,sourceRegistry,trusted} as const;}
export function createU4AuthenticatedExtractionSpecification(inv:any,trusted:any,_scenario:"base"|"critical-gap"|"noncritical-gap"="base"):U4ExtractionSpecification{const kind=(provenanceKind:string)=>provenanceKind==="source-behavior"?"behavior-proposition":provenanceKind==="runtime-probe"?"probe-proposition":provenanceKind==="native-schema"?"native-schema-leaf":"official-spec-leaf",provenance=new Map(inv.provenance.map((p:any)=>[p.id,p]));const locators=inv.facts.flatMap((f:any)=>f.provenanceIds.map((id:string)=>{const p:any=provenance.get(id),opaque=p.mediaType!=="application/json";return createU4ExtractionLocator({slotId:p.kind==="native-schema"?"shape":"value",slotTaxonomy:kind(p.kind) as any,factId:f.id,provenanceId:p.id,provenanceKind:p.kind,sourceId:p.sourceId,sourceVersion:p.sourceVersion,nativePath:f.nativePath,nativeSchemaId:f.nativeSchemaId,mode:opaque?"terminal":"json-pointer",pointer:opaque?null:p.kind==="native-schema"?"/type":"/claim",terminal:opaque?"opaque":null})}));const documents=inv.provenance.map((p:any)=>{const opaque=p.mediaType!=="application/json";return{provenanceId:p.id,sourceId:p.sourceId,sourceVersion:p.sourceVersion,provenanceKind:p.kind,traversal:opaque?"opaque-terminal-only":"canonical-json-leaves-v1",allowedLeafPointers:opaque?[]:[p.kind==="native-schema"?"/type":"/claim"]}});const spec:any={schema:"open-autonomy.u4-extraction-specification.v1",fixtureKind:"synthetic",denominatorScope:"fixture-local",empiricalRegistration:false,closureClaim:false,genericExtractorCompleteness:"deferred-external-validation",campaignId:inv.campaignId,sourceRegistryDigest:inv.sourceRegistryDigest,calculusDigest:inv.calculusDigest,issuedAt:"2026-07-17T03:00:00.000Z",authorityId:"a-semantic",documents,slots:inv.facts.flatMap((f:any)=>[{id:"shape",factId:f.id,denotation:"native value shape",comparisonKinds:[],metadataKinds:["native-schema"],requiredComparisonKinds:[],criticalityPolicy:"inherit-fact"},{id:"value",factId:f.id,denotation:"declared and observed value",comparisonKinds:["official-spec","runtime-probe","source-behavior"],metadataKinds:[],requiredComparisonKinds:["official-spec","runtime-probe","source-behavior"],criticalityPolicy:"inherit-fact"}]),locators:locators.sort((a:any,b:any)=>a.id.localeCompare(b.id)),receipt:""};const key=trusted.authorityKeys.find((x:any)=>x.authorityId==="a-semantic").keyBase64;spec.receipt=signU4ExtractionSpecification(key,spec);return spec}
