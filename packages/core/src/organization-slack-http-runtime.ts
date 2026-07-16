import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  type SlackRequestAuthentication,
  type SlackRequestVerifier,
  SlackCommandTransport,
} from "./organization-command-transports";

const digest = (value: unknown) =>
  `sha256:${createHash("sha256").update(canonicalSemanticJson(value)).digest("hex")}`;
const fileKey = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export type SlackHttpHeaders = {
  timestamp: string;
  signature: string;
  retryNumber?: string;
  retryReason?: string;
};
export type SlackIngressRecord = {
  schema: "autonomy.slack-http-ingress.v1";
  key: string;
  requestDigest: string;
  kind: "event-callback" | "block-action";
  authentication: SlackRequestAuthentication;
  retryNumber: number | null;
  retryReason: string | null;
  receivedAt: string;
};
export type SlackAcknowledgmentRecord = {
  schema: "autonomy.slack-http-acknowledgment.v1";
  ingressKey: string;
  requestDigest: string;
  ingressAttemptDigest: string;
  acknowledgedAt: string;
  elapsedMs: number;
};
export type SlackOutboxRecord = {
  schema: "autonomy.slack-http-outbox.v1";
  id: string;
  ingressKey: string;
  thread: string;
  response: ReturnType<SlackCommandTransport["handle"]>;
  preparedAt: string;
};
export type SlackDeliveryReceipt = {
  schema: "autonomy.slack-http-delivery.v1";
  outboxId: string;
  providerMessageDigest: string;
  deliveredAt: string;
  attempt: number;
};
export type SlackDeliveryAttempt = {
  schema: "autonomy.slack-http-delivery-attempt.v1";
  outboxId: string;
  attempt: number;
  attemptedAt: string;
  outcome: "delivered" | "failed";
  errorDigest?: string;
};

export interface SlackIngressStore {
  ingest(record: SlackIngressRecord): "created" | "duplicate";
  acknowledge(record: SlackAcknowledgmentRecord): void;
  ingressAttempts(key: string): SlackIngressRecord[];
  pendingIngress(): SlackIngressRecord[];
  claimIngress(key: string): string | undefined;
  releaseIngress(key: string, claim: string): void;
  prepareOutbox(record: SlackOutboxRecord): void;
  pendingOutbox(): SlackOutboxRecord[];
  recordDeliveryAttempt(attempt: SlackDeliveryAttempt): void;
  deliveryAttempts(outboxId: string): SlackDeliveryAttempt[];
  recordDelivery(receipt: SlackDeliveryReceipt): void;
  delivery(outboxId: string): SlackDeliveryReceipt | undefined;
}
export interface SlackResponsePort {
  reconcile(idempotencyKey: string): SlackDeliveryReceipt | undefined;
  deliver(input: {
    idempotencyKey: string;
    thread: string;
    response: SlackOutboxRecord["response"];
    priorAttempts: number;
  }): SlackDeliveryReceipt;
}

function parsePayload(rawBody: string) {
  if (rawBody.trimStart().startsWith("{")) return JSON.parse(rawBody);
  const encoded = new URLSearchParams(rawBody).get("payload");
  if (!encoded) throw Error("Slack form payload absent");
  return JSON.parse(encoded);
}
function requestIdentity(payload: any) {
  if (payload?.type === "event_callback" && payload.event_id)
    return { kind: "event-callback" as const, key: `event:${payload.event_id}` };
  if (payload?.type === "block_actions") {
    const action = payload.actions?.[0];
    if (!payload.trigger_id || !payload.action_ts || !action?.action_id)
      throw Error("Slack block action identity invalid");
    return {
      kind: "block-action" as const,
      key: `action:${payload.trigger_id}:${payload.action_ts}:${action.action_id}`,
    };
  }
  throw Error("Slack HTTP payload type unsupported");
}

export class SlackHttpRuntime {
  constructor(
    private verifier: SlackRequestVerifier,
    private transport: SlackCommandTransport,
    private store: SlackIngressStore,
    private responsePort: SlackResponsePort,
    private clock: () => string = () => new Date().toISOString(),
    private monotonic: () => bigint = () => process.hrtime.bigint(),
  ) {}

