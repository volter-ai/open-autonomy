import { describe, expect, test } from "bun:test";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import { canonicalSemanticJson } from "./organization-canonical";
import {
  A2A_PROTOCOL_REVISION,
  A2AStreamProjection,
  ORACLE_AGENT_SPEC_RELEASE,
  agentSpecActorAuthorizationDigest,
  authorizeAgentSpecActor,
  dereferenceA2AFilePart,
  discoverA2ACard,
  exportExactA2A,
  exportOracleAgentSpec,
  importOracleAgentSpec,
  mapA2AArtifact,
  mapA2ACancellation,
  mapA2AMessage,
  projectA2ATask,
  verifyExactA2ARoundTrip,
  verifyExactAgentSpecRoundTrip,
  type A2ADiscoveryPolicy,
} from "./organization-a2a-agent-spec";

const policy: A2ADiscoveryPolicy = {
  allowedOrigins: ["https://agents.example"],
  maxBytes: 4096,
  maxDepth: 8,
  maxNodes: 100,
  maxStringBytes: 256,
  maxItems: 20,
};
const transport = (
  body: unknown,
  changes: Partial<{
    finalUrl: string;
    contentType: string;
    address: string;
    resolved: string[];
  }> = {},
) => ({
  resolve: async () => changes.resolved ?? ["8.8.8.8"],
  fetch: async (_url: string, options: { allowedAddresses: string[] }) => {
    const address = changes.address ?? "8.8.8.8";
    if (!options.allowedAddresses.includes(address))
      throw new Error("socket address denied");
    return {
      finalUrl:
        changes.finalUrl ??
        "https://agents.example/.well-known/agent-card.json",
      contentType: changes.contentType ?? "application/json",
      connection: { address, verified: true as const },
      bytes: new TextEncoder().encode(JSON.stringify(body)),
    };
  },
});
const card = {
  protocolVersion: A2A_PROTOCOL_REVISION,
  name: "Research agent",
  description: "official-shaped card",
  url: "https://agents.example/a2a",
  skills: [{ id: "research", name: "Research", tags: ["web"] }],
  capabilities: { streaming: true },
  preferredTransport: "JSONRPC",
  additionalInterfaces: [
    { url: "https://agents.example/a2a", transport: "JSONRPC" },
  ],
  "x-vendor": { mode: "safe" },
};
const agent = {
  component_type: "Agent" as const,
  id: "agent-1",
  name: "Planner",
  agentspec_version: ORACLE_AGENT_SPEC_RELEASE,
  description: "Agent Spec 25.4.1 fixture",
  system_prompt: "Plan carefully.",
  inputs: [],
  tools: [],
  llm_config: { $component_ref: "llm-1" },
  component_plugin_name: "AgentPlugin",
  component_plugin_version: "25.4.0.dev0",
};
const flow = {
  component_type: "Flow" as const,
  id: "flow-1",
  name: "Delivery",
  agentspec_version: ORACLE_AGENT_SPEC_RELEASE,
  start_node: { $component_ref: "start" },
  nodes: [{ component_type: "StartNode", id: "start", name: "Start" }],
  edges: [],
};

describe("R13 native discovery and identity separation", () => {
  test("preserves every card field but creates no actor or authority", async () => {
    const x = await discoverA2ACard(
      "https://agents.example/.well-known/agent-card.json",
      transport(card),
      policy,
    );
    expect(x).toMatchObject({
      trusted: false,
      authorityGranted: false,
      name: card.name,
      capabilities: card.capabilities,
      description: card.description,
      preferredTransport: "JSONRPC",
      additionalInterfaces: card.additionalInterfaces,
      extensions: { "x-vendor": card["x-vendor"] },
    });
    expect(x.source).toEqual(card);
    expect(
      new Set([
        x.cardId,
        x.endpointId,
        projectA2ATask({ id: "t", status: { state: "working" } }).taskId,
        projectA2ATask({ id: "t", status: { state: "working" } }).workId,
      ]).size,
    ).toBe(4);
  });
  test("uses connection-bound public resolution and rejects SSRF ranges/redirect/media", async () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "100.64.0.1",
      "169.254.1.1",
      "172.16.0.1",
      "192.168.1.1",
      "192.0.2.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "::1",
      "fc00::1",
      "2001:db8::1",
    ])
      await expect(
        discoverA2ACard(
          "https://agents.example/.well-known/agent-card.json",
          transport(card, { resolved: [address] }),
          policy,
        ),
      ).rejects.toThrow(/global/i);
    await expect(
      discoverA2ACard(
        "https://agents.example/.well-known/agent-card.json",
        transport(card, { resolved: ["8.8.8.8"], address: "1.1.1.1" }),
        policy,
      ),
    ).rejects.toThrow();
    await expect(
      discoverA2ACard(
        "https://agents.example/.well-known/agent-card.json",
        transport(card, { finalUrl: "https://agents.example/elsewhere" }),
        policy,
      ),
    ).rejects.toThrow(/redirect/i);
    await expect(
      discoverA2ACard(
        "https://agents.example/.well-known/agent-card.json",
        transport(card, { contentType: "text/html" }),
        policy,
      ),
    ).rejects.toThrow(/media/i);
  });
});

