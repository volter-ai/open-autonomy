import { expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebClient } from "@slack/web-api";
import { createSlackTwinServer } from "@volter/twin-slack";
import { SlackHmacVerifier } from "./organization-command-transports";
import { FileSlackIngressStore, SlackHttpRuntime } from "./organization-slack-http-runtime";
import { SlackWebApiResponsePort } from "./organization-slack-web-api-port";

test("R20 runs the real Slack SDK through Volter Twin and reconciles an accepted timeout", async () => {
  const root = mkdtempSync(join(tmpdir(), "oa-volter-slack-")), journal = join(root, "journal"),
    twin = createSlackTwinServer({ port: 0, root: join(root, "twin") }),
    client = new WebClient("xoxb-volter-twin", { slackApiUrl: `http://127.0.0.1:${twin.port}/api/` });
  try {
    const parent = await client.chat.postMessage({ channel: "C1", text: "controller task" }),
      thread = String(parent.ts), raw = JSON.stringify({ type: "event_callback", event_id: "Ev-volter-1",
        team_id: "T1", event: { type: "app_mention", user: "U1", channel: "C1", ts: thread,
          thread_ts: thread, text: "status read work-A" } }), timestamp = "1770000000",
      signature = `v0=${createHmac("sha256", "slack-secret").update(`v0:${timestamp}:${raw}`).digest("hex")}`;
    let posts = 0;
    const real = new SlackWebApiResponsePort(client as any, () => "2026-07-16T08:00:00Z"),
      acceptThenTimeout = {
        reconcile: real.reconcile.bind(real),
        async deliver(input: any) { posts++; const receipt = await real.deliver(input);
          if (posts === 1) throw Error("simulated response loss after Volter accepted post"); return receipt; },
      }, transport = { handleVerified: () => ({ response_type: "ephemeral" as const, thread_ts: thread,
        blocks: [{ type: "section" as const, text: { type: "mrkdwn" as const, text: "verified status" } }] }) } as any,
      runtime = new SlackHttpRuntime(new SlackHmacVerifier("slack-secret", () => Number(timestamp) * 1000),
        transport, new FileSlackIngressStore(journal), acceptThenTimeout);
    expect(runtime.receive({ timestamp, signature }, raw).status).toBe(200);
    expect(runtime.processPending()).toBe(1);
    expect(await runtime.deliverPending()).toBe(1);
    expect(posts).toBe(1);
    const replies = await client.conversations.replies({ channel: "C1", ts: thread });
    expect(replies.messages?.filter((m: any) => m.metadata?.event_type === "open_autonomy_delivery")).toHaveLength(1);
    const restarted = new SlackHttpRuntime(new SlackHmacVerifier("slack-secret", () => Number(timestamp) * 1000),
      transport, new FileSlackIngressStore(journal), real);
    expect(await restarted.deliverPending()).toBe(0);
  } finally { twin.stop(); rmSync(root, { recursive: true, force: true }); }
});
