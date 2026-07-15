import { canonicalSemanticJson } from "./organization-canonical";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import {
  digestContent,
  type ExecutionIdentity,
  type WorkerLaunch,
} from "./organization-harness-worker";
import type { PaperclipLiveProvider, PaperclipNativePort } from "./organization-paperclip-live-provider";

export type PaperclipBridgeAuth = {
  board: string;
  agent: string;
  interaction: string;
};

export type PaperclipBridgeCall = {
  effectId: string;
  operation:
    | "heartbeat"
    | "checkout"
    | "question-publish"
    | "question-resolve"
    | "approval-request"
    | "approval-resolve"
    | "recovery";
  auth: string;
  payload: Record<string, unknown>;
};

export type PaperclipBridgeAck = {
  effectId: string;
  operation: PaperclipBridgeCall["operation"];
  durable: true;
  duplicate: boolean;
  nativeId: string;
  state: string;
  binding: {
    tenant: string;
    deployment: string;
    issueId: string;
    runId: string;
    executionDigest: string;
    fence: number;
    worker: string;
  };
};

export interface PaperclipBridgePort {
  perform(call: PaperclipBridgeCall): PaperclipBridgeAck;
}

export type PaperclipProviderBridgeConfig = {
  tenant: string;
  deployment: string;
  agentId: string;
  worker: string;
  auth: PaperclipBridgeAuth;
};

