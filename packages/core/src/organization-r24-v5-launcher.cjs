#!/usr/bin/node
"use strict";
const fs = require("node:fs"),
  crypto = require("node:crypto"),
  cp = require("node:child_process"),
  path = require("node:path");
function stable(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  return `{${Object.keys(v)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
    .join(",")}}`;
}
const shaBytes = (b) =>
    `sha256:${crypto.createHash("sha256").update(b).digest("hex")}`,
  shaFile = (p) => shaBytes(fs.readFileSync(p));
function exactObject(v, keys, name) {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).sort().join("\0") !== [...keys].sort().join("\0")
  )
    throw Error(`${name} fields invalid`);
}
function parseBinding(s) {
  const x = JSON.parse(s),
    digests = [
      "unitDigest",
      "organizationDigest",
      "behaviorDigest",
      "controlDigest",
      "workloadDigest",
      "assignmentDigest",
      "lockDigest",
      "launcherSpecDigest",
    ];
  exactObject(
    x,
    [
      "schema",
      "pairId",
      "trialId",
      "replication",
      "substrate",
      ...digests,
      "nonce",
    ],
    "binding",
  );
  if (
    x.schema !== "autonomy.r24-cell-binding.v5" ||
    !x.pairId || !x.trialId ||
    !["hermes", "paperclip"].includes(x.substrate) ||
    !Number.isSafeInteger(x.replication) ||
    x.replication < 0 ||
    !/^[a-f0-9]{64}$/.test(x.nonce) ||
    digests.some((k) => !/^sha256:[a-f0-9]{64}$/.test(x[k]))
  )
    throw Error("binding invalid");
  return x;
}
function parseSpec(s) {
  const x = JSON.parse(s),
    digestKeys = [
      "launcher",
      "runtime",
      "realHermes",
      "interpreter",
      "profile",
      "model",
      "tools",
      "skills",
      "query",
    ];
  exactObject(
    x,
    [
      "schema",
      "realHermes",
      "interpreter",
      "profile",
      "model",
      "toolsets",
      "skills",
      "query",
      "digests",
      "allowedEnvKeys",
      "canonicalEnv",
      "secretCommitments",
      "stack",
    ],
    "spec",
  );
  exactObject(x.digests, digestKeys, "digests");
  exactObject(
    x.stack,
    ["cellRoot", "hermesHome", "profileHome", "toolRoot", "configFile", "profileFiles", "skillFiles", "toolFiles"],
    "stack",
  );
  const envKeys = Object.keys(x.canonicalEnv ?? {}),
    secretKeys = Object.keys(x.secretCommitments ?? {}),
    allEnvKeys = [...envKeys, ...secretKeys],
    permittedCanonical = new Set(["HOME", "HERMES_HOME"]),
    permittedSecrets = new Set(["OPENROUTER_API_KEY"]),
    manifests = [x.stack?.configFile, ...(x.stack?.profileFiles ?? []), ...(x.stack?.skillFiles ?? []), ...(x.stack?.toolFiles ?? [])];
  if (
    x.schema !== "autonomy.r24-launcher-spec.v5" ||
    !path.isAbsolute(x.realHermes) ||
    !path.isAbsolute(x.interpreter) ||
    !x.profile ||
    !x.model ||
    !Array.isArray(x.toolsets) ||
    !Array.isArray(x.skills) ||
    !x.toolsets.length || !x.skills.length ||
    !x.query ||
    !Array.isArray(x.allowedEnvKeys) ||
    new Set(x.allowedEnvKeys).size !== x.allowedEnvKeys.length ||
    envKeys.some((k) => !permittedCanonical.has(k)) ||
    secretKeys.some((k) => !permittedSecrets.has(k)) ||
    allEnvKeys.length !== x.allowedEnvKeys.length ||
    allEnvKeys.some((k) => !x.allowedEnvKeys.includes(k)) ||
    x.allowedEnvKeys.some((k) => !allEnvKeys.includes(k)) ||
    envKeys.some((k) => typeof x.canonicalEnv[k] !== "string") ||
    secretKeys.some((k) => !/^sha256:[a-f0-9]{64}$/.test(x.secretCommitments[k])) ||
    !path.isAbsolute(x.stack.cellRoot) ||
    !path.isAbsolute(x.stack.hermesHome) ||
    !path.isAbsolute(x.stack.profileHome) ||
    !path.isAbsolute(x.stack.toolRoot) ||
    x.canonicalEnv.HERMES_HOME !== x.stack.hermesHome ||
    x.canonicalEnv.HOME !== x.stack.cellRoot ||
    !manifests.length ||
    !x.stack.configFile ||
    !x.stack.profileFiles.length || !x.stack.skillFiles.length || !x.stack.toolFiles.length ||
    manifests.some((m) => !m || !path.isAbsolute(m.path) || !/^sha256:[a-f0-9]{64}$/.test(m.digest)) ||
    new Set(manifests.map((m) => m.path)).size !== manifests.length ||
    digestKeys.some((k) => !/^sha256:[a-f0-9]{64}$/.test(x.digests[k]))
  )
    throw Error("launcher spec invalid");
  return x;
}

