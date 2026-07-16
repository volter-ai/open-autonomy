import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import type { SlackDeliveryReceipt, SlackResponsePort } from "./organization-slack-http-runtime";

type SlackMessage = { ts?: string; metadata?: { event_type?: string; event_payload?: Record<string, unknown> } };
export interface SlackWebApiLike {
  chat: { postMessage(input: Record<string, unknown>): Promise<{ ok?: boolean; ts?: string; error?: string }> };
  conversations: { replies(input: { channel: string; ts: string; limit?: number }): Promise<{ ok?: boolean; messages?: SlackMessage[] }> };
}
const sha = (value: unknown) => `sha256:${createHash("sha256").update(canonicalSemanticJson(value)).digest("hex")}`;

/** Slack Web API delivery with provider-state reconciliation via message metadata. */
export class SlackWebApiResponsePort implements SlackResponsePort {
  constructor(private client: SlackWebApiLike, private clock: () => string = () => new Date().toISOString()) {}
  async reconcile(input: { idempotencyKey: string; channel: string; thread: string }) {
    const result = await this.client.conversations.replies({ channel: input.channel, ts: input.thread, limit: 100 });
    const message = result.messages?.find(x =>
      x.metadata?.event_type === "open_autonomy_delivery" &&
      x.metadata.event_payload?.idempotency_key === input.idempotencyKey);
    if (!message?.ts) return undefined;
    return this.receipt(input.idempotencyKey, message.ts,
      Number(message.metadata?.event_payload?.attempt ?? 1));
  }
  async deliver(input: Parameters<SlackResponsePort["deliver"]>[0]) {
    const attempt = input.priorAttempts + 1,
      result = await this.client.chat.postMessage({
        channel: input.channel, thread_ts: input.thread,
        text: "Open Autonomy response",
        blocks: input.response.blocks,
        metadata: { event_type: "open_autonomy_delivery",
          event_payload: { idempotency_key: input.idempotencyKey, attempt } },
      });
    if (!result.ok || !result.ts) throw Error(`Slack Web API delivery failed: ${result.error ?? "missing receipt"}`);
    return this.receipt(input.idempotencyKey, result.ts, attempt);
  }
  private receipt(outboxId: string, providerMessageId: string, attempt: number): SlackDeliveryReceipt {
    return { schema: "autonomy.slack-http-delivery.v1", outboxId,
      providerMessageDigest: sha({ provider: "slack", providerMessageId }),
      deliveredAt: this.clock(), attempt };
  }
}