/** Concrete adapter for the routes and response shapes at Paperclip 90f85a7d. */
export class PaperclipProviderBridgePort implements PaperclipBridgePort {
  constructor(
    private readonly provider: Pick<PaperclipLiveProvider,"heartbeatRun"|"checkout"|"createApproval"|"resolveApproval">,
    private readonly native: Pick<PaperclipNativePort,"request">,
    private readonly config: PaperclipProviderBridgeConfig,
  ){ validateAuth(config.auth); }
  perform(call: PaperclipBridgeCall): PaperclipBridgeAck {
    const p=call.payload, issueId=bridgeText(p.issueId,"bridge issueId"),runId=bridgeText(p.runId,"bridge runId"),executionDigest=bridgeText(p.executionDigest,"bridge executionDigest"),fence=bridgeFence(p.fence),worker=bridgeText(p.worker,"bridge worker");
    if(worker!==this.config.worker)throw new Error("Paperclip provider bridge worker mismatch");
    const authClass=call.operation==="heartbeat"||call.operation==="checkout"?"agent":call.operation==="question-publish"?"interaction":"board";
    if(call.auth!==this.config.auth[authClass])throw new Error("Paperclip provider bridge capability mismatch");
    let nativeId:string,state="active";
    if(call.operation==="heartbeat") {
      const run=this.provider.heartbeatRun(runId); if(run.id!==runId)throw new Error("Paperclip heartbeat response identity mismatch"); nativeId=bridgeText(run.id,"heartbeat.id");
    } else if(call.operation==="checkout") {
      const issue=this.provider.checkout({effectId:call.effectId,issueId,agentId:this.config.agentId,runId,expectedStatuses:["todo","backlog","blocked"]});
      if(issue.id!==issueId||issue.assigneeAgentId!==this.config.agentId||issue.checkoutRunId!==runId||issue.status!=="in_progress")throw new Error("Paperclip checkout response binding mismatch");nativeId=issueId;
    } else if(call.operation==="approval-request") {
      const action=bridgeRecord(p.action,"approval action"),type=action.type;
      if(!["hire_agent","approve_ceo_strategy","budget_override_required","request_board_approval"].includes(String(type)))throw new Error("Paperclip approval type is unsupported");
      nativeId=bridgeText(this.provider.createApproval({effectId:call.effectId,type:type as "hire_agent"|"approve_ceo_strategy"|"budget_override_required"|"request_board_approval",requestedByAgentId:typeof action.requestedByAgentId==="string"?action.requestedByAgentId:undefined,payload:bridgeRecord(action.payload,"approval payload"),issueIds:[issueId]}),"approval.id");state="pending";
    } else if(call.operation==="approval-resolve") {
      const approvalId=bridgeText(p.approvalId,"approval.id"),approved=p.approved;if(typeof approved!=="boolean")throw new Error("approval decision is invalid");
      nativeId=bridgeText(this.provider.resolveApproval({effectId:call.effectId,approvalId,decision:approved?"approve":"reject",decisionNote:`open-autonomy decision ${bridgeText(p.correlationId,"approval correlation")}`}),"approval.id");state=approved?"approved":"rejected";
    } else if(call.operation==="question-publish") {
      const questionType=p.type,text=bridgeText(p.text,"question text"),id=bridgeText(p.id,"question id"),choices=p.choices;
      const body=questionType==="confirmation"?{kind:"request_confirmation",idempotencyKey:call.effectId,sourceRunId:runId,continuationPolicy:"none",payload:{version:1,prompt:text}}:{kind:"ask_user_questions",idempotencyKey:call.effectId,sourceRunId:runId,continuationPolicy:"none",payload:{version:1,questions:[{id,prompt:text,selectionMode:"single",required:true,options:questionType==="choice"&&Array.isArray(choices)?choices.map((value,index)=>({id:`option-${index}`,label:String(value)})):[{id:"answer",label:"Write an answer"}]}]}};
      const result=this.native.request({method:"POST",path:`/api/issues/${encodeURIComponent(issueId)}/interactions`,authBinding:call.auth,body,requestId:call.effectId});
      const value=bridgeHttpObject(result,201,"Paperclip question publish");nativeId=bridgeText(value.id,"interaction.id");if(!["pending","open"].includes(String(value.status)))throw new Error("Paperclip interaction did not become pending");state="pending";
    } else if(call.operation==="question-resolve") {
      const interactionId=bridgeText(p.interactionId,"interaction.id"),correlationId=bridgeText(p.correlationId,"interaction correlation"),type=p.type,value=p.value;
      let suffix:string,body:Record<string,unknown>;
      if(type==="confirmation"){if(typeof value!=="boolean")throw new Error("confirmation response is invalid");suffix=value?"accept":"reject";body=value?{}:{reason:`signed response by ${bridgeText(p.actor,"interaction actor")}`}}
      else {if(typeof value!=="string")throw new Error("question response is invalid");suffix="respond";const choiceIndex=Number(p.choiceIndex);if(type==="choice"&&(!Number.isSafeInteger(choiceIndex)||choiceIndex<0))throw new Error("choice response index is invalid");const optionIds=type==="choice"?[`option-${choiceIndex}`]:[];body={answers:[{questionId:correlationId,optionIds,...(type==="text"?{otherText:value}:{})}]}}
      const result=this.native.request({method:"POST",path:`/api/issues/${encodeURIComponent(issueId)}/interactions/${encodeURIComponent(interactionId)}/${suffix}`,authBinding:call.auth,body,requestId:call.effectId}),resolved=bridgeHttpObject(result,200,"Paperclip question resolution");nativeId=bridgeText(resolved.id,"resolved interaction.id");if(nativeId!==interactionId||!["answered","accepted","rejected","resolved"].includes(String(resolved.status)))throw new Error("Paperclip interaction resolution post-state mismatch");state="resolved";
    } else {
      if(p.action!=="cancel-run")throw new Error("Paperclip has no retry-pending recovery route");
      const result=this.native.request({method:"POST",path:`/api/heartbeat-runs/${encodeURIComponent(runId)}/cancel`,authBinding:call.auth,body:{},requestId:call.effectId});
      const value=bridgeHttpObject(result,200,"Paperclip heartbeat cancellation");nativeId=bridgeText(value.id,"cancelled run.id");if(nativeId!==runId||value.status!=="cancelled")throw new Error("Paperclip heartbeat cancellation post-state mismatch");
    }
    return {effectId:call.effectId,operation:call.operation,durable:true,duplicate:false,nativeId,state,binding:{tenant:this.config.tenant,deployment:this.config.deployment,issueId,runId,executionDigest,fence,worker}};
  }
}

export interface PaperclipBridgeTrust {
  signState(digest: string): string;
  verifyState(digest: string, signature: string): boolean;
  verifyInteraction(input: {
    actor: string;
    correlationId: string;
    value: string | boolean;
    signature: string;
  }): boolean;
}

type Effect = {
  id: string;
  operation: PaperclipBridgeCall["operation"];
  authClass: keyof PaperclipBridgeAuth;
  payload: Record<string, unknown>;
  digest: string;
  status: "pending" | "acked";
  nativeId?: string;
  nativeState?: string;
};

