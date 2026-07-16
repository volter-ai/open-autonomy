import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const CHECKPOINTS = ["R20", "R21", "R22", "R23", "R24", "R25", "R26", "R27", "R28"] as const;
export type ExternalCheckpoint = typeof CHECKPOINTS[number];

type Requirement =
  | { kind: "environment"; name: string }
  | { kind: "file"; path: string }
  | { kind: "attestation"; path: string; subject: string };

export type ExternalProgram = {
  schema: "open-autonomy.external-validation-program.v1";
  programId: string;
  campaigns: Partial<Record<ExternalCheckpoint, {
    registry: string;
    state: string;
    dependencies: { checkpoint: ExternalCheckpoint; receipt: string }[];
    requirements: Requirement[];
  }>>;
};

export type CampaignStatus = {
  checkpoint: ExternalCheckpoint;
  phase: "not-configured" | "blocked" | "ready" | "collecting" | "assembled";
  blockers: string[];
  state: string | null;
};

type Deps = {
  env: Record<string, string | undefined>;
  exists: (path: string) => boolean;
  read: (path: string) => string;
  init: (checkpoint: ExternalCheckpoint, state: string, registry: string) => void;
};

const defaultDeps: Deps = {
  env: process.env,
  exists: existsSync,
  read: (path) => readFileSync(path, "utf8"),
  init: (checkpoint, state, registry) => {
    const result = spawnSync("bun", ["run", `acquire:${checkpoint.toLowerCase()}`, "--", "init", "--state", state, "--registry", registry],
      { cwd: resolve(import.meta.dir, "../../.."), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (result.status !== 0) throw Error(`external ${checkpoint} initialization failed: ${(result.stderr || result.stdout).trim()}`);
  },
};

function exact(value: object, keys: string[], name: string) {
  if (Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")) throw Error(`external program ${name} schema invalid`);
}

function absolute(base: string, path: string) { return isAbsolute(path) ? path : resolve(base, path); }

export function loadExternalProgram(path: string): ExternalProgram {
  const value = JSON.parse(readFileSync(path, "utf8")) as ExternalProgram;
  exact(value, ["schema", "programId", "campaigns"], "root");
  if (value.schema !== "open-autonomy.external-validation-program.v1" || !value.programId || !value.campaigns || typeof value.campaigns !== "object")
    throw Error("external program identity invalid");
  for (const [checkpoint, campaign] of Object.entries(value.campaigns)) {
    if (!CHECKPOINTS.includes(checkpoint as ExternalCheckpoint) || !campaign) throw Error("external program checkpoint invalid");
    exact(campaign, ["registry", "state", "dependencies", "requirements"], `${checkpoint} campaign`);
    if (!campaign.registry || !campaign.state || !Array.isArray(campaign.dependencies) || !Array.isArray(campaign.requirements))
      throw Error(`external program ${checkpoint} campaign invalid`);
  }
  return value;
}

function validAttestation(text: string, subject: string) {
  try {
    const value = JSON.parse(text);
    exact(value, ["schema", "subject", "authorityId", "publicKeyId", "consent", "independent", "signedAt", "signature"], "attestation");
    return value.schema === "open-autonomy.external-authority-attestation.v1" && value.subject === subject &&
      typeof value.authorityId === "string" && !!value.authorityId && typeof value.publicKeyId === "string" && !!value.publicKeyId &&
      value.consent === true && value.independent === true && Number.isFinite(Date.parse(value.signedAt)) &&
      typeof value.signature === "string" && value.signature.length > 0;
  } catch { return false; }
}

function statePhase(text: string): "collecting" | "assembled" {
  try { return JSON.parse(text).assembledBundleDigest ? "assembled" : "collecting"; }
  catch { throw Error("external campaign state is malformed"); }
}

export function externalProgramStatus(programPath: string, program: ExternalProgram, deps: Deps = defaultDeps): CampaignStatus[] {
  const base = dirname(resolve(programPath));
  return CHECKPOINTS.map((checkpoint) => {
    const campaign = program.campaigns[checkpoint];
    if (!campaign) return { checkpoint, phase: "not-configured", blockers: ["campaign not configured"], state: null };
    const state = absolute(base, campaign.state), registry = absolute(base, campaign.registry);
    if (deps.exists(state)) return { checkpoint, phase: statePhase(deps.read(state)), blockers: [], state };
    const blockers: string[] = [];
    if (!deps.exists(registry)) blockers.push(`registry missing: ${campaign.registry}`);
    for (const dependency of campaign.dependencies) {
      const receipt = absolute(base, dependency.receipt);
      if (!deps.exists(receipt)) blockers.push(`${dependency.checkpoint} external receipt missing: ${dependency.receipt}`);
    }
    for (const requirement of campaign.requirements) {
      if (requirement.kind === "environment" && !deps.env[requirement.name]) blockers.push(`environment unset: ${requirement.name}`);
      else if (requirement.kind === "file" && !deps.exists(absolute(base, requirement.path))) blockers.push(`file missing: ${requirement.path}`);
      else if (requirement.kind === "attestation") {
        const path = absolute(base, requirement.path);
        if (!deps.exists(path)) blockers.push(`attestation missing: ${requirement.path}`);
        else if (!validAttestation(deps.read(path), requirement.subject)) blockers.push(`attestation invalid: ${requirement.path}`);
      }
    }
    return { checkpoint, phase: blockers.length ? "blocked" : "ready", blockers, state };
  });
}

export function initializeReadyCampaigns(programPath: string, program: ExternalProgram, deps: Deps = defaultDeps) {
  const base = dirname(resolve(programPath)), statuses = externalProgramStatus(programPath, program, deps), initialized: ExternalCheckpoint[] = [];
  for (const status of statuses) {
    if (status.phase !== "ready") continue;
    const campaign = program.campaigns[status.checkpoint]!;
    deps.init(status.checkpoint, absolute(base, campaign.state), absolute(base, campaign.registry));
    initialized.push(status.checkpoint);
  }
  return initialized;
}

function parse(argv: string[]) {
  const command = argv.shift(), flag = argv.shift(), path = argv.shift();
  if (!(["status", "init-ready"].includes(command ?? "")) || flag !== "--program" || !path || argv.length)
    throw Error("usage: external-validation-program <status|init-ready> --program <program.json>");
  return { command: command as "status" | "init-ready", path };
}

export function runExternalProgramCli(argv: string[]) {
  const { command, path } = parse([...argv]), program = loadExternalProgram(path);
  return command === "status" ? externalProgramStatus(path, program) : { initialized: initializeReadyCampaigns(path, program) };
}

if (import.meta.main) {
  try { console.log(JSON.stringify(runExternalProgramCli(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
