import {
  realpathSync,
  mkdtempSync,
  mkdirSync,
  symlinkSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  copyFileSync,
  chmodSync,
  utimesSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  CodexJsonlHarness,
  MemoryWorkerStateStore,
  PortableWorkerExecution,
  ProcessCliHarness,
  digestContent,
  digestBytes,
  digestContext,
  type ContentDelivery,
  type IndependentEvidence,
  type WorkerLaunch,
  type WorkerTrust,
} from "./organization-harness-worker";
import { canonicalSemanticJson } from "./organization-canonical";
const RESULT = digestContent(canonicalSemanticJson({ ok: true }));

const trust: WorkerTrust = {
  verifyContext: (item) => item.attestation === `trusted:${item.digest}`,
  verifyEvidence: (e) => e.signature === `verified:${e.statementDigest}`,
  signState: (d) => `state:${d}`,
  verifyState: (d, s) => s === `state:${d}`,
  canonicalPath: (path) => realpathSync(path),
  resolveHost: (host) =>
    host === "api.model.test" ? ["203.0.113.4"] : ["10.0.0.1"],
  verifyExecutable: (path, digest) =>
    (path === "git" && digest === "sha256:git") ||
    (path === "/usr/bin/true" && digest === "sha256:true") ||
    (path === "/usr/bin/node" && digest === "sha256:usr-node") ||
    (path === process.execPath && digest === "sha256:node"),
  verifyExecutableBytes: (bytes, digest) => {
    const paths: Record<string, string> = {
      "sha256:true": "/usr/bin/true",
      "sha256:usr-node": "/usr/bin/node",
      "sha256:node": process.execPath,
    };
    return (
      Boolean(paths[digest]) &&
      digestBytes(bytes) === digestBytes(readFileSync(paths[digest]!))
    );
  },
  verifySandbox: (id, identity) => id === `sandbox:${identity.attempt}`,
  verifyNetworkCapability: (cap, host) => cap === `network:${host}`,
  verifyArtifactSource: (uri, identity) =>
    uri.startsWith(`file://${identity.worktree}/`),
  validateOutput: (schema, output) =>
    schema === "schema:v1" &&
    Boolean(output) &&
    typeof output === "object" &&
    (output as any).ok === true,
};
const codex = () => {
  const done = new Set<string>();
  return new CodexJsonlHarness({
    perform: (id, operation) => {
      if (done.has(id))
        return {
          effectId: id,
          operation,
          status: "ack" as const,
          durable: true as const,
        };
      done.add(id);
      return {
        effectId: id,
        operation,
        status: "ack" as const,
        durable: true as const,
      };
    },
  });
};
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "r11-")),
    worktree = join(root, "work"),
    outside = join(root, "outside");
  mkdirSync(worktree);
  mkdirSync(outside);
  writeFileSync(join(worktree, "ok"), "ok");
  writeFileSync(join(outside, "secret"), "secret");
  symlinkSync(outside, join(worktree, "escape"));
  return { root, worktree, outside };
}
function request(
  worktree: string,
  overrides: Partial<WorkerLaunch> = {},
): WorkerLaunch {
  const kinds = [
      "prompt",
      "skill",
      "policy",
      "tool",
      "context",
      "budget",
      "output-schema",
    ] as const,
    context: ContentDelivery[] = kinds.map((kind, i) => {
      const content =
          kind === "budget"
            ? canonicalSemanticJson({
                tokenBudget: 100,
                costBudgetMicros: 1000,
              })
            : kind === "output-schema"
              ? "schema:v1"
              : `${kind}-content`,
        digest = digestContent(content);
      return {
        id: `${kind}:v1`,
        kind,
        content,
        digest,
        precedence: i,
        trust: i < 2 ? "package-verified" : "deployment-pinned",
        attestation: `trusted:${digest}`,
      };
    });
  const base: WorkerLaunch = {
    identity: {
      tenant: "t",
      deployment: "d",
      actor: "a",
      behavior: "code",
      attempt: "attempt",
      claim: "claim",
      worker: "w",
      repository: "repo",
      worktree,
      account: "acct",
      credentialRef: "cred",
      model: "model",
      modelEndpoint: "endpoint:model",
      modelVersion: "v1",
    },
    fence: 4,
    context,
    contextDigest: digestContext(context),
    authority: {
      worktree,
      sandboxId: "sandbox:attempt",
      processCommands: [
        {
          executable: "git",
          digest: "sha256:git",
          argv: [{ literal: "status" }, { kind: "path" }],
        },
        { executable: process.execPath, digest: "sha256:node", argv: [] },
        { executable: "/usr/bin/true", digest: "sha256:true", argv: [] },
      ],
      networkHosts: [
        {
          host: "api.model.test",
          addresses: ["203.0.113.4"],
          capability: "network:api.model.test",
        },
      ],
      repository: "repo",
      credentialRefs: ["cred"],
      models: ["model"],
    },
    tokenBudget: 100,
    costBudgetMicros: 1000,
    outputSchema: "schema:v1",
  };
  return { ...base, ...overrides };
}
function evidence(
  req: WorkerLaunch,
  changes: Partial<IndependentEvidence> = {},
): IndependentEvidence {
  const raw = {
    id: "proof",
    observer: "observer",
    tenant: req.identity.tenant,
    deployment: req.identity.deployment,
    actor: req.identity.actor,
    behavior: req.identity.behavior,
    attempt: req.identity.attempt,
    claim: req.identity.claim,
    worker: req.identity.worker,
    repository: req.identity.repository,
    worktree: req.identity.worktree,
    account: req.identity.account,
    credentialRef: req.identity.credentialRef,
    modelEndpoint: req.identity.modelEndpoint,
    modelVersion: req.identity.modelVersion,
    contextDigest: req.contextDigest,
    schemaDigest: digestContent(req.outputSchema),
    fence: req.fence,
    kind: "success" as const,
    resultDigest: digestContent(canonicalSemanticJson({ ok: true })),
    output: { ok: true },
    meterId: "meter:default",
    ...changes,
  };
  delete (raw as any).statementDigest;
  delete (raw as any).signature;
  const statementDigest = digestContent(canonicalSemanticJson(raw));
  return { ...raw, statementDigest, signature: `verified:${statementDigest}` };
}