export type BridgeQuestion = {
  id: string;
  issueId: string;
  runId: string;
  executionDigest: string;
  fence: number;
  worker: string;
  type: "text" | "choice" | "confirmation";
  text: string;
  choices?: string[];
  nativeId?: string;
  nativeState?: "pending" | "resolved";
  answer?: { actor: string; value: string | boolean; signature: string };
};

export type BridgeApproval = {
  id: string;
  issueId: string;
  runId: string;
  executionDigest: string;
  fence: number;
  worker: string;
  actionDigest: string;
  nativeId?: string;
  state: "requesting" | "pending" | "approved" | "rejected";
  resolution?: { actor: string; value: boolean; signature: string };
};

export type PaperclipBridgeState = {
  schema: "autonomy.paperclip-bridge-state.v1";
  id: string;
  version: number;
  executionDigest: string;
  identity: ExecutionIdentity;
  fence: number;
  worker: string;
  issueId: string;
  runId: string;
  active: boolean;
  effects: Record<string, Effect>;
  questions: Record<string, BridgeQuestion>;
  approvals: Record<string, BridgeApproval>;
  recoveryLog: string[];
  digest: string;
  signature: string;
};

export interface PaperclipBridgeStore {
  load(id: string): PaperclipBridgeState | undefined;
  compareAndSwap(
    id: string,
    expectedVersion: number | undefined,
    state: PaperclipBridgeState,
  ): boolean;
}

export class MemoryPaperclipBridgeStore implements PaperclipBridgeStore {
  private values = new Map<string, PaperclipBridgeState>();
  load(id: string) {
    const value = this.values.get(id);
    return value && structuredClone(value);
  }
  compareAndSwap(
    id: string,
    expected: number | undefined,
    state: PaperclipBridgeState,
  ) {
    if (this.values.get(id)?.version !== expected) return false;
    this.values.set(id, structuredClone(state));
    return true;
  }
}

/** Process-restart durable CAS store. Lock directories carry a live owner PID;
 * dead owners are reclaimed without waiting for an arbitrary wall-clock age. */
export class DiskPaperclipBridgeStore implements PaperclipBridgeStore {
  constructor(private readonly root: string) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
  }
  private path(id: string) {
    return resolve(this.root, `${createHash("sha256").update(id).digest("hex")}.json`);
  }
  load(id: string) {
    const path = this.path(id);
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, "utf8")) as PaperclipBridgeState;
  }
  compareAndSwap(id: string, expected: number | undefined, state: PaperclipBridgeState) {
    const lock = this.acquire(id);
    try {
      if (this.load(id)?.version !== expected) return false;
      const path = this.path(id), temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
      writeFileSync(temporary, `${canonicalSemanticJson(state)}\n`, { mode: 0o600, flag: "wx" });
      const file = openSync(temporary, "r");
      try { fsyncSync(file); } finally { closeSync(file); }
      renameSync(temporary, path);
      const directory = openSync(this.root, "r");
      try { fsyncSync(directory); } finally { closeSync(directory); }
      return true;
    } finally {
      rmSync(lock, { recursive: true, force: true });
    }
  }
  private acquire(id: string) {
    const lock = `${this.path(id)}.lock`;
    for (let attempt = 0; attempt < 500; attempt++) {
      try {
        mkdirSync(lock, { mode: 0o700 });
        writeFileSync(resolve(lock, "owner"), `${process.pid}\n`, { mode: 0o600 });
        return lock;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const ownerPath = resolve(lock, "owner");
        try {
          const owner = Number(readFileSync(ownerPath, "utf8").trim());
          let alive = Number.isSafeInteger(owner) && owner > 0;
          if (alive) try { process.kill(owner, 0); } catch { alive = false; }
          if (!alive || Date.now() - statSync(lock).mtimeMs > 30_000) {
            rmSync(lock, { recursive: true, force: true });
            continue;
          }
        } catch (inspection) {
          if ((inspection as NodeJS.ErrnoException).code === "ENOENT") continue;
          throw inspection;
        }
        Bun.sleepSync(10);
      }
    }
    throw new Error("Paperclip bridge disk lock timeout");
  }
}

