import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { canonicalSemanticJson } from "./organization-canonical";
import type {
  CommandEnvelope,
  CommandKind,
  CommandRequest,
  CommandResponse,
  OrganizationalCommandPlane,
  TypedConfirmation,
} from "./organization-command-plane";

export type SlackRequestAuthentication = {
  rawBody: string;
  timestamp: string;
  signature: string;
};
export interface SlackRequestVerifier {
  verify(authentication: SlackRequestAuthentication): boolean;
}
export class SlackHmacVerifier implements SlackRequestVerifier {
  constructor(
    private signingSecret: string,
    private clock: () => number = () => Date.now(),
    private maximumSkewSeconds = 300,
  ) {
    if (!signingSecret) throw new Error("Slack signing secret required");
  }
  verify(a: SlackRequestAuthentication) {
    const seconds = Number(a.timestamp);
    if (
      !Number.isSafeInteger(seconds) ||
      Math.abs(this.clock() / 1000 - seconds) > this.maximumSkewSeconds
    )
      return false;
    const expected = `v0=${createHmac("sha256", this.signingSecret).update(`v0:${a.timestamp}:${a.rawBody}`).digest("hex")}`;
    return (
      a.signature.length === expected.length &&
      timingSafeEqual(Buffer.from(a.signature), Buffer.from(expected))
    );
  }
}
export interface CommandEnvelopeFactory {
  create(input: {
    id: string;
    tenant: string;
    identity: string;
    channel: string;
    thread: string;
    at: string;
    idempotencyKey: string;
    request: CommandRequest;
    confirmation?: TypedConfirmation;
  }): CommandEnvelope;
  confirm(
    pending: CommandEnvelope,
    input: {
      id: string;
      at: string;
      idempotencyKey: string;
      approvalId?: string;
    },
  ): CommandEnvelope;
}
type PendingAction = {
  schema: "autonomy.slack-action.v1";
  pending: CommandEnvelope;
  expiresAt: string;
};
export class SlackActionTokenCodec {
  constructor(
    private secret: string,
    private clock: () => string = () => new Date().toISOString(),
  ) {
    if (!secret) throw new Error("Slack action secret required");
  }
  encode(action: PendingAction) {
    const body = Buffer.from(canonicalSemanticJson(action)).toString(
        "base64url",
      ),
      signature = createHmac("sha256", this.secret)
        .update(body)
        .digest("base64url");
    return `${body}.${signature}`;
  }
  decode(token: string): PendingAction {
    const [body, signature] = token.split(".");
    if (!body || !signature) throw new Error("Slack action token malformed");
    const expected = createHmac("sha256", this.secret)
      .update(body)
      .digest("base64url");
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      throw new Error("Slack action token authentication failed");
    const action = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as PendingAction;
    if (
      action.schema !== "autonomy.slack-action.v1" ||
      !Number.isFinite(Date.parse(action.expiresAt)) ||
      Date.parse(action.expiresAt) < Date.parse(this.clock())
    )
      throw new Error("Slack action token expired");
    return action;
  }
}
type SlackBlock = {
  type: "section" | "actions";
  text?: { type: "mrkdwn"; text: string };
  elements?: Array<{
    type: "button";
    action_id: string;
    text: { type: "plain_text"; text: string };
    style?: "primary" | "danger";
    value: string;
  }>;
};
export class SlackCommandTransport {
  constructor(
    private plane: Pick<
      OrganizationalCommandPlane,
      "submit" | "recordDelivery" | "recordTransportRejection"
    >,
    private factory: CommandEnvelopeFactory,
    private verifier: SlackRequestVerifier,
    private tokens: SlackActionTokenCodec,
  ) {}
  handle(authentication: SlackRequestAuthentication): {
    response_type: "ephemeral";
    thread_ts: string;
    blocks: SlackBlock[];
  } {
    if (!this.verifier.verify(authentication)) {
      this.plane.recordTransportRejection({
        id: `slack-auth:${authentication.timestamp}`,
        channel: "slack",
        detail: "Slack request authentication failed",
      });
      throw new Error("Slack request authentication failed");
    }
    let payload: any;
    try {
      if (authentication.rawBody.trimStart().startsWith("{"))
        payload = JSON.parse(authentication.rawBody);
      else {
        const encoded = new URLSearchParams(authentication.rawBody).get(
          "payload",
        );
        if (!encoded) throw new Error("Slack form payload absent");
        payload = JSON.parse(encoded);
      }
    } catch {
      this.plane.recordTransportRejection({
        id: `slack-json:${authentication.timestamp}`,
        channel: "slack",
        detail: "Slack request JSON invalid",
      });
      throw new Error("Slack request JSON invalid");
    }
    if (payload?.type === "event_callback") return this.handleMention(payload);
    if (payload?.type === "block_actions") return this.handleAction(payload);
    this.plane.recordTransportRejection({
      id: `slack-payload:${authentication.timestamp}`,
      channel: "slack",
      detail: "Slack interaction payload invalid",
    });
    throw new Error("Slack interaction payload invalid");
  }
  private handleMention(payload: any) {
    if (
      payload.event?.type !== "app_mention" ||
      typeof payload.event.text !== "string" ||
      !payload.event_id ||
      !payload.team_id ||
      !payload.event.user ||
      !payload.event.channel ||
      !payload.event.ts
    ) {
      this.plane.recordTransportRejection({
        id: `slack-event:${payload.event_id ?? "unknown"}`,
        identity: payload.event?.user,
        channel: String(payload.event?.channel ?? "slack"),
        thread: payload.event?.thread_ts ?? payload.event?.ts,
        detail: "Slack event payload invalid",
      });
      throw new Error("Slack event payload invalid");
    }
    const request = parseTypedText(payload.event.text),
      thread = String(payload.event.thread_ts ?? payload.event.ts),
      at = slackTime(payload.event.event_ts ?? payload.event.ts),
      pending = this.factory.create({
        id: payload.event_id,
        tenant: String(payload.team_id),
        identity: String(payload.event.user),
        channel: String(payload.event.channel),
        thread,
        at,
        idempotencyKey: payload.event_id,
        request,
      }),
      response = this.plane.submit(pending),
      blocks: SlackBlock[] = [
        { type: "section", text: { type: "mrkdwn", text: render(response) } },
      ];
    if (response.status === "confirmation-required") {
      const value = this.tokens.encode({
        schema: "autonomy.slack-action.v1",
        pending,
        expiresAt: pending.expiresAt,
      });
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            action_id: "confirm_command",
            text: { type: "plain_text", text: "Confirm" },
            style: "primary",
            value,
          },
          {
            type: "button",
            action_id: "reject_command",
            text: { type: "plain_text", text: "Cancel" },
            style: "danger",
            value,
          },
        ],
      });
    }
    return { response_type: "ephemeral" as const, thread_ts: thread, blocks };
  }
  private handleAction(payload: any) {
    const action = payload.actions?.[0],
      team = String(payload.team?.id ?? ""),
      identity = String(payload.user?.id ?? ""),
      channel = String(payload.channel?.id ?? ""),
      thread = String(
        payload.container?.thread_ts ?? payload.container?.message_ts ?? "",
      );
    if (
      !action ||
      !["confirm_command", "reject_command"].includes(action.action_id) ||
      !team ||
      !identity ||
      !channel ||
      !thread
    ) {
      this.plane.recordTransportRejection({
        id: `slack-block:${payload.trigger_id ?? "unknown"}`,
        identity,
        channel: channel || "slack",
        thread,
        detail: "Slack block action invalid",
      });
      throw new Error("Slack block action invalid");
    }
    let decoded: PendingAction;
    try {
      decoded = this.tokens.decode(String(action.value));
    } catch (error) {
      this.plane.recordTransportRejection({
        id: `slack-token:${payload.trigger_id ?? "unknown"}`,
        identity,
        channel,
        thread,
        detail: (error as Error).message,
      });
      throw error;
    }
    const pending = decoded.pending;
    if (
      pending.tenant !== team ||
      pending.identity !== identity ||
      pending.channel !== channel ||
      pending.thread !== thread
    ) {
      this.plane.recordTransportRejection({
        id: `slack-action:${payload.trigger_id ?? pending.id}`,
        identity,
        channel,
        thread,
        detail: "Slack block action confused-deputy binding failed",
      });
      throw new Error("Slack block action confused-deputy binding failed");
    }
    if (action.action_id === "reject_command") {
      this.plane.recordDelivery({
        id: `cancel:${payload.trigger_id ?? pending.id}`,
        identity,
        channel,
        thread,
        requestDigest: pending.id,
        status: "refused",
        detail: "user canceled typed confirmation",
      });
      return {
        response_type: "ephemeral" as const,
        thread_ts: thread,
        blocks: [
          {
            type: "section" as const,
            text: {
              type: "mrkdwn" as const,
              text: "*refused* — typed command canceled; no mutation executed.",
            },
          },
        ],
      };
    }
    const confirmed = this.factory.confirm(pending, {
        id: String(payload.trigger_id ?? `confirm:${pending.id}`),
        at: slackTime(payload.action_ts),
        idempotencyKey: `confirm:${payload.trigger_id ?? pending.id}`,
        ...(!["approve", "revoke"].includes(pending.request.kind) &&
        typeof pending.request.payload?.approvalId === "string"
          ? { approvalId: pending.request.payload.approvalId }
          : {}),
      }),
      response = this.plane.submit(confirmed);
    return {
      response_type: "ephemeral" as const,
      thread_ts: thread,
      blocks: [
        {
          type: "section" as const,
          text: { type: "mrkdwn" as const, text: render(response) },
        },
      ],
    };
  }
}
export class WebCommandTransport {
  constructor(
    private plane: Pick<
      OrganizationalCommandPlane,
      "submit" | "recordTransportRejection"
    >,
  ) {}
  post(body: unknown) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      this.plane.recordTransportRejection({
        id: "web-invalid",
        channel: "web",
        detail: "web command JSON invalid",
      });
      throw new Error("web command JSON invalid");
    }
    return {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-content-type-options": "nosniff",
      },
      body: this.plane.submit(body as CommandEnvelope),
    };
  }
}
export class CliCommandTransport {
  constructor(
    private plane: Pick<
      OrganizationalCommandPlane,
      "submit" | "recordTransportRejection"
    >,
    private factory: CommandEnvelopeFactory,
  ) {}
  run(
    argv: string[],
    context: { tenant: string; identity: string; at: string; nonce?: string },
    confirmation?: TypedConfirmation,
  ) {
    if (!kinds.has(argv[0] as CommandKind)) {
      this.plane.recordTransportRejection({
        id: `cli-invalid:${context.nonce ?? "unknown"}`,
        identity: context.identity,
        channel: "cli",
        thread: "stdout",
        detail: "CLI command kind invalid",
      });
      throw new Error("CLI command kind invalid");
    }
    const request = parseTypedTokens(argv);
    const nonce = context.nonce ?? argv.join(":"),
      id = `cli:${context.identity}:${nonce}`;
    return this.plane.submit(
      this.factory.create({
        id,
        tenant: context.tenant,
        identity: context.identity,
        channel: "cli",
        thread: "stdout",
        at: context.at,
        idempotencyKey: id,
        request,
        ...(confirmation ? { confirmation } : {}),
      }),
    );
  }
}

