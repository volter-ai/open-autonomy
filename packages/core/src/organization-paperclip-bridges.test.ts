import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  DiskPaperclipBridgeStore,
  MemoryPaperclipBridgeStore,
  PaperclipProviderBridgePort,
  PaperclipWorkerInteractionBridge,
  type PaperclipBridgeAck,
  type PaperclipBridgeAuth,
  type PaperclipBridgeCall,
  type PaperclipBridgePort,
  type PaperclipBridgeStore,
} from "./organization-paperclip-bridges";
import {
  digestContext,
  type WorkerLaunch,
} from "./organization-harness-worker";

const auth: PaperclipBridgeAuth = {
  board: "cap:board",
  agent: "cap:agent",
  interaction: "cap:interaction",
};
const trust = {
  signState: (digest: string) => `sig:${digest}`,
  verifyState: (digest: string, signature: string) =>
    signature === `sig:${digest}`,
  verifyInteraction: (input: {
    actor: string;
    correlationId: string;
    value: string | boolean;
    signature: string;
  }) =>
    input.signature ===
    `user:${input.actor}:${input.correlationId}:${input.value}`,
};

function launch(
  changes: Partial<WorkerLaunch["identity"]> = {},
  fence = 7,
): WorkerLaunch {
  const context: WorkerLaunch["context"] = [];
  return {
    identity: {
      tenant: "tenant",
      deployment: "deployment",
      actor: "actor",
      behavior: "code",
      attempt: "attempt",
      claim: "claim",
      worker: "worker-1",
      repository: "repo",
      worktree: "/work",
      account: "account",
      credentialRef: "credential",
      model: "model",
      modelEndpoint: "endpoint",
      modelVersion: "v1",
      ...changes,
    },
    fence,
    context,
    contextDigest: digestContext(context),
    authority: {
      worktree: "/work",
      sandboxId: "sandbox",
      processCommands: [],
      networkHosts: [],
      repository: "repo",
      credentialRefs: ["credential"],
      models: ["model"],
    },
    tokenBudget: 100,
    costBudgetMicros: 1000,
    outputSchema: "schema",
  };
}

class Native implements PaperclipBridgePort {
  calls: PaperclipBridgeCall[] = [];
  physical: PaperclipBridgeCall[] = [];
  private done = new Map<string, PaperclipBridgeAck>();
  perform(call: PaperclipBridgeCall): PaperclipBridgeAck {
    this.calls.push(structuredClone(call));
    const required =
      call.operation === "heartbeat"
        ? auth.agent
        : call.operation === "checkout"
          ? auth.agent
          : call.operation === "question-publish"
            ? auth.interaction
            : auth.board;
    if (call.auth !== required) throw new Error("authority scope violation");
    const old = this.done.get(call.effectId);
    if (old) {
      if (old.operation !== call.operation)
        throw new Error("native equivocation");
      return { ...old, duplicate: true };
    }
    this.physical.push(structuredClone(call));
    const approved = call.payload.approved;
    const state =
      call.operation === "approval-request"
        ? "pending"
        : call.operation === "approval-resolve"
          ? approved
            ? "approved"
            : "rejected"
          : call.operation === "question-publish"
            ? "pending"
            : call.operation === "question-resolve"
              ? "resolved"
              : "active";
    const ack: PaperclipBridgeAck = {
      effectId: call.effectId,
      operation: call.operation,
      durable: true,
      duplicate: false,
      nativeId: call.operation === "question-resolve" ? String(call.payload.interactionId) : `${call.operation}:native`,
      state,
      binding: {
        tenant: "tenant",
        deployment: "deployment",
        issueId: String(call.payload.issueId ?? "issue-1"),
        runId: String(call.payload.runId ?? "run-1"),
        executionDigest: String(call.payload.executionDigest),
        fence: Number(call.payload.fence),
        worker: String(call.payload.worker),
      },
    };
    this.done.set(call.effectId, ack);
    return ack;
  }
}

function bridge(
  native = new Native(),
  store: PaperclipBridgeStore = new MemoryPaperclipBridgeStore(),
  request = launch(),
  credentials = auth,
) {
  return {
    native,
    store,
    bridge: new PaperclipWorkerInteractionBridge(
      request,
      "issue-1",
      "run-1",
      credentials,
      native,
      trust,
      store,
    ),
  };
}

