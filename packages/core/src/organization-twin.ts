import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";

export type ParameterSource = "observed" | "estimated" | "assumed";
export type TwinParameter = { name: string; value: number; standardError: number; source: ParameterSource; observations: number; identifiable: boolean; confoundedWith: string[] };
export type ServiceDistribution = { kind: "deterministic" | "lognormal"; meanMs: TwinParameter; standardDeviationMs: TwinParameter };
export type TwinNode = { id: string; provider: string; capacity: number; queueLimit: number; service: ServiceDistribution; failureProbability: TwinParameter; costPerMs: TwinParameter; human: boolean; retryLimit: number; reviewNode?: string; routes: Array<{ destination: string; probability: number }> };
export type TwinSpecification = { schema: "autonomy.organization-twin.v1"; version: string; nodes: TwinNode[]; budget: number; abstractionError: Record<TwinMetric, number>; assumptions: string[] };
export type TwinMetric = "throughput" | "latencyMs" | "cost" | "quality" | "recoveryMs";
export type WorkState = { id: string; priority: number; node: string; attempt: number; status: "queued" | "running" | "review" | "done" | "failed" | "blocked"; arrivedAtMs: number; startedAtMs?: number; completedAtMs?: number; accumulatedCost: number; humanMinutes: number; quality?: number };
export type TwinState = { nowMs: number; sequence: number; work: Record<string, WorkState>; queues: Record<string, string[]>; running: Record<string, string[]>; spent: number; completed: number; failed: number; trace: TwinEvent[] };
export type TwinEvent =
  | { sequence: number; atMs: number; kind: "arrival"; workId: string; node: string; priority: number }
  | { sequence: number; atMs: number; kind: "start"; workId: string; node: string; attempt: number }
  | { sequence: number; atMs: number; kind: "complete"; workId: string; node: string; attempt: number; cost: number; quality: number; humanMinutes: number }
  | { sequence: number; atMs: number; kind: "failure"; workId: string; node: string; attempt: number; retry: boolean }
  | { sequence: number; atMs: number; kind: "route"; workId: string; from: string; to: string }
  | { sequence: number; atMs: number; kind: "block"; workId: string; reason: string };

export class ExecutableOrganizationTwin {
  private nodes: Map<string, TwinNode>;
  private stateValue: TwinState;
  constructor(readonly specification: TwinSpecification) {
    validateSpecification(specification); this.nodes = new Map(specification.nodes.map((n) => [n.id, structuredClone(n)]));
    this.stateValue = { nowMs: 0, sequence: 0, work: {}, queues: Object.fromEntries(specification.nodes.map((n) => [n.id, []])), running: Object.fromEntries(specification.nodes.map((n) => [n.id, []])), spent: 0, completed: 0, failed: 0, trace: [] };
  }
  apply(event: TwinEvent) {
    if (event.sequence !== this.stateValue.sequence + 1 || event.atMs < this.stateValue.nowMs) throw new Error("non-authoritative event ordering");
    const state = this.stateValue, node = "node" in event ? this.nodes.get(event.node) : undefined;
    if ("node" in event && !node) throw new Error("event references unknown node");
    if (event.kind === "arrival") {
      if (state.work[event.workId]) throw new Error("work identity equivocation");
      if (state.queues[event.node]!.length >= node!.queueLimit) throw new Error("queue capacity exceeded without blocking event");
      state.work[event.workId] = { id: event.workId, priority: event.priority, node: event.node, attempt: 0, status: "queued", arrivedAtMs: event.atMs, accumulatedCost: 0, humanMinutes: 0 };
      state.queues[event.node]!.push(event.workId); this.sortQueue(event.node);
    } else {
      const work = state.work[event.workId]; if (!work) throw new Error("event references unknown work identity");
      if (event.kind === "start") {
        if (work.status !== "queued" || work.node !== event.node || event.attempt !== work.attempt + 1 || state.running[event.node]!.length >= node!.capacity || state.queues[event.node]![0] !== work.id) throw new Error("invalid queue/service transition");
        state.queues[event.node]!.shift(); state.running[event.node]!.push(work.id); work.status = "running"; work.startedAtMs = event.atMs; work.attempt = event.attempt;
      } else if (event.kind === "complete") {
        this.assertRunning(work, event.node, event.attempt); if (event.cost < 0 || event.humanMinutes < 0 || event.quality < 0 || event.quality > 1) throw new Error("invalid completion measures");
        this.removeRunning(event.node, work.id); work.status = node!.reviewNode ? "review" : "done"; work.completedAtMs = event.atMs; work.accumulatedCost += event.cost; work.humanMinutes += event.humanMinutes; work.quality = event.quality; state.spent += event.cost;
        if (state.spent > this.specification.budget) work.status = "blocked"; else if (!node!.reviewNode) state.completed++;
      } else if (event.kind === "failure") {
        this.assertRunning(work, event.node, event.attempt); this.removeRunning(event.node, work.id);
        if (event.retry && work.attempt <= node!.retryLimit) { work.status = "queued"; state.queues[event.node]!.push(work.id); this.sortQueue(event.node); } else { work.status = "failed"; state.failed++; }
      } else if (event.kind === "route") {
        const from = this.nodes.get(event.from), to = this.nodes.get(event.to); if (!from || !to || work.node !== event.from || !["review", "done"].includes(work.status) || !from.routes.some((r) => r.destination === event.to)) throw new Error("invalid routing transition");
        work.node = event.to; work.status = "queued"; state.queues[event.to]!.push(work.id); this.sortQueue(event.to);
      } else { work.status = "blocked"; }
    }
    state.sequence = event.sequence; state.nowMs = event.atMs; state.trace.push(structuredClone(event));
    return this.state();
  }
  replay(events: TwinEvent[]) { for (const event of events) this.apply(event); return this.state(); }
  state() { return structuredClone(this.stateValue); }
  private assertRunning(work: WorkState, node: string, attempt: number) { if (work.status !== "running" || work.node !== node || work.attempt !== attempt || !this.stateValue.running[node]!.includes(work.id)) throw new Error("invalid running-work transition"); }
  private removeRunning(node: string, workId: string) { this.stateValue.running[node] = this.stateValue.running[node]!.filter((id) => id !== workId); }
  private sortQueue(node: string) { this.stateValue.queues[node]!.sort((a, b) => this.stateValue.work[b]!.priority - this.stateValue.work[a]!.priority || this.stateValue.work[a]!.arrivedAtMs - this.stateValue.work[b]!.arrivedAtMs || a.localeCompare(b)); }
}