export type Notification = {
  id: string;
  identity: string;
  thread: string;
  kind: CommandKind;
  text: string;
  requestDigest: string;
};
export interface NotificationSink {
  send(notification: Notification): { delivered: boolean; receipt?: string };
}
export interface DeliveryStore {
  load(
    id: string,
  ):
    | { status: "delivered" | "suppressed"; channel: string; attempts: number }
    | undefined;
  save(
    id: string,
    value: {
      status: "delivered" | "suppressed";
      channel: string;
      attempts: number;
    },
  ): void;
}
export class MemoryDeliveryStore implements DeliveryStore {
  private values = new Map<
    string,
    { status: "delivered" | "suppressed"; channel: string; attempts: number }
  >();
  load(id: string) {
    const x = this.values.get(id);
    return x && structuredClone(x);
  }
  save(
    id: string,
    value: {
      status: "delivered" | "suppressed";
      channel: string;
      attempts: number;
    },
  ) {
    this.values.set(id, structuredClone(value));
  }
}
export class FileDeliveryStore implements DeliveryStore {
  constructor(private root: string) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
  }
  load(id: string) {
    try {
      return JSON.parse(readFileSync(this.path(id), "utf8")) as {
        status: "delivered" | "suppressed";
        channel: string;
        attempts: number;
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
  save(
    id: string,
    value: {
      status: "delivered" | "suppressed";
      channel: string;
      attempts: number;
    },
  ) {
    const path = this.path(id),
      temp = `${path}.${process.pid}.${Date.now()}.tmp`,
      fd = openSync(temp, "wx", 0o600);
    try {
      writeFileSync(fd, canonicalSemanticJson(value));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, path);
    const directory = openSync(this.root, "r");
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  }
  private path(id: string) {
    return join(
      this.root,
      `${createHash("sha256").update(id).digest("hex")}.delivery.json`,
    );
  }
}
export class NotificationCoordinator {
  constructor(
    private plane: Pick<
      OrganizationalCommandPlane,
      "preferences" | "recordDelivery"
    >,
    private sinks: Record<string, NotificationSink>,
    private store: DeliveryStore,
    private maxAttempts = 3,
  ) {}
  deliver(notification: Notification) {
    const prior = this.store.load(notification.id);
    if (prior) {
      this.plane.recordDelivery({
        id: `redelivery:${notification.id}`,
        identity: notification.identity,
        channel: prior.channel,
        thread: notification.thread,
        requestDigest: notification.requestDigest,
        status: "refused",
        detail: "duplicate delivery suppressed",
      });
      return prior;
    }
    const prefs = this.plane.preferences(notification.identity);
    if (prefs.suppressedKinds.includes(notification.kind)) {
      const result = {
        status: "suppressed" as const,
        channel: "suppressed",
        attempts: 0,
      };
      this.store.save(notification.id, result);
      this.plane.recordDelivery({
        id: `suppressed:${notification.id}`,
        identity: notification.identity,
        channel: "suppressed",
        thread: notification.thread,
        requestDigest: notification.requestDigest,
        status: "refused",
        detail: "notification preference suppression",
      });
      return result;
    }
    const channels = [
      ...prefs.channels,
      ...(prefs.accessibleFallback === "none" ||
      prefs.channels.includes(prefs.accessibleFallback)
        ? []
        : [prefs.accessibleFallback]),
    ];
    let attempts = 0;
    for (const channel of channels)
      for (let retry = 0; retry < this.maxAttempts; retry++) {
        attempts++;
        const delivered = this.sinks[channel]?.send(notification);
        this.plane.recordDelivery({
          id: `delivery:${notification.id}:${attempts}`,
          identity: notification.identity,
          channel,
          thread: notification.thread,
          requestDigest: notification.requestDigest,
          status: delivered?.delivered ? "executed" : "refused",
          detail: delivered?.delivered
            ? `delivered:${delivered.receipt ?? "unreceipted"}`
            : `delivery attempt ${attempts} failed`,
        });
        if (delivered?.delivered) {
          const result = { status: "delivered" as const, channel, attempts };
          this.store.save(notification.id, result);
          return result;
        }
      }
    throw new Error("notification delivery exhausted");
  }
}

export type UsabilityCorpusCase = {
  id: string;
  transport: "slack" | "web" | "cli";
  steps: number;
  expected: CommandResponse["status"];
  run: () => CommandResponse;
};
export function runCommandUsabilityCorpus(
  cases: UsabilityCorpusCase[],
  thresholds = { completionRate: 0.95, maxMedianSteps: 3 },
) {
  const results = cases.map((c) => {
      try {
        const status = c.run().status;
        return {
          id: c.id,
          steps: c.steps,
          status,
          success: status === c.expected,
        };
      } catch {
        return { id: c.id, steps: c.steps, status: "error", success: false };
      }
    }),
    completionRate = results.filter((r) => r.success).length / results.length,
    steps = results.map((r) => r.steps).sort((a, b) => a - b),
    medianSteps = steps[Math.floor(steps.length / 2)] ?? Infinity;
  return {
    completionRate,
    medianSteps,
    passed:
      completionRate >= thresholds.completionRate &&
      medianSteps <= thresholds.maxMedianSteps,
    results,
  };
}
const kinds = new Set<CommandKind>([
  "status",
  "explain",
  "create-work",
  "question",
  "answer",
  "approve",
  "mutate",
  "pause",
  "resume",
  "repair",
  "rollback",
  "revoke",
]);
function parseTypedText(text: string) {
  return parseTypedTokens(
    text
      .trim()
      .split(/\s+/)
      .filter((x) => !x.startsWith("<@")),
  );
}
function parseTypedTokens(tokens: string[]): CommandRequest {
  const kind = tokens[0] as CommandKind;
  if (!kinds.has(kind))
    return {
      kind: "explain",
      scope: "read",
      payload: {
        unparsed: tokens.join(" "),
        warning: "unrecognized text was not executed",
      },
    };
  const scope = tokens[1] ?? "read",
    value = (i: number) =>
      tokens[i] && tokens[i] !== "-" ? tokens[i] : undefined,
    workId = value(2),
    artifact = value(3);
  if (["status", "explain", "question", "answer"].includes(kind))
    return {
      kind,
      scope,
      ...(workId ? { workId } : {}),
      ...(tokens.length > 3
        ? { payload: { text: tokens.slice(3).join(" ") } }
        : {}),
    };
  if (tokens.slice(1).some((token) => !/^[A-Za-z0-9._:/-]+$/.test(token)))
    return safeUnparsed(tokens);
  if (kind === "approve") {
    const approvalId = value(4),
      role = value(5),
      decision = tokens[6];
    if (
      !approvalId ||
      !role ||
      !["approve", "reject"].includes(decision) ||
      tokens.length !== 7
    )
      return safeUnparsed(tokens);
    return {
      kind,
      scope,
      ...(workId ? { workId } : {}),
      ...(artifact ? { artifact } : {}),
      decision: decision as "approve" | "reject",
      payload: { approvalId, role },
    };
  }
  if (kind === "revoke") {
    const approvalId = value(4);
    if (!approvalId || tokens.length !== 5) return safeUnparsed(tokens);
    return {
      kind,
      scope,
      ...(workId ? { workId } : {}),
      ...(artifact ? { artifact } : {}),
      payload: { approvalId },
    };
  }
  if (tokens.length > 5) return safeUnparsed(tokens);
  const approvalId = value(4);
  return {
    kind,
    scope,
    ...(workId ? { workId } : {}),
    ...(artifact ? { artifact } : {}),
    ...(approvalId ? { payload: { approvalId } } : {}),
  };
}
function safeUnparsed(tokens: string[]): CommandRequest {
  return {
    kind: "explain",
    scope: "read",
    payload: {
      unparsed: tokens.join(" "),
      warning: "privileged command grammar invalid; no mutation executed",
    },
  };
}
function slackTime(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error("Slack timestamp invalid");
  return new Date(n * 1000).toISOString();
}
function render(r: CommandResponse) {
  const evidence = r.result.evidence
      .map((e) => `${e.verified ? "✓" : "?"} ${e.kind}: ${e.uri}`)
      .join("\n"),
    assumptions = r.result.assumptions
      .map((x) => `Assumption: ${x}`)
      .join("\n"),
    conflicts = r.result.conflicts.map((x) => `Conflict: ${x}`).join("\n"),
    unknown = r.result.unknowns.map((x) => `Unknown: ${x}`).join("\n");
  return [
    `*${r.status}* — ${r.result.summary}`,
    evidence,
    assumptions,
    conflicts,
    unknown,
  ]
    .filter(Boolean)
    .join("\n");
}