describe("R13 complete A2A mappings", () => {
  test("exactly preserves text/file/data, nested and top-level extensions", () => {
    const message = {
        kind: "message",
        messageId: "m",
        role: "agent",
        parts: [
          { kind: "text", text: "ok", "x-part": 1 },
          {
            kind: "file",
            file: { uri: "https://agents.example/f", "x-file": 2 },
          },
          { kind: "data", data: { x: 1 } },
        ],
        "x-message": 3,
      },
      m = mapA2AMessage(message, policy);
    expect(m.value.parts[0]!.extensions).toEqual({ "x-part": 1 });
    expect(m.value.parts[1]!.kind).toBe("file");
    if (m.value.parts[1]!.kind === "file")
      expect(m.value.parts[1]!.file.extensions).toEqual({ "x-file": 2 });
    expect(m.value.extensions).toEqual({ "x-message": 3 });
    expect(verifyExactA2ARoundTrip(message, m)).toBe(true);
    expect(exportExactA2A(m)).toEqual(message);
    const a = {
      artifactId: "a",
      parts: [{ kind: "data", data: true }],
      "x-artifact": 1,
    };
    expect(mapA2AArtifact(a, policy).value.extensions).toEqual({
      "x-artifact": 1,
    });
  });
  test("retains complete native status and task extensions with explicit state relation", () => {
    const status = {
        state: "input-required",
        timestamp: "2026-01-01T00:00:00Z",
        message: { kind: "message", messageId: "s", role: "agent", parts: [] },
        "x-status": true,
      },
      x = projectA2ATask(
        {
          id: "t",
          contextId: "c",
          status,
          history: [],
          artifacts: [],
          metadata: { priority: 1 },
          "x-task": 1,
        },
        policy,
      );
    expect(x).toMatchObject({
      mappingVersion: "open-autonomy.a2a-task-map.v1",
      state: "blocked",
      condition: "awaiting-input",
      status,
      extensions: { "x-task": 1 },
      metadata: { priority: 1 },
      losses: [],
    });
    expect(
      projectA2ATask({ id: "t", status: { state: "future" } }),
    ).toMatchObject({
      state: "blocked",
      losses: [{ code: "A2A_TASK_STATE_UNSUPPORTED" }],
    });
    expect(() =>
      projectA2ATask({ id: "t", status: { state: "working" }, history: {} }),
    ).toThrow(/history/);
    expect(() =>
      projectA2ATask({ id: "t", status: { state: "working" }, artifacts: {} }),
    ).toThrow(/artifacts/);
  });
  test("stream validation is non-poisoning, binds task/context, and final is strict", () => {
    const s = new A2AStreamProjection();
    expect(() =>
      s.accept({
        kind: "message",
        messageId: "m",
        role: "agent",
        parts: [],
        taskId: "t",
      }),
    ).toThrow(/contextId/);
    expect(
      s.accept({
        kind: "message",
        messageId: "m",
        role: "agent",
        parts: [],
        taskId: "t",
        contextId: "c",
      }),
    ).toMatchObject({ taskId: "t" });
    expect(() =>
      s.accept({
        kind: "message",
        messageId: "m2",
        role: "agent",
        parts: [],
        taskId: "other",
        contextId: "c",
      }),
    ).toThrow(/identity/);
    expect(() =>
      s.accept({
        kind: "message",
        messageId: "m3",
        role: "agent",
        parts: [],
        taskId: "t",
        contextId: "other",
      }),
    ).toThrow(/context/);
    expect(() =>
      s.accept({
        kind: "message",
        messageId: "m4",
        role: "agent",
        parts: [],
        taskId: "t",
        final: false,
      }),
    ).toThrow(/only valid/);
    expect(
      s.accept({
        kind: "artifact-update",
        taskId: "t",
        contextId: "c",
        artifact: { artifactId: "a", parts: [{ kind: "data", data: 1 }] },
        append: true,
        lastChunk: true,
      }).value,
    ).toMatchObject({ artifactId: "a" });
    expect(
      s.accept({
        kind: "status-update",
        taskId: "t",
        contextId: "c",
        final: true,
        status: { state: "completed" },
      }).final,
    ).toBe(true);
    expect(() =>
      s.accept({
        kind: "message",
        messageId: "late",
        role: "agent",
        parts: [],
        taskId: "t",
        contextId: "c",
      }),
    ).toThrow(/finality/);
  });
  test("cancellation retains extensions and closes states", () => {
    expect(
      mapA2ACancellation({
        jsonrpc: "2.0",
        id: 1,
        method: "tasks/cancel",
        params: { id: "t", metadata: { reason: "user" }, "x-cancel": 1 },
      }),
    ).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "tasks/cancel",
      params: {
        id: "t",
        metadata: { reason: "user" },
        extensions: { "x-cancel": 1 },
      },
    });
    expect(
      mapA2ACancellation({
        jsonrpc: "2.0",
        id: 1,
        result: {
          id: "t",
          contextId: "c",
          status: { state: "canceled" },
          history: [],
          artifacts: [],
        },
      }),
    ).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: expect.objectContaining({
        state: "cancelled",
        taskId: "a2a-task:t",
      }),
    });
    expect(() =>
      mapA2ACancellation({
        jsonrpc: "2.0",
        id: 1,
        method: "other",
        params: { id: "t" },
      }),
    ).toThrow(/method/);
  });
});

