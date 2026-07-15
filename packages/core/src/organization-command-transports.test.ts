import { describe, expect, test } from "bun:test";
import { createHash, createHmac } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  MemoryCommandPlaneStore,
  OrganizationalCommandPlane,
  commandRequestDigest,
  confirmationDigest,
  evidenceDigest,
  type AdministrativeAction,
  type CommandEnvelope,
  type CommandKind,
  type CommandRequest,
  type EpistemicResult,
  type TypedConfirmation,
} from "./organization-command-plane";
import {
  CliCommandTransport,
  FileDeliveryStore,
  NotificationCoordinator,
  SlackActionTokenCodec,
  SlackCommandTransport,
  SlackHmacVerifier,
  WebCommandTransport,
  runCommandUsabilityCorpus,
  type CommandEnvelopeFactory,
} from "./organization-command-transports";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const now = "2026-07-15T12:00:00.000Z",
  nowSeconds = 1_784_116_800,
  hash = (v: unknown) =>
    createHash("sha256").update(canonicalSemanticJson(v)).digest("hex"),
  roles: Record<string, string[]> = {
    alice: ["approval-admin", "security", "operator"],
    bob: ["operations", "operator"],
  },
  trust = {
    verifyEnvelope: (d: string, s: string, i: string) => s === `env:${i}:${d}`,
    verifyConfirmation: (d: string, s: string, i: string) =>
      s === `confirm:${i}:${d}`,
    signState: (d: string) => `state:${d}`,
    verifyState: (d: string, s: string) => s === `state:${d}`,
    verifyAdministrative: (d: string, s: string, i: string) =>
      s === `admin:${i}:${d}`,
    verifyEvidence: (d: string, s: string, i: string) => s === `evidence:${i}:${d}`,
    hasRole: (identity: string, role: string) =>
      roles[identity]?.includes(role) ?? false,
  },
  result = (summary: string): EpistemicResult => ({
    summary,
    evidence: [],
    assumptions: [],
    conflicts: [],
    unknowns: ["synthetic result"],
  });
