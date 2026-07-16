import { createHash } from "node:crypto";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { canonicalSemanticJson } from "./organization-canonical";

export type ContextKind =
  | "prompt"
  | "skill"
  | "policy"
  | "tool"
  | "context"
  | "budget"
  | "output-schema";
export type ContextTrust =
  "operator-signed" | "package-verified" | "deployment-pinned";
export interface ContentDelivery {
  id: string;
  kind: ContextKind;
  content: string;
  digest: string;
  precedence: number;
  trust: ContextTrust;
  attestation: string;
}
export interface ExecutionIdentity {
  tenant: string;
  deployment: string;
  actor: string;
  behavior: string;
  attempt: string;
  claim: string;
  worker: string;
  repository: string;
  worktree: string;
  account: string;
  credentialRef: string;
  model: string;
  modelEndpoint: string;
  modelVersion: string;
}
export interface AuthorityEnvelope {
  worktree: string;
  sandboxId: string;
  processCommands: Array<{
    executable: string;
    digest: string;
    argv: Array<{ literal?: string; kind?: "path" | "value" }>;
  }>;
  networkHosts: Array<{
    host: string;
    addresses: string[];
    capability: string;
  }>;
  repository: string;
  credentialRefs: string[];
  models: string[];
}
export interface WorkerLaunch {
  identity: ExecutionIdentity;
  fence: number;
  context: ContentDelivery[];
  contextDigest: string;
  authority: AuthorityEnvelope;
  tokenBudget: number;
  costBudgetMicros: number;
  outputSchema: string;
}
export interface HarnessBinding {
  adapter: string;
  protocolVersion: string;
  implementationDigest: string;
  opaqueSession: string;
  launchDigest: string;
  fence: number;
}
export type PortableTrace =
  | { kind: "started"; at: string; model: string }
  | { kind: "output"; at: string; text: string }
  | {
      kind: "usage";
      at: string;
      inputTokens: number;
      outputTokens: number;
      model: string;
    }
  | { kind: "question"; at: string; questionId: string; text: string }
  | {
      kind: "artifact";
      at: string;
      artifactId: string;
      uri: string;
      digest: string;
      untrusted: true;
    }
  | { kind: "checkpoint"; at: string; checkpoint: string }
  | {
      kind: "failure";
      at: string;
      class: "harness" | "model" | "tool" | "cancelled";
      message: string;
    }
  | { kind: "loss"; at: string; nativeType: string; reason: string };
export interface HarnessAdapter<Raw = unknown> {
  readonly id: string;
  readonly protocolVersion: string;
  readonly implementationDigest: string;
  launch(effectId: string, request: WorkerLaunch): HarnessBinding;
  resume(
    effectId: string,
    binding: HarnessBinding,
    request: WorkerLaunch,
  ): HarnessBinding;
  inspect(binding: HarnessBinding): unknown;
  heartbeat(effectId: string, binding: HarnessBinding): void;
  question(
    effectId: string,
    binding: HarnessBinding,
    questionId: string,
    text: string,
    type: "text" | "choice" | "confirmation",
    choices?: string[],
  ): void;
  answer(
    effectId: string,
    binding: HarnessBinding,
    questionId: string,
    value: string | boolean,
  ): void;
  checkpoint(
    effectId: string,
    binding: HarnessBinding,
    checkpointId: string,
  ): string;
  cancel(effectId: string, binding: HarnessBinding): void;
  timeout(effectId: string, binding: HarnessBinding): void;
  reclaim(
    effectId: string,
    binding: HarnessBinding,
    replacement: HarnessBinding,
  ): void;
  teardown(effectId: string, binding: HarnessBinding): void;
  project(raw: Raw): PortableTrace[];
  validateAuthority?(request: WorkerLaunch): void;
}

export interface CodexHarnessDriver {
  perform(
    effectId: string,
    operation: string,
    payload: unknown,
  ):
    | {
        effectId: string;
        operation: string;
        status: "ack";
        durable: true;
        binding?: HarnessBinding;
      }
    | unknown;
}
export class CodexJsonlHarness implements HarnessAdapter<
  Array<Record<string, unknown>>