  receive(headers: SlackHttpHeaders, rawBody: string) {
    const started = this.monotonic(),
      authentication = {
        rawBody,
        timestamp: headers.timestamp,
        signature: headers.signature,
      };
    if (!this.verifier.verify(authentication))
      return { status: 401 as const, body: "invalid Slack signature" };
    let payload: any;
    try {
      payload = parsePayload(rawBody);
    } catch {
      return { status: 400 as const, body: "invalid Slack payload" };
    }
    if (payload?.type === "url_verification" && typeof payload.challenge === "string")
      return { status: 200 as const, body: payload.challenge };
    let identity: ReturnType<typeof requestIdentity>;
    try {
      identity = requestIdentity(payload);
    } catch {
      return { status: 400 as const, body: "unsupported Slack payload" };
    }
    const record: SlackIngressRecord = {
        schema: "autonomy.slack-http-ingress.v1",
        key: identity.key,
        requestDigest: digest(authentication),
        kind: identity.kind,
        authentication,
        retryNumber:
          headers.retryNumber === undefined ? null : Number(headers.retryNumber),
        retryReason: headers.retryReason ?? null,
        receivedAt: this.clock(),
      };
    if (
      record.retryNumber !== null &&
      (!Number.isSafeInteger(record.retryNumber) || record.retryNumber < 0)
    )
      return { status: 400 as const, body: "invalid Slack retry metadata" };
    this.store.ingest(record);
    const acknowledgment: SlackAcknowledgmentRecord = {
      schema: "autonomy.slack-http-acknowledgment.v1",
      ingressKey: record.key,
      requestDigest: record.requestDigest,
      ingressAttemptDigest: digest(record),
      acknowledgedAt: this.clock(),
      elapsedMs: Number(this.monotonic() - started) / 1_000_000,
    };
    if (acknowledgment.elapsedMs < 0) throw Error("monotonic clock regressed");
    this.store.acknowledge(acknowledgment);
    return { status: 200 as const, body: "" };
  }

  processPending(limit = 100) {
    let processed = 0;
    for (const ingress of this.store.pendingIngress().slice(0, limit)) {
      const claim = this.store.claimIngress(ingress.key);
      if (!claim) continue;
      try {
        const response = this.transport.handleVerified(ingress.authentication),
          outbox: SlackOutboxRecord = {
          schema: "autonomy.slack-http-outbox.v1",
          id: digest({ ingressKey: ingress.key, response }),
          ingressKey: ingress.key,
          thread: response.thread_ts,
          response,
            // Stable across crash/replay; wall-clock retry time is not semantic output.
            preparedAt: ingress.receivedAt,
          };
        this.store.prepareOutbox(outbox);
        processed++;
      } finally {
        this.store.releaseIngress(ingress.key, claim);
      }
    }
    return processed;
  }

  deliverPending(limit = 100) {
    let delivered = 0;
    for (const outbox of this.store.pendingOutbox().slice(0, limit)) {
      const priorAttempts = this.store.deliveryAttempts(outbox.id).length,
        attempt = priorAttempts + 1;
      const reconciled = this.responsePort.reconcile(outbox.id);
      if (reconciled) {
        if (reconciled.outboxId !== outbox.id)
          throw Error("Slack reconciled receipt is not bound to outbox");
        this.store.recordDelivery(reconciled);
        delivered++;
        continue;
      }
      let receipt: SlackDeliveryReceipt;
      try {
        receipt = this.responsePort.deliver({
          idempotencyKey: outbox.id,
          thread: outbox.thread,
          response: outbox.response,
          priorAttempts,
        });
      } catch (error) {
        const accepted = this.responsePort.reconcile(outbox.id);
        if (accepted) {
          if (accepted.outboxId !== outbox.id)
            throw Error("Slack reconciled receipt is not bound to outbox");
          this.store.recordDeliveryAttempt({
            schema: "autonomy.slack-http-delivery-attempt.v1", outboxId: outbox.id,
            attempt, attemptedAt: this.clock(), outcome: "delivered",
          });
          this.store.recordDelivery(accepted);
          delivered++;
          continue;
        }
        this.store.recordDeliveryAttempt({
          schema: "autonomy.slack-http-delivery-attempt.v1",
          outboxId: outbox.id,
          attempt,
          attemptedAt: this.clock(),
          outcome: "failed",
          errorDigest: digest({ message: String((error as Error).message) }),
        });
        throw error;
      }
      if (receipt.outboxId !== outbox.id)
        throw Error("Slack delivery receipt is not bound to outbox");
      if (receipt.attempt !== attempt)
        throw Error("Slack delivery receipt attempt is invalid");
      this.store.recordDeliveryAttempt({
        schema: "autonomy.slack-http-delivery-attempt.v1",
        outboxId: outbox.id,
        attempt,
        attemptedAt: this.clock(),
        outcome: "delivered",
      });
      this.store.recordDelivery(receipt);
      delivered++;
    }
    return delivered;
  }
}

