export type DeploymentEvidenceAssurance = 'asserted' | 'conformance-tested' | 'live-observed';
export type ObjectiveDirection = 'minimize' | 'maximize';

export interface DeploymentCertificateEvidence {
  id: string;
  assurance: DeploymentEvidenceAssurance;
  observedAt: string;
  expiresAt?: string;
  acceptance?: { acceptedBy: string; scope: string[]; expiresAt?: string };
}

export interface DeploymentObjectiveDimension {
  key: string;
  direction: ObjectiveDirection;
  unit: string;
  horizon: string;
}

export interface DeploymentObjectiveValue {
  value: number;
  unit: string;
  horizon: string;
  uncertainty: { kind: 'exact' } | { kind: 'bounded'; lower: number; upper: number } | { kind: 'estimated'; method: string };
  evidence: string;
}

export interface DeploymentConstraintWitness {
  constraint: string;
  satisfied: boolean;
  evidence: string[];
}

export interface DeploymentArtifactWitness {
  artifact: string;
  obligations: string[];
  evidence: string[];
}

export interface PlanningCertificateCandidate {
  id: string;
  hardConstraints: DeploymentConstraintWitness[];
  objectives: Record<string, DeploymentObjectiveValue>;
  adapters: string[];
  migrations: string[];
  adapterWitnesses: DeploymentArtifactWitness[];
  migrationWitnesses: DeploymentArtifactWitness[];
}

export interface DeploymentPlanningCertificate {
  schema: 'autonomy.deployment-planning-certificate.v1';
  generatedAt: string;
  search: { completeness: 'finite-exhaustive' | 'bounded'; domainCardinality: number; explored: number };
  hardConstraints: string[];
  sourceObligations: string[];
  objectiveDimensions: DeploymentObjectiveDimension[];
  knownAdapters: string[];
  knownMigrations: string[];
  evidence: DeploymentCertificateEvidence[];
  frontier: PlanningCertificateCandidate[];
}

export interface DeploymentCertificateVerification { valid: boolean; errors: string[]; }