> {
  readonly id = "codex-jsonl";
  readonly protocolVersion = "responses-jsonl/1";
  readonly implementationDigest = digestContent("codex-cli:0.144.5:jsonl-v1");
  readonly calls: string[] = [];
  constructor(
    private readonly driver?: CodexHarnessDriver,
    private readonly projectedModel = "unattributed",
    private readonly clock = () => new Date().toISOString(),
  ) {}
  private io(id: string, op: string, payload: unknown = {}) {
    if (!this.driver)
      throw new Error("Codex lifecycle requires an external protocol driver");
    this.calls.push(op);
    const response = this.driver.perform(id, op, payload);
    if (
      op !== "inspect" &&
      (!plain(response) ||
        response.effectId !== id ||
        response.operation !== op ||
        response.status !== "ack" ||
        response.durable !== true)
    )
      throw new Error(`Codex ${op} lacks durable idempotent acknowledgement`);
    return response;
  }
  launch(id: string, r: WorkerLaunch) {
    const response = this.io(id, "launch", r) as { binding?: HarnessBinding };
    return (
      response.binding ??
      makeBinding(this, `${this.id}:${r.identity.attempt}`, r)
    );
  }
  resume(id: string, b: HarnessBinding, r: WorkerLaunch) {
    assertBinding(b, r, this);
    const response = this.io(id, "resume", { b, r }) as {
      binding?: HarnessBinding;
    };
    return response.binding ?? structuredClone(b);
  }
  inspect(b: HarnessBinding) {
    return this.io("inspect", "inspect", b);
  }
  heartbeat(id: string, b: HarnessBinding) {
    this.io(id, "heartbeat", b);
  }
  question(
    id: string,
    b: HarnessBinding,
    q: string,
    text: string,
    type: "text" | "choice" | "confirmation",
    choices?: string[],
  ) {
    this.io(id, "question", { b, q, text, type, choices });
  }
  answer(id: string, b: HarnessBinding, q: string, value: string | boolean) {
    this.io(id, "answer", { b, q, value });
  }
  checkpoint(id: string, b: HarnessBinding, c: string) {
    this.io(id, "checkpoint", { b, c });
    return c;
  }
  cancel(id: string, b: HarnessBinding) {
    this.io(id, "cancel", b);
  }
  timeout(id: string, b: HarnessBinding) {
    this.io(id, "timeout", b);
  }
  reclaim(id: string, b: HarnessBinding, n: HarnessBinding) {
    this.io(id, "reclaim", { b, n });
  }
  teardown(id: string, b: HarnessBinding) {
    this.io(id, "teardown", b);
  }
  project(rows: Array<Record<string, unknown>>) {
    return rows.map((row): PortableTrace => {
      const at = validTime(this.clock()),
        type = requiredString(row.type, "type");
      const schemas: Record<string, string[]> = {
        "thread.started": ["type", "thread_id"],
        "turn.started": ["type"],
        "item.started": ["type", "item"],
        "item.completed": ["type", "item"],
        "turn.completed": ["type", "usage"],
        "turn.failed": ["type", "error"],
      };
      if (schemas[type]) strictKeys(row, schemas[type]!);
      else strictKeys(row, ["type"]);
      if (type === "thread.started")
        return {
          kind: "checkpoint",
          at,
          checkpoint: requiredString(row.thread_id, "thread_id"),
        };
      if (type === "turn.started")
        return { kind: "started", at, model: this.projectedModel };
      if (type === "item.completed") {
        if (!plain(row.item)) throw new Error("item must be object");
        const item = row.item;
        requiredString(item.id, "item.id");
        const itemType = requiredString(item.type, "item.type");
        if (itemType === "agent_message") {
          strictKeys(item, ["id", "type", "text"]);
          return {
            kind: "output",
            at,
            text: requiredString(item.text, "item.text"),
          };
        }
        return {
          kind: "loss",
          at,
          nativeType: `item.completed:${itemType}`,
          reason: "unsupported Codex item",
        };
      }
      if (type === "turn.completed") {
        if (!plain(row.usage)) throw new Error("usage must be object");
        strictKeys(row.usage, [
          "input_tokens",
          "cached_input_tokens",
          "output_tokens",
        ]);
        return {
          kind: "usage",
          at,
          inputTokens: finite(row.usage.input_tokens),
          outputTokens: finite(row.usage.output_tokens),
          model: this.projectedModel,
        };
      }
      if (type === "turn.failed") {
        if (!plain(row.error)) throw new Error("error must be object");
        strictKeys(row.error, ["message"]);
        return {
          kind: "failure",
          at,
          class: "model",
          message: requiredString(row.error.message, "error.message"),
        };
      }
      return {
        kind: "loss",
        at,
        nativeType: type,
        reason: "unsupported Codex event",
      };
    });
  }
}
export class ProcessCliHarness implements HarnessAdapter<
  Array<{ event: string; time: string; data?: Record<string, unknown> }>