export class PaperclipWorkerInteractionBridge {
  readonly id: string;
  readonly executionDigest: string;

  constructor(
    private readonly launch: WorkerLaunch,
    private readonly issueId: string,
    private readonly runId: string,
    private readonly auth: PaperclipBridgeAuth,
    private readonly port: PaperclipBridgePort,
    private readonly trust: PaperclipBridgeTrust,
    private readonly store: PaperclipBridgeStore,
  ) {
    validateAuth(auth);
    if (!issueId || !runId) throw new Error("issue and heartbeat run required");
    this.executionDigest = executionDigest(launch);
    this.id = digestContent(
      canonicalSemanticJson({
        execution: {
          tenant: launch.identity.tenant,
          deployment: launch.identity.deployment,
          attempt: launch.identity.attempt,
          claim: launch.identity.claim,
          repository: launch.identity.repository,
          worktree: launch.identity.worktree,
        },
        issueId,
        runId,
      }),
    );
    const existing = store.load(this.id);
    if (existing) {
      this.verify(existing);
      this.assertCurrent(existing);
    } else {
      const state = seal(
        {
          schema: "autonomy.paperclip-bridge-state.v1",
          id: this.id,
          version: 1,
          executionDigest: this.executionDigest,
          identity: structuredClone(launch.identity),
          fence: launch.fence,
          worker: launch.identity.worker,
          issueId,
          runId,
          active: true,
          effects: {},
          questions: {},
          approvals: {},
          recoveryLog: [],
        },
        trust,
      );
      if (!store.compareAndSwap(this.id, undefined, state))
        throw new Error("bridge creation race");
    }
    this.flush();
  }

  heartbeatCheckout() {
    this.requireLive();
    this.intent("heartbeat", "agent", {
      issueId: this.issueId,
      runId: this.runId,
      executionDigest: this.executionDigest,
      fence: this.launch.fence,
      worker: this.launch.identity.worker,
    });
    this.intent("checkout", "agent", {
      issueId: this.issueId,
      runId: this.runId,
      executionDigest: this.executionDigest,
      fence: this.launch.fence,
      worker: this.launch.identity.worker,
    });
    this.flush();
    const state = this.current();
    return {
      heartbeat: state.effects[this.effectId("heartbeat")]!.nativeId!,
      checkout: state.effects[this.effectId("checkout")]!.nativeId!,
    };
  }

  askQuestion(input: {
    questionId: string;
    type: BridgeQuestion["type"];
    text: string;
    choices?: string[];
  }) {
    this.requireLive();
    if (
      !boundedText(input.questionId, 512) ||
      !boundedText(input.text, input.type === "confirmation" ? 1000 : 500) ||
      (input.type === "choice" &&
        (!input.choices?.length ||
          input.choices.length > 10 ||
          input.choices.some((choice) => !boundedText(choice, 120)) ||
          new Set(input.choices).size !== input.choices.length)) ||
      (input.type !== "choice" && input.choices !== undefined)
    )
      throw new Error("invalid typed question");
    const correlationId = this.correlation("question", input.questionId);
    this.mutate((state) => {
      const question: BridgeQuestion = {
        id: correlationId,
        issueId: state.issueId,
        runId: state.runId,
        executionDigest: state.executionDigest,
        fence: state.fence,
        worker: state.worker,
        type: input.type,
        text: input.text,
        ...(input.choices ? { choices: [...input.choices] } : {}),
      };
      const prior = state.questions[correlationId];
      if (prior && stable(withoutAnswer(prior)) !== stable(question))
        throw new Error("question equivocation");
      state.questions[correlationId] ??= question;
      addEffect(state, {
        id: this.effectId(`question:${correlationId}`),
        operation: "question-publish",
        authClass: "interaction",
        payload: question as unknown as Record<string, unknown>,
      });
    });
    this.flush();
    return correlationId;
  }