export type CalibrationHistory = { events: TwinEvent[]; authoritativeDigest: string };
export type InferenceResult = { parameters: TwinParameter[]; diagnostics: IdentifiabilityDiagnostic[]; replayDigest: string };
export type IdentifiabilityDiagnostic = { parameter: string; status: "identified" | "weak" | "unidentifiable"; reason: string; observationallyEquivalent: string[] };

export function inferTwinParameters(specification: TwinSpecification, histories: CalibrationHistory[]): InferenceResult {
  if (!histories.length) throw new Error("calibration history required");
  const durations = new Map<string, number[]>(), failures = new Map<string, { failed: number; total: number }>();
  for (const history of histories) {
    if (history.authoritativeDigest !== twinDigest(history.events)) throw new Error("authoritative history digest mismatch");
    const twin = new ExecutableOrganizationTwin(specification); twin.replay(history.events);
    const starts = new Map<string, Extract<TwinEvent, { kind: "start" }>>();
    for (const event of history.events) {
      if (event.kind === "start") starts.set(`${event.workId}:${event.attempt}`, event);
      if (event.kind === "complete" || event.kind === "failure") { const start = starts.get(`${event.workId}:${event.attempt}`); if (start) { const list = durations.get(event.node) ?? []; list.push(event.atMs - start.atMs); durations.set(event.node, list); const count = failures.get(event.node) ?? { failed: 0, total: 0 }; count.total++; if (event.kind === "failure") count.failed++; failures.set(event.node, count); } }
    }
  }
  const parameters: TwinParameter[] = [], diagnostics: IdentifiabilityDiagnostic[] = [];
  for (const node of specification.nodes) {
    const values = durations.get(node.id) ?? [], count = failures.get(node.id) ?? { failed: 0, total: 0 };
    parameters.push(estimate(`${node.id}.service.meanMs`, values, estimateMean(values)));
    parameters.push(estimate(`${node.id}.failureProbability`, Array.from({ length: count.total }, (_, i) => i < count.failed ? 1 : 0), count.total ? count.failed / count.total : node.failureProbability.value));
    for (const parameter of parameters.slice(-2)) { const diagnostic = identify(parameter, specification); parameter.identifiable = diagnostic.status === "identified"; parameter.confoundedWith = diagnostic.observationallyEquivalent; diagnostics.push(diagnostic); }
  }
  return { parameters, diagnostics, replayDigest: twinDigest(histories.map((h) => h.authoritativeDigest)) };
}