describe("R13 Oracle Agent Spec 25.4.1 exact subset", () => {
  test("imports official-shaped Agent and Flow components exactly and rejects other releases/types", () => {
    for (const source of [agent, flow]) {
      const x = importOracleAgentSpec(source);
      expect(x.release).toBe("25.4.1");
      expect(x.trusted).toBe(false);
      expect(x.authorityGranted).toBe(false);
      expect(verifyExactAgentSpecRoundTrip(source, x)).toBe(true);
      expect(exportOracleAgentSpec(x)).toEqual(source);
    }
    expect(() =>
      importOracleAgentSpec({ ...agent, agentspec_version: "25.4.0" }),
    ).toThrow(/release/);
    expect(() =>
      importOracleAgentSpec({ ...agent, component_type: "Mystery" }),
    ).toThrow(/supported/);
  });
  test("reports nested lifecycle, authority, and governance losses and refuses exact export", () => {
    const x = importOracleAgentSpec({
      ...agent,
      tools: [
        {
          authority: { admin: true },
          governance: { selfApprove: true },
          config: { lifecycle: "eternal" },
        },
      ],
    });
    expect(x.losses.map((v) => v.path).sort()).toEqual([
      "tools.0.authority",
      "tools.0.config.lifecycle",
      "tools.0.governance",
    ]);
    expect(
      x.fieldDispositions.find((v) => v.path === "tools.0.authority")
        ?.disposition,
    ).toBe("typed-loss");
    expect(() => exportOracleAgentSpec(x)).toThrow(/lossy/);
  });
  test("requires externally signed lift and keeps actor/component/behavior namespaces distinct", () => {
    const keys = generateKeyPairSync("ed25519"),
      candidate = importOracleAgentSpec(agent),
      base = {
        tenant: "acme",
        organization: "org",
        specDigest: `sha256:${Bun.SHA256.hash(canonicalSemanticJson(agent), "hex")}`,
        actorId: "planner",
        capabilities: ["tasks:read"],
        signer: "owner",
        algorithm: "Ed25519",
      },
      statementDigest = agentSpecActorAuthorizationDigest(base),
      auth = {
        ...base,
        statementDigest,
        signature: sign(
          null,
          Buffer.from(statementDigest),
          keys.privateKey,
        ).toString("base64"),
      },
      trust = {
        verify: (v: typeof auth) =>
          verify(
            null,
            Buffer.from(v.statementDigest),
            keys.publicKey,
            Buffer.from(v.signature, "base64"),
          ),
      },
      actor = authorizeAgentSpecActor(candidate, auth, trust);
    expect(
      new Set([actor.actorId, actor.componentId, candidate.behaviorId]).size,
    ).toBe(3);
    expect(actor.actorId).toBe("org-actor:planner");
    expect(() =>
      authorizeAgentSpecActor(candidate, { ...auth, actorId: agent.id }, trust),
    ).toThrow();
  });
  test("has a total per-field disposition ledger and validates Flow graph references", () => {
    const candidate = importOracleAgentSpec({
        ...agent,
        "x-vendor": { mode: "kept" },
      }),
      paths = candidate.fieldDispositions.map((x) => x.path);
    for (const path of Object.keys({ ...agent, "x-vendor": { mode: "kept" } }))
      expect(paths).toContain(path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain("llm_config.$component_ref");
    expect(
      candidate.fieldDispositions.find((x) => x.path === "system_prompt")
        ?.disposition,
    ).toBe("mapped");
    expect(
      candidate.fieldDispositions.find((x) => x.path === "x-vendor")
        ?.disposition,
    ).toBe("retained-extension");
    const graph = {
      ...flow,
      nodes: [
        { component_type: "StartNode", id: "start", name: "Start" },
        { component_type: "EndNode", id: "end", name: "End" },
      ],
      edges: [
        {
          from_node: { $component_ref: "start" },
          to_node: { $component_ref: "end" },
        },
      ],
    };
    expect(
      verifyExactAgentSpecRoundTrip(graph, importOracleAgentSpec(graph)),
    ).toBe(true);
    expect(() =>
      importOracleAgentSpec({
        ...graph,
        start_node: { $component_ref: "missing" },
      }),
    ).toThrow(/unresolved/);
    expect(() =>
      importOracleAgentSpec({
        ...graph,
        edges: [
          {
            from_node: { $component_ref: "start" },
            to_node: { $component_ref: "missing" },
          },
        ],
      }),
    ).toThrow(/unresolved/);
    expect(() =>
      importOracleAgentSpec({
        ...graph,
        nodes: [
          structuredClone(graph.nodes[0]),
          structuredClone(graph.nodes[0]),
        ],
      }),
    ).toThrow(/unique/);
  });
});

describe("R13 independent pinned wire compatibility", () => {
  test("round trips the official A2A 0.3.0 file-with-bytes and stream fixture shapes", () => {
    // Shapes copied from the pinned A2A 0.3.0 Part and streaming result definitions, not generated by this adapter.
    const message = {
        kind: "message",
        messageId: "msg-1",
        role: "agent",
        taskId: "task-1",
        contextId: "ctx-1",
        parts: [
          {
            kind: "file",
            file: {
              name: "proof.txt",
              mimeType: "text/plain",
              bytes: Buffer.from("proof").toString("base64"),
            },
          },
        ],
      },
      mapped = mapA2AMessage(message, policy);
    expect(mapped.value.parts[0]).toMatchObject({
      kind: "file",
      file: { bytes: "cHJvb2Y=" },
    });
    expect(verifyExactA2ARoundTrip(message, mapped)).toBe(true);
    const stream = new A2AStreamProjection();
    expect(
      stream.accept({
        kind: "artifact-update",
        taskId: "task-1",
        contextId: "ctx-1",
        artifact: {
          artifactId: "artifact-1",
          parts: [{ kind: "text", text: "partial" }],
        },
        append: true,
        lastChunk: false,
      }),
    ).toMatchObject({
      kind: "artifact-update",
      append: true,
      lastChunk: false,
    });
    expect(
      stream.accept({
        kind: "status-update",
        taskId: "task-1",
        contextId: "ctx-1",
        status: { state: "completed" },
        final: true,
      }).final,
    ).toBe(true);
  });
  test("interoperates with an independent raw JSON-RPC tasks/cancel process", async () => {
    const code = `let b='';for await(const c of Bun.stdin.stream()){b+=new TextDecoder().decode(c,{stream:true});const i=b.indexOf('\\n');if(i>=0){const q=JSON.parse(b.slice(0,i));if(q.jsonrpc==='2.0'&&q.method==='tasks/cancel')console.log(JSON.stringify({jsonrpc:'2.0',id:q.id,result:{kind:'task',id:q.params.id,contextId:'ctx',status:{state:'canceled'},history:[],artifacts:[]}}));}}`;
    const proc = Bun.spawn({
        cmd: [process.execPath, "-e", code],
        stdin: "pipe",
        stdout: "pipe",
      }),
      request = {
        jsonrpc: "2.0",
        id: 9,
        method: "tasks/cancel",
        params: { id: "task-9" },
      };
    proc.stdin.write(`${JSON.stringify(request)}\n`);
    proc.stdin.end();
    const response = JSON.parse(await new Response(proc.stdout).text());
    await proc.exited;
    expect(mapA2ACancellation(request)).toMatchObject({
      method: "tasks/cancel",
      params: { id: "task-9" },
    });
    expect(mapA2ACancellation(response)).toMatchObject({
      id: 9,
      result: { state: "cancelled", taskId: "a2a-task:task-9" },
    });
  });
});

describe("R13 hostile schema and dereference boundaries", () => {
  test('rejects ambiguous RPC, identity drift, closed artifact updates, and expanded mapped-loopback resolution',async()=>{
    expect(()=>mapA2ACancellation({jsonrpc:'2.0',id:1,method:'tasks/cancel',params:{id:'t'},result:{}})).toThrow(/exactly one/);expect(()=>mapA2ACancellation({jsonrpc:'2.0',id:Infinity,method:'tasks/cancel',params:{id:'t'}})).toThrow(/identity|finite|canonical/);
    expect(()=>projectA2ATask({id:'t',contextId:'c',status:{state:'working'},history:[{kind:'message',messageId:'m',role:'agent',parts:[],taskId:'other',contextId:'c'}]})).toThrow(/task identity/);expect(()=>projectA2ATask({id:'t',contextId:'c',status:{state:'working'},history:[{kind:'message',messageId:'m',role:'agent',parts:[],taskId:'t',contextId:'other'}]})).toThrow(/context identity/);
    const stream=new A2AStreamProjection(),chunk={kind:'artifact-update',taskId:'t',contextId:'c',artifact:{artifactId:'a',parts:[{kind:'text',text:'x'}]},append:true,lastChunk:true};stream.accept(chunk);expect(()=>stream.accept({...chunk,lastChunk:false})).toThrow(/last chunk/);
    await expect(discoverA2ACard('https://agents.example/.well-known/agent-card.json',transport(card,{resolved:['0:0:0:0:0:ffff:7f00:1']}),policy)).rejects.toThrow(/global/);
  });
  test('retains fields from inactive part union branches instead of silently claiming exact losslessness',()=>{const mapped=mapA2AMessage({kind:'message',messageId:'m',role:'user',parts:[{kind:'text',text:'hello',file:{vendor:true},data:{also:'vendor'}}]});expect(mapped.value.parts[0]?.extensions).toEqual({file:{vendor:true},data:{also:'vendor'}});expect(mapped.exact).toBe(true)});
  test("enforces byte/depth/node/item/string before canonical hashing and decoded byte size", () => {
    const limits = { ...policy, maxItems: 2 };
    expect(() =>
      mapA2AMessage(
        {
          kind: "message",
          messageId: "m",
          role: "user",
          parts: [],
          a: 1,
          b: 2,
          c: 3,
        },
        limits,
      ),
    ).toThrow(/item/);
    expect(() =>
      importOracleAgentSpec({ ...agent, name: "x".repeat(300) }, policy),
    ).toThrow(/string/);
    let deep: unknown = {};
    for (let i = 0; i < 20; i++) deep = { x: deep };
    expect(() => importOracleAgentSpec(deep, policy)).toThrow(/depth/);
    const b64 = Buffer.alloc(5000).toString("base64");
    expect(() =>
      mapA2AMessage(
        {
          kind: "message",
          messageId: "m",
          role: "user",
          parts: [{ kind: "file", file: { bytes: b64 } }],
        },
        policy,
      ),
    ).toThrow(/byte|string/);
  });
  test("revalidates URI, connection binding, size, redirect, and content type at dereference", async () => {
    expect(() =>
      mapA2AMessage(
        {
          kind: "message",
          messageId: "m",
          role: "user",
          parts: [{ kind: "file", file: { uri: "http://169.254.169.254/x" } }],
        },
        policy,
      ),
    ).toThrow();
    const m = mapA2AMessage(
        {
          kind: "message",
          messageId: "m",
          role: "user",
          parts: [
            {
              kind: "file",
              file: {
                uri: "https://agents.example/.well-known/agent-card.json",
              },
            },
          ],
        },
        policy,
      ),
      part = m.value.parts[0]!;
    if (part.kind !== "file") throw new Error("fixture");
    await expect(
      dereferenceA2AFilePart(
        part,
        transport({}, { resolved: ["10.0.0.1"] }),
        policy,
      ),
    ).rejects.toThrow(/global/);
    await expect(
      dereferenceA2AFilePart(
        part,
        transport({}, { contentType: "text/html" }),
        policy,
      ),
    ).rejects.toThrow(/media/);
  });
});