  answerQuestion(input: {
    correlationId: string;
    actor: string;
    value: string | boolean;
    signature: string;
  }) {
    this.requireLive();
    if (
      !boundedText(input.actor, 512) ||
      !boundedText(input.signature, 16_384) ||
      (typeof input.value === "string" && !boundedText(input.value, 64 * 1024))
    )
      throw new Error("interaction answer exceeds typed bounds");
    if (!this.trust.verifyInteraction(input))
      throw new Error("untrusted interaction answer");
    this.mutate((state) => {
      const question = state.questions[input.correlationId];
      if (!question) throw new Error("unknown question correlation");
      assertBound(question, state);
      if (
        (question.type === "confirmation" &&
          typeof input.value !== "boolean") ||
        (question.type !== "confirmation" && typeof input.value !== "string") ||
        (question.type === "choice" &&
          !question.choices!.includes(input.value as string))
      )
        throw new Error("answer violates question schema");
      const answer = {
        actor: input.actor,
        value: input.value,
        signature: input.signature,
      };
      if (question.answer && stable(question.answer) !== stable(answer))
        throw new Error("answer equivocation");
      question.answer ??= answer;
      if (!question.nativeId) throw new Error("question is not live in Paperclip");
      addEffect(state, {
        id: this.effectId(`question-resolve:${input.correlationId}`),
        operation: "question-resolve",
        authClass: "board",
        payload: { interactionId: question.nativeId, correlationId: question.id, type: question.type, value: input.value, actor: input.actor, signature: input.signature, ...(question.type === "choice" ? { choiceIndex: question.choices!.indexOf(input.value as string) } : {}), issueId: state.issueId, runId: state.runId, executionDigest: state.executionDigest, fence: state.fence, worker: state.worker },
      });
    });
    this.flush();
  }

  readAnswer(correlationId: string) {
    const state = this.current();
    const question = state.questions[correlationId];
    if (!question?.answer) return undefined;
    assertBound(question, state);
    return structuredClone(question.answer);
  }

  requestApproval(input: { approvalId: string; action: unknown }) {
    this.requireLive();
    if (!boundedText(input.approvalId, 512))
      throw new Error("approval correlation id is invalid");
    const correlationId = this.correlation("approval", input.approvalId);
    const encodedAction = canonicalSemanticJson(input.action);
    if (Buffer.byteLength(encodedAction) > 1024 * 1024)
      throw new Error("approval action exceeds bounds");
    const actionDigest = digestContent(encodedAction);
    this.mutate((state) => {
      const approval: BridgeApproval = {
        id: correlationId,
        issueId: state.issueId,
        runId: state.runId,
        executionDigest: state.executionDigest,
        fence: state.fence,
        worker: state.worker,
        actionDigest,
        state: "requesting",
      };
      const prior = state.approvals[correlationId];
      if (prior && prior.actionDigest !== actionDigest)
        throw new Error("approval equivocation");
      state.approvals[correlationId] ??= approval;
      addEffect(state, {
        id: this.effectId(`approval-request:${correlationId}`),
        operation: "approval-request",
        authClass: "board",
        payload: { ...approval, action: input.action },
      });
    });
    this.flush();
    return correlationId;
  }

  resolveApproval(input: {
    correlationId: string;
    actor: string;
    approved: boolean;
    signature: string;
  }) {
    this.requireLive();
    if (
      !boundedText(input.correlationId, 512) ||
      !boundedText(input.actor, 512) ||
      !boundedText(input.signature, 16_384) ||
      typeof input.approved !== "boolean"
    )
      throw new Error("approval decision violates typed bounds");
    if (
      !this.trust.verifyInteraction({
        actor: input.actor,
        correlationId: input.correlationId,
        value: input.approved,
        signature: input.signature,
      })
    )
      throw new Error("untrusted approval decision");
    this.mutate((state) => {
      const approval = state.approvals[input.correlationId];
      if (!approval?.nativeId)
        throw new Error("approval is not live and pending");
      assertBound(approval, state);
      const resolution = {
        actor: input.actor,
        value: input.approved,
        signature: input.signature,
      };
      if (
        approval.resolution &&
        stable(approval.resolution) !== stable(resolution)
      )
        throw new Error("approval decision equivocation");
      if (
        approval.resolution &&
        (approval.state === "approved" || approval.state === "rejected")
      )
        return;
      if (approval.state !== "pending")
        throw new Error("approval is not live and pending");
      approval.resolution ??= resolution;
      addEffect(state, {
        id: this.effectId(`approval-resolve:${input.correlationId}`),
        operation: "approval-resolve",
        authClass: "board",
        payload: {
          approvalId: approval.nativeId,
          correlationId: approval.id,
          approved: input.approved,
          actionDigest: approval.actionDigest,
          issueId: state.issueId,
          runId: state.runId,
          executionDigest: state.executionDigest,
          fence: state.fence,
          worker: state.worker,
        },
      });
    });
    this.flush();
    return this.current().approvals[input.correlationId]!.state;
  }

