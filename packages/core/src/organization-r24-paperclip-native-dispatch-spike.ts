/** Live, disposable proof of Paperclip 0.3.1's native issue -> process-adapter dispatch. */
export type PaperclipNativeDispatchSpike = {
  pin: { version: "0.3.1"; sha: "90f85a7d11c517b1d09db90dbec97f4de7d96b83" };
  ids: { company: string; agent: string; issue: string; run: string };
  requestPayloads: Record<string, unknown>;
  observation: { status: string; exitCode: number | null; processPid: number | null; invocationSource: string; stdout: string; stderr: string; linkedIssueIds: string[]; adapterEvent: unknown };
  limitations: string[];
  cleanup: { method: "DELETE" | "PATCH-archive"; status: number };
};

export async function runPaperclipNativeDispatchSpike(baseUrl = "http://127.0.0.1:3216"): Promise<PaperclipNativeDispatchSpike> {
  const api = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${baseUrl}/api${path}`, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text(); let value: any = null; try { value = text ? JSON.parse(text) : null; } catch { value = text; }
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text}`);
    return { status: response.status, body: value };
  };
  const health = (await api("GET", "/health")).body;
  if (health.version !== "0.3.1" || health.serverInfo?.git?.fullSha !== "90f85a7d11c517b1d09db90dbec97f4de7d96b83") throw new Error("Paperclip pin mismatch");
  const nonce = `${process.pid}-${Date.now()}`;
  const companyPayload = { name: `OA R24 native dispatch spike ${nonce}`, description: "owned disposable native dispatch proof", budgetMonthlyCents: 100 };
  const company = (await api("POST", "/companies", companyPayload)).body;
  let cleanup: PaperclipNativeDispatchSpike["cleanup"] = { method: "DELETE", status: 0 };
  try {
    const marker = `R24_NATIVE_DISPATCH_${nonce}`;
    const agentPayload = { name: `R24 native worker ${nonce}`, role: "engineer", adapterType: "process", adapterConfig: { command: "/bin/sh", args: ["-c", `printf '${marker} agent=%s\\n' \"$PAPERCLIP_AGENT_ID\"; printf '${marker}_STDERR\\n' >&2; exit 0`], cwd: "/tmp", timeoutSec: 30 }, budgetMonthlyCents: 50 };
    const agent = (await api("POST", `/companies/${company.id}/agents`, agentPayload)).body;
    const issuePayload = { title: `R24 native dispatch proof ${nonce}`, description: "Assignment must produce a native heartbeat run.", status: "todo", priority: "medium", assigneeAgentId: agent.id };
    const issue = (await api("POST", `/companies/${company.id}/issues`, issuePayload)).body;
    let run: any;
    for (let i=0;i<100;i++) { const runs = (await api("GET", `/companies/${company.id}/heartbeat-runs?agentId=${agent.id}&limit=20`)).body as any[]; run = runs.find(r => r.contextSnapshot?.issueId === issue.id && r.invocationSource === "assignment"); if (run && !["queued","running"].includes(run.status)) break; await Bun.sleep(100); }
    if (!run || run.status !== "succeeded" || run.exitCode !== 0 || !run.processPid) throw new Error("native assignment run did not succeed");
    const log = (await api("GET", `/heartbeat-runs/${run.id}/log`)).body.content as string;
    const records = log.trim().split("\n").map((line:string)=>JSON.parse(line));
    const stdout = records.filter((x:any)=>x.stream === "stdout").map((x:any)=>x.chunk).join("");
    const stderr = records.filter((x:any)=>x.stream === "stderr").map((x:any)=>x.chunk).join("");
    if (!stdout.includes(marker) || !stderr.includes(`${marker}_STDERR`)) throw new Error("actual process output absent");
    const events = (await api("GET", `/heartbeat-runs/${run.id}/events`)).body as any[];
    const adapterEvent = events.find(e => e.eventType === "adapter.invoke")?.payload;
    if (adapterEvent?.adapterType !== "process" || adapterEvent?.command !== "/bin/sh") throw new Error("native adapter invocation event absent");
    const linked = (await api("GET", `/heartbeat-runs/${run.id}/issues`)).body as any[];
    if (!linked.some(x => x.issueId === issue.id)) throw new Error("native issue/run linkage absent");
    return { pin: { version:"0.3.1", sha:"90f85a7d11c517b1d09db90dbec97f4de7d96b83" }, ids:{company:company.id,agent:agent.id,issue:issue.id,run:run.id}, requestPayloads:{company:companyPayload,agent:agentPayload,issue:issuePayload,wake:"implicit assignment wake; no manual wake request"}, observation:{status:run.status,exitCode:run.exitCode,processPid:run.processPid,invocationSource:run.invocationSource,stdout,stderr,linkedIssueIds:linked.map(x=>x.issueId),adapterEvent}, limitations:["process adapter has no persistent conversational session", "0.3.1 adapter environment includes PAPERCLIP_AGENT_ID/COMPANY_ID/API_URL but not PAPERCLIP_RUN_ID or PAPERCLIP_TASK_ID", "a successful process that leaves no issue comment/action is classified needs_followup and queues one automatic missing_issue_comment wake"] ,cleanup};
  } finally {
    const deleted = await fetch(`${baseUrl}/api/companies/${company.id}`, { method:"DELETE" });
    if (deleted.ok) { cleanup.method="DELETE"; cleanup.status=deleted.status; } else { const archived = await fetch(`${baseUrl}/api/companies/${company.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status:"archived"})}); cleanup.method="PATCH-archive"; cleanup.status=archived.status; }
  }
}