function estimate(name: string, values: number[], fallback: number): TwinParameter { const m = values.length ? estimateMean(values) : fallback, variance = values.length > 1 ? values.reduce((n, x) => n + (x - m) ** 2, 0) / (values.length - 1) : 0; return { name, value: m, standardError: values.length > 1 ? Math.sqrt(variance / values.length) : Number.POSITIVE_INFINITY, source: values.length ? "estimated" : "assumed", observations: values.length, identifiable: false, confoundedWith: [] }; }
function identify(parameter: TwinParameter, spec: TwinSpecification): IdentifiabilityDiagnostic {
  if (parameter.observations < 2 || !Number.isFinite(parameter.standardError)) return { parameter: parameter.name, status: "unidentifiable", reason: "fewer than two informative observations", observationallyEquivalent: [`assumption:${parameter.name}`] };
  const node = parameter.name.split(".")[0]!, routes = spec.nodes.find((n) => n.id === node)?.routes ?? [];
  if (routes.length > 1 && parameter.name.endsWith("service.meanMs")) return { parameter: parameter.name, status: "weak", reason: "service duration is observationally mixed across unrandomized routes", observationallyEquivalent: routes.map((r) => `${node}->${r.destination}`) };
  return { parameter: parameter.name, status: "identified", reason: "repeated direct start-to-terminal observations", observationallyEquivalent: [] };
}

export type TwinPrediction = { metric: TwinMetric; point: number; interval90: [number, number]; bottleneck?: string; provenance: ParameterSource[]; assumptions: string[]; calibrated: boolean };
export function predictTwin(specification: TwinSpecification, parameters: TwinParameter[], arrivals: number, horizonMs: number, calibration?: { heldOutObservations: number; coverage90: number }): TwinPrediction[] {
  if (arrivals < 0 || horizonMs <= 0) throw new Error("prediction horizon invalid");
  const get = (name: string, fallback: TwinParameter) => parameters.find((p) => p.name === name) ?? fallback;
  const relevant = specification.nodes.flatMap((node) => [get(`${node.id}.service.meanMs`, node.service.meanMs), get(`${node.id}.failureProbability`, node.failureProbability), get(`${node.id}.costPerMs`, node.costPerMs)]);
  const evaluate = (values: TwinParameter[]) => { const byName = new Map(values.map((p) => [p.name,p])), nodes = specification.nodes.map((node) => { const service = byName.get(`${node.id}.service.meanMs`) ?? node.service.meanMs, failure = byName.get(`${node.id}.failureProbability`) ?? node.failureProbability, costRate = byName.get(`${node.id}.costPerMs`) ?? node.costPerMs; return { node, service, failure, costRate, capacityThroughput: node.capacity * horizonMs / Math.max(1, service.value) }; }), bottleneck = nodes.reduce((a,b) => a.capacityThroughput < b.capacityThroughput ? a : b), throughput = Math.min(arrivals,bottleneck.capacityThroughput), latencyMs = nodes.reduce((n,x) => n+x.service.value,0), quality = Math.max(0,nodes.reduce((p,x) => p*(1-x.failure.value),1)), cost = nodes.reduce((n,x) => n+throughput*x.service.value*x.costRate.value,0); return { values: { throughput,latencyMs,cost,quality } as Record<Exclude<TwinMetric,"recoveryMs">,number>, bottleneck: bottleneck.node.id }; };
  const baseline = evaluate(relevant), parameterReady = relevant.every((p) => p.source !== "assumed" && p.identifiable && Number.isFinite(p.standardError)), calibrated = parameterReady && !!calibration && calibration.heldOutObservations > 0 && calibration.coverage90 >= .9;
  const make = (metric: Exclude<TwinMetric,"recoveryMs">) => { const point = baseline.values[metric], variance = relevant.reduce((sum,p,index) => { if (!Number.isFinite(p.standardError) || p.standardError === 0) return sum; const perturbed = relevant.map((x,i) => i === index ? { ...x, value: x.value + x.standardError } : x), delta = evaluate(perturbed).values[metric] - point; return sum + delta*delta; },0), half = 1.645*Math.sqrt(variance)+specification.abstractionError[metric]; return { metric,point,interval90:[Math.max(0,point-half),point+half] as [number,number], ...(metric === "throughput" || metric === "latencyMs" ? { bottleneck: baseline.bottleneck } : {}), provenance:[...new Set(relevant.map((p) => p.source))], assumptions:[...specification.assumptions],calibrated }; };
  return [make("throughput"),make("latencyMs"),make("cost"),make("quality")];
}

