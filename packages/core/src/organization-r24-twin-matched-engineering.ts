import { createHash } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
export type R24EngineeringBinding = {
  schema: "autonomy.r24-engineering-binding.v1";
  campaignId: string;
  organizationDigest: `sha256:${string}`;
  workloadDigest: `sha256:${string}`;
  assignmentDigest: `sha256:${string}`;
  repositoryDigest: `sha256:${string}`;
  harnessDigest: `sha256:${string}`;
  modelDigest: `sha256:${string}`;
  promptDigest: `sha256:${string}`;
  contextDigest: `sha256:${string}`;
  sessionPolicyDigest: `sha256:${string}`;
  credentialScopeDigest: `sha256:${string}`;
  serviceTwin: {
    implementationDigest: `sha256:${string}`;
    scenarioDigest: `sha256:${string}`;
  };
};
export type R24NativeRequest = {
  binding: R24EngineeringBinding;
  substrate: "hermes" | "paperclip";
  trialId: string;
  order: number;
  nonce: string;
};
export type R24NativeReceipt = {
  schema: "autonomy.r24-native-engineering-receipt.v1";
  substrate: "hermes" | "paperclip";
  nativePath: "hermes-kanban-worker" | "paperclip-issue-process-adapter";
  providerVersion: string;
  providerRevision: string;
  trialId: string;
  order: number;
  bindingDigest: `sha256:${string}`;
  organizationDigest: `sha256:${string}`;
  workloadDigest: `sha256:${string}`;
  serviceTwinImplementationDigest: `sha256:${string}`;
  serviceTwinScenarioDigest: `sha256:${string}`;
  nativeRunId: string;
  processId: number;
  startedAt: string;
  completedAt: string;
  terminal: "success" | "failure" | "timeout";
  portableOutcomeDigest: `sha256:${string}`;
  rawTraceDigest: `sha256:${string}`;
  cleanupDigest: `sha256:${string}`;
  humanAssistanceMinutes: 0;
  liveProviderClaim: false;
};
export interface R24NativeEngineeringPath {
  readonly substrate: "hermes" | "paperclip";
  readonly nativePath: R24NativeReceipt["nativePath"];
  readonly pin: { version: string; revision: string };
  run(request: R24NativeRequest): Promise<R24NativeReceipt>;
}
export type R24TwinMatchedArtifact = {
  schema: "autonomy.r24-twin-matched-engineering.v1";
  closureClaim: false;
  profile: "twin-conformant-engineering";
  binding: R24EngineeringBinding;
  bindingDigest: `sha256:${string}`;
  order: ["hermes" | "paperclip", "hermes" | "paperclip"];
  cells: R24NativeReceipt[];
  sharedServiceTwin: true;
  claims: {
    actualNativeSubstrateProcesses: true;
    liveRemoteProvider: false;
    humanParticipants: false;
    humanAssistance: false;
  };
  replay: {
    binding: R24EngineeringBinding;
    requests: R24NativeRequest[];
    pins: {
      hermes: { version: string; revision: string };
      paperclip: { version: string; revision: string };
    };
  };
  differences: Array<{
    kind: "terminal" | "portable-outcome" | "operational";
    hermes: string;
    paperclip: string;
    classified: true;
  }>;
  digest: `sha256:${string}`;
};
const digest = (x: unknown) =>
    `sha256:${createHash("sha256").update(canonicalSemanticJson(x)).digest("hex")}` as const,
  sha = (x: string) => /^sha256:[a-f0-9]{64}$/.test(x),
  iso = (x: string) => Number.isFinite(Date.parse(x));