describe("R11 immutable identity/context binding", () => {
  test("uses collision-free durable keys for tenant and attempt identities", () => {
    const f = fixture(),
      store = new MemoryWorkerStateStore(),
      left = request(f.worktree, {
        identity: {
          ...request(f.worktree).identity,
          tenant: "tenant/a",
          attempt: "attempt",
        },
        authority: {
          ...request(f.worktree).authority,
          sandboxId: "sandbox:attempt",
        },
      }),
      right = request(f.worktree, {
        identity: {
          ...request(f.worktree).identity,
          tenant: "tenant",
          attempt: "a/attempt",
        },
        authority: {
          ...request(f.worktree).authority,
          sandboxId: "sandbox:a/attempt",
        },
      });
    const first = new PortableWorkerExecution(left, codex(), trust, store),
      second = new PortableWorkerExecution(right, codex(), trust, store);
    expect(first.key).not.toBe(second.key);
  });

  test("returns clones and rejects authority, budget, schema, context, and identity substitution on resume", () => {
    const f = fixture(),
      req = request(f.worktree),
      runtime = new PortableWorkerExecution(
        req,
        codex(),
        trust,
        new MemoryWorkerStateStore(),
      );
    const exposed = runtime.request;
    exposed.authority.processCommands.push({
      executable: "sh",
      digest: "x",
      argv: [],
    });
    expect(runtime.authorize({ executable: "sh" })).toBe(false);
    for (const changed of [
      request(f.worktree, { tokenBudget: 999 }),
      request(f.worktree, { outputSchema: "schema:other" }),
      request(f.worktree, {
        authority: {
          ...req.authority,
          networkHosts: [
            ...req.authority.networkHosts,
            { host: "evil", addresses: ["1.1.1.1"], capability: "bad" },
          ],
        },
      }),
      request(f.worktree, { identity: { ...req.identity, attempt: "other" } }),
    ])
      expect(() => runtime.resume(changed)).toThrow(
        /digest|durable|mismatch|capability|content-addressed|not bound to execution identity or OS sandbox/,
      );
    const bad = structuredClone(req);
    bad.context[0]!.attestation = "self-asserted";
    expect(
      () =>
        new PortableWorkerExecution(
          bad,
          codex(),
          trust,
          new MemoryWorkerStateStore(),
        ),
    ).toThrow(/trust/);
  });
});

