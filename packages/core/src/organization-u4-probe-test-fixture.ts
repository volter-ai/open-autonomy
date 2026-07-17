import {createHash,createHmac} from "node:crypto";
import {canonicalSemanticJson as C} from "./organization-canonical";
import {createU4AuthenticatedTestFixture} from "./organization-u4-test-fixture";
import {computeU4FrontendReplayResultDigest} from "./organization-u4-inventory-replay-certificate";
import {freezeU4ProbePlan,freezeU4ProbeRun,freezeU4SourceBehaviorTraceJoin,freezeU4VerifiedProbeBundle,computeU4ProbeInvocationId,computeU4ProbeCorrelationId,computeU4ProbeMaterialDigest,computeU4SyntheticU3TrustAnchorDigest} from "./organization-u4-probe-protocol";
import {U3_EVALUATOR_SCHEMA,freezeU3TraceEvaluationContract,integrityU3Event,signU3Record,evaluateU3ObservationTrace,computeU3SourceTraceDigest} from "./organization-u3-observation-evaluator";
const H=(x:string|Uint8Array)=>("sha256:"+createHash("sha256").update(x).digest("hex")) as any;
const key=(id:string)=>Buffer.from(id.padEnd(32,"!")).subarray(0,32);
const mac=(id:string,d:string,b:unknown)=>createHmac("sha256",key(id)).update(d).update("\0").update(C(b)).digest("hex");
const U3K = {
  source: "u4-source-secret",
  lifted: "u4-lifted-secret",
  evidence: "u4-evidence-secret",
  provenance: "u4-provenance-secret",
  custody: "u4-custody-secret",
};
const u3sort = <T extends { id: string }>(xs: T[]) =>
  xs.sort((a, b) => a.id.localeCompare(b.id));