export async function runR24TwinMatchedEngineering(
  binding: R24EngineeringBinding,
  paths: {
    hermes: R24NativeEngineeringPath;
    paperclip: R24NativeEngineeringPath;
  },
  seed: number,
): Promise<R24TwinMatchedArtifact> {
  if (
    binding.schema !== "autonomy.r24-engineering-binding.v1" ||
    !Number.isSafeInteger(seed) ||
    Object.entries(binding)
      .filter(([k]) => k.endsWith("Digest"))
      .some(([, v]) => typeof v !== "string" || !sha(v)) ||
    Object.values(binding.serviceTwin).some((v) => !sha(v))
  )
    throw Error("R24 engineering binding invalid");
  if (
    paths.hermes.substrate !== "hermes" ||
    paths.hermes.nativePath !== "hermes-kanban-worker" ||
    paths.paperclip.substrate !== "paperclip" ||
    paths.paperclip.nativePath !== "paperclip-issue-process-adapter" ||
    paths.hermes.pin.version !== "0.18.2" ||
    paths.hermes.pin.revision !== "0c1adb48" ||
    paths.paperclip.pin.version !== "0.3.1" ||
    paths.paperclip.pin.revision !== "90f85a7d11c517b1d09db90dbec97f4de7d96b83"
  )
    throw Error("native substrate pin mismatch");
  const order = (
      seed & 1 ? ["paperclip", "hermes"] : ["hermes", "paperclip"]
    ) as R24TwinMatchedArtifact["order"],
    bindingDigest = digest(binding),
    requests = order.map((substrate, i) => ({
      binding: structuredClone(binding),
      substrate,
      trialId: `${binding.campaignId}:${substrate}`,
      order: i,
      nonce: digest({ seed, substrate, bindingDigest }),
    })),
    cells = [] as R24NativeReceipt[];
  for (const request of requests) {
    const path = paths[request.substrate],
      r = await path.run(structuredClone(request));
    if (
      r.schema !== "autonomy.r24-native-engineering-receipt.v1" ||
      r.substrate !== request.substrate ||
      r.nativePath !== path.nativePath ||
      r.providerVersion !== path.pin.version ||
      r.providerRevision !== path.pin.revision ||
      r.trialId !== request.trialId ||
      r.order !== request.order ||
      r.bindingDigest !== bindingDigest ||
      r.organizationDigest !== binding.organizationDigest ||
      r.workloadDigest !== binding.workloadDigest ||
      r.serviceTwinImplementationDigest !==
        binding.serviceTwin.implementationDigest ||
      r.serviceTwinScenarioDigest !== binding.serviceTwin.scenarioDigest ||
      !r.nativeRunId ||
      !Number.isSafeInteger(r.processId) ||
      r.processId < 1 ||
      !iso(r.startedAt) ||
      !iso(r.completedAt) ||
      Date.parse(r.completedAt) < Date.parse(r.startedAt) ||
      !["success", "failure", "timeout"].includes(r.terminal) ||
      ![r.portableOutcomeDigest, r.rawTraceDigest, r.cleanupDigest].every(
        sha,
      ) ||
      r.humanAssistanceMinutes !== 0 ||
      r.liveProviderClaim !== false
    )
      throw Error(`${request.substrate} native receipt invalid`);
    cells.push(structuredClone(r));
  }
  const h = cells.find((x) => x.substrate === "hermes")!,
    p = cells.find((x) => x.substrate === "paperclip")!,
    differences: R24TwinMatchedArtifact["differences"] = [];
  if (h.terminal !== p.terminal)
    differences.push({
      kind: "terminal",
      hermes: h.terminal,
      paperclip: p.terminal,
      classified: true,
    });
  if (h.portableOutcomeDigest !== p.portableOutcomeDigest)
    differences.push({
      kind: "portable-outcome",
      hermes: h.portableOutcomeDigest,
      paperclip: p.portableOutcomeDigest,
      classified: true,
    });
  const body = {
    schema: "autonomy.r24-twin-matched-engineering.v1" as const,
    closureClaim: false as const,
    profile: "twin-conformant-engineering" as const,
    binding: structuredClone(binding),
    bindingDigest,
    order,
    cells,
    sharedServiceTwin: true as const,
    claims: {
      actualNativeSubstrateProcesses: true as const,
      liveRemoteProvider: false as const,
      humanParticipants: false as const,
      humanAssistance: false as const,
    },
    replay: {
      binding: structuredClone(binding),
      requests,
      pins: {
        hermes: { ...paths.hermes.pin },
        paperclip: { ...paths.paperclip.pin },
      },
    },
    differences,
  };
  return { ...body, digest: digest(body) };
}
export function verifyR24TwinMatchedEngineering(a: R24TwinMatchedArtifact) {
  const { digest: d, ...body } = a;
  if (
    d !== digest(body) ||
    a.closureClaim !== false ||
    a.profile !== "twin-conformant-engineering" ||
    a.cells.length !== 2 ||
    a.claims.liveRemoteProvider ||
    a.claims.humanParticipants ||
    a.claims.humanAssistance
  )
    return false;
  return a.cells.every(
    (c) =>
      c.bindingDigest === a.bindingDigest &&
      c.organizationDigest === a.binding.organizationDigest &&
      c.workloadDigest === a.binding.workloadDigest &&
      c.serviceTwinImplementationDigest ===
        a.binding.serviceTwin.implementationDigest &&
      c.serviceTwinScenarioDigest === a.binding.serviceTwin.scenarioDigest &&
      c.humanAssistanceMinutes === 0 &&
      c.liveProviderClaim === false,
  );
}