export type HeldOutObservation = { metric: TwinMetric; value: number };
export type PredictionScore = { observations: number; coverage90: number; meanAbsoluteError: number; calibrated: boolean; falsifying: HeldOutObservation[] };
export function scoreHeldOut(predictions: TwinPrediction[], observed: HeldOutObservation[], minimumCoverage = .9): PredictionScore {
  if (!observed.length) throw new Error("held-out observations required");
  const errors: number[] = [], falsifying: HeldOutObservation[] = []; let covered = 0;
  for (const observation of observed) { const prediction = predictions.find((p) => p.metric === observation.metric); if (!prediction) throw new Error("held-out metric lacks prediction"); const inside = observation.value >= prediction.interval90[0] && observation.value <= prediction.interval90[1]; if (inside) covered++; else falsifying.push(structuredClone(observation)); errors.push(Math.abs(observation.value - prediction.point)); }
  const coverage90 = covered / observed.length;
  return { observations: observed.length, coverage90, meanAbsoluteError: estimateMean(errors), calibrated: predictions.every((p) => p.calibrated) && coverage90 >= minimumCoverage, falsifying };
}

export type RecoveryPrediction = { backlog: number; survivingCapacity: number; pointMs: number; interval90: [number, number]; identifiable: boolean };
export function predictRecovery(backlog: number, node: TwinNode, lostCapacity: number): RecoveryPrediction { const survivingCapacity = node.capacity - lostCapacity; if (backlog < 0 || lostCapacity < 0 || survivingCapacity <= 0) throw new Error("recovery has no feasible surviving capacity"); const pointMs = backlog * node.service.meanMs.value / survivingCapacity, half = 1.645 * (Number.isFinite(node.service.meanMs.standardError) ? node.service.meanMs.standardError : pointMs) + 0; return { backlog, survivingCapacity, pointMs, interval90: [Math.max(0, pointMs - half), pointMs + half], identifiable: node.service.meanMs.identifiable && Number.isFinite(node.service.meanMs.standardError) }; }

export type Intervention = { id: string; parameter: string; value: number };
export type InterventionComparison = { intervention: string; claim: "prediction" | "causal"; baseline: TwinPrediction[]; changed: TwinPrediction[]; deltas: Partial<Record<TwinMetric, number>>; assumptions: string[] };
export function compareIntervention(spec: TwinSpecification, parameters: TwinParameter[], arrivals: number, horizonMs: number, intervention: Intervention, claim: "prediction" | "causal"): InterventionComparison {
  const target = parameters.find((p) => p.name === intervention.parameter); if (!target || intervention.value < 0) throw new Error("intervention target invalid");
  if (claim === "causal" && (!target.identifiable || target.confoundedWith.length || target.source === "assumed")) throw new Error("causal intervention is non-identifiable or confounded");
  const baseline = predictTwin(spec, parameters, arrivals, horizonMs), changed = predictTwin(spec, parameters.map((p) => p.name === target.name ? { ...p, value: intervention.value } : p), arrivals, horizonMs);
  return { intervention: intervention.id, claim, baseline, changed, deltas: Object.fromEntries(changed.map((p) => [p.metric, p.point - baseline.find((b) => b.metric === p.metric)!.point])), assumptions: claim === "prediction" ? ["counterfactual is model prediction, not causal evidence"] : [] };
}

export function ablateNode(spec: TwinSpecification, nodeId: string, parameters: TwinParameter[], arrivals: number, horizonMs: number) { if (!spec.nodes.some((n) => n.id === nodeId) || spec.nodes.length < 2) throw new Error("ablation target invalid"); const baseline = predictTwin(spec, parameters, arrivals, horizonMs), ablated = predictTwin({ ...spec, nodes: spec.nodes.filter((n) => n.id !== nodeId) }, parameters.filter((p) => !p.name.startsWith(`${nodeId}.`)), arrivals, horizonMs); return { nodeId, baseline, ablated, deltas: Object.fromEntries(ablated.map((p) => [p.metric, p.point - baseline.find((b) => b.metric === p.metric)!.point])) }; }