/** Recomputes the solver result's structural proof obligations from pinned inputs. */
export function verifyCertifiedDeploymentResult(result:DeploymentSolverResult,organization:OrganizationIR,manifests:Record<string,ComponentManifestV2>,adapters:Record<string,AdapterContract>,policy:AssurancePolicy,domain:DeploymentFiniteDomain):DeploymentCertificateVerification{
  const errors:string[]=[];let cardinality=1;for(const manifest of Object.values(manifests))cardinality*=Math.min(domain.maxInstancesPerManifest,manifest.topology.maximumInstances??domain.maxInstancesPerManifest)+1;cardinality--;
  if(result.status==='invalid'){const expected=independentInputErrors(manifests,adapters,policy,domain);if(result.complete||result.explored!==0||result.domainCardinality!==0||result.frontier.length||result.unsatisfiedCore.length||result.coreMinimality!=='none')errors.push('invalid input result has an invalid closed shape');if(!expected.length||!same(sorted(result.errors),sorted(expected)))errors.push('invalid result does not match independently reproduced input errors');return{valid:errors.length===0,errors};}
  if(result.domainCardinality!==cardinality)errors.push('solver domain cardinality does not match the independently reconstructed finite domain');
  if(result.explored>cardinality)errors.push('solver explored count exceeds finite domain');
  if(result.complete&&result.explored!==cardinality)errors.push('complete result did not explore the exact finite domain');
  if(result.status==='incompatible'&&!result.complete)errors.push('incompatibility requires complete finite search');
  if(result.status==='compatible'&&!result.frontier.length)errors.push('compatible result requires a nonempty frontier');
  if(result.status==='compatible'&&(result.unsatisfiedCore.length||result.coreMinimality!=='none'))errors.push('compatible result cannot carry an unsatisfied core');
  if(result.status==='incompatible'&&result.frontier.length)errors.push('incompatible result requires an empty frontier');
  if(result.status==='exhausted'&&(result.complete||result.unsatisfiedCore.length||result.frontier.length))errors.push('exhaustion requires an empty frontier and cannot claim completeness or an unsatisfied core');
  if(result.status==='exhausted'&&result.coreMinimality!=='none')errors.push('exhaustion cannot claim core minimality');
  const constraintIds=sorted(domain.constraints.map(x=>x.id)),obligationCatalog=deriveAtomicObligations(organization),obligationIds=sorted(obligationCatalog.map(x=>x.id));
  const expectedFrontier=independentFrontierKeys(organization,manifests,adapters,policy,domain,result.complete?result.domainCardinality:result.explored);if(result.status==='compatible'&&!same(sorted(result.frontier.map(x=>x.objective.key)),expectedFrontier))errors.push('compatible result omits or adds independently reconstructed Pareto frontier members');if(result.status==='incompatible'&&expectedFrontier.length)errors.push('incompatible result has independently reconstructed feasible frontier members');
  if(result.status==='exhausted'&&expectedFrontier.length)errors.push('exhausted result has feasible candidates in its explored prefix');
  if(result.status==='incompatible')verifyUnsatisfiedCore(result,organization,manifests,adapters,policy,domain,errors);
  for(const candidate of result.frontier){
    const derivedKey=Object.entries(candidate.composition.instances).sort().map(([id,value])=>`${id}=${value.manifest}`).join(',');if(candidate.objective.key!==derivedKey)errors.push(`candidate '${candidate.objective.key}' identity does not match its composition`);if(!independentSelectionValid(candidate.composition.instances,manifests))errors.push(`candidate '${candidate.objective.key}' violates manifest selection constraints`);
    const expectedAdapters=sorted(domain.constraints.filter(x=>x.class==='adapter').map(x=>x.id)),actualAdapters=sorted(candidate.certificate.plan.adapters.map(x=>x.constraint)),expectedMigrations=sorted(domain.constraints.filter(x=>x.class==='migration').map(x=>x.id)),actualMigrations=sorted(candidate.certificate.plan.migrations.map(x=>x.constraint));if(!same(expectedAdapters,actualAdapters))errors.push(`candidate '${candidate.objective.key}' does not carry the exact adapter plan inventory`);if(!same(expectedMigrations,actualMigrations))errors.push(`candidate '${candidate.objective.key}' does not carry the exact migration plan inventory`);
    if(candidate.ledger.unresolved.length)errors.push(`candidate '${candidate.objective.key}' retains unresolved semantic obligations`);
    if(!same(sorted(candidate.certificate.constraintWitnesses.map(x=>x.constraint)),constraintIds))errors.push(`candidate '${candidate.objective.key}' does not witness the exact hard-constraint inventory`);
    if(!same(sorted(candidate.certificate.semanticObligations.filter(x=>x.startsWith('obl:'))),obligationIds))errors.push(`candidate '${candidate.objective.key}' does not witness the exact semantic-obligation inventory`);
    if(candidate.certificate.domainCardinality!==result.domainCardinality||candidate.certificate.explored!==result.explored||candidate.certificate.complete!==result.complete)errors.push(`candidate '${candidate.objective.key}' search certificate differs from result`);
    const replay=validateDeploymentCandidate(deriveAtomicObligations(organization),candidate.composition,manifests,adapters,policy,domain.preferredManifests??[]);if(replay.ledger.unresolved.length)errors.push(`candidate '${candidate.objective.key}' fails independent semantic replay: ${replay.ledger.unresolved.join(', ')}`);if(JSON.stringify(candidate.ledger)!==JSON.stringify(replay.ledger))errors.push(`candidate '${candidate.objective.key}' semantic ledger does not match independent replay`);
    for(const constraint of domain.constraints){if(!independentlySatisfies(constraint,candidate,manifests,adapters,domain,obligationCatalog))errors.push(`candidate '${candidate.objective.key}' fails independent ${constraint.class} constraint '${constraint.id}'`);const expected=independentConstraintEvidence(constraint,candidate,manifests,adapters,domain,policy);const actual=candidate.certificate.constraintWitnesses.find(x=>x.constraint===constraint.id);if(!expected||!actual||!same(sorted(actual.evidence),sorted(expected.evidence))||!same(sorted(actual.assumptions),sorted(expected.assumptions)))errors.push(`candidate '${candidate.objective.key}' constraint '${constraint.id}' evidence or freshness acceptance does not replay`);}
    for(const [instance,configured] of Object.entries(candidate.composition.instances)){const manifest=manifests[configured.manifest];if(!manifest){errors.push(`candidate '${candidate.objective.key}' references unknown manifest '${configured.manifest}'`);continue;}const count=Object.values(candidate.composition.instances).filter(x=>x.manifest===manifest.id).length;if(count<manifest.topology.minimumInstances||(manifest.topology.maximumInstances!==undefined&&count>manifest.topology.maximumInstances))errors.push(`candidate '${candidate.objective.key}' violates topology cardinality for '${instance}'`);}
    for(const planned of candidate.certificate.plan.adapters){const requirement=domain.constraints.find((x):x is Extract<DeploymentFiniteDomain['constraints'][number],{class:'adapter'}>=>x.class==='adapter'&&x.id===planned.constraint),declaration=adapters[planned.adapter];if(!requirement||!declaration||planned.adapter!==requirement.adapter||planned.from!==requirement.from||planned.to!==requirement.to||!same(sorted(planned.obligations),sorted(requirement.obligations))||!same(sorted(planned.losses),sorted(declaration.losses))||declaration.from.id!==planned.from||declaration.to.id!==planned.to||!domain.allowedAdapters?.includes(planned.adapter))errors.push(`candidate '${candidate.objective.key}' has an invalid adapter witness '${planned.adapter}'`);if(!planned.obligations.length||planned.obligations.some(id=>!obligationIds.includes(id)))errors.push(`candidate '${candidate.objective.key}' adapter '${planned.adapter}' is not bound to source obligations`);}
    for(const planned of candidate.certificate.plan.migrations){const requirement=domain.constraints.find((x):x is Extract<DeploymentFiniteDomain['constraints'][number],{class:'migration'}>=>x.class==='migration'&&x.id===planned.constraint);let at=requirement?.from,actualLossy=false;for(const step of planned.steps){const edge=domain.migrations?.find(x=>x.id===step);if(!edge||edge.from!==at||edge.kind!==requirement?.kind||(!requirement.allowLossy&&edge.lossy)||(!edge.lossy&&!edge.rollback)){errors.push(`candidate '${candidate.objective.key}' has an invalid migration step '${step}'`);break;}actualLossy||=edge.lossy;at=edge.to;}if(at!==requirement?.to)errors.push(`candidate '${candidate.objective.key}' migration does not reach target`);if(!requirement||!same(sorted(planned.obligations),sorted(requirement.obligations))||planned.lossy!==actualLossy)errors.push(`candidate '${candidate.objective.key}' migration witness does not match constraint '${planned.constraint}'`);if(!planned.obligations.length||planned.obligations.some(id=>!obligationIds.includes(id)))errors.push(`candidate '${candidate.objective.key}' migration is not bound to source obligations`);}
    verifyCoordinates(candidate,policy,errors);const expectedObjective=independentCoordinates(Object.values(candidate.composition.instances).map(x=>manifests[x.manifest]),policy);if(JSON.stringify(candidate.certificate.objective)!==JSON.stringify(expectedObjective))errors.push(`candidate '${candidate.objective.key}' objective does not match pinned manifest quantities and evidence`);
  }
  for(let i=0;i<result.frontier.length;i++)for(let j=0;j<result.frontier.length;j++)if(i!==j&&solverDominates(result.frontier[j].certificate.objective,result.frontier[i].certificate.objective))errors.push(`frontier candidate '${result.frontier[i].objective.key}' is dominated`);
  return{valid:errors.length===0,errors:[...new Set(errors)]};
}