describe("R11 durable fenced lifecycle", () => {
  test("never retargets a pending old-fence effect onto a replacement session", () => {
    const f = fixture(),
      req = request(f.worktree);
    let failHeartbeat = true;
    const adapter = new CodexJsonlHarness({
        perform: (id, operation) => {
          if (operation === "heartbeat" && failHeartbeat)
            throw new Error("partition");
          return { effectId: id, operation, status: "ack", durable: true };
        },
      }),
      r = new PortableWorkerExecution(
        req,
        adapter,
        trust,
        new MemoryWorkerStateStore(),
      );
    expect(() =>
      r.apply({ eventId: "pending", fence: 4, worker: "w", kind: "heartbeat" }),
    ).toThrow(/partition/);
    expect(() => r.reclaim("replacement")).toThrow(/pending prior-fence/);
    failHeartbeat = false;
    r.apply({ eventId: "pending", fence: 4, worker: "w", kind: "heartbeat" });
    expect(r.reclaim("replacement").identity.worker).toBe("replacement");
  });
  test("shared CAS prevents split brain, survives restart, and makes terminal duplicates idempotent", () => {
    const f = fixture(),
      req = request(f.worktree),
      store = new MemoryWorkerStateStore(),
      lost = new PortableWorkerExecution(req, codex(), trust, store),
      same = new PortableWorkerExecution(req, codex(), trust, store),
      replacement = lost.reclaim("w2");
    expect(() =>
      same.apply({ eventId: "old", fence: 5, worker: "w", kind: "heartbeat" }),
    ).toThrow(/stale|worker/);
    const resumed = new PortableWorkerExecution(
      replacement,
      codex(),
      trust,
      store,
    );
    resumed.observe(
      evidence(replacement, {
        id: "usage",
        worker: "w2",
        fence: 5,
        kind: "usage",
        inputTokens: 20,
        outputTokens: 10,
        costMicros: 30,
        model: "model",
      }),
    );
    resumed.observe(evidence(replacement, { worker: "w2", fence: 5 }));
    expect(
      resumed.apply({
        eventId: "done",
        fence: 5,
        worker: "w2",
        kind: "completion",
        value: RESULT,
      }),
    ).toEqual({ accepted: true, duplicate: false });
    expect(
      resumed.apply({
        eventId: "done",
        fence: 5,
        worker: "w2",
        kind: "completion",
        value: RESULT,
      }),
    ).toEqual({ accepted: true, duplicate: true });
    expect(() =>
      resumed.apply({
        eventId: "done2",
        fence: 5,
        worker: "w2",
        kind: "completion",
        value: RESULT,
      }),
    ).toThrow(/inactive/);
  });
  test("question identities do not overwrite and cancel retry is idempotent", () => {
    const f = fixture(),
      r = new PortableWorkerExecution(
        request(f.worktree),
        new ProcessCliHarness(),
        trust,
        new MemoryWorkerStateStore(),
      );
    r.apply({
      eventId: "q1",
      fence: 4,
      worker: "w",
      kind: "question",
      questionType: "text",
      questionId: "q1",
      text: "one",
    });
    r.apply({
      eventId: "q2",
      fence: 4,
      worker: "w",
      kind: "question",
      questionType: "text",
      questionId: "q2",
      text: "two",
    });
    r.apply({
      eventId: "a1",
      fence: 4,
      worker: "w",
      kind: "answer",
      questionId: "q1",
      value: "yes",
    });
    expect(() =>
      r.apply({
        eventId: "a-again",
        fence: 4,
        worker: "w",
        kind: "answer",
        questionId: "q1",
        value: "no",
      }),
    ).toThrow(/schema/);
    expect(r.interactions).toEqual(
      expect.arrayContaining([
        { id: "q1", type: "text", text: "one", answer: "yes" },
        { id: "q2", type: "text", text: "two" },
      ]),
    );
    r.apply({
      eventId: "p",
      fence: 4,
      worker: "w",
      kind: "checkpoint",
      checkpointId: "cp-1",
    });
    const cancel = {
      eventId: "c",
      fence: 4,
      worker: "w",
      kind: "cancel" as const,
    };
    expect(r.apply(cancel).duplicate).toBe(false);
    expect(r.apply(cancel).duplicate).toBe(true);
  });
});
describe("R11 transactional harness outbox", () => {
  test("scopes external idempotency keys to the complete execution identity", () => {
    const f = fixture(),
      store = new MemoryWorkerStateStore(),
      seen = new Set<string>();
    let physical = 0;
    const make = () =>
      new CodexJsonlHarness({
        perform: (id, operation) => {
          if (!seen.has(id)) {
            seen.add(id);
            physical++;
          }
          return { effectId: id, operation, status: "ack", durable: true };
        },
      });
    new PortableWorkerExecution(request(f.worktree), make(), trust, store);
    const other = request(f.worktree, {
      identity: { ...request(f.worktree).identity, attempt: "other" },
      authority: {
        ...request(f.worktree).authority,
        sandboxId: "sandbox:other",
      },
    });
    new PortableWorkerExecution(other, make(), trust, store);
    expect(physical).toBe(2);
  });
  test("persists adapter allocated and rotated opaque bindings", () => {
    const f = fixture(),
      req = request(f.worktree),
      launchDigest = digestContent(canonicalSemanticJson(req));
    const driver = {
      perform: (id: string, operation: string, payload: unknown) => {
        const prior = (payload as { b?: unknown })?.b as
          Record<string, unknown> | undefined;
        const binding =
          operation === "launch"
            ? {
                adapter: "codex-jsonl",
                protocolVersion: "responses-jsonl/1",
                implementationDigest: digestContent(
                  "codex-cli:0.144.5:jsonl-v1",
                ),
                opaqueSession: "allocated",
                launchDigest,
                fence: req.fence,
              }
            : operation === "resume"
              ? { ...prior, opaqueSession: "rotated" }
              : undefined;
        return {
          effectId: id,
          operation,
          status: "ack" as const,
          durable: true as const,
          ...(binding ? { binding } : {}),
        };
      },
    };
    const adapter = new CodexJsonlHarness(driver),
      store = new MemoryWorkerStateStore(),
      runtime = new PortableWorkerExecution(req, adapter, trust, store);
    expect(runtime.binding.opaqueSession).toBe("allocated");
    runtime.resume(req);
    expect(runtime.binding.opaqueSession).toBe("rotated");
    const impostor = new CodexJsonlHarness(driver);
    Object.defineProperty(impostor, "protocolVersion", {
      value: "responses-jsonl/evil",
    });
    expect(
      () => new PortableWorkerExecution(req, impostor, trust, store),
    ).toThrow(/binding/);
  });
  test("recovers a crash after effect execution but before durable acknowledgement using one stable effect id", () => {
    const f = fixture(),
      req = request(f.worktree),
      store = new MemoryWorkerStateStore(),
      seen = new Set<string>();
    let fail = true,
      physical = 0,
      calls = 0;
    const driver = {
      perform: (id: string, operation: string) => {
        calls++;
        if (!seen.has(id)) {
          seen.add(id);
          physical++;
        }
        if (fail) {
          fail = false;
          throw new Error("lost acknowledgement");
        }
        return {
          effectId: id,
          operation,
          status: "ack" as const,
          durable: true as const,
        };
      },
    };
    expect(
      () =>
        new PortableWorkerExecution(
          req,
          new CodexJsonlHarness(driver),
          trust,
          store,
        ),
    ).toThrow(/lost acknowledgement/);
    new PortableWorkerExecution(
      req,
      new CodexJsonlHarness(driver),
      trust,
      store,
    );
    new PortableWorkerExecution(
      req,
      new CodexJsonlHarness(driver),
      trust,
      store,
    );
    expect(physical).toBe(1);
    expect(calls).toBe(2);
  });
  test("process protocol durably deduplicates across adapter reconstruction after lost state ack", () => {
    const f = fixture(),
      req = request(f.worktree),
      inner = new MemoryWorkerStateStore();
    let rejectAck = true;
    const store = {
      load: (k: string) => inner.load(k),
      compareAndSwap: (k: string, v: number | undefined, n: any) => {
        if (rejectAck && v === 1) return false;
        return inner.compareAndSwap(k, v, n);
      },
    };
    const first = new ProcessCliHarness();
    expect(() => new PortableWorkerExecution(req, first, trust, store)).toThrow(
      /contention/,
    );
    expect(first.physicalCalls).toEqual(["launch"]);
    rejectAck = false;
    const second = new ProcessCliHarness();
    new PortableWorkerExecution(req, second, trust, store);
    expect(second.physicalCalls).toEqual([]);
    const states = readdirSync(join(f.worktree, ".open-autonomy-fixture"));
    expect(states).toHaveLength(1);
    expect(
      JSON.parse(
        readFileSync(
          join(f.worktree, ".open-autonomy-fixture", states[0]!),
          "utf8",
        ),
      ),
    ).toMatchObject({ active: true, effects: expect.any(Object) });
  });
});

