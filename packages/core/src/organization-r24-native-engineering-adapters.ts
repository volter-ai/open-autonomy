import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  runR24TwinMatchedEngineering,
  verifyR24TwinMatchedEngineering,
  type R24EngineeringBinding,
  type R24NativeEngineeringPath,
  type R24NativeReceipt,
  type R24NativeRequest,
} from "./organization-r24-twin-matched-engineering";
const digest = (x: unknown) =>
    `sha256:${createHash("sha256")
      .update(typeof x === "string" ? x : canonicalSemanticJson(x))
      .digest("hex")}` as const,
  worker = join(import.meta.dir, "organization-r24-v5-outcome-worker.cjs"),
  outcomeBinding = (r: R24NativeRequest) => canonicalSemanticJson({ schema: "autonomy.r24-engineering-outcome-binding.v1", nonce: digest(r.binding).slice(7), mode: "success", organizationDigest: r.binding.organizationDigest, workloadDigest: r.binding.workloadDigest }),
  sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function cmd(args: string[], cwd: string, env: Record<string, string>) {
  const p = Bun.spawn(args, {
      cwd,
      env: { ...process.env, ...env },
      stdout: "pipe",
      stderr: "pipe",
    }),
    [stdout, stderr, exitCode] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
      p.exited,
    ]);
  return { stdout, stderr, exitCode };
}
export class HermesKanbanNativeEngineeringPath implements R24NativeEngineeringPath {
  readonly substrate = "hermes" as const;
  readonly nativePath = "hermes-kanban-worker" as const;
  readonly pin = { version: "0.18.2", revision: "0c1adb48" };
  constructor(
    private apiKey: string,
    private binary = "/home/porta/.local/bin/hermes",
  ) {}
  async run(r: R24NativeRequest): Promise<R24NativeReceipt> {
    const root = `/tmp/oa-r24-hermes-${randomUUID()}`,
      home = join(root, ".hermes"),
      profile = join(home, "profiles/worker"),
      skill = join(profile, "skills/r24-native"),
      idem = join(root, "idempotency"),
      board = `r24-${randomUUID().slice(0, 8)}`,
      bindingJson = outcomeBinding(r);
    mkdirSync(skill, { recursive: true });
    mkdirSync(idem, { recursive: true });
    writeFileSync(
      join(profile, "config.yaml"),
      `model:\n  default: openai/gpt-4.1-nano\n  provider: auto\n  base_url: https://openrouter.ai/api/v1\nterminal:\n  backend: local\n  cwd: ${root}\n  timeout: 30\nagent:\n  max_turns: 8\n  verbose: false\nplatform_toolsets:\n  cli:\n    - terminal\ndisplay:\n  streaming: false\nplugins:\n  enabled: []\n_config_version: 33\n`,
    );
    writeFileSync(
      join(skill, "SKILL.md"),
      `---\nname: r24-native\ndescription: Execute the pinned deterministic R24 cell.\n---\nRun exactly this command once, unchanged:\n\n\`OA_R24_IDEMPOTENCY_ROOT='${idem}' ${worker} --mode success --binding '${bindingJson}'\`\n\nThen report the OA_R24_OUTCOME line verbatim.\n`,
    );
    const env = {
        HOME: root,
        HERMES_HOME: home,
        OPENROUTER_API_KEY: this.apiKey,
        OA_R24_IDEMPOTENCY_ROOT: idem,
        PATH: process.env.PATH!,
        TERM: "dumb",
        NO_COLOR: "1",
      },
      startedAt = new Date().toISOString();
    let taskId = "",
      trace = "";
    try {
      let x = await cmd(
        [
          this.binary,
          "kanban",
          "boards",
          "create",
          board,
          "--switch",
          "--default-workdir",
          root,
        ],
        root,
        env,
      );
      if (x.exitCode) throw Error(`Hermes board create failed: ${x.stderr}`);
      x = await cmd(
        [
          this.binary,
          "kanban",
          "create",
          "R24 deterministic matched cell",
          "--body",
          `Execute r24-native for binding ${digest(r.binding)}`,
          "--assignee",
          "worker",
          "--workspace",
          `dir:${root}`,
          "--skill",
          "r24-native",
          "--max-runtime",
          "180",
          "--max-retries",
          "1",
          "--idempotency-key",
          r.trialId,
          "--json",
        ],
        root,
        env,
      );
      if (x.exitCode) throw Error(`Hermes task create failed: ${x.stderr}`);
      const created = JSON.parse(x.stdout),
        id = created.id ?? created.task?.id ?? created.task_id;
      if (!id) throw Error("Hermes task id absent");
      taskId = String(id);
      x = await cmd(
        [this.binary, "kanban", "dispatch", "--max", "1", "--json"],
        root,
        env,
      );
      if (x.exitCode) throw Error(`Hermes dispatch failed: ${x.stderr}`);
      let show: any, runs: any;
      for (let i = 0; i < 180; i++) {
        const s = await cmd(
          [this.binary, "kanban", "show", taskId, "--json"],
          root,
          env,
        );
        if (!s.exitCode) {
          show = JSON.parse(s.stdout);
          const status = show.status ?? show.task?.status;
          if (["done", "blocked"].includes(status)) break;
        }
        await sleep(1000);
      }
      const rr = await cmd(
        [this.binary, "kanban", "runs", taskId, "--json"],
        root,
        env,
      );
      runs = rr.exitCode ? [] : JSON.parse(rr.stdout);
      const lg = await cmd([this.binary, "kanban", "log", taskId], root, env);
      trace = canonicalSemanticJson({
        show,
        runs,
        logDigest: digest(lg.stdout),
        dispatch: x.stdout,
      });
      const files = existsSync(idem)
          ? Array.from(new Bun.Glob("*.json").scanSync(idem))
          : [],
        outcome =
          files.length === 1 ? readFileSync(join(idem, files[0]!), "utf8") : "",
        run = Array.isArray(runs) ? runs.at(-1) : runs?.runs?.at(-1),
        findPid=(v:any):number=>{if(!v||typeof v!=="object")return 0;for(const[k,x]of Object.entries(v)){if(/pid/i.test(k)&&Number.isSafeInteger(Number(x))&&Number(x)>0)return Number(x);const n=findPid(x);if(n)return n}return 0},
        pid = findPid({run,runs,show});
      if (!outcome || !Number.isSafeInteger(pid) || pid < 1)
        throw Error(`Hermes native outcome or PID absent: ${canonicalSemanticJson({files,status:show?.status??show?.task?.status,runSummary:runs})}`);
      return this.receipt(
        r,
        taskId,
        pid,
        startedAt,
        "success",
        digest(outcome),
        digest(trace),
        digest({ board, taskId, cleanup: "pending" }),
      );
    } finally {
      await cmd(
        [this.binary, "kanban", "boards", "rm", board, "--yes"],
        root,
        env,
      ).catch(() => undefined);
      rmSync(root, { recursive: true, force: true });
    }
  }
  private receipt(
    r: R24NativeRequest,
    nativeRunId: string,
    processId: number,
    startedAt: string,
    terminal: R24NativeReceipt["terminal"],
    portableOutcomeDigest: `sha256:${string}`,
    rawTraceDigest: `sha256:${string}`,
    cleanupDigest: `sha256:${string}`,
  ): R24NativeReceipt {
    return {
      schema: "autonomy.r24-native-engineering-receipt.v1",
      substrate: this.substrate,
      nativePath: this.nativePath,
      providerVersion: this.pin.version,
      providerRevision: this.pin.revision,
      trialId: r.trialId,
      order: r.order,
      bindingDigest: digest(r.binding),
      organizationDigest: r.binding.organizationDigest,
      workloadDigest: r.binding.workloadDigest,
      serviceTwinImplementationDigest:
        r.binding.serviceTwin.implementationDigest,
      serviceTwinScenarioDigest: r.binding.serviceTwin.scenarioDigest,
      nativeRunId,
      processId,
      startedAt,
      completedAt: new Date().toISOString(),
      terminal,
      portableOutcomeDigest,
      rawTraceDigest,
      cleanupDigest,
      humanAssistanceMinutes: 0,
      liveProviderClaim: false,
    };
  }
}
export class PaperclipHttpNativeEngineeringPath implements R24NativeEngineeringPath {
  readonly substrate = "paperclip" as const;
  readonly nativePath = "paperclip-issue-process-adapter" as const;
  readonly pin = {
    version: "0.3.1",
    revision: "90f85a7d11c517b1d09db90dbec97f4de7d96b83",
  };
  constructor(private base = "http://127.0.0.1:3216") {}
  private async api(method: string, path: string, body?: unknown) {
    const x = await fetch(`${this.base}/api${path}`, {
        method,
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      text = await x.text();
    if (!x.ok) throw Error(`${method} ${path}: ${x.status}`);
    return text ? JSON.parse(text) : null;
  }
  async run(r: R24NativeRequest): Promise<R24NativeReceipt> {
    const health = await this.api("GET", "/health");
    if (
      health.version !== this.pin.version ||
      health.serverInfo?.git?.fullSha !== this.pin.revision
    )
      throw Error("Paperclip pin mismatch");
    const root = `/tmp/oa-r24-paperclip-${randomUUID()}`,
      idem = join(root, "idempotency"),
      bindingJson = outcomeBinding(r);
    mkdirSync(idem, { recursive: true });
    const company = await this.api("POST", "/companies", {
        name: `OA R24 ${randomUUID()}`,
        description: "owned matched engineering cell",
        budgetMonthlyCents: 100,
      }),
      startedAt = new Date().toISOString();
    try {
      const agent = await this.api("POST", `/companies/${company.id}/agents`, {
          name: "R24 deterministic worker",
          role: "engineer",
          adapterType: "process",
          adapterConfig: {
            command: "/bin/sh",
            args: ["-c", `OA_R24_IDEMPOTENCY_ROOT='${idem}' exec '${worker}' --mode success --binding '${bindingJson}'`],
            cwd: root,
            timeoutSec: 60,
          },
          budgetMonthlyCents: 50,
        }),
        issue = await this.api("POST", `/companies/${company.id}/issues`, {
          title: "R24 deterministic matched cell",
          description: `binding ${digest(r.binding)}`,
          status: "todo",
          priority: "medium",
          assigneeAgentId: agent.id,
        });
      let run: any;
      for (let i = 0; i < 200; i++) {
        const runs = await this.api(
          "GET",
          `/companies/${company.id}/heartbeat-runs?agentId=${agent.id}&limit=20`,
        );
        run = runs.find(
          (x: any) =>
            x.contextSnapshot?.issueId === issue.id &&
            x.invocationSource === "assignment",
        );
        if (run && !["queued", "running"].includes(run.status)) break;
        await sleep(250);
      }
      if (!run || run.status !== "succeeded" || !run.processPid) {
        const failedLog = run?.id ? await this.api("GET", `/heartbeat-runs/${run.id}/log`).catch(() => null) : null;
        throw Error(`Paperclip native assignment failed: ${canonicalSemanticJson(run ? {id:run.id,status:run.status,exitCode:run.exitCode,error:run.error,processPid:run.processPid,log:failedLog} : {run:null})}`);
      }
      const log = await this.api("GET", `/heartbeat-runs/${run.id}/log`),
        events = await this.api("GET", `/heartbeat-runs/${run.id}/events`),
        linked = await this.api("GET", `/heartbeat-runs/${run.id}/issues`),
        files = Array.from(new Bun.Glob("*.json").scanSync(idem)),
        outcome =
          files.length === 1 ? readFileSync(join(idem, files[0]!), "utf8") : "";
      if (
        !outcome ||
        !linked.some((x: any) => x.issueId === issue.id) ||
        !events.some((x: any) => x.eventType === "adapter.invoke")
      )
        throw Error("Paperclip causal native join absent");
      return {
        schema: "autonomy.r24-native-engineering-receipt.v1",
        substrate: this.substrate,
        nativePath: this.nativePath,
        providerVersion: this.pin.version,
        providerRevision: this.pin.revision,
        trialId: r.trialId,
        order: r.order,
        bindingDigest: digest(r.binding),
        organizationDigest: r.binding.organizationDigest,
        workloadDigest: r.binding.workloadDigest,
        serviceTwinImplementationDigest:
          r.binding.serviceTwin.implementationDigest,
        serviceTwinScenarioDigest: r.binding.serviceTwin.scenarioDigest,
        nativeRunId: run.id,
        processId: run.processPid,
        startedAt,
        completedAt: new Date().toISOString(),
        terminal: "success",
        portableOutcomeDigest: digest(outcome),
        rawTraceDigest: digest({ run, log, events, linked }),
        cleanupDigest: digest({ company: company.id, method: "DELETE" }),
        humanAssistanceMinutes: 0,
        liveProviderClaim: false,
      };
    } finally {
      await fetch(`${this.base}/api/companies/${company.id}`, {
        method: "DELETE",
      });
      rmSync(root, { recursive: true, force: true });
    }
  }
}
export async function executeAndPersistR24NativeMatched(
  binding: R24EngineeringBinding,
  apiKey: string,
  path: string,
) {
  const artifact = await runR24TwinMatchedEngineering(
    binding,
    {
      hermes: new HermesKanbanNativeEngineeringPath(apiKey),
      paperclip: new PaperclipHttpNativeEngineeringPath(),
    },
    0,
  );
  if (!verifyR24TwinMatchedEngineering(artifact))
    throw Error("persisted R24 artifact failed verification");
  writeFileSync(path, JSON.stringify(artifact, null, 2) + "\n");
  return artifact;
}