function verifyCoordinates(candidate:SolverCandidate,policy:AssurancePolicy,errors:string[]){for(const item of candidate.certificate.objective){if(!item.unit||!item.attribution||!Number.isFinite(item.value)||item.value<0)errors.push(`candidate '${candidate.objective.key}' has an invalid objective coordinate`);if(!item.effectiveAt||!item.evidence.length)errors.push(`candidate '${candidate.objective.key}' objective lacks time or evidence identity`);}if(policy.maxEvidenceAgeMs===undefined||!policy.asOf)errors.push('freshness policy lacks a bound or asOf clock');}
function solverDominates(left:ObjectiveCoordinate[],right:ObjectiveCoordinate[]){const key=(x:ObjectiveCoordinate)=>`${x.measure}|${x.unit}|${x.per??''}|${x.attribution}`;if(left.length!==right.length||left.some((x,i)=>key(x)!==key(right[i])||x.uncertainty!=='exact'||right[i].uncertainty!=='exact'))return false;let strict=false;for(let i=0;i<left.length;i++){const l=left[i].measure==='capacity'?-left[i].value:left[i].value,r=right[i].measure==='capacity'?-right[i].value:right[i].value;if(l>r)return false;if(l<r)strict=true;}return strict;}
function independentlySatisfies(constraint:DeploymentConstraint,candidate:SolverCandidate,manifests:Record<string,ComponentManifestV2>,adapters:Record<string,AdapterContract>,domain:DeploymentFiniteDomain,obligations:ReturnType<typeof deriveAtomicObligations>){const selected=Object.values(candidate.composition.instances).map(x=>manifests[x.manifest]).filter(Boolean),applicable=constraint.manifest?selected.filter(x=>x.id===constraint.manifest):selected;if(constraint.manifest&&!applicable.length)return false;if(constraint.class==='adapter'){const x=adapters[constraint.adapter];return Boolean(x&&domain.allowedAdapters?.includes(x.id)&&x.from.id===constraint.from&&x.to.id===constraint.to&&constraint.obligations.length&&constraint.obligations.every(id=>{const obligation=obligations.find(o=>o.id===id);return obligation&&x.interfaceMappings.some(m=>m.to===obligation.facet||m.to===`${obligation.facet}.${obligation.operation}`);})&&(!x.losses.length||constraint.allowLosses));}if(constraint.class==='migration'){const planned=candidate.certificate.plan.migrations.find(x=>x.constraint===constraint.id),edges=planned?.steps.map(id=>domain.migrations?.find(x=>x.id===id));return Boolean(planned&&planned.obligations.length&&edges?.every(Boolean)&&planned.obligations.every(id=>{const obligation=obligations.find(x=>x.id===id);return obligation&&edges.every(edge=>edge!.sourcePaths.some(path=>obligation.path===path||obligation.path.startsWith(`${path}.`)))&&edges.every(edge=>edge!.lossy||edge!.rollback);}));}if(constraint.class==='cardinality')return applicable.length>=constraint.minimum&&(constraint.maximum===undefined||applicable.length<=constraint.maximum);if(constraint.class==='capacity'||constraint.class==='cost'){const values=applicable.flatMap(m=>(constraint.class==='cost'?m.cost??[]:m.capacity??[]).filter(q=>q.unit===constraint.unit&&q.per===constraint.per&&(!constraint.attribution||q.attribution===constraint.attribution)&&q.value!==undefined));const total=values.reduce((n,q)=>n+q.value!,0);return values.length>0&&(constraint.class==='capacity'?total>=constraint.minimum:total<=constraint.maximum);}const matches=applicable.filter(manifest=>{const ext=(manifest.extensions?.deployment??{}) as DeploymentExtension;if(constraint.class==='version')return constraint.allowed.includes(manifest.version);if(constraint.class==='region')return ext.regions?.some(x=>constraint.allowed.includes(x));if(constraint.class==='tenant')return ext.tenants?.some(x=>constraint.allowed.includes(x));if(constraint.class==='data-residency')return ext.dataResidency?.some(x=>constraint.allowed.includes(x));if(constraint.class==='credential')return ext.credentials?.some(x=>constraint.allowed.includes(x));if(constraint.class==='upgrade')return Boolean(ext.upgradeFrom?.some(x=>constraint.allowed.includes(x))&&manifest.failure.upgrade&&manifest.failure.rollback);if(constraint.class==='topology')return(!constraint.modes||constraint.modes.includes(manifest.topology.mode))&&(!constraint.isolations||constraint.isolations.includes(manifest.topology.isolation));if(constraint.class==='slo'){const values=(manifest.capacity??[]).filter(q=>q.unit===constraint.unit&&q.per===constraint.per&&(!constraint.attribution||q.attribution===constraint.attribution)&&q.value!==undefined);return values.length>0&&values.every(q=>q.value!<=constraint.maximum);}return false;});return constraint.quantifier==='any'||constraint.class==='credential'?matches.length>0:matches.length===applicable.length;}
function independentConstraintEvidence(constraint:DeploymentConstraint,candidate:SolverCandidate,manifests:Record<string,ComponentManifestV2>,adapters:Record<string,AdapterContract>,domain:DeploymentFiniteDomain,policy:AssurancePolicy){if(constraint.class==='cardinality')return{evidence:[],assumptions:[]};if(constraint.class==='migration'){const path=candidate.certificate.plan.migrations.find(x=>x.constraint===constraint.id)?.steps??[];return{evidence:path,assumptions:[]};}if(constraint.class==='adapter'){const adapter=adapters[constraint.adapter],item=adapter?.evidence;if(!item)return;const accepted=independentEvidence(item,policy,constraint.id,[adapter.version]);return accepted&&{evidence:[item.source?.uri??constraint.adapter],assumptions:accepted};}const selected=Object.values(candidate.composition.instances).map(x=>manifests[x.manifest]).filter(Boolean),applicable=constraint.manifest?selected.filter(x=>x.id===constraint.manifest):selected,versions=[...new Set(applicable.map(x=>x.version))];let items:ManifestEvidence[]=[],quantities:Array<{effectiveAt:string;version:string}>=[];if(constraint.class==='capacity'||constraint.class==='cost')for(const manifest of applicable)for(const q of (constraint.class==='cost'?manifest.cost??[]:manifest.capacity??[]).filter(q=>q.unit===constraint.unit&&q.per===constraint.per&&(!constraint.attribution||q.attribution===constraint.attribution))){items.push(q.evidence);if(q.effectiveAt)quantities.push({effectiveAt:q.effectiveAt,version:manifest.version});}else if(constraint.class==='topology')items=applicable.map(x=>x.topology.evidence);else if(constraint.class==='upgrade')items=applicable.map(x=>x.failure.evidence);else if(constraint.class==='slo')for(const manifest of applicable)for(const q of (manifest.capacity??[]).filter(q=>q.unit===constraint.unit&&q.per===constraint.per&&(!constraint.attribution||q.attribution===constraint.attribution))){items.push(q.evidence);if(q.effectiveAt)quantities.push({effectiveAt:q.effectiveAt,version:manifest.version});}else items=applicable.flatMap(x=>Object.values(x.facets).map(f=>f.evidence));const assumptions:string[]=[];for(const item of items){const accepted=independentEvidence(item,policy,constraint.id,versions);if(!accepted)return;assumptions.push(...accepted);}for(const item of quantities){const accepted=independentQuantity(item.effectiveAt,policy,constraint.id,item.version);if(!accepted)return;assumptions.push(...accepted);}return{evidence:items.map(x=>x.source?.uri??'inline'),assumptions:assumptions.sort()};}
function independentCoordinates(manifests:ComponentManifestV2[],policy:AssurancePolicy){const groups=new Map<string,ObjectiveCoordinate>();for(const manifest of manifests)for(const [rawMeasure,items] of [['cost',manifest.cost??[]],['capacity',manifest.capacity??[]]] as const)for(const item of items){if(item.value===undefined||!item.effectiveAt||!item.evidence.source)continue;const scope=`objective:${manifest.id}:${rawMeasure}:${item.unit}`,evidenceAcceptance=independentEvidence(item.evidence,policy,scope,[manifest.version]),quantityAcceptance=independentQuantity(item.effectiveAt,policy,scope,manifest.version);if(!evidenceAcceptance||!quantityAcceptance)continue;const measure=rawMeasure==='cost'?'cost':item.unit==='latency-ms'?'latency':'capacity',key=`${rawMeasure}|${item.unit}|${item.per??''}|${item.attribution}`,prior=groups.get(key),rank=['exact','bounded','estimated','volatile','unknown'],uncertainty=rank.indexOf(prior?.uncertainty??'exact')>rank.indexOf(item.uncertainty)?prior!.uncertainty:item.uncertainty,evidence=item.evidence.source.digest??item.evidence.source.uri;groups.set(key,{measure,unit:item.unit,per:item.per,attribution:item.attribution,value:(prior?.value??0)+item.value,uncertainty,effectiveAt:prior&&prior.effectiveAt<item.effectiveAt?prior.effectiveAt:item.effectiveAt,evidence:[...new Set([...(prior?.evidence??[]),evidence])].sort(),assumptions:[...new Set([...(prior?.assumptions??[]),...evidenceAcceptance,...quantityAcceptance])].sort()});}return[...groups.values()].sort((a,b)=>`${a.measure}|${a.unit}|${a.per??''}|${a.attribution}`.localeCompare(`${b.measure}|${b.unit}|${b.per??''}|${b.attribution}`));}
function independentEvidence(evidence:ManifestEvidence,policy:AssurancePolicy,scope:string,versions:string[]):string[]|undefined{const accepted=(kind:'asserted'|'stale')=>{const assumption=`evidence:${scope}:${kind}`,item=policy.acceptedAssumptions.find(x=>x.assumption===assumption&&(x.scope==='*'||x.scope===scope)&&independentAcceptance(x,policy,versions));return item?[`${item.acceptedBy}:${assumption}`]:undefined;};if(evidence.assurance==='unknown')return;if(evidence.assurance==='asserted')return accepted('asserted');if(!evidence.observedAt)return;const age=Date.parse(policy.asOf!)-Date.parse(evidence.observedAt);return Number.isFinite(age)&&age>=0&&age<=policy.maxEvidenceAgeMs!?[]:accepted('stale');}
function independentQuantity(effectiveAt:string,policy:AssurancePolicy,scope:string,version:string):string[]|undefined{if(!effectiveAt)return;const age=Date.parse(policy.asOf!)-Date.parse(effectiveAt);if(Number.isFinite(age)&&age>=0&&age<=policy.maxEvidenceAgeMs!)return[];const assumption=`quantity:${scope}:stale`,item=policy.acceptedAssumptions.find(x=>x.assumption===assumption&&(x.scope==='*'||x.scope===scope)&&independentAcceptance(x,policy,[version]));return item?[`${item.acceptedBy}:${assumption}`]:undefined;}
function independentAcceptance(item:AssurancePolicy['acceptedAssumptions'][number],policy:AssurancePolicy,versions:string[]){if(!item.acceptedBy||!policy.asOf)return false;const asOf=Date.parse(policy.asOf);if(!Number.isFinite(asOf))return false;if(item.expires){const expires=Date.parse(item.expires);if(!Number.isFinite(expires)||expires<asOf)return false;}return !item.untilVersion||(versions.length>0&&versions.every(version=>version===item.untilVersion));}
function verifyUnsatisfiedCore(result:DeploymentSolverResult,organization:OrganizationIR,manifests:Record<string,ComponentManifestV2>,adapters:Record<string,AdapterContract>,policy:AssurancePolicy,domain:DeploymentFiniteDomain,errors:string[]){if(!result.unsatisfiedCore.length){errors.push('incompatible result has no unsatisfied core');return;}if(result.coreMinimality==='subset-minimal'){const constraints=result.unsatisfiedCore.map(item=>{const found=domain.constraints.find(x=>x.id===item.id&&x.class===item.class);if(!found)errors.push(`unsatisfied core references unknown or misclassified constraint '${item.id}'`);return found;}).filter(Boolean) as DeploymentConstraint[];if(independentHasAssignment(constraints,organization,manifests,adapters,policy,domain))errors.push('claimed unsatisfied core is satisfiable');for(const constraint of constraints)if(!independentHasAssignment(constraints.filter(x=>x!==constraint),organization,manifests,adapters,policy,domain))errors.push(`unsatisfied core is not subset-minimal at '${constraint.id}'`);}else if(result.coreMinimality==='classified'){if(result.unsatisfiedCore.some(x=>x.class!=='semantic')||independentHasAssignment([],organization,manifests,adapters,policy,domain))errors.push('classified semantic core does not replay as unsatisfiable');}else errors.push('incompatible result lacks a core minimality classification');}
function independentHasAssignment(constraints:DeploymentConstraint[],organization:OrganizationIR,manifests:Record<string,ComponentManifestV2>,adapters:Record<string,AdapterContract>,policy:AssurancePolicy,domain:DeploymentFiniteDomain){
  const ids=Object.keys(manifests).sort(),maxima=ids.map(id=>Math.min(domain.maxInstancesPerManifest,manifests[id].topology.maximumInstances??domain.maxInstancesPerManifest)),counts=new Array(ids.length).fill(0),obligations=deriveAtomicObligations(organization);let found=false;
  const visit=(index:number)=>{if(found)return;if(index<ids.length){for(let n=0;n<=maxima[index];n++){counts[index]=n;visit(index+1);}return;}if(counts.every(x=>x===0))return;const instances:Record<string,{manifest:string}>={};for(let i=0;i<ids.length;i++)for(let n=0;n<counts[i];n++)instances[`${ids[i]}#${n}`]={manifest:ids[i]};if(!independentSelectionValid(instances,manifests))return;
    const authorities:Record<string,string>={};for(const state of [...new Set(Object.values(instances).flatMap(x=>manifests[x.manifest].state.filter(s=>s.authority==='authoritative').map(s=>s.state)))]){const owners=Object.keys(instances).filter(instance=>manifests[instances[instance].manifest].state.some(s=>s.state===state&&s.authority==='authoritative'));if(owners.length===1)authorities[state]=owners[0];}const composition={instances,authorities};if(validateDeploymentCandidate(obligations,composition,manifests,adapters,policy,domain.preferredManifests??[]).ledger.unresolved.length)return;
    const plan={adapters:constraints.filter((x):x is Extract<DeploymentConstraint,{class:'adapter'}>=>x.class==='adapter').map(x=>({constraint:x.id,adapter:x.adapter,from:x.from,to:x.to,obligations:x.obligations,losses:adapters[x.adapter]?.losses??[]})),migrations:constraints.filter((x):x is Extract<DeploymentConstraint,{class:'migration'}>=>x.class==='migration').map(x=>({constraint:x.id,steps:independentMigrationPath(domain,x),obligations:x.obligations,lossy:false}))};const candidate={composition,certificate:{plan}} as unknown as SolverCandidate;if(constraints.every(x=>independentlySatisfies(x,candidate,manifests,adapters,domain,obligations)&&Boolean(independentConstraintEvidence(x,candidate,manifests,adapters,domain,policy))))found=true;
  };visit(0);return found;
}
function independentMigrationPath(domain:DeploymentFiniteDomain,constraint:Extract<DeploymentConstraint,{class:'migration'}>){const queue=[{at:constraint.from,path:[] as string[]}],seen=new Set([constraint.from]);while(queue.length){const item=queue.shift()!;if(item.at===constraint.to)return item.path;for(const edge of (domain.migrations??[]).filter(x=>x.kind===constraint.kind&&x.from===item.at&&!seen.has(x.to)&&(!x.lossy||constraint.allowLossy)).sort((a,b)=>a.id.localeCompare(b.id))){seen.add(edge.to);queue.push({at:edge.to,path:[...item.path,edge.id]});}}return[];}
function independentFrontierKeys(organization:OrganizationIR,manifests:Record<string,ComponentManifestV2>,adapters:Record<string,AdapterContract>,policy:AssurancePolicy,domain:DeploymentFiniteDomain,limit:number){
  const ids=Object.keys(manifests).sort(),maxima=ids.map(id=>Math.min(domain.maxInstancesPerManifest,manifests[id].topology.maximumInstances??domain.maxInstancesPerManifest)),counts=new Array(ids.length).fill(0),obligations=deriveAtomicObligations(organization),values:Array<{key:string;objective:ObjectiveCoordinate[]}>=[];let explored=0;
  const visit=(index:number)=>{if(explored>=limit)return;if(index<ids.length){for(let n=0;n<=maxima[index];n++){counts[index]=n;visit(index+1);if(explored>=limit)return;}return;}if(counts.every(x=>x===0))return;explored++;
    const instances:Record<string,{manifest:string}>={};for(let i=0;i<ids.length;i++)for(let n=0;n<counts[i];n++)instances[`${ids[i]}#${n}`]={manifest:ids[i]};if(!independentSelectionValid(instances,manifests))return;
    const authorities:Record<string,string>={};for(const state of [...new Set(Object.values(instances).flatMap(x=>manifests[x.manifest].state.filter(s=>s.authority==='authoritative').map(s=>s.state)))]){const owners=Object.keys(instances).filter(instance=>manifests[instances[instance].manifest].state.some(s=>s.state===state&&s.authority==='authoritative'));if(owners.length===1)authorities[state]=owners[0];}
    const composition={instances,authorities};if(validateDeploymentCandidate(obligations,composition,manifests,adapters,policy,domain.preferredManifests??[]).ledger.unresolved.length)return;
    const plan={adapters:domain.constraints.filter((x):x is Extract<DeploymentConstraint,{class:'adapter'}>=>x.class==='adapter').map(x=>({constraint:x.id,adapter:x.adapter,from:x.from,to:x.to,obligations:x.obligations,losses:adapters[x.adapter]?.losses??[]})),migrations:domain.constraints.filter((x):x is Extract<DeploymentConstraint,{class:'migration'}>=>x.class==='migration').map(x=>({constraint:x.id,steps:independentMigrationPath(domain,x),obligations:x.obligations,lossy:false}))};const candidate={composition,certificate:{plan}} as unknown as SolverCandidate;
    if(!domain.constraints.every(x=>independentlySatisfies(x,candidate,manifests,adapters,domain,obligations)&&Boolean(independentConstraintEvidence(x,candidate,manifests,adapters,domain,policy))))return;const objective=independentCoordinates(Object.values(instances).map(x=>manifests[x.manifest]),policy);values.push({key:Object.entries(instances).sort().map(([id,value])=>`${id}=${value.manifest}`).join(','),objective});
  };visit(0);return values.filter((item,index)=>!values.some((other,j)=>j!==index&&solverDominates(other.objective,item.objective))).map(x=>x.key).sort();
}
function independentSelectionValid(instances:Record<string,{manifest:string}>,manifests:Record<string,ComponentManifestV2>){for(const id of Object.keys(manifests)){const count=Object.values(instances).filter(x=>x.manifest===id).length,manifest=manifests[id];if(count>0&&(count<manifest.topology.minimumInstances||(manifest.topology.maximumInstances!==undefined&&count>manifest.topology.maximumInstances)))return false;if(count>0&&(manifest.conflictsWith??[]).some(conflict=>Object.values(instances).some(x=>x.manifest===conflict)))return false;if(count>0&&(manifest.requires??[]).some(required=>!Object.values(instances).some(x=>x.manifest===required||Object.values(manifests[x.manifest].facets).some(f=>f.facet===required))))return false;}return true;}
function independentInputErrors(manifests:Record<string,ComponentManifestV2>,adapters:Record<string,AdapterContract>,policy:AssurancePolicy,domain:DeploymentFiniteDomain){const errors:string[]=[];if(!Number.isSafeInteger(domain.maxAssignments)||domain.maxAssignments<0)errors.push('maxAssignments must be a nonnegative safe integer');if(!Number.isSafeInteger(domain.maxInstancesPerManifest)||domain.maxInstancesPerManifest<1)errors.push('maxInstancesPerManifest must be a positive safe integer');if(new Set(domain.constraints.map(x=>x.id)).size!==domain.constraints.length)errors.push('constraint ids must be unique');if(!policy.asOf||!Number.isFinite(Date.parse(policy.asOf)))errors.push('assurance policy requires a valid asOf clock');if(!Number.isSafeInteger(policy.maxEvidenceAgeMs)||policy.maxEvidenceAgeMs!<0)errors.push('maxEvidenceAgeMs must be a nonnegative safe integer');let cardinality=1;for(const manifest of Object.values(manifests))cardinality*=Math.min(domain.maxInstancesPerManifest,manifest.topology.maximumInstances??domain.maxInstancesPerManifest)+1;if(!Number.isSafeInteger(cardinality-1))errors.push('declared finite domain cardinality exceeds safe integer range');for(const [id,manifest] of Object.entries(manifests))for(const q of [...manifest.cost??[],...manifest.capacity??[]])if(q.value!==undefined&&(!Number.isFinite(q.value)||q.value<0))errors.push(`manifest '${id}' has invalid quantity`);for(const id of domain.allowedAdapters??[])if(!adapters[id])errors.push(`allowed adapter '${id}' is absent`);return errors;}