describe("R11 enforced least-authority model", () => {
  test("rejects symlink, cwd/argv, DNS, repository, credential, and model escapes", () => {
    const f = fixture(),
      r = new PortableWorkerExecution(
        request(f.worktree),
        new ProcessCliHarness(),
        trust,
        new MemoryWorkerStateStore(),
      );
    expect(
      r.authorize({
        path: join(f.worktree, "ok"),
        executable: "git",
        args: ["status", join(f.worktree, "ok")],
        cwd: f.worktree,
        host: "api.model.test",
        repository: "repo",
        credentialRef: "cred",
        model: "model",
      }),
    ).toBe(true);
    const executed = r.executeAuthorizedCommand({
      executable: "/usr/bin/true",
      args: [],
      cwd: f.worktree,
      repository: "repo",
      credentialRef: "cred",
      model: "model",
    });
    expect(executed.status).toBe(0);
    const mutableExecutable = join(f.worktree, "mutable-executable");
    copyFileSync("/usr/bin/node", mutableExecutable);
    chmodSync(mutableExecutable, 0o755);
    const pinnedDigest = digestBytes(readFileSync(mutableExecutable));
    let swapped = false;
    const swappingTrust: WorkerTrust = {
      ...trust,
      verifyExecutable: (path, digest) =>
        (path === mutableExecutable && digest === pinnedDigest) ||
        trust.verifyExecutable(path, digest),
      verifyExecutableBytes: (bytes, digest) => {
        const matches = digestBytes(bytes) === digest;
        copyFileSync("/usr/bin/false", mutableExecutable);
        chmodSync(mutableExecutable, 0o755);
        swapped = true;
        return matches;
      },
    };
    const swapRequest = request(f.worktree);
    swapRequest.identity.attempt = "executable-swap";
    swapRequest.authority.sandboxId = "sandbox:executable-swap";
    swapRequest.authority.processCommands.push({
      executable: mutableExecutable,
      digest: pinnedDigest,
      argv: [],
    });
    const swapRuntime = new PortableWorkerExecution(
      swapRequest,
      codex(),
      swappingTrust,
      new MemoryWorkerStateStore(),
    );
    expect(
      swapRuntime.executeAuthorizedCommand({
        executable: mutableExecutable,
        args: [],
        cwd: f.worktree,
      }).status,
    ).toBe(0);
    expect(swapped).toBe(true);
    expect(
      r.executeAuthorizedNetwork("api.model.test", (target) => target),
    ).toEqual({
      host: "api.model.test",
      address: "203.0.113.4",
      capability: "network:api.model.test",
    });
    let rebound = false;
    const rebindingTrust: WorkerTrust = {
      ...trust,
      resolveHost: () => (rebound ? ["10.0.0.9"] : ["203.0.113.4"]),
    };
    const reboundRequest = request(f.worktree);
    reboundRequest.identity.attempt = "dns-rebind";
    reboundRequest.authority.sandboxId = "sandbox:dns-rebind";
    const reboundRuntime = new PortableWorkerExecution(
      reboundRequest,
      codex(),
      rebindingTrust,
      new MemoryWorkerStateStore(),
    );
    expect(reboundRuntime.authorize({ host: "api.model.test" })).toBe(true);
    rebound = true;
    expect(() =>
      reboundRuntime.executeAuthorizedNetwork("api.model.test", () => true),
    ).toThrow(/changed before execution/);
    const escapeCode = `const fs=require('fs');try{fs.readFileSync(${JSON.stringify(join(f.outside, "secret"))});process.exit(9)}catch{console.log('blocked')}`,
      sandboxRequest = request(f.worktree),
      sandboxStore = new MemoryWorkerStateStore();
    sandboxRequest.identity.attempt = "sandbox-attack";
    sandboxRequest.authority.sandboxId = "sandbox:sandbox-attack";
    sandboxRequest.authority.processCommands.push({
      executable: "/usr/bin/node",
      digest: "sha256:usr-node",
      argv: [{ literal: "-e" }, { literal: escapeCode }],
    });
    const sandboxed = new PortableWorkerExecution(
      sandboxRequest,
      codex(),
      trust,
      sandboxStore,
    );
    expect(
      sandboxed
        .executeAuthorizedCommand({
          executable: "/usr/bin/node",
          args: ["-e", escapeCode],
          cwd: f.worktree,
        })
        .stdout.trim(),
    ).toBe("blocked");
    for (const attack of [
      { args: ["status"] },
      { path: join(f.worktree, "escape", "secret") },
      {
        executable: "git",
        args: ["status", join(f.outside, "secret")],
        cwd: f.worktree,
      },
      { executable: "git", args: ["-C", f.outside] },
      { host: "evil" },
      { repository: "other" },
      { credentialRef: "admin" },
      { model: "other" },
    ])
      expect(r.authorize(attack)).toBe(false);
    const malformed = request(f.worktree);
    malformed.authority.processCommands[0]!.argv = [
      { literal: "status", kind: "value" },
    ];
    expect(
      () =>
        new PortableWorkerExecution(
          malformed,
          codex(),
          trust,
          new MemoryWorkerStateStore(),
        ),
    ).toThrow(/pinned/);
  });
});