> {
  readonly id = "process-cli";
  readonly protocolVersion = "process-events/1";
  readonly implementationDigest: string;
  readonly calls: string[] = [];
  readonly physicalCalls: string[] = [];
  private completed = new Set<string>();
  private launchRequest?: WorkerLaunch;
  constructor(
    private readonly executable = process.execPath,
    private readonly spawnArgs = [
      "-e",
      "const fs=require('fs'),p=require('path'),c=require('crypto'),r=JSON.parse(process.argv[1]),d=p.join(process.cwd(),'.open-autonomy-fixture'),f=p.join(d,c.createHash('sha256').update(process.env.OPEN_AUTONOMY_SESSION).digest('hex')+'.json'),l=f+'.lock',wait=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);fs.mkdirSync(d,{recursive:true});for(let n=0;;n++){try{fs.mkdirSync(l);fs.writeFileSync(p.join(l,'owner'),JSON.stringify({pid:process.pid,at:Date.now()}));break}catch(e){if(e.code!=='EEXIST')throw e;let stale=false;try{stale=Date.now()-fs.statSync(l).mtimeMs>30000}catch{}if(stale){try{fs.rmSync(l,{recursive:true})}catch{}continue}if(n>3000)throw Error('effect ledger lock timeout');wait(10)}}let duplicate=false;try{let s={active:false,effects:{},questions:{},checkpoints:[]};try{s=JSON.parse(fs.readFileSync(f,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}if(s.effects[r.effectId]){if(s.effects[r.effectId]!==r.operation)throw Error('effect operation mismatch');duplicate=true}else{if(r.operation==='launch'){if(s.active)throw Error('already launched');s.active=true}else if(!s.active)throw Error('inactive session');if(r.operation==='question'){const q=r.payload.questionId||r.payload.q;if(s.questions[q])throw Error('duplicate question');s.questions[q]={type:r.payload.questionType||r.payload.type||'text',choices:r.payload.choices,answer:null}}if(r.operation==='answer'){const q=r.payload.questionId||r.payload.q,z=s.questions[q],v=r.payload.value;if(!z||z.answer!==null||(z.type==='confirmation'&&typeof v!=='boolean')||(z.type!=='confirmation'&&typeof v!=='string')||(z.type==='choice'&&!z.choices.includes(v)))throw Error('invalid answer');z.answer=v}if(r.operation==='checkpoint')s.checkpoints.push(r.payload.checkpoint||r.payload.c);if(['cancel','timeout','teardown'].includes(r.operation))s.active=false;s.effects[r.effectId]=r.operation;const t=f+'.'+process.pid+'.'+c.randomUUID();fs.writeFileSync(t,JSON.stringify(s));fs.renameSync(t,f)}}finally{fs.rmSync(l,{recursive:true,force:true})}process.stdout.write(JSON.stringify({effectId:r.effectId,operation:r.operation,status:'ack',durable:true,duplicate}))",
    ],
  ) {
    this.implementationDigest = digestContent(
      canonicalSemanticJson({
        protocol: this.protocolVersion,
        executable: this.executable,
        spawnArgs: this.spawnArgs,
      }),
    );
  }
  validateAuthority(r: WorkerLaunch) {
    if (
      !r.authority.processCommands.some((x) => x.executable === this.executable)
    )
      throw new Error("process harness executable is outside pinned authority");
  }
  private io(id: string, op: string, payload: unknown = {}) {
    if (this.completed.has(id)) return;
    const request = canonicalSemanticJson({
      effectId: id,
      operation: op,
      payload,
    });
    if (!this.launchRequest)
      throw new Error("process harness launch state missing");
    const worktree = this.launchRequest.authority.worktree,
      homeBun = this.executable.startsWith("/home/porta/.bun/")
        ? [
            "--dir",
            "/home",
            "--dir",
            "/home/porta",
            "--ro-bind",
            "/home/porta/.bun",
            "/home/porta/.bun",
          ]
        : [],
      run = spawnSync(
        "/usr/bin/bwrap",
        [
          "--unshare-all",
          "--die-with-parent",
          "--new-session",
          "--ro-bind",
          "/usr",
          "/usr",
          "--ro-bind",
          "/lib",
          "/lib",
          "--ro-bind",
          "/lib64",
          "/lib64",
          ...homeBun,
          "--proc",
          "/proc",
          "--dev",
          "/dev",
          "--tmpfs",
          "/tmp",
          "--bind",
          worktree,
          worktree,
          "--chdir",
          worktree,
          this.executable,
          ...this.spawnArgs,
          request,
        ],
        {
          stdio: "pipe",
          encoding: "utf8",
          timeout: 30_000,
          windowsHide: true,
          cwd: worktree,
          env: this.launchRequest
            ? {
                OPEN_AUTONOMY_SANDBOX_ID:
                  this.launchRequest.authority.sandboxId,
                // Attempt names are only locally meaningful.  The complete,
                // immutable launch identity prevents two tenants/deployments
                // sharing a worktree from aliasing the same durable session.
                OPEN_AUTONOMY_SESSION: launchDigest(this.launchRequest),
              }
            : {},
        },
      );
    if (run.status !== 0) throw new Error(`process harness ${op} failed`);
    let response: unknown;
    try {
      response = JSON.parse(run.stdout);
    } catch {
      throw new Error(
        `process harness ${op} returned a non-JSON acknowledgement`,
      );
    }
    if (
      !plain(response) ||
      response.effectId !== id ||
      response.operation !== op ||
      response.status !== "ack" ||
      response.durable !== true ||
      typeof response.duplicate !== "boolean" ||
      Object.keys(response).some(
        (key) =>
          !["effectId", "operation", "status", "durable", "duplicate"].includes(
            key,
          ),
      )
    )
      throw new Error(
        `process harness ${op} returned a mismatched acknowledgement`,
      );
    this.completed.add(id);
    this.calls.push(op);
    if (!response.duplicate) this.physicalCalls.push(op);
  }
  launch(id: string, r: WorkerLaunch) {
    if (!isAbsolute(this.executable))
      throw new Error("process harness executable must be absolute and pinned");
    this.launchRequest = structuredClone(r);
    this.io(id, "launch", r);
    return makeBinding(this, `${this.id}:${r.identity.attempt}`, r);
  }
  resume(id: string, b: HarnessBinding, r: WorkerLaunch) {
    assertBinding(b, r, this);
    this.io(id, "resume", { binding: b, request: r });
    return structuredClone(b);
  }
  inspect() {
    return { status: "running", executable: this.executable };
  }
  heartbeat(id: string, binding: HarnessBinding) {
    this.io(id, "heartbeat", binding);
  }
  question(
    id: string,
    binding: HarnessBinding,
    questionId: string,
    text: string,
    type: "text" | "choice" | "confirmation",
    choices?: string[],
  ) {
    this.io(id, "question", { binding, questionId, text, type, choices });
  }
  answer(
    id: string,
    binding: HarnessBinding,
    questionId: string,
    value: string | boolean,
  ) {
    this.io(id, "answer", { binding, questionId, value });
  }
  checkpoint(id: string, binding: HarnessBinding, c: string) {
    this.io(id, "checkpoint", { binding, checkpoint: c });
    return c;
  }
  cancel(id: string, binding: HarnessBinding) {
    this.io(id, "cancel", binding);
  }
  timeout(id: string, binding: HarnessBinding) {
    this.io(id, "timeout", binding);
  }
  reclaim(id: string, binding: HarnessBinding, replacement: HarnessBinding) {
    this.io(id, "reclaim", { binding, replacement });
  }
  teardown(id: string, binding: HarnessBinding) {
    this.io(id, "teardown", binding);
  }
  project(
    rows: Array<{
      event: string;
      time: string;
      data?: Record<string, unknown>;
    }>,
  ) {
    return rows.map((row): PortableTrace => {
      strictKeys(row, ["event", "time", "data"]);
      const at = validTime(row.time),
        event = requiredString(row.event, "event"),
        data = row.data ?? {};
      if (!plain(data)) throw new Error("event data must be object");
      const dataSchemas: Record<string, string[]> = {
        stdout: ["chunk"],
        meter: ["prompt", "completion", "endpoint"],
        "stdin-request": ["nonce", "prompt"],
        artifact: ["id", "uri", "digest"],
        exit: ["code"],
      };
      if (dataSchemas[event]) strictKeys(data, dataSchemas[event]!);
      else strictKeys(data, []);
      if (event === "stdout")
        return {
          kind: "output",
          at,
          text: requiredString(data.chunk, "chunk"),
        };
      if (event === "meter")
        return {
          kind: "usage",
          at,
          inputTokens: finite(data.prompt),
          outputTokens: finite(data.completion),
          model: requiredString(data.endpoint, "endpoint"),
        };
      if (event === "stdin-request")
        return {
          kind: "question",
          at,
          questionId: requiredString(data.nonce, "nonce"),
          text: requiredString(data.prompt, "prompt"),
        };
      if (event === "artifact")
        return {
          kind: "artifact",
          at,
          artifactId: requiredString(data.id, "id"),
          uri: requiredString(data.uri, "uri"),
          digest: requiredDigest(data.digest, "digest"),
          untrusted: true,
        };
      if (event === "exit" && Number(data.code) !== 0)
        return {
          kind: "failure",
          at,
          class: "harness",
          message: `exit ${finite(data.code)}`,
        };
      return {
        kind: "loss",
        at,
        nativeType: event,
        reason: "unsupported process event",
      };
    });
  }
}