function inside(root, candidate) {
  const r = fs.realpathSync(root), c = fs.realpathSync(candidate), rel = path.relative(r, c);
  return rel === "" || (!rel.startsWith(".." + path.sep) && rel !== "..");
}
function parseNative(argv, substrate, spec) {
  if (substrate === "paperclip") {
    if (argv.length !== 1 || argv[0] !== "--oa-paperclip-dispatch")
      throw Error("unexpected Paperclip launcher argv");
    return {
      grammar: "paperclip-process-v5",
      preservation: [
        {
          source: "process.command",
          target: "launcher",
          disposition: "preserved",
          rationale: "native process adapter selected these exact launcher bytes",
        },
        {
          source: "process.args",
          target: "canonical Hermes argv",
          disposition: "normalized",
          rationale: "declared Paperclip adapter marker removed",
        },
      ],
    };
  }
  let i = 0,
    need = (x) => {
      if (argv[i++] !== x)
        throw Error(`unexpected Hermes launcher argv at ${i - 1}`);
    };
  need("-p");
  if (argv[i++] !== spec.profile) throw Error("Hermes profile mismatch");
  need("--cli");
  need("--accept-hooks");
  for (const sk of spec.skills) {
    need("--skills");
    if (argv[i++] !== sk) throw Error("Hermes skill mismatch");
  }
  need("-m");
  if (argv[i++] !== spec.model) throw Error("Hermes model mismatch");
  need("--toolsets");
  if (argv[i++] !== [...spec.toolsets].sort().join(","))
    throw Error("Hermes toolsets mismatch");
  need("chat");
  need("-q");
  if (
    !/^work kanban task [A-Za-z0-9_-]+$/.test(argv[i++] ?? "") ||
    i !== argv.length
  )
    throw Error("Hermes task prompt grammar invalid");
  return {
    grammar: "hermes-kanban-default-spawn-v5",
    preservation: [
      {
        source: "profile/model/skills/toolsets",
        target: "canonical Hermes argv",
        disposition: "preserved",
        rationale: "native Hermes dispatcher arguments match locked stack fields",
      },
      {
        source: "task-specific quiet query",
        target: "canonical query",
        disposition: "normalized",
        rationale: "declared cell binding supplies substrate-neutral query",
      },
    ],
  };
}
function canonicalArgv(spec) {
  return [
    spec.interpreter,
    spec.realHermes,
    "-p",
    spec.profile,
    "--cli",
    "--accept-hooks",
    ...spec.skills.flatMap((x) => ["--skills", x]),
    "-m",
    spec.model,
    "--toolsets",
    [...spec.toolsets].sort().join(","),
    "chat",
    "-q",
    spec.query,
  ];
}
function launcherSpecDigest(spec) {
  return shaBytes(Buffer.from(stable(spec)));
}
function verifyPins(spec, self = __filename) {
  const expectedProfileHome = path.join(spec.stack.hermesHome, "profiles", spec.profile);
  if (!inside(spec.stack.cellRoot, spec.stack.hermesHome) ||
      !inside(spec.stack.cellRoot, spec.stack.toolRoot) ||
      path.normalize(spec.stack.profileHome) !== path.normalize(expectedProfileHome) ||
      !inside(spec.stack.hermesHome, spec.stack.profileHome))
    throw Error("profile home isolation mismatch");
  const manifests = [
    [spec.stack.configFile, spec.stack.hermesHome],
    ...spec.stack.profileFiles.map((x) => [x, spec.stack.profileHome]),
    ...spec.stack.skillFiles.map((x) => [x, spec.stack.hermesHome]),
    ...spec.stack.toolFiles.map((x) => [x, spec.stack.toolRoot]),
  ];
  for (const [entry, root] of manifests) {
    if (!inside(root, entry.path) || shaFile(entry.path) !== entry.digest)
      throw Error("stack manifest byte pin mismatch");
  }
  const skillNames = spec.stack.skillFiles.map((x) => path.basename(x.path).replace(/\.[^.]+$/, "")).sort();
  if (stable(skillNames) !== stable([...spec.skills].sort())) throw Error("skill manifest mismatch");
  const actual = {
    launcher: shaFile(self),
    runtime: shaFile(process.execPath),
    realHermes: shaFile(spec.realHermes),
    interpreter: shaFile(spec.interpreter),
    profile: shaBytes(Buffer.from(stable(spec.stack.profileFiles))),
    model: shaBytes(Buffer.from(spec.model)),
    tools: shaBytes(Buffer.from(stable(spec.stack.toolFiles))),
    skills: shaBytes(Buffer.from(stable(spec.stack.skillFiles))),
    query: shaBytes(Buffer.from(spec.query)),
  };
  for (const k of Object.keys(actual))
    if (actual[k] !== spec.digests[k]) throw Error(`${k} digest mismatch`);
  return actual;
}
function childEnvironment(spec) {
  const env = { ...spec.canonicalEnv };
  for (const [key, commitment] of Object.entries(spec.secretCommitments)) {
    const value = process.env[key];
    if (typeof value !== "string" || shaBytes(Buffer.from(value)) !== commitment)
      throw Error(`secret commitment mismatch: ${key}`);
    env[key] = value;
  }
  return env;
}
function consumeKey(file) {
  if (!path.isAbsolute(file)) throw Error("receipt key path must be absolute");
  const parent = fs.statSync(path.dirname(file));
  if (!parent.isDirectory() || parent.uid !== process.getuid() || (parent.mode & 0o022) !== 0)
    throw Error("receipt key parent custody invalid");
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0), fd = fs.openSync(file, flags);
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.nlink !== 1 || (st.mode & 0o077) !== 0 || st.uid !== process.getuid())
      throw Error("receipt key custody invalid");
    const key = fs.readFileSync(fd);
    if (key.length < 32) throw Error("receipt key too short");
    fs.unlinkSync(file);
    if (fs.existsSync(file)) throw Error("receipt key one-use unlink failed");
    return key;
  } finally { fs.closeSync(fd); }
}
function signReceipt(body, key) {
  const unsigned = { schema: "autonomy.r24-launcher-receipt.v5", ...body };
  return {
    ...unsigned,
    mac: crypto
      .createHmac("sha256", key)
      .update(stable(unsigned))
      .digest("hex"),
  };
}
function processGroup(pid) {
  const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8"), rest = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
  const pgid = Number(rest[2]);
  if (!Number.isSafeInteger(pgid) || pgid < 1) throw Error("process group readback failed");
  return pgid;
}
async function main() {
  const originalArgv = process.argv.slice(2),
    binding = parseBinding(process.env.OA_R24_BINDING),
    spec = parseSpec(process.env.OA_R24_LAUNCHER_SPEC);
  if (binding.substrate !== process.env.OA_R24_SUBSTRATE)
    throw Error("substrate binding mismatch");
  const normalization = parseNative(originalArgv, binding.substrate, spec),
    specDigest = launcherSpecDigest(spec);
  if (specDigest !== binding.launcherSpecDigest)
    throw Error("launcher spec differs from authorized binding");
  const
    pins = verifyPins(spec),
    key = consumeKey(process.env.OA_R24_RECEIPT_KEY_FILE),
    argv = canonicalArgv(spec),
    env = childEnvironment(spec);
  const input = {
    originalArgv,
    recordedEnv: spec.canonicalEnv,
    secretCommitments: spec.secretCommitments,
    stackManifestDigest: shaBytes(Buffer.from(stable(spec.stack))),
    launcherSpecDigest: specDigest,
    normalization,
    canonicalArgv: argv,
    pins,
    binding,
  };
  const inputDigest = shaBytes(Buffer.from(stable(input))),
    started = process.hrtime.bigint();
  let child,
    outerSignal = null,
    escalation = null;
  const forward = (s) => {
    outerSignal = s;
    if (child?.pid)
      try {
        process.kill(-child.pid, s);
      } catch {}
    if (s === "SIGTERM" && child?.pid)
      escalation = setTimeout(() => {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
      }, 1000);
  };
  process.on("SIGTERM", () => forward("SIGTERM"));
  process.on("SIGINT", () => forward("SIGINT"));
  child = cp.spawn(argv[0], argv.slice(1), {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const launcherPgid = processGroup(process.pid), hermesPgid = processGroup(child.pid);
  const start = signReceipt(
    {
      phase: "start",
      binding,
      inputDigest,
      pid: process.pid,
      processGroup: launcherPgid,
      hermesPid: child.pid,
      hermesProcessGroup: hermesPgid,
      workerDigest: pins.launcher,
      runtimeDigest: pins.runtime,
      argvDigest: shaBytes(Buffer.from(stable(argv))),
      at: new Date().toISOString(),
      monotonicNs: started.toString(),
      originalInput: input,
    },
    key,
  );
  process.stdout.write(`OA_R24_RECEIPT ${JSON.stringify(start)}\n`);
  const stdout = [], stderr = [], maxOutputBytes = 16 * 1024 * 1024;
  let outputBytes = 0, outputOverflow = false;
  const collect = (target) => (chunk) => {
    outputBytes += chunk.length;
    if (outputBytes > maxOutputBytes) {
      outputOverflow = true;
      try { process.kill(-child.pid, "SIGKILL"); } catch {}
    } else target.push(Buffer.from(chunk));
  };
  child.stdout.on("data", collect(stdout));
  child.stderr.on("data", collect(stderr));
  let terminal = await new Promise((resolve) => {
    child.once("error", (e) =>
      resolve({ code: null, signal: null, error: String(e) }),
    );
    child.once("exit", (code, signal) =>
      resolve({ code, signal, error: null }),
    );
  });
  const stdoutBytes = Buffer.concat(stdout), stderrBytes = Buffer.concat(stderr),
    secretValues = Object.keys(spec.secretCommitments).map((k) => Buffer.from(env[k])),
    leaked = secretValues.some((secret) => secret.length && (stdoutBytes.includes(secret) || stderrBytes.includes(secret)));
  if (leaked || outputOverflow) {
    terminal = { code: 65, signal: null, error: leaked ? "child secret exfiltration rejected" : "child output limit exceeded" };
  } else {
    process.stdout.write(stdoutBytes);
    process.stderr.write(stderrBytes);
  }
  if (escalation) clearTimeout(escalation);
  if (outerSignal) {
    process.exitCode = outerSignal === "SIGTERM" ? 143 : 130;
    return;
  }
  const ended = process.hrtime.bigint(),
    success = terminal.code === 0 && !terminal.signal;
  const result = signReceipt(
    {
      phase: "result",
      binding,
      inputDigest,
      pid: process.pid,
      processGroup: launcherPgid,
      hermesPid: child.pid,
      hermesProcessGroup: hermesPgid,
      workerDigest: pins.launcher,
      runtimeDigest: pins.runtime,
      argvDigest: shaBytes(Buffer.from(stable(argv))),
      at: new Date().toISOString(),
      monotonicNs: ended.toString(),
      terminal: success ? "success" : "failure",
      exitCode: terminal.code ?? (terminal.signal ? 128 : 1),
      signal: terminal.signal,
      error: terminal.error,
    },
    key,
  );
  process.stdout.write(`OA_R24_RECEIPT ${JSON.stringify(result)}\n`);
  process.exitCode = result.exitCode;
}
if (require.main === module)
  main().catch((e) => {
    process.stderr.write(`OA_R24_LAUNCHER_ERROR ${e.message}\n`);
    process.exitCode = 64;
  });
module.exports = {
  stable,
  shaBytes,
  parseBinding,
  parseSpec,
  parseNative,
  canonicalArgv,
  verifyPins,
  launcherSpecDigest,
  childEnvironment,
  consumeKey,
  signReceipt,
};
