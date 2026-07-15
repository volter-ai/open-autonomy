import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
const hermes = "/home/porta/.local/bin/hermes",
  worker = join(import.meta.dir, "organization-r24-v5-outcome-worker.cjs"),
  sha = (p: string) =>
    `sha256:${createHash("sha256").update(readFileSync(p)).digest("hex")}`;
export async function runR24V5LocalSmoke() {
  const root = `/tmp/oa-r24-v5-nested-smoke-${randomUUID()}`,
    home = join(root, ".hermes"),
    profile = join(home, "profiles/worker"),
    skill = join(profile, "skills/r24-outcome"),
    idem = join(root, "idempotency"),
    binding = {
      schema: "autonomy.r24-smoke-binding.v5",
      nonce: randomBytes(32).toString("hex"),
      mode: "success",
    },
    bindingJson = JSON.stringify(binding),
    key = process.env.OPENROUTER_API_KEY;
  if (!key) throw Error("OPENROUTER_API_KEY must be injected by caller");
  rmSync(root, { recursive: true, force: true });
  mkdirSync(skill, { recursive: true, mode: 0o700 });
  mkdirSync(idem, { recursive: true, mode: 0o700 });
  const config = `model:\n  default: openai/gpt-4.1-nano\n  provider: auto\n  base_url: https://openrouter.ai/api/v1\nterminal:\n  backend: local\n  cwd: ${root}\n  timeout: 30\nagent:\n  max_turns: 8\n  verbose: false\nplatform_toolsets:\n  cli:\n    - terminal\ndisplay:\n  streaming: false\nplugins:\n  enabled: []\n_config_version: 33\n`;
  writeFileSync(join(profile, "config.yaml"), config, { mode: 0o600 });
  writeFileSync(
    join(skill, "SKILL.md"),
    `---\nname: r24-outcome\ndescription: Execute the authenticated R24 outcome exactly once.\n---\nRun exactly this absolute command once using the terminal tool, with no changes:\n\n\`${worker} --mode success --binding '${bindingJson}'\`\n\nThe environment already provides OA_R24_IDEMPOTENCY_ROOT. After it exits zero, report its OA_R24_OUTCOME line verbatim. Do not run any other command.\n`,
    { mode: 0o600 },
  );
  const configPath = join(profile, "config.yaml"), skillPath = join(skill, "SKILL.md"),
    manifest = {
      home,
      profile,
      configDigest: sha(configPath),
      skillDigest: sha(skillPath),
      outcomeWorkerDigest: sha(worker),
      hermesDigest: sha(hermes),
      modelRequestedByHermes: "openai/gpt-4.1-nano",
      providerRevisionEvidence:
        "OpenRouter response/log evidence required; configuration identifier is not a revision",
    },
    startedAt = new Date().toISOString(),
    proc = Bun.spawn(
      [
        hermes,
        "-p",
        "worker",
        "--cli",
        "--accept-hooks",
        "--skills",
        "r24-outcome",
        "-m",
        "openai/gpt-4.1-nano",
        "--toolsets",
        "terminal",
        "chat",
        "-q",
        "Execute the loaded r24-outcome skill exactly once and return its receipt.",
      ],
      {
        cwd: root,
        env: {
          HOME: root,
          HERMES_HOME: home,
          PATH: process.env.PATH!,
          OPENROUTER_API_KEY: key,
          OA_R24_IDEMPOTENCY_ROOT: idem,
          TERM: "dumb",
          NO_COLOR: "1",
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    ),
    timeoutTranscript: Array<{ signal: string; at: string }> = [],
    timer = setTimeout(() => {
      timeoutTranscript.push({ signal: "SIGTERM", at: new Date().toISOString() });
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (proc.exitCode === null) {
          timeoutTranscript.push({ signal: "SIGKILL", at: new Date().toISOString() });
          proc.kill("SIGKILL");
        }
      }, 2_000);
    }, 120_000),
    [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
  clearTimeout(timer);
  const completedAt = new Date().toISOString(),
    idempotencyPath = join(idem, binding.nonce + ".json"),
    outcome = existsSync(idempotencyPath) ? readFileSync(idempotencyPath, "utf8") : null,
    expectedOutcome = JSON.stringify({
      schema: "autonomy.r24-deterministic-outcome.v5",
      nonce: binding.nonce,
      mode: "success",
      bindingDigest: `sha256:${createHash("sha256").update(bindingJson).digest("hex")}`,
    }),
    agentLogPath = join(profile, "logs/agent.log"),
    agentLog = existsSync(agentLogPath) ? readFileSync(agentLogPath, "utf8") : "",
    redact = (s: string) =>
      s.replaceAll(key, "[REDACTED]").replace(/sk-or-v1-[A-Za-z0-9_-]+/g, "[REDACTED]"),
    tokenRows = [...agentLog.matchAll(/API call #(\d+): model=([^ ]+) provider=([^ ]+) in=(\d+) out=(\d+) total=(\d+)/g)],
    evidence = {
      renderedStdoutDigest: `sha256:${createHash("sha256").update(redact(stdout)).digest("hex")}`,
      agentLogDigest: `sha256:${createHash("sha256").update(redact(agentLog)).digest("hex")}`,
      stdoutExcerpt: redact(stdout).slice(0, 8_000),
      stderrExcerpt: redact(stderr).slice(0, 2_000),
      agentLogExcerpt: redact(agentLog).slice(-8_000),
      terminalToolTurns: Number(/tool_turns=(\d+)/.exec(agentLog)?.[1] ?? -1),
      uniqueIdempotencyRecord: outcome === expectedOutcome,
      authenticity: "idempotency-and-causal-execution-evidence; not model-resistant authenticity",
    },
    usage = {
      modelRequestedByHermes: "openai/gpt-4.1-nano",
      providerLoggedByHermes: tokenRows[0]?.[3] ?? null,
      modelLoggedByHermes: tokenRows[0]?.[2] ?? null,
      providerResponseAttestation: null,
      inputTokens: tokenRows.reduce((n, x) => n + Number(x[4]), 0),
      outputTokens: tokenRows.reduce((n, x) => n + Number(x[5]), 0),
      apiCalls: tokenRows.length,
      moneyUsd: null,
      providerRevision: null,
    },
    priorRoot = "/tmp/oa-r24-v5-nested-smoke-1082510",
    priorResult = existsSync(join(priorRoot, "result.json")) ? redact(readFileSync(join(priorRoot, "result.json"), "utf8")) : "",
    priorEvidence = { boundedRedactedResult: priorResult.slice(0, 12_000), fullRedactedDigest: `sha256:${createHash("sha256").update(priorResult).digest("hex")}`, replayability: "bounded excerpt; full raw attempt is intentionally nonreplayable after safe cleanup" },
    replayBytes = { configYaml: readFileSync(configPath, "utf8"), skillMarkdown: readFileSync(skillPath, "utf8"), outcomeWorkerBase64: readFileSync(worker).toString("base64"), smokeRunnerBase64: readFileSync(import.meta.filename).toString("base64") },
    cleanup = (rmSync(root, { recursive: true, force: true }), rmSync(priorRoot, { recursive: true, force: true }), { attempts: [{ root, absent: !existsSync(root) }, { root: priorRoot, absent: !existsSync(priorRoot) }] }),
    body = {
      schema: "autonomy.r24-local-nested-hermes-smoke.v5",
      closureClaim: false as const,
      manifest,
      startedAt,
      completedAt,
      exitCode,
      outcome,
      expectedOutcome,
      idempotencyPath,
      evidence,
      usage,
      replayBytes,
      cleanup,
      attempts: [
        { id: "detector-v1", disposition: "failed-detector", exitCode: 0, reason: "rendered Hermes UI wrapped the idempotency record; execution succeeded but line detector was invalid", evidence: priorEvidence },
        { id: "detector-v2", disposition: "accepted-smoke", exitCode },
      ],
      limitations: ["Direct local nested-Hermes smoke only; bypasses the R24 launcher, Hermes Kanban native scheduling, and Paperclip.", "Profile load is inferred from isolated-path behavior and logs, not a separate native profile-readback API.", "The outcome file is unsigned idempotency evidence, not a model-resistant authenticated receipt.", "Bounded redacted logs are not complete raw-log replay evidence."],
      timeoutTranscript,
      passed: exitCode === 0 && outcome === expectedOutcome && evidence.terminalToolTurns === 1 && usage.apiCalls === 2 && usage.modelLoggedByHermes === usage.modelRequestedByHermes && usage.providerLoggedByHermes === "openrouter" && cleanup.attempts.every(x => x.absent),
    },
    keypair = generateKeyPairSync("ed25519"),
    publicKeyPem = keypair.publicKey.export({ type: "spki", format: "pem" }).toString(),
    digest = `sha256:${createHash("sha256").update(JSON.stringify(body)).digest("hex")}`,
    result = { ...body, signing: { algorithm: "Ed25519", publicKeyPem, authenticity: "local-self-signature" }, digest, signature: sign(null, Buffer.from(digest), keypair.privateKey).toString("base64") };
  const artifactPath = join(import.meta.dir, "../../../docs/evidence/R24-V5-NESTED-HERMES-SMOKE.json");
  const serialized = JSON.stringify(result, null, 2) + "\n";
  if (serialized.includes(key) || /sk-or-v1-[A-Za-z0-9_-]+|OPENROUTER_API_KEY\s*[=:]/.test(serialized)) throw Error("recursive smoke artifact secret scan failed");
  writeFileSync(artifactPath, serialized);
  return { result, root, artifactPath };
}
if (import.meta.main) {
  const x = await runR24V5LocalSmoke();
  console.log(
    JSON.stringify(
      {
        root: x.root,
        passed: x.result.passed,
        exitCode: x.result.exitCode,
        manifest: x.result.manifest,
        outcome: x.result.outcome,
        cleanup: x.result.cleanup,
      },
      null,
      2,
    ),
  );
  if (!x.result.passed) process.exitCode = 1;
}