  recover(action: "retry-pending" | "cancel-run") {
    this.requireLive();
    this.mutate((state) => {
      state.recoveryLog.push(`${state.version}:${action}`);
      if (action === "cancel-run") state.active = false;
      if (action === "cancel-run")
        addEffect(state, {
          id: this.effectId(`recovery:${state.recoveryLog.length}:${action}`),
          operation: "recovery",
          authClass: "board",
          payload: {
            action,
            issueId: state.issueId,
            runId: state.runId,
            executionDigest: state.executionDigest,
            fence: state.fence,
            worker: state.worker,
          },
        });
    });
    this.flush();
  }

  snapshot() {
    return structuredClone(this.current());
  }

  private correlation(kind: string, id: string) {
    if (!id) throw new Error("correlation id required");
    return digestContent(
      canonicalSemanticJson({
        kind,
        id,
        bridge: this.id,
        fence: this.launch.fence,
        worker: this.launch.identity.worker,
      }),
    );
  }
  private effectId(suffix: string) {
    return digestContent(canonicalSemanticJson({ bridge: this.id, suffix }));
  }
  private requireLive() {
    const state = this.current();
    this.assertCurrent(state);
    if (!state.active) throw new Error("bridge run inactive");
  }
  private assertCurrent(state: PaperclipBridgeState) {
    if (
      state.id !== this.id ||
      state.executionDigest !== this.executionDigest ||
      stable(state.identity) !== stable(this.launch.identity) ||
      state.fence !== this.launch.fence ||
      state.worker !== this.launch.identity.worker ||
      state.issueId !== this.issueId ||
      state.runId !== this.runId
    )
      throw new Error("stale or substituted worker binding");
  }
  private intent(
    operation: Effect["operation"],
    authClass: Effect["authClass"],
    payload: Record<string, unknown>,
  ) {
    this.mutate((state) =>
      addEffect(state, {
        id: this.effectId(operation),
        operation,
        authClass,
        payload,
      }),
    );
  }
  private flush() {
    for (;;) {
      const effect = Object.values(this.current().effects).find(
        (candidate) => candidate.status === "pending",
      );
      if (!effect) return;
      const ack = this.port.perform({
        effectId: effect.id,
        operation: effect.operation,
        auth: this.auth[effect.authClass],
        payload: structuredClone(effect.payload),
      });
      if (
        ack.effectId !== effect.id ||
        ack.operation !== effect.operation ||
        ack.durable !== true ||
        typeof ack.duplicate !== "boolean" ||
        !boundedText(ack.nativeId, 4096) ||
        !boundedText(ack.state, 4096) ||
        (!["approval-request", "approval-resolve", "question-publish", "question-resolve"].includes(effect.operation) && ack.state !== "active") ||
        (effect.operation === "question-publish" && !["pending", "open"].includes(ack.state)) ||
        (effect.operation === "question-resolve" && ack.state !== "resolved") ||
        !sameAckBinding(ack.binding, this.launch, this.issueId, this.runId, this.executionDigest)
      )
        throw new Error("invalid durable Paperclip acknowledgement");
      this.mutate((state) => {
        const current = state.effects[effect.id];
        if (!current || current.digest !== effect.digest)
          throw new Error("effect changed during delivery");
        current.status = "acked";
        current.nativeId = ack.nativeId;
        current.nativeState = ack.state;
        if (current.operation === "approval-request") {
          const approval = Object.values(state.approvals).find(
            (candidate) =>
              this.effectId(`approval-request:${candidate.id}`) === current.id,
          );
          if (!approval || ack.state !== "pending")
            throw new Error("native approval did not become pending");
          approval.nativeId = ack.nativeId;
          approval.state = "pending";
        }
        if (current.operation === "question-publish") {
          const question = Object.values(state.questions).find(candidate => this.effectId(`question:${candidate.id}`) === current.id);
          if (!question || !["pending", "open"].includes(ack.state)) throw new Error("native question did not become pending");
          question.nativeId = ack.nativeId; question.nativeState = "pending";
        }
        if (current.operation === "question-resolve") {
          const correlationId = current.payload.correlationId as string, question = state.questions[correlationId];
          if (!question || question.nativeId !== ack.nativeId || ack.state !== "resolved") throw new Error("native question resolution mismatch");
          question.nativeState = "resolved";
        }
        if (current.operation === "approval-resolve") {
          const correlationId = current.payload.correlationId as string;
          const approval = state.approvals[correlationId];
          const expected = approval?.resolution?.value
            ? "approved"
            : "rejected";
          if (!approval || ack.state !== expected)
            throw new Error("native approval resolution mismatch");
          approval.state = expected;
        }
      });
    }
  }
  private mutate(change: (state: PaperclipBridgeState) => void) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const state = this.current();
      const version = state.version;
      change(state);
      state.version++;
      validateState(state);
      const next = seal(stripSeal(state), this.trust);
      if (this.store.compareAndSwap(this.id, version, next)) return;
    }
    throw new Error("bridge CAS contention");
  }
  private current() {
    const state = this.store.load(this.id);
    if (!state) throw new Error("bridge state missing");
    this.verify(state);
    this.assertCurrent(state);
    return state;
  }
  private verify(state: PaperclipBridgeState) {
    const unsigned = stripSeal(state);
    const digest = digestContent(canonicalSemanticJson(unsigned));
    if (
      digest !== state.digest ||
      !this.trust.verifyState(digest, state.signature)
    )
      throw new Error("bridge state integrity failure");
    validateState(state);
  }
}

