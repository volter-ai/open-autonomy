import { expect, test } from "bun:test";
import {
  deriveV5ProviderFromRecord,
  validateV5Cell,
  V5ProcessTreeMeter,
} from "../organization-r24-v5-live-runner";
import {
  sealProviderTranscript,
  transcriptRaw,
} from "../organization-r24-provider-transcripts";
import { v5ProtocolDigest } from "../organization-r24-v5-protocol";
import {
  createPaperclipV5CellFixture,
  createV5CellFixture,
  V5_FIXTURE_RECEIPT_KEY,
} from "./organization-r24-v5-fixture";

test("constructs a valid launched Paperclip V5 cell", () => {
  expect(
    validateV5Cell(createPaperclipV5CellFixture(), V5_FIXTURE_RECEIPT_KEY),
  ).toMatchObject({ status: "success", authenticated: true, causal: true });
});

test("constructs a valid launched Hermes V5 cell", () => {
  expect(
    validateV5Cell(
      createV5CellFixture({ substrate: "hermes" }),
      V5_FIXTURE_RECEIPT_KEY,
    ),
  ).toMatchObject({ status: "success", authenticated: true, causal: true });
});

test("fixture validation rejects provider transcript byte tampering", () => {
  const cell = createPaperclipV5CellFixture(),
    launched = cell.attempts.find((attempt) => attempt.kind === "launched")!;
  launched.providerTranscript.records[0]!.response.body!.bytesBase64 =
    Buffer.from("tampered").toString("base64");
  expect(() => validateV5Cell(cell, V5_FIXTURE_RECEIPT_KEY)).toThrow();
});

test("rejects provider terminal disagreement with authenticated launcher receipts", () => {
  const cell = createPaperclipV5CellFixture(),
    launched = cell.attempts.find((attempt) => attempt.kind === "launched")!,
    transcript = launched.providerTranscript,
    runs = transcript.records.find(
      (record) => record.label === "runs-readback",
    )!;
  runs.response.body = transcriptRaw(
    JSON.stringify({
      runs: [
        {
          id: "run-1",
          agentId: "agent-1",
          contextSnapshot: { issueId: "trial-1" },
          processPid: 12,
          status: "failed",
        },
      ],
    }),
  );
  launched.providerTranscript = sealProviderTranscript(
    "paperclip",
    transcript.records,
    {
      wallAt: transcript.collector.startedWallAt,
      monotonicNs: transcript.collector.startedMonotonicNs,
    },
    {
      wallAt: transcript.collector.finishedWallAt,
      monotonicNs: transcript.collector.finishedMonotonicNs,
    },
  );
  expect(() =>
    deriveV5ProviderFromRecord(cell, V5_FIXTURE_RECEIPT_KEY),
  ).toThrow("terminal disagrees");
});

test("rejects a correctly hashed fault observation made after terminal", () => {
  const cell = createPaperclipV5CellFixture();
  cell.fault.raw.observedScope.appliedAt = "2026-07-15T00:00:10Z";
  cell.fault.observedScopeDigest = v5ProtocolDigest(
    cell.fault.raw.observedScope,
  );
  expect(() => validateV5Cell(cell, V5_FIXTURE_RECEIPT_KEY)).toThrow();
});

test("accepts the production procfs meter schema and rejects raw sample drift", async () => {
  const child = Bun.spawn(
      [process.execPath, "-e", "let x=0;for(let i=0;i<1e7;i++)x+=i"],
      { stdout: "ignore", stderr: "ignore" },
    ),
    meter = new V5ProcessTreeMeter(child.pid);
  await new Promise((resolve) => setTimeout(resolve, 20));
  meter.sample();
  await child.exited;
  meter.sample();
  const cell = createV5CellFixture({
    pid: child.pid,
    externalMeter: meter.result(),
  });
  expect(() => validateV5Cell(cell, V5_FIXTURE_RECEIPT_KEY)).not.toThrow();
  for (const mutate of [
    (x: typeof cell) => {
      const launched = x.attempts.find((a) => a.kind === "launched")!;
      launched.trace.externalMeter.raw.rootPid++;
    },
    (x: typeof cell) => {
      const launched = x.attempts.find((a) => a.kind === "launched")!;
      launched.trace.externalMeter.raw.samples[0]!.monotonicNs = "999999999999";
    },
    (x: typeof cell) => {
      const launched = x.attempts.find((a) => a.kind === "launched")!;
      launched.trace.externalMeter.raw.samples[0]!.processes[0]!.cpuTicks++;
    },
  ]) {
    const altered = structuredClone(cell);
    mutate(altered);
    expect(() => validateV5Cell(altered, V5_FIXTURE_RECEIPT_KEY)).toThrow();
  }
});