export interface IndependentEvidence {
  id: string;
  observer: string;
  tenant: string;
  deployment: string;
  actor: string;
  behavior: string;
  attempt: string;
  claim: string;
  worker: string;
  repository: string;
  worktree: string;
  account: string;
  credentialRef: string;
  modelEndpoint: string;
  modelVersion: string;
  contextDigest: string;
  schemaDigest: string;
  fence: number;
  kind: "usage" | "artifact" | "output" | "success";
  resultDigest: string;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  costMicros?: number;
  meterId?: string;
  artifactId?: string;
  artifactUri?: string;
  artifactBytesBase64?: string;
  output?: unknown;
  statementDigest: string;
  signature: string;
}
export interface WorkerAction {
  eventId: string;
  fence: number;
  worker: string;
  kind:
    | "heartbeat"
    | "question"
    | "answer"
    | "checkpoint"
    | "cancel"
    | "timeout"
    | "teardown"
    | "completion";
  questionId?: string;
  questionType?: "text" | "choice" | "confirmation";
  choices?: string[];
  checkpointId?: string;
  text?: string;
  value?: string | boolean;
}
export interface WorkerTrust {
  verifyContext(item: ContentDelivery): boolean;
  verifyEvidence(evidence: IndependentEvidence): boolean;
  signState(digest: string): string;
  verifyState(digest: string, signature: string): boolean;
  canonicalPath(path: string): string;
  resolveHost(host: string): string[];
  verifyExecutable(path: string, digest: string): boolean;
  verifyExecutableBytes(bytes: Uint8Array, digest: string): boolean;
  verifySandbox(sandboxId: string, identity: ExecutionIdentity): boolean;
  verifyNetworkCapability(
    capability: string,
    host: string,
    addresses: string[],
  ): boolean;
  verifyArtifactSource(uri: string, identity: ExecutionIdentity): boolean;
  validateOutput(schema: string, output: unknown): boolean;
}
interface HarnessEffect {
  id: string;
  kind:
    | "launch"
    | "resume"
    | "heartbeat"
    | "question"
    | "answer"
    | "checkpoint"
    | "cancel"
    | "timeout"
    | "reclaim"
    | "teardown";
  status: "pending" | "acked";
  payload: Record<string, unknown>;
  binding: HarnessBinding;
  fence: number;
  worker: string;
}
interface DurableState {
  version: number;
  launchDigest: string;
  binding: HarnessBinding;
  identity: ExecutionIdentity;
  fence: number;
  active: boolean;
  terminal?: "cancelled" | "timed-out" | "torn-down" | "completed";
  events: Record<string, string>;
  questions: Array<{
    id: string;
    type: "text" | "choice" | "confirmation";
    text: string;
    choices?: string[];
    answer?: string | boolean;
  }>;
  evidence: IndependentEvidence[];
  outbox: Record<string, HarnessEffect>;
  observations: Array<{
    eventId: string;
    kind: string;
    fence: number;
    worker: string;
    effectId?: string;
  }>;
  digest: string;
  signature: string;
}
export interface WorkerStateStore {
  load(key: string): DurableState | undefined;
  compareAndSwap(
    key: string,
    expectedVersion: number | undefined,
    next: DurableState,
  ): boolean;
}
export class MemoryWorkerStateStore implements WorkerStateStore {
  private values = new Map<string, DurableState>();
  load(key: string) {
    const value = this.values.get(key);
    return value && structuredClone(value);
  }
  compareAndSwap(key: string, version: number | undefined, next: DurableState) {
    const current = this.values.get(key);
    if (current?.version !== version) return false;
    this.values.set(key, structuredClone(next));
    return true;
  }
}