export type SimulatedArrival = { id: string; atMs: number; node: string; priority: number; quality: number };
export type TwinSimulationResult = { seed: number; horizonMs: number; arrived: number; completed: number; failed: number; blocked: number; throughput: number; meanLatencyMs: number; cost: number; quality: number; humanMinutes: number; maximumQueue: Record<string,number>; trace: Array<{atMs:number;kind:"arrival"|"start"|"complete"|"failure"|"route"|"blocked";workId:string;node:string;attempt:number}> };
export function simulateTwin(spec: TwinSpecification, arrivals: SimulatedArrival[], horizonMs: number, seed: number): TwinSimulationResult {
  validateSpecification(spec); if (!Number.isSafeInteger(seed) || horizonMs <= 0 || arrivals.some((a)=>!a.id||a.atMs<0||a.atMs>horizonMs||!spec.nodes.some((n)=>n.id===a.node)||a.quality<0||a.quality>1)||new Set(arrivals.map((a)=>a.id)).size!==arrivals.length) throw new Error("simulation input invalid");
  const random=seededRandom(seed), nodes=new Map(spec.nodes.map((n)=>[n.id,n])), queues=new Map(spec.nodes.map((n)=>[n.id,[] as Array<{arrival:SimulatedArrival;attempt:number;enteredAt:number}>])), running=new Map(spec.nodes.map((n)=>[n.id,0])), events:Array<{atMs:number;serial:number;kind:"arrival"|"terminal";arrival:SimulatedArrival;node:string;attempt:number;failed?:boolean}>=[], trace:TwinSimulationResult["trace"]=[], maximumQueue=Object.fromEntries(spec.nodes.map((n)=>[n.id,0])), serial={value:0}; let cost=0,humanMinutes=0,completed=0,failed=0,blocked=0,qualityTotal=0,latencyTotal=0;
  const push=(event:Omit<(typeof events)[number],"serial">)=>{events.push({...event,serial:serial.value++});events.sort((a,b)=>a.atMs-b.atMs||a.serial-b.serial)}; arrivals.forEach((arrival)=>push({atMs:arrival.atMs,kind:"arrival",arrival,node:arrival.node,attempt:1}));
  const start=(nodeId:string,now:number)=>{const node=nodes.get(nodeId)!,queue=queues.get(nodeId)!;while(running.get(nodeId)!<node.capacity&&queue.length){queue.sort((a,b)=>b.arrival.priority-a.arrival.priority||a.enteredAt-b.enteredAt||a.arrival.id.localeCompare(b.arrival.id));const item=queue.shift()!;running.set(nodeId,running.get(nodeId)!+1);trace.push({atMs:now,kind:"start",workId:item.arrival.id,node:nodeId,attempt:item.attempt});const duration=sampleService(node.service,random),willFail=random()<node.failureProbability.value;push({atMs:Math.min(horizonMs,now+duration),kind:"terminal",arrival:item.arrival,node:nodeId,attempt:item.attempt,failed:willFail});}};
  while(events.length){const event=events.shift()!,node=nodes.get(event.node)!;if(event.kind==="arrival"){const queue=queues.get(event.node)!;trace.push({atMs:event.atMs,kind:"arrival",workId:event.arrival.id,node:event.node,attempt:event.attempt});if(queue.length>=node.queueLimit){blocked++;trace.push({atMs:event.atMs,kind:"blocked",workId:event.arrival.id,node:event.node,attempt:event.attempt});}else{queue.push({arrival:event.arrival,attempt:event.attempt,enteredAt:event.atMs});maximumQueue[event.node]=Math.max(maximumQueue[event.node]!,queue.length);start(event.node,event.atMs)}}else{running.set(event.node,running.get(event.node)!-1);const started=[...trace].reverse().find((t)=>t.kind==="start"&&t.workId===event.arrival.id&&t.node===event.node&&t.attempt===event.attempt),duration=Math.max(0,event.atMs-(started?.atMs??event.atMs)),incrementalCost=duration*node.costPerMs.value;cost+=incrementalCost;if(node.human)humanMinutes+=duration/60_000;if(event.atMs>=horizonMs||cost>spec.budget){blocked++;trace.push({atMs:event.atMs,kind:"blocked",workId:event.arrival.id,node:event.node,attempt:event.attempt});}else if(event.failed){trace.push({atMs:event.atMs,kind:"failure",workId:event.arrival.id,node:event.node,attempt:event.attempt});if(event.attempt<=node.retryLimit)push({atMs:event.atMs,kind:"arrival",arrival:event.arrival,node:event.node,attempt:event.attempt+1});else failed++;}else{trace.push({atMs:event.atMs,kind:"complete",workId:event.arrival.id,node:event.node,attempt:event.attempt});const route=chooseRoute(node.routes,random);if(route){trace.push({atMs:event.atMs,kind:"route",workId:event.arrival.id,node:route,attempt:event.attempt});push({atMs:event.atMs,kind:"arrival",arrival:event.arrival,node:route,attempt:event.attempt+1});}else{completed++;qualityTotal+=event.arrival.quality;latencyTotal+=event.atMs-event.arrival.atMs;}}start(event.node,event.atMs)}}
  return {seed,horizonMs,arrived:arrivals.length,completed,failed,blocked,throughput:completed/(horizonMs/1000),meanLatencyMs:completed?latencyTotal/completed:0,cost,quality:completed?qualityTotal/completed:0,humanMinutes,maximumQueue,trace};
}
function sampleService(distribution:ServiceDistribution,random:()=>number){if(distribution.kind==="deterministic")return distribution.meanMs.value;const mean=Math.max(.0001,distribution.meanMs.value),sd=Math.max(0,distribution.standardDeviationMs.value),sigma2=Math.log(1+(sd*sd)/(mean*mean)),mu=Math.log(mean)-sigma2/2,z=Math.sqrt(-2*Math.log(Math.max(random(),1e-12)))*Math.cos(2*Math.PI*random());return Math.exp(mu+Math.sqrt(sigma2)*z)}
function chooseRoute(routes:TwinNode["routes"],random:()=>number){if(!routes.length)return undefined;const draw=random();let sum=0;for(const route of routes){sum+=route.probability;if(draw<=sum)return route.destination}return routes.at(-1)!.destination}
function seededRandom(seed:number){let state=seed>>>0;return()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/2**32)}
export type PosteriorCalibrationDiagnostic={metric:keyof Pick<TwinSimulationResult,"throughput"|"meanLatencyMs"|"cost"|"quality"|"humanMinutes">;observations:number;coverage90:number;meanAbsoluteError:number;calibrated:boolean};
export function diagnosePosteriorCalibration(predictions:Array<{metric:PosteriorCalibrationDiagnostic["metric"];point:number;interval90:[number,number];actual:number}>):PosteriorCalibrationDiagnostic[]{return [...new Set(predictions.map((p)=>p.metric))].map((metric)=>{const values=predictions.filter((p)=>p.metric===metric),coverage90=values.filter((p)=>p.actual>=p.interval90[0]&&p.actual<=p.interval90[1]).length/values.length;return{metric,observations:values.length,coverage90,meanAbsoluteError:values.reduce((n,p)=>n+Math.abs(p.point-p.actual),0)/values.length,calibrated:values.length>=10&&coverage90>=.9}})}
export function observationalEquivalence(specifications:TwinSpecification[],arrivals:SimulatedArrival[],horizonMs:number,seeds:number[]){if(specifications.length<2||!seeds.length)throw new Error("equivalence comparison insufficient");const signatures=specifications.map((spec)=>twinDigest(seeds.map((seed)=>{const r=simulateTwin(spec,arrivals,horizonMs,seed);return{completed:r.completed,failed:r.failed,blocked:r.blocked,throughput:r.throughput,latency:r.meanLatencyMs,cost:r.cost,quality:r.quality,human:r.humanMinutes}})));const groups=signatures.map((signature,i)=>specifications.map((s,j)=>signatures[j]===signature?j:-1).filter((j)=>j>=0));return{identifiable:groups.every((g)=>g.length===1),groups,signatures}}

function validateSpecification(spec: TwinSpecification) { if (spec.schema !== "autonomy.organization-twin.v1" || !spec.version || !spec.nodes.length || new Set(spec.nodes.map((n) => n.id)).size !== spec.nodes.length || spec.budget < 0 || spec.nodes.some((n) => !n.id || !n.provider || n.capacity < 1 || n.queueLimit < 1 || n.retryLimit < 0 || n.routes.some((r) => r.probability < 0 || r.probability > 1 || !spec.nodes.some((x) => x.id === r.destination)) || n.routes.length > 0 && Math.abs(n.routes.reduce((sum,r) => sum+r.probability,0)-1) > 1e-9) || Object.values(spec.abstractionError).some((n) => n < 0)) throw new Error("twin specification invalid"); }
function estimateMean(v: number[]) { return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; }
export function twinDigest(value: unknown) { return createHash("sha256").update(canonicalSemanticJson(value)).digest("hex"); }