export class FileSlackIngressStore implements SlackIngressStore {
  private directories: Record<
    "ingress" | "attempt" | "ack" | "claim" | "outbox" | "processed" | "deliveryAttempt" | "delivery",
    string
  >;
  constructor(private root: string) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    this.directories = Object.fromEntries(
      (["ingress", "attempt", "ack", "claim", "outbox", "processed", "deliveryAttempt", "delivery"] as const).map((name) => {
        const path = join(root, name);
        mkdirSync(path, { recursive: true, mode: 0o700 });
        return [name, path];
      }),
    ) as typeof this.directories;
  }
  private path(kind: keyof FileSlackIngressStore["directories"], id: string) {
    return join(this.directories[kind], `${fileKey(id)}.json`);
  }
  private put(path: string, value: unknown) {
    const envelope = { value, digest: digest(value) },
      bytes = `${canonicalSemanticJson(envelope)}\n`,
      temporary = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
      fd = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(fd, bytes);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    try {
      linkSync(temporary, path);
      const directory = openSync(dirname(path), "r");
      try {
        fsyncSync(directory);
      } finally {
        closeSync(directory);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (readFileSync(path, "utf8") !== bytes)
        throw Error("Slack durable record equivocation");
    } finally {
      rmSync(temporary, { force: true });
    }
  }
  private read<T>(path: string): T | undefined {
    try {
      const envelope = JSON.parse(readFileSync(path, "utf8"));
      if (
        !envelope ||
        Object.keys(envelope).sort().join("\0") !== "digest\0value" ||
        envelope.digest !== digest(envelope.value)
      )
        throw Error("Slack durable record digest invalid");
      return envelope.value as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
  private all<T>(kind: keyof FileSlackIngressStore["directories"]) {
    return readdirSync(this.directories[kind])
      .filter((name) => name.endsWith(".json"))
      .map((name) => this.read<T>(join(this.directories[kind], name))!);
  }
  ingest(record: SlackIngressRecord) {
    const path = this.path("ingress", record.key),
      prior = this.read<SlackIngressRecord>(path);
    this.put(this.path("attempt", `${record.key}:${digest(record)}`), record);
    if (prior) {
      if (
        prior.requestDigest !== record.requestDigest ||
        prior.kind !== record.kind
      )
        throw Error("Slack ingress idempotency equivocation");
      return "duplicate";
    }
    this.put(path, record);
    return "created";
  }
  acknowledge(record: SlackAcknowledgmentRecord) {
    this.put(
      this.path("ack", `${record.ingressKey}:${record.ingressAttemptDigest}`),
      record,
    );
  }
  ingressAttempts(key: string) {
    return this.all<SlackIngressRecord>("attempt").filter(
      (record) => record.key === key,
    );
  }
  pendingIngress() {
    return this.all<SlackIngressRecord>("ingress").filter(
      (record) => !existsSync(this.path("processed", record.key)),
    );
  }
  claimIngress(key: string): string | undefined {
    const path = this.path("claim", key), claim = randomBytes(16).toString("hex"),
      record = { key, claim, pid: process.pid };
    try {
      this.put(path, record);
      return claim;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("equivocation")) throw error;
      const prior = this.read<typeof record>(path);
      if (!prior || prior.key !== key || !Number.isSafeInteger(prior.pid))
        throw Error("Slack ingress claim invalid");
      try { process.kill(prior.pid, 0); return undefined; }
      catch { rmSync(path); return this.claimIngress(key); }
    }
  }
  releaseIngress(key: string, claim: string) {
    const path = this.path("claim", key), prior = this.read<{ claim: string }>(path);
    if (!prior || prior.claim !== claim) throw Error("Slack ingress claim fencing failed");
    rmSync(path);
  }
  prepareOutbox(record: SlackOutboxRecord) {
    this.put(this.path("outbox", record.id), record);
    this.put(this.path("processed", record.ingressKey), {
      ingressKey: record.ingressKey,
      outboxId: record.id,
    });
  }
  pendingOutbox() {
    return this.all<SlackOutboxRecord>("outbox").filter(
      (record) => !existsSync(this.path("delivery", record.id)),
    );
  }
  recordDeliveryAttempt(attempt: SlackDeliveryAttempt) {
    this.put(
      this.path("deliveryAttempt", `${attempt.outboxId}:${attempt.attempt}`),
      attempt,
    );
  }
  deliveryAttempts(outboxId: string) {
    return this.all<SlackDeliveryAttempt>("deliveryAttempt")
      .filter((attempt) => attempt.outboxId === outboxId)
      .sort((a, b) => a.attempt - b.attempt);
  }
  recordDelivery(receipt: SlackDeliveryReceipt) {
    this.put(this.path("delivery", receipt.outboxId), receipt);
  }
  delivery(outboxId: string) {
    return this.read<SlackDeliveryReceipt>(this.path("delivery", outboxId));
  }
}