describe("R11 process adapter identity binding", () => {
  test("does not alias equal attempt names across execution identities", () => {
    const f = fixture();
    const one = request(f.worktree);
    const two = request(f.worktree, {
      identity: { ...one.identity, tenant: "other-tenant" },
    });
    new PortableWorkerExecution(
      one,
      new ProcessCliHarness(),
      trust,
      new MemoryWorkerStateStore(),
    );
    new PortableWorkerExecution(
      two,
      new ProcessCliHarness(),
      trust,
      new MemoryWorkerStateStore(),
    );
    expect(
      readdirSync(join(f.worktree, ".open-autonomy-fixture")),
    ).toHaveLength(2);
  });

  test("binds the actual process invocation implementation", () => {
    expect(new ProcessCliHarness().implementationDigest).not.toBe(
      new ProcessCliHarness(process.execPath, ["--version"])
        .implementationDigest,
    );
  });

  test("linearizes genuinely simultaneous external effect delivery", async () => {
    const f = fixture();
    const adapter = new ProcessCliHarness() as any;
    const effect = canonicalSemanticJson({
      effectId: "same-effect",
      operation: "launch",
      payload: {},
    });
    const run = () =>
      Bun.spawn([process.execPath, ...adapter.spawnArgs, effect], {
        cwd: f.worktree,
        env: { ...process.env, OPEN_AUTONOMY_SESSION: "concurrent-session" },
        stdout: "pipe",
        stderr: "pipe",
      });
    const children = [run(), run()];
    expect(await Promise.all(children.map((child) => child.exited))).toEqual([
      0, 0,
    ]);
    const acknowledgements = await Promise.all(
      children.map(async (child) =>
        JSON.parse(await new Response(child.stdout).text()),
      ),
    );
    expect(acknowledgements.map((ack) => ack.duplicate).sort()).toEqual([
      false,
      true,
    ]);
  });

  test("recovers a lock abandoned by a dead external owner", async () => {
    const f = fixture();
    const adapter = new ProcessCliHarness() as any;
    const session = "dead-owner-session";
    const ledger = join(
      f.worktree,
      ".open-autonomy-fixture",
      `${createHash("sha256").update(session).digest("hex")}.json`,
    );
    const lock = `${ledger}.lock`;
    mkdirSync(lock, { recursive: true });
    writeFileSync(join(lock, "owner"), JSON.stringify({ pid: 999999, at: 0 }));
    utimesSync(lock, new Date(0), new Date(0));
    const effect = canonicalSemanticJson({
      effectId: "recovered-effect",
      operation: "launch",
      payload: {},
    });
    const child = Bun.spawn([process.execPath, ...adapter.spawnArgs, effect], {
      cwd: f.worktree,
      env: { ...process.env, OPEN_AUTONOMY_SESSION: session },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await child.exited).toBe(0);
    expect(JSON.parse(await new Response(child.stdout).text()).duplicate).toBe(
      false,
    );
    expect(readFileSync(ledger, "utf8")).toContain("recovered-effect");
  });
});

describe("R11 independent evidence", () => {
  test("binds complete execution identity, artifact bytes/source, output schema, and usage meter conservation", () => {
    const f = fixture(),
      req = request(f.worktree),
      r = new PortableWorkerExecution(
        req,
        codex(),
        trust,
        new MemoryWorkerStateStore(),
      );
    for (const change of [
      { behavior: "other" },
      { worktree: f.outside },
      { account: "other" },
      { credentialRef: "other" },
      { modelEndpoint: "other" },
      { modelVersion: "other" },
    ])
      expect(() => r.observe(evidence(req, change))).toThrow(/independent/);
    const bytes = Buffer.from("artifact"),
      digest = digestBytes(bytes);
    expect(() =>
      r.observe(
        evidence(req, {
          id: "bad-artifact",
          kind: "artifact",
          resultDigest: digest,
          artifactId: "a",
          artifactUri: `file://${f.outside}/a`,
          artifactBytesBase64: bytes.toString("base64"),
        }),
      ),
    ).toThrow(/source/);
    r.observe(
      evidence(req, {
        id: "artifact",
        kind: "artifact",
        resultDigest: digest,
        artifactId: "a",
        artifactUri: `file://${f.worktree}/a`,
        artifactBytesBase64: bytes.toString("base64"),
      }),
    );
    expect(() =>
      r.acceptReport({
        kind: "artifact",
        digest,
        artifactId: "a",
        artifactUri: `file://${f.worktree}/a`,
      }),
    ).not.toThrow();
    expect(() =>
      r.acceptReport({
        kind: "artifact",
        digest,
        artifactId: "substituted",
        artifactUri: `file://${f.worktree}/a`,
      }),
    ).toThrow(/identity/);
    expect(() =>
      r.observe(
        evidence(req, {
          id: "bad-output",
          output: { ok: false },
          resultDigest: digestContent(canonicalSemanticJson({ ok: false })),
        }),
      ),
    ).toThrow(/schema/);
    r.observe(
      evidence(req, {
        id: "meter-1",
        kind: "usage",
        inputTokens: 1,
        outputTokens: 1,
        costMicros: 1,
        model: "model",
        meterId: "bill:1",
      }),
    );
    expect(() =>
      r.observe(
        evidence(req, {
          id: "meter-replay",
          kind: "usage",
          inputTokens: 1,
          outputTokens: 1,
          costMicros: 1,
          model: "model",
          meterId: "bill:1",
        }),
      ),
    ).toThrow(/conservation/);
  });
  test("requires signed statement, complete binding, and independently reconciled usage/model/budget", () => {
    const f = fixture(),
      req = request(f.worktree),
      r = new PortableWorkerExecution(
        req,
        codex(),
        trust,
        new MemoryWorkerStateStore(),
      );
    for (const forged of [
      evidence(req, { observer: "w" }),
      { ...evidence(req), signature: "self" },
      evidence(req, { attempt: "old" }),
      evidence(req, { fence: 3 }),
      evidence(req, { contextDigest: "old" }),
    ])
      expect(() => r.observe(forged)).toThrow(/independent/);
    r.observe(evidence(req));
    expect(() =>
      r.apply({
        eventId: "wrong",
        fence: 4,
        worker: "w",
        kind: "completion",
        value: "sha256:other",
      }),
    ).toThrow(/result-bound/);
    r.observe(
      evidence(req, {
        id: "unrelated-usage",
        kind: "usage",
        resultDigest: digestContent("unrelated"),
        inputTokens: 1,
        outputTokens: 1,
        costMicros: 1,
        model: "model",
        meterId: "unrelated",
      }),
    );
    expect(() =>
      r.apply({
        eventId: "done0",
        fence: 4,
        worker: "w",
        kind: "completion",
        value: RESULT,
      }),
    ).toThrow(/usage/);
    const version = spawnSync("codex", ["--version"], { encoding: "utf8" }),
      help = spawnSync("codex", ["exec", "--help"], { encoding: "utf8" });
    expect(version.status).toBe(0);
    expect(version.stdout).toMatch(/codex-cli 0\.144\.5/);
    expect(help.stdout).toContain("--json");
    r.observe(
      evidence(req, {
        id: "usage",
        kind: "usage",
        inputTokens: 70,
        outputTokens: 20,
        costMicros: 50,
        model: "model",
      }),
    );
    expect(
      r.apply({
        eventId: "done",
        fence: 4,
        worker: "w",
        kind: "completion",
        value: RESULT,
      }).accepted,
    ).toBe(true);
  });
});

describe("R11 dissimilar adapter TCK", () => {
  test("both adapters implement lifecycle and strict typed native projection", () => {
    const f = fixture(),
      at = "2026-07-15T00:00:00Z";
    for (const adapter of [codex(), new ProcessCliHarness()]) {
      const req = request(f.worktree),
        r = new PortableWorkerExecution(
          req,
          adapter,
          trust,
          new MemoryWorkerStateStore(),
        );
      r.resume(req);
      adapter.inspect(r.binding);
      r.apply({ eventId: "h", fence: 4, worker: "w", kind: "heartbeat" });
      r.apply({
        eventId: "q",
        fence: 4,
        worker: "w",
        kind: "question",
        questionType: "text",
        questionId: "q",
        text: "why",
      });
      r.apply({
        eventId: "a",
        fence: 4,
        worker: "w",
        kind: "answer",
        questionId: "q",
        value: "x",
      });
      r.apply({
        eventId: "q-choice",
        fence: 4,
        worker: "w",
        kind: "question",
        questionId: "choice",
        questionType: "choice",
        choices: ["one", "two"],
        text: "pick",
      });
      expect(() =>
        r.apply({
          eventId: "a-bad",
          fence: 4,
          worker: "w",
          kind: "answer",
          questionId: "choice",
          value: "three",
        }),
      ).toThrow(/schema/);
      r.apply({
        eventId: "a-choice",
        fence: 4,
        worker: "w",
        kind: "answer",
        questionId: "choice",
        value: "two",
      });
      r.apply({
        eventId: "p",
        fence: 4,
        worker: "w",
        kind: "checkpoint",
        checkpointId: "cp",
      });
      r.apply({ eventId: "c", fence: 4, worker: "w", kind: "cancel" });
      if (adapter instanceof ProcessCliHarness) {
        const stateFile = readdirSync(
            join(f.worktree, ".open-autonomy-fixture"),
          )[0]!,
          state = JSON.parse(
            readFileSync(
              join(f.worktree, ".open-autonomy-fixture", stateFile),
              "utf8",
            ),
          );
        expect(state).toMatchObject({
          active: false,
          questions: {
            q: { type: "text", answer: "x" },
            choice: { type: "choice", choices: ["one", "two"], answer: "two" },
          },
          checkpoints: ["cp"],
        });
      }
      expect(adapter.calls).toEqual(
        expect.arrayContaining([
          "launch",
          "resume",
          "heartbeat",
          "question",
          "answer",
          "checkpoint",
          "cancel",
        ]),
      );
      expect(adapter.protocolVersion).toMatch(/\/1$/);
    }
    const nativeCodex = () => new CodexJsonlHarness(undefined, "m", () => at),
      c = nativeCodex().project([{ type: "future" }]),
      p = new ProcessCliHarness().project([{ event: "future", time: at }]);
    expect(c[0]?.kind).toBe("loss");
    expect(p[0]?.kind).toBe("loss");
    const artifactDigest = `sha256:${"a".repeat(64)}`;
    expect(
      nativeCodex().project([
        { type: "thread.started", thread_id: "thread-1" },
      ])[0],
    ).toEqual({ kind: "checkpoint", at, checkpoint: "thread-1" });
    expect(
      nativeCodex().project([
        {
          type: "item.completed",
          item: { id: "item-1", type: "agent_message", text: "done" },
        },
      ])[0],
    ).toEqual({ kind: "output", at, text: "done" });
    expect(
      new ProcessCliHarness().project([
        {
          event: "artifact",
          time: at,
          data: {
            id: "artifact-2",
            uri: "file:///untrusted/process-output",
            digest: artifactDigest,
          },
        },
      ])[0]?.kind,
    ).toBe("artifact");
    expect(() =>
      nativeCodex().project([
        {
          type: "turn.completed",
          usage: {
            input_tokens: "1",
            cached_input_tokens: 0,
            output_tokens: 1,
          },
        },
      ]),
    ).toThrow(/usage/);
    expect(() =>
      new ProcessCliHarness().project([
        {
          event: "stdout",
          time: at,
          data: { chunk: "x" },
          extra: true,
        } as never,
      ]),
    ).toThrow(/unknown/);
    expect(() =>
      nativeCodex().project([{ type: "turn.started", extra: "smuggled" }]),
    ).toThrow(/unknown/);
    expect(() =>
      new ProcessCliHarness().project([
        {
          event: "meter",
          time: at,
          data: { prompt: 1, completion: 1, endpoint: "m", extra: true },
        },
      ]),
    ).toThrow(/unknown/);

    for (const make of [() => codex(), () => new ProcessCliHarness()]) {
      const reclaimAdapter = make(),
        reclaimRequest = request(f.worktree, {
          identity: {
            ...request(f.worktree).identity,
            attempt: `reclaim-${reclaimAdapter.id}`,
          },
          authority: {
            ...request(f.worktree).authority,
            sandboxId: `sandbox:reclaim-${reclaimAdapter.id}`,
          },
        }),
        reclaimed = new PortableWorkerExecution(
          reclaimRequest,
          reclaimAdapter,
          trust,
          new MemoryWorkerStateStore(),
        );
      reclaimed.reclaim("replacement");
      expect(reclaimAdapter.calls).toContain("reclaim");

      for (const terminal of ["timeout", "teardown"] as const) {
        const adapter = make(),
          attempt = `${terminal}-${adapter.id}`,
          terminalRequest = request(f.worktree, {
            identity: { ...request(f.worktree).identity, attempt },
            authority: {
              ...request(f.worktree).authority,
              sandboxId: `sandbox:${attempt}`,
            },
          }),
          runtime = new PortableWorkerExecution(
            terminalRequest,
            adapter,
            trust,
            new MemoryWorkerStateStore(),
          );
        runtime.apply({
          eventId: terminal,
          fence: terminalRequest.fence,
          worker: terminalRequest.identity.worker,
          kind: terminal,
        });
        expect(adapter.calls).toContain(terminal);
      }
    }
  });
});