function creditedU3Fixture(calculus: any, invocationId: string, runId = "run") {
  const shape0 = {
      id: "event-shape",
      schemaId: "event-schema",
      schemaVersion: "1",
      schemaDigest: calculus.schemas.find((s: any) => s.id === "event-schema")
        .schemaSha256,
      type: "boolean" as const,
      required: [],
      properties: [],
    },
    contract = freezeU3TraceEvaluationContract({
      schema: U3_EVALUATOR_SCHEMA,
      fixtureKind: "synthetic",
      calculusDigest: calculus.digest,
      shapes: [{ ...shape0, semanticDigest: H(C(shape0)) }],
      adapters: [{ id: "adapter", version: "1", digest: H("adapter") }],
      compilers: [{ id: "compiler", version: "1", digest: H("compiler") }],
      runtimes: [{ id: "runtime", version: "1", digest: H("runtime") }],
      authorities: u3sort([
        {
          id: "custody",
          role: "custodian" as const,
          trustRootDigest: H("custody-root"),
          verificationKeyDigest: H(U3K.custody),
        },
        {
          id: "evidence",
          role: "evidence-producer" as const,
          trustRootDigest: H("evidence-root"),
          verificationKeyDigest: H(U3K.evidence),
        },
        {
          id: "lifted",
          role: "trace-producer" as const,
          trustRootDigest: calculus.authenticationPolicies[0].trustRootSha256,
          verificationKeyDigest: H(U3K.lifted),
        },
        {
          id: "provenance",
          role: "provenance-producer" as const,
          trustRootDigest: H("provenance-root"),
          verificationKeyDigest: H(U3K.provenance),
        },
        {
          id: "source",
          role: "trace-producer" as const,
          trustRootDigest: calculus.authenticationPolicies[0].trustRootSha256,
          verificationKeyDigest: H(U3K.source),
        },
      ]),
      quotients: [],
    });
  const provenance: any[] = [],
    evidence: any[] = [];
  const makeTrace = (
    side: "source" | "lifted",
    authorityId: "source" | "lifted",
  ) => {
    const events: any[] = [];
    for (const observation of calculus.profiles
      .find((p: any) => p.id === "base")
      .observationIds.map((id: string) =>
        calculus.observations.find((o: any) => o.id === id),
      )) {
      for (let n = 0; n < 2; n++) {
        const suffix = `${side}-${observation.id}-${n}`,
          provenanceId = `provenance-${suffix}`,
          evidenceId = `evidence-${suffix}`,
          p0 = {
            id: provenanceId,
            producerAuthorityId: "provenance",
            custodyAuthorityId: "custody",
            artifactDigest: H(`artifact-${suffix}`),
          },
          producerReceipt = signU3Record(U3K.provenance, p0),
          p1 = { ...p0, producerReceipt };
        provenance.push({
          ...p1,
          custodyReceipt: signU3Record(U3K.custody, p1),
        });
        const event0: any = {
          id: `event-${suffix}`,
          sampleId: `sample-${n}`,
          observationId: observation.id,
          runId,
          traceId: `trace-${side}`,
          side,
          subject: {
            sort: observation.subjectSort,
            providerId: observation.providerId,
            componentId: observation.componentId,
          },
          schemaId: observation.nativeSchemaId,
          schemaVersion: observation.nativeSchemaVersion,
          timestamp: null,
          logicalOrder: events.length + 1,
          causalParentIds: [],
          correlationId: computeU4ProbeCorrelationId(
            invocationId,
            observation.id,
            `sample-${n}`,
          ),
          epistemic: "verification",
          provenanceId,
          evidenceId,
          adapterId: "adapter",
          adapterVersion: "1",
          adapterDigest: H("adapter"),
          compilerId: "compiler",
          compilerVersion: "1",
          compilerDigest: H("compiler"),
          runtimeId: "runtime",
          runtimeVersion: "1",
          runtimeDigest: H("runtime"),
          payload: true,
        };
        const integrityDigest = integrityU3Event(event0),
          event = {
            ...event0,
            integrityDigest,
            authentication: {
              authorityId,
              receipt: signU3Record(U3K[authorityId], {
                ...event0,
                integrityDigest,
              }),
            },
          };
        events.push(event);
        const e0: any = {
            id: evidenceId,
            eventId: event.id,
            payloadDigest: H(C(event.payload)),
            runId,
            subjectDigest: H(C(event.subject)),
            provenanceDigest: p0.artifactDigest,
            custodyDigest: H(C({ custodyAuthorityId: "custody" })),
            authorityId: "evidence",
            custodyAuthorityId: "custody",
          },
          receipt = signU3Record(U3K.evidence, e0),
          e1 = { ...e0, receipt };
        evidence.push({ ...e1, custodyReceipt: signU3Record(U3K.custody, e1) });
      }
    }
    const t0: any = {
        schema: "open-autonomy.u3-trace.v2",
        version: "2.0.0",
        traceId: `trace-${side}`,
        side,
        runId,
        producerAuthorityId: authorityId,
        start: null,
        end: null,
        logicalStart: 0,
        logicalEnd: events.length + 1,
        window: "trace",
        closure: "closed",
        completeness: "complete",
        gapCodes: [],
        events,
        closureCustodianAuthorityId: "custody",
      },
      producerReceipt = signU3Record(U3K[authorityId], t0),
      t1 = { ...t0, producerReceipt };
    return { ...t1, closureReceipt: signU3Record(U3K.custody, t1) };
  };
  const input: any = {
    schema: "open-autonomy.u3-trace-evaluation-input.v2",
    fixtureKind: "synthetic",
    calculusDigest: calculus.digest,
    contractDigest: contract.digest,
    profileId: "base",
    runId,
    source: makeTrace("source", "source"),
    lifted: makeTrace("lifted", "lifted"),
    evidence,
    provenance,
    losses: [],
  };
  u3sort(evidence);
  u3sort(provenance);
  const u3Trusted = { keys: U3K },
    report = evaluateU3ObservationTrace(calculus, contract, input, u3Trusted);
  return { contract, input, u3Trusted, report };
}
export const replayInputs = () => {
  const fixture = createU4AuthenticatedTestFixture(),
    {inventory, calculus, sourceRegistry, trusted} = fixture,
    seedU3 = creditedU3Fixture(calculus, "placeholder"),
    u3Contract: any = seedU3.contract,
    fact = inventory.facts[0],
    planBody: any = {
      schema: "open-autonomy.u4-probe-protocol.v1",
      fixtureKind: "synthetic",
      denominatorScope: "fixture-local",
      empiricalRegistration: false,
      closureClaim: false,
      campaignId: "organization-universality-2026-v9",
      inventoryDigest: inventory.digest,
      calculusDigest: calculus.digest,
      u3ContractDigest: u3Contract.digest,
      issuedAt: "2026-08-01T00:00:00.000Z",
      executionNotBefore: "2026-08-02T00:00:00.000Z",
      executionNotAfter: "2026-08-03T00:00:00.000Z",
      plannerAuthorityId: "a-semantic",
      custodyAuthorityId: "a-custody",
      cases: [
        {
          id: "case",
          sourceId: "source",
          sourceVersion: "1",
          factIds: inventory.facts.map((f) => f.id).sort(),
          observationIds: [
            ...new Set(
              inventory.facts.flatMap((f) => f.mandatoryObservationIds),
            ),
          ].sort(),
          factResultBindings: inventory.facts.map((f) => ({ factId: f.id, semanticSlotId: "value", observationIds: [...f.mandatoryObservationIds], stdoutJsonPointer: "", sourceProjection: "u3-observation-source-value-v1", sharedProjectionEquivalenceId: "all-facts-return-same-boolean" })).sort((a,b)=>a.factId.localeCompare(b.factId)),
          runtimeProbeProvenanceId: "p-probe",
          sourceBehaviorProvenanceId: "p-behavior",
          invocation: {
            adapterId: "adapter",
            adapterVersion: "1",
            adapterDigest: H("adapter"),
            inputSchemaId: "input",
            inputSchemaVersion: "1",
            inputCanonicalJson: '{"x":1}',
          },
          bounds: {
            timeoutMs: 1000,
            maxStdoutBytes: 1000,
            maxStderrBytes: 1000,
          },
          repetitions: 1,
          expected: {
            allowedTermination: ["exited"],
            stdoutMode: "exactly-one-canonical-json-value",
            traceWindow: "trace",
          },
        },
      ],
      plannerReceipt: "",
      custodyReceipt: "",
    };
  const pb = { ...planBody };
  delete pb.plannerReceipt;
  delete pb.custodyReceipt;
  planBody.plannerReceipt = mac("a-semantic", "u4-probe-plan", pb);
  planBody.custodyReceipt = mac("a-custody", "u4-probe-plan-custody", {
    ...pb,
    plannerAuthorityId: planBody.plannerAuthorityId,
    plannerReceipt: planBody.plannerReceipt,
  });
  const plan = freezeU4ProbePlan(
      planBody,
      inventory,
      calculus,
      u3Contract,
      trusted,
    ),
    stdout = Buffer.from("true"),
    stderr = Buffer.alloc(0),
    runBody: any = {
      schema: "open-autonomy.u4-probe-run.v1",
      fixtureKind: "synthetic",
      planDigest: plan.digest,
      caseId: "case",
      invocationId: computeU4ProbeInvocationId(plan.digest, "case", 0),
      repetition: 0,
      sourceId: "source",
      sourceVersion: "1",
      runId: "run",
      startedAt: "2026-08-02T01:00:00.000Z",
      endedAt: "2026-08-02T01:00:01.000Z",
      termination: "exited",
      exitCode: 0,
      signal: null,
      stdoutBase64: stdout.toString("base64"),
      stderrBase64: stderr.toString("base64"),
      stdoutSha256: H(stdout),
      stderrSha256: H(stderr),
      operatorAuthorityId: "a-probe",
      custodyAuthorityId: "a-custody",
      operatorReceipt: "",
      custodyReceipt: "",
    };
  const rb = { ...runBody };
  delete rb.operatorReceipt;
  delete rb.custodyReceipt;
  runBody.operatorReceipt = mac("a-probe", "u4-probe-run", rb);
  runBody.custodyReceipt = mac("a-custody", "u4-probe-run-custody", {
    ...rb,
    operatorAuthorityId: runBody.operatorAuthorityId,
    operatorReceipt: runBody.operatorReceipt,
  });
  const run = freezeU4ProbeRun(runBody, plan, inventory, trusted),
    u3 = creditedU3Fixture(calculus, run.invocationId),
    sourceEvents = u3.input.source.events.filter((e: any) =>
      plan.cases[0].observationIds.includes(e.observationId),
    ),
    joinBody: any = {
      schema: "open-autonomy.u4-source-behavior-trace-join.v1",
      fixtureKind: "synthetic",
      semanticProjectionStatus: "verified-u3-source-projection",
      inventoryDigest: inventory.digest,
      calculusDigest: calculus.digest,
      u3ContractDigest: u3Contract.digest,
      planDigest: plan.digest,
      probeRunDigest: run.digest,
      caseId: "case",
      invocationId: run.invocationId,
      runId: run.runId,
      sourceId: "source",
      factIds: plan.cases[0].factIds,
      observationIds: plan.cases[0].observationIds,
      sourceBehaviorProvenanceId: "p-behavior",
      sourceTraceDigest: computeU3SourceTraceDigest(u3.input.source),
      sourceEventIds: sourceEvents.map((e: any) => e.id).sort(),
      sourceEvidenceIds: [
        ...new Set(sourceEvents.map((e: any) => e.evidenceId)),
      ].sort(),
      sourceProvenanceIds: [
        ...new Set(sourceEvents.map((e: any) => e.provenanceId)),
      ].sort(),
      observerAuthorityId: "a-behavior",
      custodyAuthorityId: "a-custody",
      observerReceipt: "",
      custodyReceipt: "",
    };
  const jb = { ...joinBody };
  delete jb.observerReceipt;
  delete jb.custodyReceipt;
  joinBody.observerReceipt = mac(
    "a-behavior",
    "u4-source-behavior-trace-join",
    jb,
  );
  joinBody.custodyReceipt = mac(
    "a-custody",
    "u4-source-behavior-trace-join-custody",
    {
      ...jb,
      observerAuthorityId: joinBody.observerAuthorityId,
      observerReceipt: joinBody.observerReceipt,
    },
  );
  const join = freezeU4SourceBehaviorTraceJoin(
      joinBody,
      run,
      plan,
      inventory,
      calculus,
      u3Contract,
      u3.input,
      u3.u3Trusted,
      trusted,
    ),
    materials: any[] = [
      {
        invocationId: run.invocationId,
        u3Input: u3.input,
        u3Trusted: u3.u3Trusted,
      },
    ],
    bundleBody: any = {
      schema: "open-autonomy.u4-verified-probe-bundle.v1",
      fixtureKind: "synthetic",
      denominatorScope: "fixture-local",
      empiricalRegistration: false,
      closureClaim: false,
      inventoryDigest: inventory.digest,
      calculusDigest: calculus.digest,
      u3ContractDigest: u3Contract.digest,
      u3TrustAnchorDigest: computeU4SyntheticU3TrustAnchorDigest(
        u3Contract,
        u3.u3Trusted,
      ),
      materialDigests: materials.map(computeU4ProbeMaterialDigest).sort(),
      plan,
      executions: [
        {
          invocationId: run.invocationId,
          disposition: "credited",
          noncreditReason: null,
          run,
          join,
          u3InputDigest: H(
            `open-autonomy.u4-probe-u3-input.v1\0${C(u3.input)}`,
          ),
          u3ReportDigest: u3.report.digest,
        },
      ],
    },
    bundle = freezeU4VerifiedProbeBundle(
      bundleBody,
      materials,
      inventory,
      calculus,
      u3Contract,
      trusted,
      sourceRegistry,
    ),
    probeBundle = { bundle, materials, u3Contract },
    outcome: any = {
      schema: "open-autonomy.u4-frontend-outcome.v1",
      at: "2026-08-04T00:00:00.000Z",
      authorityId: "a-frontend",
      ownerId: "frontend",
      resultDigest: computeU4FrontendReplayResultDigest(
        inventory.digest,
        calculus.digest,
        sourceRegistry.digest,
        bundle.digest,
        bundle.u3ContractDigest,
        bundle.materialDigests,
      ),
      receipt: "",
    };
  outcome.receipt = mac("a-frontend", "u4-frontend-outcome", {
    schema: outcome.schema,
    at: outcome.at,
    authorityId: outcome.authorityId,
    ownerId: outcome.ownerId,
    resultDigest: outcome.resultDigest,
  });
  return { inventory, calculus, sourceRegistry, trusted, probeBundle, outcome };
};
export function replan(x:any,cases:any[]){const{digest:_,...p}=structuredClone(x.probeBundle.bundle.plan);void _;p.cases=cases;p.plannerReceipt="";p.custodyReceipt="";const pb={...p};delete pb.plannerReceipt;delete pb.custodyReceipt;p.plannerReceipt=mac("a-semantic","u4-probe-plan",pb);p.custodyReceipt=mac("a-custody","u4-probe-plan-custody",{...pb,plannerAuthorityId:p.plannerAuthorityId,plannerReceipt:p.plannerReceipt});return freezeU4ProbePlan(p,x.inventory,x.calculus,x.probeBundle.u3Contract,x.trusted)}
export function makeRun(x:any,plan:any,caseId:string,repetition:number,kind:"credited"|"noncredit",creditedStdout="true"){const stdout=Buffer.from(kind==="credited"?creditedStdout:"{"),stderr=Buffer.alloc(0),c=plan.cases.find((v:any)=>v.id===caseId),r:any={schema:"open-autonomy.u4-probe-run.v1",fixtureKind:"synthetic",planDigest:plan.digest,caseId,invocationId:computeU4ProbeInvocationId(plan.digest,caseId,repetition),repetition,sourceId:c.sourceId,sourceVersion:c.sourceVersion,runId:`run.${caseId}.${repetition}`,startedAt:`2026-08-02T0${repetition+1}:00:00.000Z`,endedAt:`2026-08-02T0${repetition+1}:00:01.000Z`,termination:"exited",exitCode:0,signal:null,stdoutBase64:stdout.toString("base64"),stderrBase64:stderr.toString("base64"),stdoutSha256:H(stdout),stderrSha256:H(stderr),operatorAuthorityId:"a-probe",custodyAuthorityId:"a-custody",operatorReceipt:"",custodyReceipt:""},rb={...r};delete rb.operatorReceipt;delete rb.custodyReceipt;r.operatorReceipt=mac("a-probe","u4-probe-run",rb);r.custodyReceipt=mac("a-custody","u4-probe-run-custody",{...rb,operatorAuthorityId:r.operatorAuthorityId,operatorReceipt:r.operatorReceipt});return freezeU4ProbeRun(r,plan,x.inventory,x.trusted)}
export function creditedExecution(x:any,plan:any,run:any){const c=plan.cases.find((v:any)=>v.id===run.caseId),u3=creditedU3Fixture(x.calculus,run.invocationId,run.runId),events=u3.input.source.events.filter((e:any)=>c.observationIds.includes(e.observationId)),j:any={schema:"open-autonomy.u4-source-behavior-trace-join.v1",fixtureKind:"synthetic",semanticProjectionStatus:"verified-u3-source-projection",inventoryDigest:x.inventory.digest,calculusDigest:x.calculus.digest,u3ContractDigest:x.probeBundle.u3Contract.digest,planDigest:plan.digest,probeRunDigest:run.digest,caseId:c.id,invocationId:run.invocationId,runId:run.runId,sourceId:c.sourceId,factIds:c.factIds,observationIds:c.observationIds,sourceBehaviorProvenanceId:c.sourceBehaviorProvenanceId,sourceTraceDigest:computeU3SourceTraceDigest(u3.input.source),sourceEventIds:events.map((e:any)=>e.id).sort(),sourceEvidenceIds:[...new Set(events.map((e:any)=>e.evidenceId))].sort(),sourceProvenanceIds:[...new Set(events.map((e:any)=>e.provenanceId))].sort(),observerAuthorityId:"a-behavior",custodyAuthorityId:"a-custody",observerReceipt:"",custodyReceipt:""},jb={...j};delete jb.observerReceipt;delete jb.custodyReceipt;j.observerReceipt=mac("a-behavior","u4-source-behavior-trace-join",jb);j.custodyReceipt=mac("a-custody","u4-source-behavior-trace-join-custody",{...jb,observerAuthorityId:j.observerAuthorityId,observerReceipt:j.observerReceipt});const join=freezeU4SourceBehaviorTraceJoin(j,run,plan,x.inventory,x.calculus,x.probeBundle.u3Contract,u3.input,u3.u3Trusted,x.trusted),material={invocationId:run.invocationId,u3Input:u3.input,u3Trusted:u3.u3Trusted};return{material,execution:{invocationId:run.invocationId,disposition:"credited",noncreditReason:null,run,join,u3InputDigest:H(`open-autonomy.u4-probe-u3-input.v1\0${C(u3.input)}`),u3ReportDigest:u3.report.digest}}}
export function replayVariant(kinds:Array<{caseId:string;repetition:number;kind:"credited"|"noncredit"}>,multiCase=false){const x:any=replayInputs(),base=structuredClone(x.probeBundle.bundle.plan.cases[0]),facts=[...base.factIds],cases=multiCase?[{...base,id:"case.a",factIds:facts.slice(0,Math.ceil(facts.length/2)),factResultBindings:base.factResultBindings.filter((b:any)=>facts.slice(0,Math.ceil(facts.length/2)).includes(b.factId)),repetitions:2,expected:{...base.expected,allowedTermination:["exited"]}},{...base,id:"case.b",factIds:facts.slice(Math.ceil(facts.length/2)),factResultBindings:base.factResultBindings.filter((b:any)=>facts.slice(Math.ceil(facts.length/2)).includes(b.factId)),repetitions:1,expected:{...base.expected,allowedTermination:["exited"]}}]:[{...base,repetitions:2,expected:{...base.expected,allowedTermination:["exited"]}}],plan=replan(x,cases),materials:any[]=[],executions:any[]=[];for(const k of kinds){const run=makeRun(x,plan,k.caseId,k.repetition,k.kind);if(k.kind==="credited"){const ce=creditedExecution(x,plan,run);materials.push(ce.material);executions.push(ce.execution)}else executions.push({invocationId:run.invocationId,disposition:"noncredit",noncreditReason:"malformed-output",run,join:null,u3InputDigest:null,u3ReportDigest:null})}executions.sort((a,b)=>a.invocationId.localeCompare(b.invocationId));const trustedPolicy=materials[0]?.u3Trusted??{keys:{}},body:any={schema:"open-autonomy.u4-verified-probe-bundle.v1",fixtureKind:"synthetic",denominatorScope:"fixture-local",empiricalRegistration:false,closureClaim:false,inventoryDigest:x.inventory.digest,calculusDigest:x.calculus.digest,u3ContractDigest:x.probeBundle.u3Contract.digest,u3TrustAnchorDigest:computeU4SyntheticU3TrustAnchorDigest(x.probeBundle.u3Contract,trustedPolicy),materialDigests:materials.map(computeU4ProbeMaterialDigest).sort(),plan,executions},bundle=freezeU4VerifiedProbeBundle(body,materials,x.inventory,x.calculus,x.probeBundle.u3Contract,x.trusted,x.sourceRegistry);x.probeBundle={bundle,materials,u3Contract:x.probeBundle.u3Contract};x.outcome.resultDigest=computeU4FrontendReplayResultDigest(x.inventory.digest,x.calculus.digest,x.sourceRegistry.digest,bundle.digest,bundle.u3ContractDigest,bundle.materialDigests);x.outcome.receipt=mac("a-frontend","u4-frontend-outcome",{schema:x.outcome.schema,at:x.outcome.at,authorityId:x.outcome.authorityId,ownerId:x.outcome.ownerId,resultDigest:x.outcome.resultDigest});return x}