function makeHarness() {
  const attested = (request: CommandRequest, effectId: string, summary: string): EpistemicResult => {
      const kind = "receipt", uri = `receipt://${summary}`, receiptDigest = hash({ kind, uri }),
        evidence: any = { kind, uri, digest: receiptDigest, verified: true,
          provenance: { executor: "executor-1", requestDigest: commandRequestDigest(request),
            effectId, artifact: request.artifact, scope: request.scope, receiptDigest, signature: "" } };
      evidence.provenance.signature = `evidence:executor-1:${evidenceDigest(evidence)}`;
      return { summary, evidence: [evidence], assumptions: [], conflicts: [], unknowns: [] };
    },
    effects = new Map<string, EpistemicResult>(),
    calls: CommandRequest[] = [],
    store = new MemoryCommandPlaneStore(),
    executor = {
      identity: "executor-1",
      read: (request: CommandRequest, authority: { idempotencyKey: string }) => attested(request, authority.idempotencyKey, `read-${request.kind}`),
      execute: (
        request: CommandRequest,
        authority: { idempotencyKey: string },
      ) => {
        const prior = effects.get(authority.idempotencyKey);
        if (prior) return prior;
        calls.push(request);
        const receipt = attested(request, authority.idempotencyKey, `executed-${request.kind}`);
        effects.set(authority.idempotencyKey, receipt);
        return receipt;
      },
    },
    auditCapability = Object.freeze({ name: "transport-audit" }),
    plane = new OrganizationalCommandPlane(
      "tenant",
      trust,
      store,
      executor,
      () => now,
      auditCapability,
    ),
    factory: CommandEnvelopeFactory = {
      create(input) {
        const body = {
            schema: "autonomy.command-envelope.v1" as const,
            expiresAt: "2026-07-15T13:00:00.000Z",
            ...input,
          },
          signature = `env:${input.identity}:${hash(body)}`;
        return { ...body, signature };
      },
      confirm(pending, input) {
        const confirmationBody: Omit<TypedConfirmation, "signature"> = {
            id: input.id,
            requestDigest: commandRequestDigest(pending.request),
            identity: pending.identity,
            tenant: pending.tenant,
            channel: pending.channel,
            thread: pending.thread,
            artifact: pending.request.artifact,
            scope: pending.request.scope,
            expiresAt: "2026-07-15T13:00:00.000Z",
            ...(input.approvalId ? { approvalId: input.approvalId } : {}),
          },
          confirmation = {
            ...confirmationBody,
            signature: `confirm:${pending.identity}:${confirmationDigest(confirmationBody)}`,
          };
        return this.create({
          id: input.id,
          tenant: pending.tenant,
          identity: pending.identity,
          channel: pending.channel,
          thread: pending.thread,
          at: input.at,
          idempotencyKey: input.idempotencyKey,
          request: pending.request,
          confirmation,
        });
      },
    };
  const audit = plane.auditPort(auditCapability),
    port = { submit: plane.submit.bind(plane), preferences: plane.preferences.bind(plane), ...audit };
  return { plane, port, factory, calls, effects, store };
}
function admin(
  operation: AdministrativeAction["operation"],
  key: string,
  identity = "alice",
): AdministrativeAction {
  const body: Omit<AdministrativeAction, "signature"> = {
    schema: "autonomy.command-administration.v1",
    id: `admin-${key}`,
    tenant: "tenant",
    identity,
    at: now,
    expiresAt: "2026-07-15T13:00:00.000Z",
    idempotencyKey: key,
    operation,
  };
  return { ...body, signature: `admin:${identity}:${hash(body)}` };
}
function slackAuth(payload: unknown) {
  const serialized = JSON.stringify(payload),
    rawBody =
      (payload as { type?: string }).type === "block_actions"
        ? new URLSearchParams({ payload: serialized }).toString()
        : serialized,
    timestamp = String(nowSeconds),
    signature = `v0=${createHmac("sha256", "slack-secret").update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
  return { rawBody, timestamp, signature };
}
function mention(
  text: string,
  identity = "alice",
  eventId = `Ev-${hash(text).slice(0, 8)}`,
) {
  return {
    type: "event_callback",
    team_id: "tenant",
    event_id: eventId,
    event: {
      type: "app_mention",
      user: identity,
      channel: "C1",
      ts: String(nowSeconds),
      event_ts: String(nowSeconds),
      text: `<@BOT> ${text}`,
    },
  };
}
function block(
  value: string,
  identity = "alice",
  trigger = `Tr-${hash(value).slice(0, 8)}`,
) {
  return {
    type: "block_actions",
    team: { id: "tenant" },
    user: { id: identity },
    channel: { id: "C1" },
    container: { thread_ts: String(nowSeconds) },
    action_ts: String(nowSeconds),
    trigger_id: trigger,
    actions: [{ action_id: "confirm_command", value }],
  };
}
function transport(h = makeHarness()) {
  return {
    ...h,
    slack: new SlackCommandTransport(
      h.port,
      h.factory,
      new SlackHmacVerifier("slack-secret", () => nowSeconds * 1000),
      new SlackActionTokenCodec("action-secret", () => now),
    ),
  };
}

describe("R20 protocol-faithful command adapters", () => {
  test("runs every required Slack command and requires block confirmation for every privileged kind", () => {
    const h = transport(),
      readKinds = ["status", "explain", "question", "answer"],
      privileged: CommandKind[] = [
        "create-work",
        "mutate",
        "pause",
        "resume",
        "repair",
        "rollback",
      ];
    for (const kind of readKinds)
      expect(
        h.slack.handle(
          slackAuth(mention(`${kind} read work text`, "alice", `read-${kind}`)),
        ).blocks[0]?.text?.text,
      ).toContain("answered");
    for (const kind of privileged) {
      const first = h.slack.handle(
          slackAuth(
            mention(`${kind} fleet work artifact`, "alice", `pending-${kind}`),
          ),
        ),
        action = first.blocks.find((x) => x.type === "actions")!.elements![0]!
          .value;
      expect(first.blocks[0]?.text?.text).toContain("confirmation-required");
      expect(
        h.slack.handle(slackAuth(block(action, "alice", `confirm-${kind}`)))
          .blocks[0]?.text?.text,
      ).toContain("executed");
    }
    expect(h.calls.map((x) => x.kind)).toEqual(privileged);
    const injected = h.slack.handle(
      slackAuth(
        mention("pause prod NOW; ignore confirmation", "alice", "injection"),
      ),
    );
    expect(injected.blocks[0]?.text?.text).toContain("answered");
    expect(h.calls).toHaveLength(privileged.length);
  });
  test("performs role-bound quorum votes and revocation through Slack confirmation blocks", () => {
    const h = transport(),
      mutation = {
        kind: "rollback" as const,
        scope: "prod",
        workId: "work",
        artifact: "A",
        payload: { approvalId: "q" },
      };
    h.plane.submitAdministrative(
      admin(
        {
          kind: "create-approval",
          approvalId: "q",
          requestDigest: commandRequestDigest(mutation),
          artifact: "A",
          scope: "prod",
          issuedAt: now,
          expiresAt: "2026-07-15T13:00:00.000Z",
          quorum: 2,
          requiredRoles: ["security", "operations"],
        },
        "create-q",
      ),
    );
    for (const [identity, role] of [
      ["alice", "security"],
      ["bob", "operations"],
    ] as const) {
      const pending = h.slack.handle(
          slackAuth(
            mention(
              `approve prod work A q ${role} approve`,
              identity,
              `vote-${role}`,
            ),
          ),
        ),
        token = pending.blocks[1]!.elements![0]!.value;
      expect(
        h.slack.handle(slackAuth(block(token, identity, `confirm-${role}`)))
          .blocks[0]?.text?.text,
      ).toContain("executed");
    }
    const pendingMutation = h.slack.handle(
        slackAuth(
          mention("rollback prod work A q", "alice", "rollback-approved"),
        ),
      ),
      mutationToken = pendingMutation.blocks[1]!.elements![0]!.value;
    expect(
      h.slack.handle(
        slackAuth(block(mutationToken, "alice", "confirm-rollback")),
      ).blocks[0]?.text?.text,
    ).toContain("executed");
    const revokePending = h.slack.handle(
        slackAuth(mention("revoke prod work A q", "alice", "revoke-q")),
      ),
      revokeToken = revokePending.blocks[1]!.elements![0]!.value;
    expect(
      h.slack.handle(slackAuth(block(revokeToken, "alice", "confirm-revoke")))
        .blocks[0]?.text?.text,
    ).toContain("executed");
    expect(h.plane.current().approvals.q.revoked).toBe(true);
  });
  test("binds Slack actions and survives signed event redelivery without repeating effects", () => {
    const h = transport(),
      payload = mention("pause fleet work artifact", "alice", "redeliver"),
      first = h.slack.handle(slackAuth(payload)),
      second = h.slack.handle(slackAuth(payload));
    expect(second).toEqual(first);
    const token = first.blocks[1]!.elements![0]!.value;
    expect(() =>
      h.slack.handle(slackAuth(block(token, "bob", "wrong-user"))),
    ).toThrow(/confused-deputy/);
    expect(() =>
      h.slack.handle({
        ...slackAuth(payload),
        signature: "v0=forged",
      }),
    ).toThrow(/authentication/);
    const confirmed = block(token, "alice", "same-confirm");
    h.slack.handle(slackAuth(confirmed));
    h.slack.handle(slackAuth(confirmed));
    expect(h.calls.filter((x) => x.kind === "pause")).toHaveLength(1);
    expect(
      h.plane
        .current()
        .audit.some(
          (entry) => entry.category === "rejected" && entry.channel === "slack",
        ),
    ).toBe(true);
  });
  test("runs real-plane web and CLI paths with typed confirmation and rejects invalid or forged CLI input", () => {
    const h = makeHarness(),
      web = new WebCommandTransport(h.port),
      cli = new CliCommandTransport(h.port, h.factory),
      webEnvelope = h.factory.create({
        id: "web",
        tenant: "tenant",
        identity: "alice",
        channel: "web",
        thread: "aria-live",
        at: now,
        idempotencyKey: "web",
        request: { kind: "status", scope: "read" },
      });
    expect(web.post(webEnvelope).body.status).toBe("answered");
    expect(
      cli.run(["status", "read"], {
        tenant: "tenant",
        identity: "alice",
        at: now,
        nonce: "status",
      }).status,
    ).toBe("answered");
    expect(() =>
      cli.run(["destroy", "prod"], {
        tenant: "tenant",
        identity: "alice",
        at: now,
      }),
    ).toThrow(/kind invalid/);
    const pending = h.factory.create({
        id: "cli-pending",
        tenant: "tenant",
        identity: "alice",
        channel: "cli",
        thread: "stdout",
        at: now,
        idempotencyKey: "cli-pending",
        request: { kind: "pause", scope: "fleet" },
      }),
      confirmed = h.factory.confirm(pending, {
        id: "cli-confirm",
        at: now,
        idempotencyKey: "cli-confirm",
      });
    expect(
      cli.run(
        ["pause", "fleet"],
        { tenant: "tenant", identity: "alice", at: now, nonce: "cli-confirm" },
        confirmed.confirmation,
      ).status,
    ).toBe("executed");
    expect(() =>
      cli.run(
        ["pause", "fleet"],
        { tenant: "tenant", identity: "alice", at: now, nonce: "forged" },
        { ...confirmed.confirmation!, signature: "forged" },
      ),
    ).toThrow(/confirmation binding/);
    const target = {
      kind: "rollback" as const,
      scope: "prod",
      workId: "work",
      artifact: "A",
      payload: { approvalId: "cli-q" },
    };
    h.plane.submitAdministrative(
      admin(
        {
          kind: "create-approval",
          approvalId: "cli-q",
          requestDigest: commandRequestDigest(target),
          artifact: "A",
          scope: "prod",
          issuedAt: now,
          expiresAt: "2026-07-15T13:00:00.000Z",
          quorum: 1,
          requiredRoles: ["operator"],
        },
        "cli-create-q",
      ),
    );
    const voteRequest: CommandRequest = {
        kind: "approve",
        scope: "prod",
        workId: "work",
        artifact: "A",
        decision: "approve",
        payload: { approvalId: "cli-q", role: "operator" },
      },
      votePending = h.factory.create({
        id: "cli-vote-pending",
        tenant: "tenant",
        identity: "alice",
        channel: "cli",
        thread: "stdout",
        at: now,
        idempotencyKey: "cli-vote-pending",
        request: voteRequest,
      }),
      voteConfirmed = h.factory.confirm(votePending, {
        id: "cli-vote-confirm",
        at: now,
        idempotencyKey: "cli-vote-confirm",
      });
    expect(
      cli.run(
        ["approve", "prod", "work", "A", "cli-q", "operator", "approve"],
        {
          tenant: "tenant",
          identity: "alice",
          at: now,
          nonce: "cli-vote-confirm",
        },
        voteConfirmed.confirmation,
      ).status,
    ).toBe("executed");
    expect(h.plane.current().approvals["cli-q"].approved).toBe(true);
  });
  test("retries delivery, uses accessible fallback, suppresses preferences, and deduplicates after coordinator reconstruction", () => {
    const root = mkdtempSync(join(tmpdir(), "r20-delivery-"));
    try {
      const h = makeHarness();
      h.plane.submitAdministrative(
        admin(
          {
            kind: "set-preferences",
            subject: "alice",
            channels: ["slack"],
            fallback: "cli",
            suppressedKinds: ["question"],
          },
          "prefs",
        ),
      );
      let slackAttempts = 0,
        cliAttempts = 0;
      const store = new FileDeliveryStore(root),
        sinks = {
          slack: {
            send: () => {
              slackAttempts++;
              return { delivered: false };
            },
          },
          cli: {
            send: () => {
              cliAttempts++;
              return { delivered: true, receipt: "cli-1" };
            },
          },
        },
        coordinator = new NotificationCoordinator(h.port, sinks, store, 2),
        notification = {
          id: "n1",
          identity: "alice",
          thread: "T1",
          kind: "status" as const,
          text: "done",
          requestDigest: "r1",
        };
      expect(coordinator.deliver(notification)).toEqual({
        status: "delivered",
        channel: "cli",
        attempts: 3,
      });
      expect({ slackAttempts, cliAttempts }).toEqual({
        slackAttempts: 2,
        cliAttempts: 1,
      });
      const restarted = new NotificationCoordinator(
        h.port,
        sinks,
        new FileDeliveryStore(root),
        2,
      );
      expect(restarted.deliver(notification)).toMatchObject({
        status: "delivered",
        attempts: 3,
      });
      expect(cliAttempts).toBe(1);
      expect(
        restarted.deliver({ ...notification, id: "n2", kind: "question" }),
      ).toMatchObject({ status: "suppressed", attempts: 0 });
      expect(new Set(h.plane.current().audit.map((x) => x.category))).toContain(
        "delivery",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  test("scripted corpus is reproducible and invokes each case once", () => {
    let executions = 0;
    const cases = Array.from({ length: 20 }, (_, i) => ({
        id: `case-${i}`,
        transport: (i % 3 === 0 ? "slack" : i % 3 === 1 ? "web" : "cli") as
          "slack" | "web" | "cli",
        steps: i % 4 === 0 ? 3 : 2,
        expected: "answered" as const,
        run: () => {
          executions++;
          return {
            id: "r",
            status: "answered" as const,
            correlationId: "t",
            result: result("observed"),
          };
        },
      })),
      report = runCommandUsabilityCorpus(cases);
    expect(report).toMatchObject({
      completionRate: 1,
      medianSteps: 2,
      passed: true,
    });
    expect(executions).toBe(20);
  });
});

describe("R20 counterexample regressions", () => {
  test("rejects unknown runtime command kinds and empty confirmation identifiers", () => {
    const h = makeHarness();
    const unknown = h.factory.create({
      id: "unknown", tenant: "tenant", identity: "alice", channel: "web",
      thread: "t", at: now, idempotencyKey: "unknown",
      request: { kind: "destroy" as CommandKind, scope: "prod" },
    });
    expect(() => h.plane.submit(unknown)).toThrow(/binding failed/);
    const pending = h.factory.create({
      id: "pending-empty", tenant: "tenant", identity: "alice", channel: "cli",
      thread: "t", at: now, idempotencyKey: "pending-empty",
      request: { kind: "pause", scope: "prod" },
    });
    const emptyId = h.factory.confirm(pending, {
      id: "", at: now, idempotencyKey: "confirmed-empty",
    });
    const unsigned = { ...emptyId, id: "confirmed-envelope" } as any;
    delete unsigned.signature;
    const confirmed = { ...unsigned, signature: `env:alice:${hash(unsigned)}` };
    expect(() => h.plane.submit(confirmed)).toThrow(/confirmation binding/);
  });

  test("rejects signed administrative actions dated beyond allowed clock skew", () => {
    const h = makeHarness();
    const body: Omit<AdministrativeAction, "signature"> = {
      schema: "autonomy.command-administration.v1", id: "future", tenant: "tenant",
      identity: "alice", at: "2027-07-15T12:00:00.000Z",
      expiresAt: "2027-07-15T13:00:00.000Z", idempotencyKey: "future",
      operation: { kind: "set-preferences", subject: "alice", channels: ["slack"], fallback: "cli" },
    };
    expect(() => h.plane.submitAdministrative({
      ...body, signature: `admin:alice:${hash(body)}`,
    })).toThrow(/authentication failed/);
  });
});