describe("R16 Paperclip worker/interaction bridge", () => {
  test("uses distinct capability classes and binds heartbeat plus checkout to R11 execution/fence", () => {
    expect(() =>
      bridge(new Native(), new MemoryPaperclipBridgeStore(), launch(), {
        board: "same",
        agent: "same",
        interaction: "other",
      }),
    ).toThrow(/distinct/);
    const fixture = bridge();
    fixture.bridge.heartbeatCheckout();
    const heartbeat = fixture.native.physical.find(
      (call) => call.operation === "heartbeat",
    )!;
    const checkout = fixture.native.physical.find(
      (call) => call.operation === "checkout",
    )!;
    expect(heartbeat.auth).toBe(auth.agent);
    expect(checkout.auth).toBe(auth.agent);
    for (const call of [heartbeat, checkout])
      expect(call.payload).toMatchObject({
        issueId: "issue-1",
        runId: "run-1",
        fence: 7,
        worker: "worker-1",
        executionDigest: fixture.bridge.executionDigest,
      });
  });

  test("correlates durable typed questions and rejects duplicate equivocation", () => {
    const fixture = bridge();
    const correlationId = fixture.bridge.askQuestion({
      questionId: "q1",
      type: "choice",
      text: "Ship?",
      choices: ["yes", "no"],
    });
    fixture.bridge.answerQuestion({
      correlationId,
      actor: "user",
      value: "yes",
      signature: `user:user:${correlationId}:yes`,
    });
    expect(fixture.bridge.readAnswer(correlationId)?.value).toBe("yes");
    expect(() =>
      fixture.bridge.answerQuestion({
        correlationId,
        actor: "user",
        value: "no",
        signature: `user:user:${correlationId}:no`,
      }),
    ).toThrow(/equivocation/);
    expect(() =>
      fixture.bridge.askQuestion({
        questionId: "q1",
        type: "choice",
        text: "Different",
        choices: ["yes", "no"],
      }),
    ).toThrow(/equivocation/);
    expect(
      fixture.native.physical.filter(
        (call) => call.operation === "question-publish",
      ),
    ).toHaveLength(1);
  });

  test("requires a live native pending approval and resolves with board authority", () => {
    const fixture = bridge();
    const correlationId = fixture.bridge.requestApproval({
      approvalId: "deploy",
      action: { environment: "production", revision: "abc" },
    });
    expect(
      fixture.bridge.resolveApproval({
        correlationId,
        actor: "owner",
        approved: true,
        signature: `user:owner:${correlationId}:true`,
      }),
    ).toBe("approved");
    expect(
      fixture.bridge.resolveApproval({
        correlationId,
        actor: "owner",
        approved: true,
        signature: `user:owner:${correlationId}:true`,
      }),
    ).toBe("approved");
    const calls = fixture.native.physical.filter((call) =>
      call.operation.startsWith("approval"),
    );
    expect(calls.map((call) => [call.operation, call.auth])).toEqual([
      ["approval-request", auth.board],
      ["approval-resolve", auth.board],
    ]);
    expect(
      fixture.native.physical.filter(
        (call) => call.operation === "approval-resolve",
      ),
    ).toHaveLength(1);
    expect(() =>
      fixture.bridge.resolveApproval({
        correlationId,
        actor: "owner",
        approved: false,
        signature: `user:owner:${correlationId}:false`,
      }),
    ).toThrow(/equivocation/);
    expect(() =>
      fixture.bridge.requestApproval({
        approvalId: "deploy",
        action: { environment: "production", revision: "evil" },
      }),
    ).toThrow(/equivocation/);
  });

  test("recovers crash-after-native-effect and restart without repeating a physical effect", () => {
    const native = new Native();
    const durable = new MemoryPaperclipBridgeStore();
    let failAck = true;
    const crashing: PaperclipBridgeStore = {
      load: (id) => durable.load(id),
      compareAndSwap: (id, expected, state) => {
        if (
          failAck &&
          Object.values(state.effects).some(
            (effect) => effect.status === "acked",
          )
        ) {
          failAck = false;
          throw new Error("simulated crash");
        }
        return durable.compareAndSwap(id, expected, state);
      },
    };
    const first = bridge(native, crashing);
    expect(() => first.bridge.heartbeatCheckout()).toThrow(/simulated crash/);
    const restarted = bridge(native, durable);
    restarted.bridge.heartbeatCheckout();
    expect(
      native.physical.filter((call) => call.operation === "heartbeat"),
    ).toHaveLength(1);
    expect(
      native.calls.filter((call) => call.operation === "heartbeat"),
    ).toHaveLength(2);
  });

  test("rejects stale worker/fence against the same durable bridge key, not merely unequal IDs", () => {
    const native = new Native();
    const store = new MemoryPaperclipBridgeStore();
    const original = bridge(native, store);
    original.bridge.heartbeatCheckout();
    expect(() =>
      bridge(native, store, launch({ worker: "worker-2" }, 8)),
    ).toThrow(/stale or substituted/);
    expect(
      native.physical.filter((call) => call.operation === "checkout"),
    ).toHaveLength(1);
  });

  test("persists explicit recovery actions and makes cancellation terminal", () => {
    const fixture = bridge();
    fixture.bridge.recover("retry-pending");
    fixture.bridge.recover("cancel-run");
    expect(fixture.bridge.snapshot().recoveryLog).toHaveLength(2);
    expect(() =>
      fixture.bridge.askQuestion({
        questionId: "late",
        type: "text",
        text: "late",
      }),
    ).toThrow(/inactive/);
    expect(
      fixture.native.physical.filter((call) => call.operation === "recovery"),
    ).toHaveLength(1);
  });

  test("rejects cross-tenant native acknowledgements without consuming pending intent", () => {
    const native = new Native();
    const hostile: PaperclipBridgePort = {
      perform(call) {
        const ack = native.perform(call);
        return { ...ack, binding: { ...ack.binding, tenant: "other-tenant" } };
      },
    };
    const fixture = bridge(hostile as Native);
    expect(() => fixture.bridge.heartbeatCheckout()).toThrow(/acknowledgement/);
    expect(fixture.bridge.snapshot().effects).toEqual(
      expect.objectContaining({
        [native.calls[0]!.effectId]: expect.objectContaining({ status: "pending" }),
      }),
    );
  });

  test("does not count a durable receipt whose typed post-state contradicts the operation", () => {
    const native = new Native();
    const lying: PaperclipBridgePort = {
      perform(call) {
        const ack = native.perform(call);
        return { ...ack, state: "failed" };
      },
    };
    const fixture = bridge(lying as Native);
    expect(() => fixture.bridge.heartbeatCheckout()).toThrow(/acknowledgement/);
    expect(Object.values(fixture.bridge.snapshot().effects)[0]).toMatchObject({ status: "pending" });
  });

  test("rechecks fence and execution binding during recovery and every state reload", () => {
    class MutableStore implements PaperclipBridgeStore {
      value: ReturnType<PaperclipWorkerInteractionBridge["snapshot"]> | undefined;
      load() { return this.value && structuredClone(this.value); }
      compareAndSwap(_id: string, expected: number | undefined, state: NonNullable<MutableStore["value"]>) {
        if (this.value?.version !== expected) return false;
        this.value = structuredClone(state); return true;
      }
    }
    const store = new MutableStore(), native = new Native();
    const stale = bridge(native, store).bridge;
    const replacement = bridge(new Native(), new MemoryPaperclipBridgeStore(), launch({}, 8)).bridge.snapshot();
    store.value = replacement;
    expect(() => stale.recover("retry-pending")).toThrow(/stale or substituted/);
    expect(native.physical).toHaveLength(0);
  });

  test("enforces opaque capabilities and bounded typed interaction values", () => {
    expect(() => bridge(new Native(), new MemoryPaperclipBridgeStore(), launch(), { board: "password", agent: "cap:a", interaction: "cap:i" })).toThrow(/opaque capability/);
    const fixture = bridge();
    expect(() => fixture.bridge.askQuestion({ questionId: "q", type: "choice", text: "?", choices: [""] })).toThrow(/typed question/);
    expect(() => fixture.bridge.askQuestion({ questionId: "q", type: "text", text: "x".repeat(16_385) })).toThrow(/typed question/);
    const id = fixture.bridge.askQuestion({ questionId: "bounded", type: "text", text: "?" });
    expect(() => fixture.bridge.answerQuestion({ correlationId: id, actor: "user", value: "x".repeat(65_537), signature: "sig" })).toThrow(/typed bounds/);
    expect(() => fixture.bridge.requestApproval({ approvalId: "a", action: { value: "x".repeat(1024 * 1024) } })).toThrow(/bounds/);
  });

  test("preserves pending intent when the port fails before acknowledgement and resumes after restart", () => {
    const native = new Native(), store = new MemoryPaperclipBridgeStore();
    let partitioned = true;
    const port: PaperclipBridgePort = { perform(call) { if (partitioned) throw new Error("partition"); return native.perform(call); } };
    const first = bridge(port as Native, store);
    expect(() => first.bridge.heartbeatCheckout()).toThrow(/partition/);
    expect(Object.values(first.bridge.snapshot().effects).filter(effect => effect.status === "pending")).toHaveLength(2);
    partitioned = false;
    const restarted = bridge(port as Native, store);
    expect(restarted.bridge.heartbeatCheckout()).toEqual({ heartbeat: "heartbeat:native", checkout: "checkout:native" });
    expect(native.physical).toHaveLength(2);
  });

  test("composes with the pinned provider and exact native interaction/cancel routes", () => {
    const calls: Array<[string, unknown]> = [];
    const provider = {
      heartbeatRun(id: string) { calls.push(["heartbeat", id]); return { id, companyId: "company" }; },
      checkout(input: Record<string, unknown>) { calls.push(["checkout", input]); return { id: input.issueId, assigneeAgentId: input.agentId, checkoutRunId: input.runId, status: "in_progress" }; },
      createApproval(input: any) { calls.push(["approval-request", input]); return "approval-native"; },
      resolveApproval(input: any) { calls.push(["approval-resolve", input]); return input.approvalId; },
    };
    const http: any[] = [];
    const native = { request(input: any) { http.push(structuredClone(input)); return input.path.endsWith("/cancel") ? {status:200,body:{id:"run-1",status:"cancelled"},headers:{}} : input.path.endsWith("/accept") ? {status:200,body:{id:"interaction-native",status:"accepted"},headers:{}} : {status:201,body:{id:"interaction-native",status:"pending"},headers:{}}; } };
    const adapter = new PaperclipProviderBridgePort(provider, native, {tenant:"tenant",deployment:"deployment",agentId:"paperclip-agent",worker:"worker-1",auth});
    const b = new PaperclipWorkerInteractionBridge(launch(),"issue-1","run-1",auth,adapter,trust,new MemoryPaperclipBridgeStore());
    expect(b.heartbeatCheckout()).toEqual({heartbeat:"run-1",checkout:"issue-1"});
    const question=b.askQuestion({questionId:"q",type:"confirmation",text:"Ship?"});
    b.answerQuestion({correlationId:question,actor:"owner",value:true,signature:`user:owner:${question}:true`});
    const approval=b.requestApproval({approvalId:"deploy",action:{type:"request_board_approval",payload:{environment:"production"}}});
    expect(b.resolveApproval({correlationId:approval,actor:"owner",approved:true,signature:`user:owner:${approval}:true`})).toBe("approved");
    b.recover("cancel-run");
    expect(calls).toEqual([
      ["heartbeat","run-1"],
      ["checkout",expect.objectContaining({issueId:"issue-1",agentId:"paperclip-agent",runId:"run-1",expectedStatuses:["todo","backlog","blocked"]})],
      ["approval-request",expect.objectContaining({type:"request_board_approval",payload:{environment:"production"},issueIds:["issue-1"]})],
      ["approval-resolve",expect.objectContaining({approvalId:"approval-native",decision:"approve"})],
    ]);
    expect(http).toEqual([
      expect.objectContaining({method:"POST",path:"/api/issues/issue-1/interactions",authBinding:auth.interaction,body:expect.objectContaining({kind:"request_confirmation",sourceRunId:"run-1",payload:{version:1,prompt:"Ship?"}})}),
      expect.objectContaining({method:"POST",path:"/api/issues/issue-1/interactions/interaction-native/accept",authBinding:auth.board,body:{}}),
      expect.objectContaining({method:"POST",path:"/api/heartbeat-runs/run-1/cancel",authBinding:auth.board,body:{}}),
    ]);
  });

  test("retry-pending is local replay, never an invented Paperclip recovery route", () => {
    const fixture=bridge();fixture.bridge.recover("retry-pending");
    expect(fixture.native.calls.some(call=>call.operation==="recovery")).toBe(false);
    expect(fixture.bridge.snapshot().recoveryLog).toHaveLength(1);
  });

  test("disk state survives reconstruction and reclaims a dead lock owner", () => {
    const root = mkdtempSync(resolve(tmpdir(), "oa-paperclip-bridge-"));
    try {
      const native = new Native();
      const first = bridge(native, new DiskPaperclipBridgeStore(root));
      first.bridge.heartbeatCheckout();
      const restarted = bridge(native, new DiskPaperclipBridgeStore(root));
      expect(restarted.bridge.snapshot()).toEqual(first.bridge.snapshot());
      const key = createHash("sha256").update(first.bridge.id).digest("hex");
      const lock = resolve(root, `${key}.json.lock`);
      mkdirSync(lock);
      writeFileSync(resolve(lock, "owner"), "999999999\n");
      restarted.bridge.recover("retry-pending");
      expect(restarted.bridge.snapshot().recoveryLog).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