export class PortableWorkerExecution {
  readonly key: string;
  private readonly launchState: WorkerLaunch;
  private readonly adapter: HarnessAdapter;
  constructor(
    request: WorkerLaunch,
    adapter: HarnessAdapter,
    private readonly trust: WorkerTrust,
    private readonly store: WorkerStateStore,
  ) {
    validateLaunch(request, trust);
    adapter.validateAuthority?.(request);
    this.launchState = deepFreeze(structuredClone(request));
    this.adapter = adapter;
    this.key = digestContent(stable(executionScope(request.identity)));
    const existing = store.load(this.key);
    if (existing) {
      verifyState(existing, trust);
      if (existing.launchDigest !== launchDigest(request))
        throw new Error("durable attempt already has different launch");
      assertBinding(existing.binding, request, adapter);
    } else {
      const b = makeBinding(
          adapter,
          `${adapter.id}:${request.identity.attempt}`,
          request,
        ),
        effect = {
          id: effectId(request.identity, request.fence, "lifecycle:launch"),
          kind: "launch" as const,
          status: "pending" as const,
          payload: {},
          binding: structuredClone(b),
          fence: request.fence,
          worker: request.identity.worker,
        },
        base = {
          version: 1,
          launchDigest: launchDigest(request),
          binding: b,
          identity: structuredClone(request.identity),
          fence: request.fence,
          active: true,
          events: {},
          questions: [],
          evidence: [],
          outbox: { [effect.id]: effect },
          observations: [
            {
              eventId: "lifecycle:launch-intent",
              kind: "launch-intent",
              fence: request.fence,
              worker: request.identity.worker,
              effectId: effect.id,
            },
          ],
        } as Omit<DurableState, "digest" | "signature">;
      if (!store.compareAndSwap(this.key, undefined, seal(base, trust)))
        throw new Error("concurrent launch lost CAS");
    }
    this.flush();
  }
  get request() {
    return structuredClone(this.launchState);
  }
  get binding() {
    return structuredClone(this.current().binding);
  }
  get interactions() {
    return structuredClone(this.current().questions);
  }
  resume(request: WorkerLaunch): void {
    validateLaunch(request, this.trust);
    if (launchDigest(request) !== launchDigest(this.launchState))
      throw new Error("resume launch digest mismatch");
    this.intent(
      effectId(request.identity, request.fence, "lifecycle:resume"),
      "resume",
      {},
      (state) => {
        if (!state.active) throw new Error("worker execution is inactive");
        if (
          request.fence !== state.fence ||
          request.identity.worker !== state.identity.worker
        )
          throw new Error("stale fence or worker");
      },
    );
    this.flush();
  }
  apply(action: WorkerAction) {
    let duplicate = false;
    this.mutate((state) => {
      const encoded = stable(action),
        prior = state.events[action.eventId];
      if (prior) {
        if (prior !== encoded)
          throw new Error("event id replayed with different payload");
        duplicate = true;
        return;
      }
      if (!state.active) throw new Error("worker execution is inactive");
      if (
        action.fence !== state.fence ||
        action.worker !== state.identity.worker
      )
        throw new Error("stale fence or worker");
      if (action.kind === "question") {
        if (
          !action.questionId ||
          !action.questionType ||
          !action.text ||
          (action.questionType === "choice" &&
            (!action.choices?.length ||
              new Set(action.choices).size !== action.choices.length)) ||
          (action.questionType !== "choice" && action.choices !== undefined) ||
          state.questions.some((q) => q.id === action.questionId)
        )
          throw new Error("unique typed question id required");
        state.questions.push({
          id: action.questionId,
          type: action.questionType,
          text: action.text,
          ...(action.choices ? { choices: [...action.choices] } : {}),
        });
      }
      if (action.kind === "answer") {
        if (
          !action.questionId ||
          (typeof action.value !== "string" &&
            typeof action.value !== "boolean") ||
          !state.questions.some((q) => q.id === action.questionId)
        )
          throw new Error("answer does not match pending question");
        const q = state.questions.find((q) => q.id === action.questionId)!;
        if (
          q.answer !== undefined ||
          (q.type === "confirmation" && typeof action.value !== "boolean") ||
          (q.type !== "confirmation" && typeof action.value !== "string") ||
          (q.type === "choice" && !q.choices!.includes(action.value as string))
        )
          throw new Error("answer does not satisfy pending question schema");
        q.answer = action.value;
      }
      if (action.kind === "checkpoint" && !action.checkpointId)
        throw new Error("checkpoint id required");
      if (action.kind === "completion") {
        if (
          !action.value ||
          !state.evidence.some(
            (e) => e.kind === "success" && e.resultDigest === action.value,
          )
        )
          throw new Error(
            "completion requires result-bound independent success evidence",
          );
        const usage = state.evidence.filter(
            (e) => e.kind === "usage" && e.resultDigest === action.value,
          ),
          tokens = usage.reduce(
            (n, e) => n + (e.inputTokens ?? 0) + (e.outputTokens ?? 0),
            0,
          ),
          cost = usage.reduce((n, e) => n + (e.costMicros ?? 0), 0);
        if (
          !usage.length ||
          !Number.isSafeInteger(tokens) ||
          !Number.isSafeInteger(cost) ||
          tokens > this.launchState.tokenBudget ||
          cost > this.launchState.costBudgetMicros ||
          usage.some((e) => e.model !== this.launchState.identity.model)
        )
          throw new Error(
            "completion requires independently reconciled model usage and cost within budget",
          );
        state.active = false;
        state.terminal = "completed";
      }
      const effectKinds = [
        "heartbeat",
        "question",
        "answer",
        "checkpoint",
        "cancel",
        "timeout",
        "teardown",
      ] as const;
      if ((effectKinds as readonly string[]).includes(action.kind)) {
        const id = effectId(
          state.identity,
          state.fence,
          `action:${action.eventId}`,
        );
        state.outbox[id] = {
          id,
          kind: action.kind as HarnessEffect["kind"],
          status: "pending",
          payload: {
            questionId: action.questionId,
            questionType: action.questionType,
            choices: action.choices,
            text: action.text,
            value: action.value,
            checkpointId: action.checkpointId,
          },
          binding: structuredClone(state.binding),
          fence: state.fence,
          worker: state.identity.worker,
        };
        if (action.kind === "cancel") {
          state.active = false;
          state.terminal = "cancelled";
        }
        if (action.kind === "timeout") {
          state.active = false;
          state.terminal = "timed-out";
        }
        if (action.kind === "teardown") {
          state.active = false;
          state.terminal = "torn-down";
        }
      }
      state.events[action.eventId] = encoded;
      state.observations.push({
        eventId: action.eventId,
        kind: `${action.kind}-intent`,
        fence: state.fence,
        worker: state.identity.worker,
        ...((effectKinds as readonly string[]).includes(action.kind)
          ? {
              effectId: effectId(
                state.identity,
                state.fence,
                `action:${action.eventId}`,
              ),
            }
          : {}),
      });
    });
    this.flush();
    return { accepted: true, duplicate };
  }
  reclaim(worker: string) {
    const state = this.current(),
      next = structuredClone(this.launchState);
    next.identity.worker = worker;
    next.fence = state.fence + 1;
    this.mutate((value) => {
      if (!value.active) throw new Error("worker execution is inactive");
      if (Object.values(value.outbox).some((e) => e.status === "pending"))
        throw new Error("cannot reclaim with pending prior-fence effects");
      const previous = structuredClone(value.binding),
        replacement = makeBinding(
          this.adapter,
          `${this.adapter.id}:${next.identity.attempt}:${worker}`,
          next,
        ),
        id = effectId(next.identity, next.fence, "lifecycle:reclaim");
      value.outbox[id] = {
        id,
        kind: "reclaim",
        status: "pending",
        payload: { previous, replacement },
        binding: previous,
        fence: value.fence,
        worker: value.identity.worker,
      };
      value.identity.worker = worker;
      value.fence = next.fence;
      value.launchDigest = launchDigest(next);
      value.binding = replacement;
      value.observations.push({
        eventId: `reclaim:${next.fence}`,
        kind: "reclaim-intent",
        fence: next.fence,
        worker,
        effectId: id,
      });
    });
    this.flush();
    return next;
  }
  observe(evidence: IndependentEvidence) {
    this.mutate((state) => {
      const i = state.identity,
        { signature: _, statementDigest: __, ...statement } = evidence,
        computed = digestContent(stable(statement));
      if (
        evidence.statementDigest !== computed ||
        !this.trust.verifyEvidence(evidence) ||
        evidence.observer === i.worker ||
        evidence.tenant !== i.tenant ||
        evidence.deployment !== i.deployment ||
        evidence.actor !== i.actor ||
        evidence.behavior !== i.behavior ||
        evidence.attempt !== i.attempt ||
        evidence.claim !== i.claim ||
        evidence.worker !== i.worker ||
        evidence.repository !== i.repository ||
        evidence.worktree !== i.worktree ||
        evidence.account !== i.account ||
        evidence.credentialRef !== i.credentialRef ||
        evidence.modelEndpoint !== i.modelEndpoint ||
        evidence.modelVersion !== i.modelVersion ||
        evidence.contextDigest !== this.launchState.contextDigest ||
        evidence.schemaDigest !==
          digestContent(this.launchState.outputSchema) ||
        evidence.fence !== state.fence
      )
        throw new Error(
          "independent attempt-bound verified observation required",
        );
      if (
        evidence.kind === "usage" &&
        (!evidence.meterId ||
          !Number.isSafeInteger(evidence.inputTokens) ||
          !Number.isSafeInteger(evidence.outputTokens) ||
          !Number.isSafeInteger(evidence.costMicros) ||
          evidence.inputTokens! < 0 ||
          evidence.outputTokens! < 0 ||
          evidence.costMicros! < 0 ||
          evidence.model !== i.model)
      )
        throw new Error("usage evidence is malformed or model-mismatched");
      if (
        evidence.kind === "usage" &&
        state.evidence.some(
          (e) =>
            e.kind === "usage" &&
            e.meterId === evidence.meterId &&
            e.id !== evidence.id,
        )
      )
        throw new Error("usage meter replay would violate cost conservation");
      if (evidence.kind === "artifact") {
        if (
          !evidence.artifactId ||
          !evidence.artifactUri ||
          !evidence.artifactBytesBase64 ||
          !this.trust.verifyArtifactSource(evidence.artifactUri, i)
        )
          throw new Error(
            "artifact evidence is incomplete or source-untrusted",
          );
        if (
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
            evidence.artifactBytesBase64,
          )
        )
          throw new Error("artifact bytes malformed");
        const bytes = Buffer.from(evidence.artifactBytesBase64, "base64");
        if (digestBytes(bytes) !== evidence.resultDigest)
          throw new Error(
            "artifact bytes do not match independently observed digest",
          );
      }
      if (
        (evidence.kind === "success" || evidence.kind === "output") &&
        (!("output" in evidence) ||
          digestContent(stable(evidence.output)) !== evidence.resultDigest ||
          !this.trust.validateOutput(
            this.launchState.outputSchema,
            evidence.output,
          ))
      )
        throw new Error("output does not match digest or delivered schema");
      const prior = state.evidence.find((e) => e.id === evidence.id);
      if (prior && stable(prior) !== stable(evidence))
        throw new Error("evidence id replay");
      if (!prior) {
        state.evidence.push(structuredClone(evidence));
        state.observations.push({
          eventId: `evidence:${evidence.id}`,
          kind: `observed-${evidence.kind}`,
          fence: state.fence,
          worker: i.worker,
        });
      }
    });
  }
  acceptReport(report: {
    kind: IndependentEvidence["kind"];
    digest: string;
    artifactId?: string;
    artifactUri?: string;
    schemaDigest?: string;
    meterId?: string;
  }) {
    if (
      !this.current().evidence.some(
        (e) =>
          e.kind === report.kind &&
          e.resultDigest === report.digest &&
          (report.kind !== "artifact" ||
            (e.artifactId === report.artifactId &&
              e.artifactUri === report.artifactUri)) &&
          (report.kind !== "usage" || e.meterId === report.meterId) &&
          ((report.kind !== "output" && report.kind !== "success") ||
            e.schemaDigest === report.schemaDigest),
      )
    )
      throw new Error(
        `${report.kind} report requires matching independent evidence identity`,
      );
  }
  authorize(input: {
    path?: string;
    executable?: string;
    args?: string[];
    cwd?: string;
    host?: string;
    repository?: string;
    credentialRef?: string;
    model?: string;
  }) {
    const a = this.launchState.authority,
      inside = (path: string) => {
        const base = this.trust.canonicalPath(a.worktree),
          target = this.trust.canonicalPath(path),
          rel = relative(base, target);
        return (
          !isAbsolute(rel) &&
          rel !== ".." &&
          !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
        );
      };
    if (input.args && !input.executable) return false;
    if (
      !this.trust.verifySandbox(a.sandboxId, this.launchState.identity) ||
      (input.path && !inside(input.path)) ||
      (input.cwd && !inside(input.cwd))
    )
      return false;
    if (input.executable) {
      const rule = a.processCommands.find(
        (x) =>
          x.executable === input.executable &&
          this.trust.verifyExecutable(x.executable, x.digest),
      );
      if (!rule || (input.args ?? []).length !== rule.argv.length) return false;
      for (let i = 0; i < rule.argv.length; i++) {
        const schema = rule.argv[i]!,
          arg = input.args![i]!;
        if (schema.literal !== undefined && arg !== schema.literal)
          return false;
        if (
          schema.kind === "path" &&
          !inside(resolve(input.cwd ?? a.worktree, arg))
        )
          return false;
      }
    }
    if (input.host) {
      const rule = a.networkHosts.find((x) => x.host === input.host),
        addresses = this.trust.resolveHost(input.host);
      if (
        !rule ||
        stable([...addresses].sort()) !== stable([...rule.addresses].sort()) ||
        !this.trust.verifyNetworkCapability(
          rule.capability,
          input.host,
          addresses,
        )
      )
        return false;
    }
    return (
      (!input.repository || input.repository === a.repository) &&
      (!input.credentialRef ||
        a.credentialRefs.includes(input.credentialRef)) &&
      (!input.model || a.models.includes(input.model))
    );
  }
  executeAuthorizedCommand(input: {
    executable: string;
    args: string[];
    cwd: string;
    repository?: string;
    credentialRef?: string;
    model?: string;
  }) {
    if (!this.authorize(input))
      throw new Error("least-authority request denied");
    const a = this.launchState.authority,
      worktree = this.trust.canonicalPath(a.worktree),
      cwd = this.trust.canonicalPath(input.cwd),
      rule = a.processCommands.find(
        (candidate) => candidate.executable === input.executable,
      ),
      pinnedPath = `/run/${basename(input.executable)}`;
    if (!rule) throw new Error("executable authority disappeared");
    // Attest one byte snapshot, then stage it under a private unlinked fd.
    // Path replacement or in-place mutation after this point cannot alter the
    // artifact bwrap binds from fd 3.
    const executableBytes = readFileSync(input.executable);
    if (!this.trust.verifyExecutableBytes(executableBytes, rule.digest))
      throw new Error("opened executable bytes do not match pinned digest");
    const stageDir = mkdtempSync(`${tmpdir()}/open-autonomy-exec-`),
      stagePath = `${stageDir}/executable`;
    writeFileSync(stagePath, executableBytes, { mode: 0o500 });
    chmodSync(stagePath, 0o500);
    try {
      const run = spawnSync(
        "/usr/bin/bwrap",
        [
          "--unshare-all",
          "--die-with-parent",
          "--new-session",
          "--dir",
          "/run",
          "--ro-bind",
          stagePath,
          pinnedPath,
          "--ro-bind",
          "/usr",
          "/usr",
          "--ro-bind",
          "/lib",
          "/lib",
          "--ro-bind",
          "/lib64",
          "/lib64",
          "--proc",
          "/proc",
          "--dev",
          "/dev",
          "--tmpfs",
          "/tmp",
          "--bind",
          worktree,
          worktree,
          "--chdir",
          cwd,
          pinnedPath,
          ...input.args,
        ],
        {
          encoding: "utf8",
          stdio: "pipe",
          timeout: 30_000,
          env: { PATH: "/usr/bin:/bin" },
        },
      );
      if (run.error || run.status !== 0)
        throw new Error(
          `sandboxed command failed: ${run.stderr || run.error?.message}`,
        );
      return { stdout: run.stdout, stderr: run.stderr, status: run.status };
    } finally {
      rmSync(stageDir, { recursive: true, force: true });
    }
  }
  executeAuthorizedNetwork<T>(
    host: string,
    connect: (target: {
      host: string;
      address: string;
      capability: string;
    }) => T,
  ): T {
    const rule = this.launchState.authority.networkHosts.find(
      (candidate) => candidate.host === host,
    );
    if (!rule) throw new Error("network host is outside pinned authority");
    // Resolve and verify at the effect boundary.  The connector receives the
    // pinned address, not a hostname that it could resolve again.
    const addresses = this.trust.resolveHost(host);
    if (
      stable([...addresses].sort()) !== stable([...rule.addresses].sort()) ||
      !this.trust.verifyNetworkCapability(rule.capability, host, addresses)
    )
      throw new Error("network authority changed before execution");
    if (addresses.length !== 1)
      throw new Error("network execution requires one pinned address");
    return connect({
      host,
      address: addresses[0]!,
      capability: rule.capability,
    });
  }
  private current() {
    const state = this.store.load(this.key);
    if (!state) throw new Error("durable execution missing");
    verifyState(state, this.trust);
    return state;
  }
  private mutate(change: (state: DurableState) => void) {
    for (let n = 0; n < 8; n++) {
      const state = this.current(),
        version = state.version;
      change(state);
      state.version++;
      const next = seal(stripSeal(state), this.trust);
      if (this.store.compareAndSwap(this.key, version, next)) return;
    }
    throw new Error("worker state CAS contention");
  }
  private intent(
    id: string,
    kind: HarnessEffect["kind"],
    payload: Record<string, unknown>,
    validate: (state: DurableState) => void,
  ) {
    this.mutate((state) => {
      validate(state);
      state.outbox[id] ??= {
        id,
        kind,
        status: "pending",
        payload,
        binding: structuredClone(state.binding),
        fence: state.fence,
        worker: state.identity.worker,
      };
      state.observations.push({
        eventId: `${id}:intent`,
        kind: `${kind}-intent`,
        fence: state.fence,
        worker: state.identity.worker,
        effectId: id,
      });
    });
  }
  private flush() {
    for (const effect of Object.values(this.current().outbox).filter(
      (e) => e.status === "pending",
    )) {
      const state = this.current(),
        b = effect.binding,
        p = effect.payload;
      if (
        effect.kind !== "reclaim" &&
        (state.fence !== effect.fence ||
          state.identity.worker !== effect.worker ||
          stable(state.binding) !== stable(effect.binding))
      )
        throw new Error("stale effect delivery rejected");
      let returnedBinding: HarnessBinding | undefined;
      switch (effect.kind) {
        case "launch": {
          const actual = this.adapter.launch(effect.id, this.launchState);
          assertBinding(actual, this.launchState, this.adapter);
          returnedBinding = actual;
          break;
        }
        case "resume":
          returnedBinding = this.adapter.resume(effect.id, b, this.launchState);
          assertBinding(returnedBinding, this.launchState, this.adapter);
          break;
        case "heartbeat":
          this.adapter.heartbeat(effect.id, b);
          break;
        case "question":
          this.adapter.question(
            effect.id,
            b,
            String(p.questionId),
            String(p.text ?? ""),
            p.questionType as "text" | "choice" | "confirmation",
            p.choices as string[] | undefined,
          );
          break;
        case "answer":
          this.adapter.answer(
            effect.id,
            b,
            String(p.questionId),
            p.value as string | boolean,
          );
          break;
        case "checkpoint":
          this.adapter.checkpoint(effect.id, b, String(p.checkpointId));
          break;
        case "cancel":
          this.adapter.cancel(effect.id, b);
          break;
        case "timeout":
          this.adapter.timeout(effect.id, b);
          break;
        case "reclaim":
          this.adapter.reclaim(
            effect.id,
            p.previous as HarnessBinding,
            p.replacement as HarnessBinding,
          );
          break;
        case "teardown":
          this.adapter.teardown(effect.id, b);
          break;
      }
      this.mutate((next) => {
        const item = next.outbox[effect.id];
        if (item) item.status = "acked";
        if (returnedBinding) {
          next.binding = structuredClone(returnedBinding);
        }
        next.observations.push({
          eventId: `${effect.id}:ack`,
          kind: `${effect.kind}-ack`,
          fence: next.fence,
          worker: next.identity.worker,
          effectId: effect.id,
        });
      });
    }
  }
}

