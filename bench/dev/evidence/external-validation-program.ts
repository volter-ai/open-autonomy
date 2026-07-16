import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
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

export type AuthorityInvitation = {
  checkpoint: ExternalCheckpoint;
  subject: string;
  destination: string;
  requiredSchema: "open-autonomy.external-authority-attestation.v1";
  warning: "private key material and participant-private data must never be returned";
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

export function authorityInvitations(program: ExternalProgram): AuthorityInvitation[] {
  return CHECKPOINTS.flatMap((checkpoint) => (program.campaigns[checkpoint]?.requirements ?? [])
    .filter((requirement): requirement is Extract<Requirement, { kind: "attestation" }> => requirement.kind === "attestation")
    .map((requirement) => ({ checkpoint, subject: requirement.subject, destination: requirement.path,
      requiredSchema: "open-autonomy.external-authority-attestation.v1" as const,
      warning: "private key material and participant-private data must never be returned" as const })));
}

export function bootstrapExternalProgram(outDir: string) {
  const root = resolve(import.meta.dir, "../../.."), target = resolve(outDir), rel = relative(root, target);
  if (!rel || (!rel.startsWith("..") && !isAbsolute(rel))) throw Error("external program workspace must be outside the repository");
  if (existsSync(target)) throw Error("external program workspace already exists");
  const parent = dirname(target), probe = resolve(parent, `.oa-permission-probe-${process.pid}`);
  mkdirSync(parent, { recursive: true });
  try {
    mkdirSync(probe, { mode: 0o700 });
    if ((statSync(probe).mode & 0o777) !== 0o700) throw Error("external program filesystem cannot enforce private POSIX permissions");
  } finally { if (existsSync(probe)) rmSync(probe, { recursive: true }); }
  const program = JSON.parse(readFileSync(resolve(root, "bench/external-validation-program.example.json"), "utf8")) as ExternalProgram;
  mkdirSync(resolve(target, "private"), { recursive: true, mode: 0o700 });
  mkdirSync(resolve(target, "state"), { mode: 0o700 });
  mkdirSync(resolve(target, "receipts"), { mode: 0o700 });
  writeFileSync(resolve(target, "program.json"), `${JSON.stringify(program, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  writeFileSync(resolve(target, "AUTHORITY-INVITATIONS.json"), `${JSON.stringify({
    schema: "open-autonomy.external-authority-invitations.v1", programId: program.programId,
    instructions: "Each independent authority returns only a public attestation at its destination. Never return private keys, credentials, raw invoices, or participant-private data.",
    invitations: authorityInvitations(program),
  }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  writeFileSync(resolve(target, ".gitignore"), "*\n!.gitignore\n", { flag: "wx", mode: 0o600 });
  return { workspace: target, program: resolve(target, "program.json"), invitations: authorityInvitations(program).length };
}

function parse(argv: string[]) {
  const command = argv.shift(), flag = argv.shift(), path = argv.shift();
  if (command === "bootstrap" && flag === "--out" && path && !argv.length) return { command, path } as const;
  if (!(["status", "init-ready"].includes(command ?? "")) || flag !== "--program" || !path || argv.length)
    throw Error("usage: external-validation-program <status|init-ready> --program <program.json> | bootstrap --out <private-directory>");
  return { command: command as "status" | "init-ready", path } as const;
}

export function runExternalProgramCli(argv: string[]) {
  const { command, path } = parse([...argv]);
  if (command === "bootstrap") return bootstrapExternalProgram(path);
  const program = loadExternalProgram(path);
  return command === "status" ? externalProgramStatus(path, program) : { initialized: initializeReadyCampaigns(path, program) };
}

if (import.meta.main) {
  try { console.log(JSON.stringify(runExternalProgramCli(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