/** Independently checks a deployment-planning certificate without trusting solver bookkeeping. */
export function verifyDeploymentPlanningCertificate(certificate: DeploymentPlanningCertificate): DeploymentCertificateVerification {
  const errors: string[] = [];
  if (certificate.schema !== 'autonomy.deployment-planning-certificate.v1') errors.push('unsupported certificate schema');
  const generatedAt = timestamp(certificate.generatedAt, 'generatedAt', errors);
  const unique = (values: string[], path: string) => {
    if (values.some((value) => !value.trim())) errors.push(`${path} contains an empty identifier`);
    if (new Set(values).size !== values.length) errors.push(`${path} contains duplicate identifiers`);
  };
  unique(certificate.hardConstraints, 'hardConstraints');
  unique(certificate.sourceObligations, 'sourceObligations');
  unique(certificate.knownAdapters, 'knownAdapters');
  unique(certificate.knownMigrations, 'knownMigrations');
  unique(certificate.objectiveDimensions.map((item) => item.key), 'objectiveDimensions');
  unique(certificate.evidence.map((item) => item.id), 'evidence');
  unique(certificate.frontier.map((item) => item.id), 'frontier');

  const { domainCardinality, explored, completeness } = certificate.search;
  if (!Number.isSafeInteger(domainCardinality) || domainCardinality < 0) errors.push('search.domainCardinality must be a nonnegative safe integer');
  if (!Number.isSafeInteger(explored) || explored < 0 || explored > domainCardinality) errors.push('search.explored must be between zero and domainCardinality');
  if (completeness === 'finite-exhaustive' && explored !== domainCardinality) errors.push('finite-exhaustive search must explore the exact domain cardinality');

  const evidence = new Map(certificate.evidence.map((item) => [item.id, item]));
  const dimensions = new Map(certificate.objectiveDimensions.map((item) => [item.key, item]));
  const expectedConstraints = sorted(certificate.hardConstraints);
  const expectedDimensions = sorted([...dimensions.keys()]);
  for (const candidate of certificate.frontier) {
    const actualConstraints = sorted(candidate.hardConstraints.map((item) => item.constraint));
    if (!same(actualConstraints, expectedConstraints)) errors.push(`candidate '${candidate.id}' does not witness the exact hard-constraint inventory`);
    if (new Set(actualConstraints).size !== actualConstraints.length) errors.push(`candidate '${candidate.id}' duplicates a hard-constraint witness`);
    for (const witness of candidate.hardConstraints) {
      if (!witness.satisfied) errors.push(`candidate '${candidate.id}' does not satisfy hard constraint '${witness.constraint}'`);
      checkEvidenceRefs(witness.evidence, `candidate '${candidate.id}' constraint '${witness.constraint}'`, witness.constraint, evidence, generatedAt, errors);
    }
    const actualDimensions = sorted(Object.keys(candidate.objectives));
    if (!same(actualDimensions, expectedDimensions)) errors.push(`candidate '${candidate.id}' does not provide the exact objective dimensions`);
    for (const [key, value] of Object.entries(candidate.objectives)) {
      const dimension = dimensions.get(key);
      if (!dimension) continue;
      if (!Number.isFinite(value.value)) errors.push(`candidate '${candidate.id}' objective '${key}' is not finite`);
      if (value.unit !== dimension.unit || value.horizon !== dimension.horizon) errors.push(`candidate '${candidate.id}' objective '${key}' changes its unit or horizon`);
      if (value.uncertainty.kind === 'bounded' && (!(value.uncertainty.lower <= value.value && value.value <= value.uncertainty.upper))) errors.push(`candidate '${candidate.id}' objective '${key}' lies outside its uncertainty bounds`);
      if (value.uncertainty.kind === 'estimated' && !value.uncertainty.method.trim()) errors.push(`candidate '${candidate.id}' objective '${key}' omits its estimation method`);
      checkEvidenceRefs([value.evidence], `candidate '${candidate.id}' objective '${key}'`, `objective:${key}`, evidence, generatedAt, errors);
    }
    checkArtifacts(candidate.id, 'adapter', candidate.adapters, candidate.adapterWitnesses, certificate.knownAdapters, certificate.sourceObligations, evidence, generatedAt, errors);
    checkArtifacts(candidate.id, 'migration', candidate.migrations, candidate.migrationWitnesses, certificate.knownMigrations, certificate.sourceObligations, evidence, generatedAt, errors);
  }
  for (let left = 0; left < certificate.frontier.length; left++) for (let right = 0; right < certificate.frontier.length; right++) {
    if (left !== right && dominates(certificate.frontier[right]!, certificate.frontier[left]!, dimensions))
      errors.push(`frontier candidate '${certificate.frontier[left]!.id}' is dominated by '${certificate.frontier[right]!.id}'`);
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

function checkArtifacts(candidate: string, kind: 'adapter' | 'migration', selected: string[], witnesses: DeploymentArtifactWitness[], known: string[], obligations: string[], evidence: Map<string, DeploymentCertificateEvidence>, asOf: number, errors: string[]): void {
  const knownSet = new Set(known), obligationsSet = new Set(obligations);
  if (new Set(selected).size !== selected.length) errors.push(`candidate '${candidate}' duplicates a selected ${kind}`);
  if (new Set(witnesses.map((item) => item.artifact)).size !== witnesses.length) errors.push(`candidate '${candidate}' duplicates a ${kind} witness`);
  if (!same(sorted(selected), sorted(witnesses.map((item) => item.artifact)))) errors.push(`candidate '${candidate}' does not witness the exact selected ${kind} inventory`);
  for (const witness of witnesses) {
    if (!knownSet.has(witness.artifact)) errors.push(`candidate '${candidate}' references unknown ${kind} '${witness.artifact}'`);
    if (!witness.obligations.length || witness.obligations.some((item) => !obligationsSet.has(item))) errors.push(`candidate '${candidate}' ${kind} '${witness.artifact}' has invalid obligation references`);
    checkEvidenceRefs(witness.evidence, `candidate '${candidate}' ${kind} '${witness.artifact}'`, `artifact:${witness.artifact}`, evidence, asOf, errors);
  }
}

function checkEvidenceRefs(refs: string[], path: string, scope: string, catalog: Map<string, DeploymentCertificateEvidence>, asOf: number, errors: string[]): void {
  if (!refs.length) errors.push(`${path} has no evidence`);
  for (const ref of refs) {
    const item = catalog.get(ref);
    if (!item) { errors.push(`${path} references unknown evidence '${ref}'`); continue; }
    const observed = timestamp(item.observedAt, `evidence '${ref}'.observedAt`, errors);
    const expires = item.expiresAt ? timestamp(item.expiresAt, `evidence '${ref}'.expiresAt`, errors) : undefined;
    if (observed > asOf) errors.push(`evidence '${ref}' is dated after certificate generation`);
    if (expires !== undefined && expires < asOf) errors.push(`evidence '${ref}' is stale`);
    if (item.assurance === 'asserted') {
      const acceptance = item.acceptance;
      if (!acceptance?.acceptedBy.trim() || (!acceptance.scope.includes('*') && !acceptance.scope.includes(scope))) errors.push(`asserted evidence '${ref}' lacks scoped acceptance for '${scope}'`);
      if (acceptance?.expiresAt && timestamp(acceptance.expiresAt, `evidence '${ref}'.acceptance.expiresAt`, errors) < asOf) errors.push(`acceptance for evidence '${ref}' is stale`);
    }
  }
}

function dominates(left: PlanningCertificateCandidate, right: PlanningCertificateCandidate, dimensions: Map<string, DeploymentObjectiveDimension>): boolean {
  let strict = false;
  for (const [key, dimension] of dimensions) {
    const l = left.objectives[key]?.value, r = right.objectives[key]?.value;
    if (l === undefined || r === undefined) return false;
    if (dimension.direction === 'minimize' ? l > r : l < r) return false;
    if (l !== r) strict = true;
  }
  return strict;
}
function timestamp(value: string, path: string, errors: string[]): number { const parsed = Date.parse(value); if (!Number.isFinite(parsed)) errors.push(`${path} is not a valid timestamp`); return parsed; }
function sorted(values: string[]): string[] { return [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0); }
function same(left: string[], right: string[]): boolean { return left.length === right.length && left.every((value, index) => value === right[index]); }
import type {AdapterContract,ComponentManifestV2,ManifestEvidence} from './organization-component';
import type {OrganizationIR} from './organization-ir';
import {deriveAtomicObligations,validateDeploymentCandidate,type AssurancePolicy} from './organization-solver';
import type {CertifiedDeploymentCandidate as SolverCandidate,DeploymentConstraint,DeploymentExtension,DeploymentFiniteDomain,DeploymentSolverResult,ObjectiveCoordinate} from './organization-deployment-solver';
