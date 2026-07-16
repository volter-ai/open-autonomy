import { expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SlackHmacVerifier } from "./organization-command-transports";
import {
  FileSlackIngressStore,
  SlackHttpRuntime,
  type SlackDeliveryReceipt,
} from "./organization-slack-http-runtime";

const timestamp = "1770000000",
  now = Number(timestamp) * 1000,
  auth = (rawBody: string) => ({
    timestamp,
    signature: `v0=${createHmac("sha256", "slack-secret")
      .update(`v0:${timestamp}:${rawBody}`)
      .digest("hex")}`,
  }),
  event = (eventId = "Ev1", text = "status read work-A") =>
    JSON.stringify({
      type: "event_callback",
      event_id: eventId,
      team_id: "T1",
      event: {
        type: "app_mention",
        user: "U1",
        channel: "C1",
        ts: "1770000000.000001",
        text,
      },
    });

test("Slack HTTP runtime acknowledges before processing, survives restart, and deduplicates real retry delivery", () => {
  const root = mkdtempSync(join(tmpdir(), "oa-slack-http-")),
    store = new FileSlackIngressStore(root),
    handled: string[] = [],
    delivered = new Map<string, SlackDeliveryReceipt>(),
    attempts = new Map<string, number>(),
    transport = {
      handleVerified(input: { rawBody: string }) {
        handled.push(input.rawBody);
        return {
          response_type: "ephemeral" as const,
          thread_ts: "1770000000.000001",
          blocks: [
            {
              type: "section" as const,
              text: { type: "mrkdwn" as const, text: "answered" },
            },
          ],
        };
      },
    } as any,
    responsePort = {
      deliver(input: { idempotencyKey: string }) {
        const n = (attempts.get(input.idempotencyKey) ?? 0) + 1;
        attempts.set(input.idempotencyKey, n);
        if (n === 1) throw Error("injected Slack Web API outage");
        const prior = delivered.get(input.idempotencyKey);
        if (prior) return prior;
        const receipt: SlackDeliveryReceipt = {
          schema: "autonomy.slack-http-delivery.v1",
          outboxId: input.idempotencyKey,
          providerMessageDigest: "sha256:" + "a".repeat(64),
          deliveredAt: "2026-02-02T02:40:01.000Z",
          attempt: n,
        };
        delivered.set(input.idempotencyKey, receipt);
        return receipt;
      },
    },
    runtime = new SlackHttpRuntime(
      new SlackHmacVerifier("slack-secret", () => now),
      transport,
      store,
      responsePort,
      () => "2026-02-02T02:40:00.000Z",
      (() => {
        let n = 0n;
        return () => ++n * 1_000_000n;
      })(),
    ),
    raw = event();
  try {
    expect(runtime.receive(auth(raw), raw)).toEqual({ status: 200, body: "" });
    expect(handled).toHaveLength(0);
    expect(store.pendingIngress()).toHaveLength(1);
    expect(runtime.processPending()).toBe(1);
    expect(handled).toHaveLength(1);
    expect(store.pendingOutbox()).toHaveLength(1);
    const outboxId = store.pendingOutbox()[0]!.id;
    expect(() => runtime.deliverPending()).toThrow("injected Slack Web API outage");
    expect(store.deliveryAttempts(outboxId)).toEqual([
      expect.objectContaining({ attempt: 1, outcome: "failed" }),
    ]);

    const restartedStore = new FileSlackIngressStore(root),
      restarted = new SlackHttpRuntime(
        new SlackHmacVerifier("slack-secret", () => now),
        transport,
        restartedStore,
        responsePort,
        () => "2026-02-02T02:40:02.000Z",
      );
    expect(restarted.processPending()).toBe(0);
    expect(restarted.deliverPending()).toBe(1);
    const receipt = restartedStore.delivery(outboxId);
    expect(receipt?.attempt).toBe(2);
    expect(restartedStore.pendingOutbox()).toHaveLength(0);

    expect(
      restarted.receive(
        { ...auth(raw), retryNumber: "1", retryReason: "http_timeout" },
        raw,
      ),
    ).toEqual({ status: 200, body: "" });
    expect(restartedStore.ingressAttempts("event:Ev1")).toHaveLength(2);
    expect(restarted.processPending()).toBe(0);
    expect(handled).toHaveLength(1);
    expect(delivered).toHaveLength(1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slack HTTP runtime rejects forged requests, handles URL verification, and rejects event-id equivocation", () => {
  const root = mkdtempSync(join(tmpdir(), "oa-slack-http-")),
    store = new FileSlackIngressStore(root),
    runtime = new SlackHttpRuntime(
      new SlackHmacVerifier("slack-secret", () => now),
      { handleVerified: () => { throw Error("not reached"); } } as any,
      store,
      { deliver: () => { throw Error("not reached"); } },
    );
  try {
    const raw = event();
    expect(
      runtime.receive({ timestamp, signature: "v0=forged" }, raw),
    ).toEqual({ status: 401, body: "invalid Slack signature" });
    const challenge = JSON.stringify({ type: "url_verification", challenge: "c" });
    expect(runtime.receive(auth(challenge), challenge)).toEqual({
      status: 200,
      body: "c",
    });
    expect(runtime.receive(auth(raw), raw).status).toBe(200);
    const changed = event("Ev1", "pause prod work-A");
    expect(() => runtime.receive(auth(changed), changed)).toThrow(
      "idempotency equivocation",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Slack durable journal rejects corrupted private ingress state", () => {
  const root = mkdtempSync(join(tmpdir(), "oa-slack-http-")),
    store = new FileSlackIngressStore(root),
    runtime = new SlackHttpRuntime(
      new SlackHmacVerifier("slack-secret", () => now),
      { handleVerified: () => { throw Error("not reached"); } } as any,
      store,
      { deliver: () => { throw Error("not reached"); } },
    );
  try {
    const raw = event();
    expect(runtime.receive(auth(raw), raw).status).toBe(200);
    const file = join(root, "ingress", readdirSync(join(root, "ingress"))[0]!);
    writeFileSync(file, '{"value":{},"digest":"sha256:bad"}\n');
    expect(() => new FileSlackIngressStore(root).pendingIngress()).toThrow(
      "durable record digest invalid",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