export function digestContent(content: string) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}
export function digestBytes(content: Uint8Array) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}
export function digestContext(items: ContentDelivery[]) {
  return digestContent(
    stable(
      [...items]
        .sort((a, b) => a.precedence - b.precedence || a.id.localeCompare(b.id))
        .map(({ id, kind, digest, precedence, trust, attestation }) => ({
          id,
          kind,
          digest,
          precedence,
          trust,
          attestation,
        })),
    ),
  );
}
function launchDigest(request: WorkerLaunch) {
  return digestContent(stable(request));
}
function executionScope(i: ExecutionIdentity) {
  const { worker: _, ...scope } = i;
  return scope;
}
function effectId(i: ExecutionIdentity, fence: number, event: string) {
  return `effect:${digestContent(stable([executionScope(i), fence, event])).slice(7)}`;
}
function stable(value: unknown) {
  return canonicalSemanticJson(value);
}
function validateLaunch(request: WorkerLaunch, trust: WorkerTrust) {
  if (Object.values(request.identity).some((v) => !v.trim()))
    throw new Error("all execution identities are required");
  const kinds = new Set(request.context.map((i) => i.kind));
  for (const kind of [
    "prompt",
    "skill",
    "policy",
    "tool",
    "context",
    "budget",
    "output-schema",
  ] as ContextKind[])
    if (!kinds.has(kind)) throw new Error(`missing ${kind} delivery`);
  const precedence = new Set<number>();
  for (const item of request.context) {
    if (
      item.digest !== digestContent(item.content) ||
      !trust.verifyContext(item)
    )
      throw new Error(`content digest or trust mismatch: ${item.id}`);
    if (precedence.has(item.precedence))
      throw new Error("context precedence must be total");
    precedence.add(item.precedence);
  }
  if (request.contextDigest !== digestContext(request.context))
    throw new Error("context manifest digest mismatch");
  if (
    !Number.isSafeInteger(request.tokenBudget) ||
    request.tokenBudget <= 0 ||
    !Number.isSafeInteger(request.costBudgetMicros) ||
    request.costBudgetMicros <= 0 ||
    !request.outputSchema
  )
    throw new Error("token/cost budget and output schema required");
  const budgetDelivery = request.context.find((item) => item.kind === "budget"),
    schemaDelivery = request.context.find(
      (item) => item.kind === "output-schema",
    );
  let deliveredBudget: unknown;
  try {
    deliveredBudget = JSON.parse(budgetDelivery?.content ?? "");
  } catch {
    throw new Error("content-addressed budget delivery is malformed");
  }
  if (
    !plain(deliveredBudget) ||
    Object.keys(deliveredBudget).some(
      (key) => !["tokenBudget", "costBudgetMicros"].includes(key),
    ) ||
    deliveredBudget.tokenBudget !== request.tokenBudget ||
    deliveredBudget.costBudgetMicros !== request.costBudgetMicros ||
    schemaDelivery?.content !== request.outputSchema
  )
    throw new Error(
      "runtime budgets and output schema do not match their content-addressed deliveries",
    );
  const a = request.authority,
    i = request.identity;
  if (
    a.worktree !== i.worktree ||
    a.repository !== i.repository ||
    !a.credentialRefs.includes(i.credentialRef) ||
    !a.models.includes(i.model) ||
    !trust.verifySandbox(a.sandboxId, i)
  )
    throw new Error(
      "authority is not bound to execution identity or OS sandbox",
    );
  for (const rule of a.processCommands)
    if (
      !trust.verifyExecutable(rule.executable, rule.digest) ||
      !rule.argv.every(
        (x) => (x.literal !== undefined) !== (x.kind !== undefined),
      )
    )
      throw new Error("process executable is not pinned");
  for (const network of a.networkHosts)
    if (
      !trust.verifyNetworkCapability(
        network.capability,
        network.host,
        network.addresses,
      )
    )
      throw new Error("network connection capability is invalid");
}
function makeBinding(
  adapter: Pick<
    HarnessAdapter,
    "id" | "protocolVersion" | "implementationDigest"
  >,
  session: string,
  request: WorkerLaunch,
): HarnessBinding {
  return {
    adapter: adapter.id,
    protocolVersion: adapter.protocolVersion,
    implementationDigest: adapter.implementationDigest,
    opaqueSession: session,
    launchDigest: launchDigest(request),
    fence: request.fence,
  };
}
function assertBinding(
  current: HarnessBinding,
  request: WorkerLaunch,
  adapter: HarnessAdapter,
) {
  if (
    current.adapter !== adapter.id ||
    current.protocolVersion !== adapter.protocolVersion ||
    current.implementationDigest !== adapter.implementationDigest ||
    !current.opaqueSession ||
    current.launchDigest !== launchDigest(request) ||
    current.fence !== request.fence
  )
    throw new Error("session binding mismatch");
}
function seal(
  state: Omit<DurableState, "digest" | "signature">,
  trust: WorkerTrust,
): DurableState {
  const digest = digestContent(stable(state));
  return { ...state, digest, signature: trust.signState(digest) };
}
function stripSeal(state: DurableState) {
  const { digest: _, signature: __, ...rest } = state;
  return rest;
}
function verifyState(state: DurableState, trust: WorkerTrust) {
  const { digest, signature, ...rest } = state;
  if (
    digest !== digestContent(stable(rest)) ||
    !trust.verifyState(digest, signature)
  )
    throw new Error("durable worker state signature invalid");
}
function validTime(value: unknown) {
  if (typeof value !== "string")
    throw new Error("trace timestamp must be a string");
  const text = value;
  if (!Number.isFinite(Date.parse(text)))
    throw new Error("invalid trace timestamp");
  return text;
}
function finite(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error("invalid usage value");
  return value;
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
function plain(value: unknown): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
function strictKeys(value: object, allowed: string[]) {
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      throw new Error(`unknown native event field '${key}'`);
}
function requiredString(value: unknown, path: string) {
  if (typeof value !== "string" || !value.length)
    throw new Error(`${path} must be a nonempty string`);
  return value;
}
function requiredDigest(value: unknown, path: string) {
  const text = requiredString(value, path);
  if (!/^sha256:[a-f0-9]{64}$/.test(text))
    throw new Error(`${path} must be a sha256 digest`);
  return text;
}