function addEffect(
  state: PaperclipBridgeState,
  input: Omit<Effect, "digest" | "status">,
) {
  const digest = digestContent(
    canonicalSemanticJson({
      operation: input.operation,
      authClass: input.authClass,
      payload: input.payload,
    }),
  );
  const prior = state.effects[input.id];
  if (prior && prior.digest !== digest) throw new Error("effect equivocation");
  state.effects[input.id] ??= {
    ...structuredClone(input),
    digest,
    status: "pending",
  };
}

function executionDigest(launch: WorkerLaunch) {
  return digestContent(
    canonicalSemanticJson({
      identity: launch.identity,
      fence: launch.fence,
      contextDigest: launch.contextDigest,
      authority: launch.authority,
      tokenBudget: launch.tokenBudget,
      costBudgetMicros: launch.costBudgetMicros,
      outputSchema: launch.outputSchema,
    }),
  );
}

function validateAuth(auth: PaperclipBridgeAuth) {
  if (!Object.values(auth).every((value) => boundedText(value, 4096)))
    throw new Error("three auth bindings required");
  if (new Set(Object.values(auth)).size !== 3)
    throw new Error("board, agent, and interaction authority must be distinct");
  if (!Object.values(auth).every((value) => /^(cap:|secret:\/\/)/.test(value)))
    throw new Error("auth bindings must be opaque capability references");
}
function boundedText(value: unknown, bytes: number): value is string {
  return typeof value === "string" && value.length > 0 && Buffer.byteLength(value) <= bytes && !/[\u0000-\u001f\u007f]/.test(value);
}
function bridgeText(value:unknown,field:string){if(!boundedText(value,4096))throw new Error(`${field} is invalid`);return value;}
function bridgeFence(value:unknown){if(!Number.isSafeInteger(value)||Number(value)<0)throw new Error("bridge fence is invalid");return Number(value);}
function bridgeRecord(value:unknown,field:string){if(!value||typeof value!=="object"||Array.isArray(value))throw new Error(`${field} is invalid`);return value as Record<string,unknown>;}
function bridgeHttpObject(result:{status:number;body:unknown},status:number,field:string){if(result.status!==status)return (()=>{throw new Error(`${field} failed with ${result.status}`)})();return bridgeRecord(result.body,field);}
function sameAckBinding(binding: PaperclipBridgeAck["binding"], launch: WorkerLaunch, issueId: string, runId: string, digest: string) {
  return !!binding && binding.tenant === launch.identity.tenant && binding.deployment === launch.identity.deployment && binding.issueId === issueId && binding.runId === runId && binding.executionDigest === digest && binding.fence === launch.fence && binding.worker === launch.identity.worker;
}
function validateState(state: PaperclipBridgeState) {
  if (state.schema !== "autonomy.paperclip-bridge-state.v1" || !boundedText(state.id, 512) || !Number.isSafeInteger(state.version) || state.version < 1 || !Number.isSafeInteger(state.fence) || state.fence < 0 || !boundedText(state.worker, 512) || !boundedText(state.issueId, 4096) || !boundedText(state.runId, 4096) || !Array.isArray(state.recoveryLog) || state.recoveryLog.length > 10_000 || !state.effects || !state.questions || !state.approvals)
    throw new Error("bridge state invariant failure");
  if (Object.keys(state.effects).length > 20_000 || Object.keys(state.questions).length > 10_000 || Object.keys(state.approvals).length > 10_000)
    throw new Error("bridge state bounds failure");
  for (const [key, effect] of Object.entries(state.effects)) {
    const expected = digestContent(canonicalSemanticJson({operation:effect.operation,authClass:effect.authClass,payload:effect.payload}));
    if (key !== effect.id || expected !== effect.digest || !["pending","acked"].includes(effect.status) || !["board","agent","interaction"].includes(effect.authClass) || (effect.status === "acked" && (!boundedText(effect.nativeId,4096)||!boundedText(effect.nativeState,4096))))
      throw new Error("bridge effect invariant failure");
  }
  for (const [key, question] of Object.entries(state.questions)) {
    const choicesValid=question.type==="choice" ? !!question.choices?.length&&question.choices.length<=10&&question.choices.every(value=>boundedText(value,120))&&new Set(question.choices).size===question.choices.length : question.choices===undefined;
    const answerValid=!question.answer || (boundedText(question.answer.actor,512)&&boundedText(question.answer.signature,16_384)&&((question.type==="confirmation"&&typeof question.answer.value==="boolean")||(question.type!=="confirmation"&&boundedText(question.answer.value,64*1024)))&&(question.type!=="choice"||question.choices!.includes(question.answer.value as string)));
    const nativeValid=(question.nativeId===undefined&&question.nativeState===undefined)||(boundedText(question.nativeId,4096)&&["pending","resolved"].includes(String(question.nativeState)));
    if (key !== question.id || !["text","choice","confirmation"].includes(question.type) || !boundedText(question.text,question.type==="confirmation"?1000:500) || !choicesValid || !answerValid || !nativeValid) throw new Error("bridge question invariant failure");
    assertBound(question,state);
  }
  for (const [key, approval] of Object.entries(state.approvals)) {
    if (key !== approval.id || !["requesting","pending","approved","rejected"].includes(approval.state) || !boundedText(approval.actionDigest,512) || ((approval.state === "pending" || approval.state === "approved" || approval.state === "rejected") && !boundedText(approval.nativeId,4096)) || ((approval.state === "approved" || approval.state === "rejected") && (!approval.resolution || typeof approval.resolution.value!=="boolean"))) throw new Error("bridge approval invariant failure");
    assertBound(approval,state);
  }
}
function assertBound(
  item: Pick<
    BridgeQuestion,
    "issueId" | "runId" | "executionDigest" | "fence" | "worker"
  >,
  state: PaperclipBridgeState,
) {
  if (
    item.issueId !== state.issueId ||
    item.runId !== state.runId ||
    item.executionDigest !== state.executionDigest ||
    item.fence !== state.fence ||
    item.worker !== state.worker
  )
    throw new Error("interaction binding mismatch");
}
function withoutAnswer(question: BridgeQuestion) {
  const { answer: _answer, nativeId: _nativeId, nativeState: _nativeState, ...rest } = question;
  return rest;
}
function stable(value: unknown) {
  return canonicalSemanticJson(value);
}
function stripSeal(state: PaperclipBridgeState) {
  const { digest: _digest, signature: _signature, ...unsigned } = state;
  return unsigned;
}
function seal(
  unsigned: Omit<PaperclipBridgeState, "digest" | "signature">,
  trust: PaperclipBridgeTrust,
): PaperclipBridgeState {
  const digest = digestContent(canonicalSemanticJson(unsigned));
  return {
    ...structuredClone(unsigned),
    digest,
    signature: trust.signState(digest),
  };
}
