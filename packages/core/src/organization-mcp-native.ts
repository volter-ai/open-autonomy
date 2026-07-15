import { canonicalSemanticJson } from "./organization-canonical";
import {createHash} from "node:crypto";

export const MCP_PROTOCOL_REVISION = "2025-06-18" as const;
export const MCP_OFFICIAL_SCHEMA_PROVENANCE={url:"https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/refs/tags/2025-06-18/schema/2025-06-18/schema.json",sha256:"05020a692319467847cdb1794b1306567f52860353b5ff2f2bc2b0140819305b"} as const;
export function verifyMcpOfficialSchemaArtifact(bytes:Uint8Array){const digest=createHash('sha256').update(bytes).digest('hex');if(digest!==MCP_OFFICIAL_SCHEMA_PROVENANCE.sha256)throw new Error('MCP official schema artifact provenance mismatch');const value=JSON.parse(decoder.decode(bytes));if(!plain(value)||!plain(value.definitions))throw new Error('MCP official schema artifact malformed');return{digest,url:MCP_OFFICIAL_SCHEMA_PROVENANCE.url}}
export type McpTransport = "stdio" | "streamable-http";
export type JsonRpcId = string | number;
export interface McpLimits {
  maxMessageBytes: number;
  maxSchemaBytes: number;
  maxItems: number;
  maxStringBytes: number;
}
export interface McpPeer {
  origin: string;
  authBinding: string;
  transport: McpTransport;
}
export interface McpNetworkVerifier {
  resolve(origin: string): string[];
  verifyPublic(origin: string, addresses: string[]): boolean;
}
export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}
export interface McpResource {
  uri: string;
  name: string;
  mimeType?: string;
  description?: string;
  _meta?: Record<string, unknown>;
}
export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
  _meta?: Record<string, unknown>;
}
export interface McpDiscovery {
  peer: McpPeer;
  limits: McpLimits;
  verifiedAddresses: string[];
  tools: McpTool[];
  resources: McpResource[];
  prompts: McpPrompt[];
  discoveredAt: string;
}
export interface McpExecutionContext {
  tenant: string;
  deployment: string;
  actor: string;
  attempt: string;
}
export interface McpCapabilityGrant extends McpExecutionContext {
  grantId: string;
  expiresAt: string;
  peerOrigin: string;
  authBinding: string;
  tools: string[];
  toolEffects: Record<string, string[]>;
  resourcePrefixes: string[];
  prompts: string[];
  effects: string[];
  signature: string;
}
export interface McpGrantVerifier {
  now(): Date;
  verify(grant: McpCapabilityGrant, context: McpExecutionContext): boolean;
}
export interface McpLoss {
  code: "unsupported-construct" | "unsupported-field" | "trust-not-conferred";
  path: string;
  explanation: string;
}
export interface McpMapping<T> {
  value?: T;
  losses: McpLoss[];
  exact: boolean;
}
export type JsonRpcMessage = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

const utf8 = new TextEncoder(),
  decoder = new TextDecoder("utf-8", { fatal: true });
const size = (v: unknown) => utf8.encode(canonicalSemanticJson(v)).byteLength,
  clone = <T>(v: T): T => structuredClone(v);
const plain = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
function bounded(
  value: unknown,
  limits: McpLimits,
  path = "message",
  seen = new Set<object>(),
  state = { nodes: 0 },
  depth = 0,
): void {
  if (depth > limits.maxItems || ++state.nodes > limits.maxItems)
    throw new Error(`${path} graph limit exceeded`);
  if (
    typeof value === "string" &&
    utf8.encode(value).byteLength > limits.maxStringBytes
  )
    throw new Error(`${path} string limit exceeded`);
  if (value && typeof value === "object") {
    if (seen.has(value)) throw new Error(`${path} contains cycle`);
    seen.add(value);
    const entries = Array.isArray(value)
      ? value.map((x, i) => [String(i), x] as const)
      : Object.entries(value);
    if (entries.length > limits.maxItems)
      throw new Error(`${path} item limit exceeded`);
    for (const [k, item] of entries) {
      if (["__proto__", "prototype", "constructor"].includes(k))
        throw new Error(`${path} unsafe key`);
      bounded(item, limits, `${path}.${k}`, seen, state, depth + 1);
    }
    seen.delete(value);
  }
}
function boundedMessage(value: unknown, limits: McpLimits, path: string) {
  bounded(value, limits, path);
  if (size(value) > limits.maxMessageBytes)
    throw new Error(`${path} message limit exceeded`);
}
function requireMeta(owner: Record<string, unknown>, path: string) {
  if ("_meta" in owner && !plain(owner._meta))
    throw new Error(`${path}._meta must be an object`);
}
function validateMetaTree(value: unknown, path: string): void {
  if (!value || typeof value !== "object") return;
  if (plain(value)) requireMeta(value, path);
  for (const [key, child] of Object.entries(value))
    validateMetaTree(child, `${path}.${key}`);
}

const schemaKeys = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "description",
  "title",
  "default",
]);
function schemaLosses(schema: unknown, path = "schema"): McpLoss[] {
  if (!plain(schema))
    return [
      {
        code: "unsupported-field",
        path,
        explanation: "schema must be an object",
      },
    ];
  const losses: McpLoss[] = [];
  for (const key of Object.keys(schema))
    if (!schemaKeys.has(key))
      losses.push({
        code: "unsupported-field",
        path: `${path}.${key}`,
        explanation: `JSON Schema keyword '${key}' is outside the declared validator subset`,
      });
  if (plain(schema.properties))
    for (const [k, v] of Object.entries(schema.properties))
      losses.push(...schemaLosses(v, `${path}.properties.${k}`));
  if (plain(schema.items))
    losses.push(...schemaLosses(schema.items, `${path}.items`));
  return losses;
}
function validateSchema(
  schema: unknown,
  limits: McpLimits,
  path: string,
): asserts schema is Record<string, unknown> {
  if (!plain(schema))
    throw new Error(`${path} schema invalid or exceeds limit`);
  bounded(schema, limits, path);
  if (size(schema) > limits.maxSchemaBytes)
    throw new Error(`${path} schema invalid or exceeds limit`);
  const losses = schemaLosses(schema, path);
  if (losses.length)
    throw new Error(`${losses[0]!.path} unsupported schema keyword`);
  if (
    schema.type !== undefined &&
    ![
      "object",
      "array",
      "string",
      "number",
      "integer",
      "boolean",
      "null",
    ].includes(String(schema.type))
  )
    throw new Error(`${path} unsupported schema type`);
  if(schema.properties!==undefined&&!plain(schema.properties))throw new Error(`${path}.properties must be object`);
  if(schema.required!==undefined&&(!Array.isArray(schema.required)||schema.required.some(x=>typeof x!=="string")))throw new Error(`${path}.required must be string array`);
  if(schema.items!==undefined&&!plain(schema.items))throw new Error(`${path}.items must be one schema object`);
  if(schema.additionalProperties!==undefined&&typeof schema.additionalProperties!=="boolean")throw new Error(`${path}.additionalProperties must be boolean`);
  if (
    Array.isArray(schema.required) &&
    (!plain(schema.properties) ||
      schema.required.some(
        (x) =>
          typeof x !== "string" ||
          !(x in (schema.properties as Record<string, unknown>)),
      ))
  )
    throw new Error(`${path}.required must name declared properties`);
  for (const [lo, hi] of [
    ["minimum", "maximum"],
    ["minLength", "maxLength"],
    ["minItems", "maxItems"],
  ] as const) {
    if (schema[lo] !== undefined && !Number.isFinite(schema[lo]))
      throw new Error(`${path}.${lo} invalid`);
    if (schema[hi] !== undefined && !Number.isFinite(schema[hi]))
      throw new Error(`${path}.${hi} invalid`);
    if (
      (lo === "minLength" || lo === "minItems") &&
      ((schema[lo] !== undefined && Number(schema[lo]) < 0) ||
        (schema[hi] !== undefined && Number(schema[hi]) < 0))
    )
      throw new Error(`${path}.${lo}/${hi} invalid`);
    if((lo==='minLength'||lo==='minItems')&&((schema[lo]!==undefined&&!Number.isSafeInteger(schema[lo]))||(schema[hi]!==undefined&&!Number.isSafeInteger(schema[hi]))))throw new Error(`${path}.${lo}/${hi} must be safe integers`);
    if (
      schema[lo] !== undefined &&
      schema[hi] !== undefined &&
      Number(schema[lo]) > Number(schema[hi])
    )
      throw new Error(`${path} contradictory ${lo}/${hi}`);
  }
  if (Array.isArray(schema.enum) && schema.enum.length === 0)
    throw new Error(`${path}.enum must be nonempty`);
}
function validateAgainst(
  schema: Record<string, unknown>,
  value: unknown,
  path = "value",
): void {
  const type = schema.type;
  if (type === "object") {
    if (!plain(value)) throw new Error(`${path} must be object`);
    const props = plain(schema.properties) ? schema.properties : {};
    for (const r of Array.isArray(schema.required) ? schema.required : [])
      if (typeof r === "string" && !(r in value))
        throw new Error(`${path}.${r} required`);
    if (schema.additionalProperties === false)
      for (const k of Object.keys(value))
        if (!(k in props)) throw new Error(`${path}.${k} not declared`);
    for (const [k, s] of Object.entries(props))
      if (k in value && plain(s)) validateAgainst(s, value[k], `${path}.${k}`);
  } else if (type === "array") {
    if (!Array.isArray(value)) throw new Error(`${path} must be array`);
    if (typeof schema.minItems === "number" && value.length < schema.minItems)
      throw new Error(`${path} too short`);
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems)
      throw new Error(`${path} too long`);
    if (plain(schema.items))
      value.forEach((v, i) =>
        validateAgainst(
          schema.items as Record<string, unknown>,
          v,
          `${path}.${i}`,
        ),
      );
  } else if (type === "string") {
    if (typeof value !== "string") throw new Error(`${path} must be string`);
    if (typeof schema.minLength === "number" && value.length < schema.minLength)
      throw new Error(`${path} too short`);
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength)
      throw new Error(`${path} too long`);
    if (
      schema.pattern !== undefined &&
      !new RegExp(String(schema.pattern)).test(value)
    )
      throw new Error(`${path} pattern mismatch`);
  } else if (
    type === "number" &&
    !(typeof value === "number" && Number.isFinite(value))
  )
    throw new Error(`${path} must be finite number`);
  else if (
    type === "integer" &&
    !(typeof value === "number" && Number.isSafeInteger(value))
  )
    throw new Error(`${path} must be integer`);
  else if (type === "boolean" && typeof value !== "boolean")
    throw new Error(`${path} must be boolean`);
  else if (type === "null" && value !== null)
    throw new Error(`${path} must be null`);
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some(
      (x) => canonicalSemanticJson(x) === canonicalSemanticJson(value),
    )
  )
    throw new Error(`${path} not in enum`);
  if (
    "const" in schema &&
    canonicalSemanticJson(schema.const) !== canonicalSemanticJson(value)
  )
    throw new Error(`${path} differs from const`);
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum)
      throw new Error(`${path} below minimum`);
    if (typeof schema.maximum === "number" && value > schema.maximum)
      throw new Error(`${path} above maximum`);
  }
}

function validateCapabilities(value: unknown, path: "client"|"server") {
  if (!plain(value)) throw new Error(`${path} capabilities must be object`);
  const directional=path==='client'?new Set(['roots','sampling','elicitation']):new Set(['tools','resources','prompts','logging','completions']),fields:Record<string,Set<string>>={tools:new Set(['listChanged']),resources:new Set(['subscribe','listChanged']),prompts:new Set(['listChanged']),roots:new Set(['listChanged']),sampling:new Set(),elicitation:new Set(),logging:new Set(),completions:new Set()};
  for(const name of Object.keys(value)){if(name==='experimental')continue;if(!directional.has(name))throw new Error(`${path}.${name} capability is unsupported or wrong-direction`);}
  for (const name of directional)
    if (name in value) {
      const cap = value[name];
      if (!plain(cap))
        throw new Error(`${path}.${name} capability must be object`);
      for (const [key, setting] of Object.entries(cap))
        if (!fields[name]?.has(key)||typeof setting !== "boolean")
          throw new Error(`${path}.${name}.${key} capability shape invalid`);
    }
}
export function negotiateMcpInitialize(
  request: {
    protocolVersion: string;
    capabilities: Record<string, unknown>;
    clientInfo: { name: string; version: string };
  },
  server: {
    protocolVersion: string;
    name: string;
    version: string;
    capabilities: Record<string, unknown>;
  },
) {
  if (
    request.protocolVersion !== MCP_PROTOCOL_REVISION ||
    server.protocolVersion !== MCP_PROTOCOL_REVISION
  )
    throw new Error("MCP downgrade or unsupported revision");
  if (
    !request.clientInfo?.name ||
    !request.clientInfo.version ||
    !server.name ||
    !server.version
  )
    throw new Error("invalid native MCP initialize payload");
  validateCapabilities(request.capabilities, "client");
  validateCapabilities(server.capabilities, "server");
  return {
    protocolVersion: MCP_PROTOCOL_REVISION,
    capabilities: clone(server.capabilities),
    serverInfo: { name: server.name, version: server.version },
  };
}
export function validateJsonRpc(
  value: unknown,
  limits: McpLimits,
): asserts value is JsonRpcMessage {
  if (!plain(value) || value.jsonrpc !== "2.0")
    throw new Error("invalid JSON-RPC 2.0 envelope");
  bounded(value, limits);
  validateMetaTree(value, "message");
  if (size(value) > limits.maxMessageBytes)
    throw new Error("MCP message limit exceeded");
  const hm = typeof value.method === "string" && value.method.length > 0,
    hr = "result" in value,
    he = "error" in value;
  if (Number(hm) + Number(hr) + Number(he) !== 1)
    throw new Error("JSON-RPC requires exactly one method, result, or error");
  const envelopeKeys=new Set(hm?['jsonrpc','id','method','params']:hr?['jsonrpc','id','result']:['jsonrpc','id','error']);for(const key of Object.keys(value))if(!envelopeKeys.has(key))throw new Error(`JSON-RPC envelope member '${key}' unsupported`);
  if (
    "id" in value &&
    !(
      typeof value.id === "string" ||
      (typeof value.id === "number" && Number.isFinite(value.id))
    )
  )
    throw new Error("invalid JSON-RPC id");
  if ((hr || he) && !("id" in value)) throw new Error("response requires id");
  if (
    he &&
    (!plain(value.error) ||
      !Number.isInteger(value.error.code) ||
      typeof value.error.message !== "string")
  )
    throw new Error("invalid JSON-RPC error");
  if(he)for(const key of Object.keys(value.error as Record<string,unknown>))if(!['code','message','data'].includes(key))throw new Error(`JSON-RPC error member '${key}' unsupported`);
}
function strictObject(v:unknown,path:string,allowed:string[]){if(!plain(v))throw new Error(`${path} must be object`);for(const k of Object.keys(v))if(!allowed.includes(k))throw new Error(`${path}.${k} unsupported`);return v}
function validateMethod(method:string,params:unknown,path='params'){
  const p=params===undefined?{}:strictObject(params,path,method==='tools/call'?['name','arguments','_meta']:method==='resources/read'?['uri','_meta']:method==='prompts/get'?['name','arguments','_meta']:method==='completion/complete'?['ref','argument','context','_meta']:method==='logging/setLevel'?['level','_meta']:method==='notifications/cancelled'?['requestId','reason']:method==='notifications/progress'?['progressToken','progress','total','message']:['cursor','_meta']);
  if(method==='tools/call'&&(typeof p.name!=='string'||p.arguments!==undefined&&!plain(p.arguments)))throw new Error('tools/call params invalid');
  if(method==='resources/read'&&typeof p.uri!=='string')throw new Error('resources/read params invalid');
  if(method==='prompts/get'&&(typeof p.name!=='string'||(p.arguments!==undefined&&!plain(p.arguments))))throw new Error('prompts/get params invalid');
  if(method==='logging/setLevel'&&!['debug','info','notice','warning','error','critical','alert','emergency'].includes(String(p.level)))throw new Error('logging/setLevel params invalid');
  if(method==='notifications/cancelled'&&!(typeof p.requestId==='string'||typeof p.requestId==='number'&&Number.isFinite(p.requestId)))throw new Error('cancellation requestId invalid');
  if(method==='notifications/progress'&&(!(typeof p.progressToken==='string'||typeof p.progressToken==='number'&&Number.isFinite(p.progressToken))||!Number.isFinite(p.progress)||Number(p.progress)<0||p.total!==undefined&&(!Number.isFinite(p.total)||Number(p.total)<Number(p.progress))))throw new Error('progress params invalid');
  validateMetaTree(p,path);
}
function validateMethodResult(method:string,result:unknown){const r=strictObject(result,'result',method==='tools/list'?['tools','nextCursor','_meta']:method==='tools/call'?['content','structuredContent','isError','_meta']:method==='resources/list'?['resources','nextCursor','_meta']:method==='resources/templates/list'?['resourceTemplates','nextCursor','_meta']:method==='resources/read'?['contents','_meta']:method==='prompts/list'?['prompts','nextCursor','_meta']:method==='prompts/get'?['description','messages','_meta']:method==='completion/complete'?['completion','_meta']:method==='roots/list'?['roots','_meta']:method==='ping'?['_meta']:[]);const required:Record<string,string>={'tools/list':'tools','resources/list':'resources','resources/templates/list':'resourceTemplates','resources/read':'contents','prompts/list':'prompts','prompts/get':'messages','completion/complete':'completion','roots/list':'roots'};if(required[method]&&!Array.isArray(r[required[method]!])&&!(method==='completion/complete'&&plain(r.completion)))throw new Error(`${method} result shape invalid`);if(method==='tools/call'&&(!Array.isArray(r.content)||(r.structuredContent!==undefined&&!plain(r.structuredContent))||(r.isError!==undefined&&typeof r.isError!=='boolean')))throw new Error('tools/call result shape invalid');validateMetaTree(r,'result')}
export function encodeMcpStdio(message: JsonRpcMessage, limits: McpLimits) {
  validateJsonRpc(message, limits);
  const b = utf8.encode(`${JSON.stringify(message)}\n`);
  if (b.byteLength > limits.maxMessageBytes)
    throw new Error("MCP stdio message limit exceeded");
  return b;
}
export class McpStdioTransport {
  private buffer = new Uint8Array();
  constructor(readonly limits: McpLimits) {}
  push(chunk: Uint8Array): JsonRpcMessage[] {
    const merged = new Uint8Array(this.buffer.length + chunk.length);
    merged.set(this.buffer);
    merged.set(chunk, this.buffer.length);
    const frames: Uint8Array[] = [];
    let start = 0;
    for (let i = 0; i < merged.length; i++)
      if (merged[i] === 10) {
        frames.push(merged.slice(start, i));
        start = i + 1;
      }
    this.buffer = merged.slice(start);
    if (this.buffer.length > this.limits.maxMessageBytes)
      throw new Error("MCP stdio partial frame limit exceeded");
    return frames.map((frame) => {
      if (!frame.length) throw new Error("empty MCP stdio frame");
      if (frame.length > this.limits.maxMessageBytes)
        throw new Error("MCP stdio message limit exceeded");
      let v;
      try {
        v = JSON.parse(decoder.decode(frame));
      } catch {
        throw new Error("invalid MCP stdio JSON");
      }
      validateJsonRpc(v, this.limits);
      return v;
    });
  }
  finish() {
    if (this.buffer.length) throw new Error("MCP stdio truncated frame");
  }
}
export function decodeMcpStdio(bytes: Uint8Array, limits: McpLimits) {
  const t = new McpStdioTransport(limits),
    out = t.push(bytes);
  t.finish();
  return out;
}

function headersOf(h: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]),
  );
}
export function validateMcpHttpRequest(
  request: {
    method: string;
    headers: Record<string, string>;
    body: Uint8Array;
  },
  peer: McpPeer,
  limits: McpLimits,
  initialized = true,
): JsonRpcMessage {
  if (peer.transport !== "streamable-http" || request.method !== "POST")
    throw new Error("MCP streamable HTTP requires POST");
  const h = headersOf(request.headers);
  if (h.origin !== peer.origin || h.authorization !== peer.authBinding)
    throw new Error("MCP HTTP origin or auth binding mismatch");
  if (initialized && h["mcp-protocol-version"] !== MCP_PROTOCOL_REVISION)
    throw new Error("MCP protocol header mismatch");
  if (!h["content-type"]?.toLowerCase().startsWith("application/json"))
    throw new Error("MCP HTTP content type invalid");
  const accepts = (h.accept ?? "").split(",").map((x) => x.trim());
  if (
    !accepts.includes("application/json") ||
    !accepts.includes("text/event-stream")
  )
    throw new Error("MCP HTTP Accept invalid");
  if (request.body.byteLength > limits.maxMessageBytes)
    throw new Error("MCP HTTP message limit exceeded");
  let v;
  try {
    v = JSON.parse(decoder.decode(request.body));
  } catch {
    throw new Error("invalid MCP HTTP JSON");
  }
  validateJsonRpc(v, limits);
  return v;
}
export class McpStreamableHttpSession {
  private phase: "created" | "awaiting-initialized" | "ready" | "closed" =
    "created";
  private pending=new Map<JsonRpcId,{method:string}>();
  private outbound=new Map<JsonRpcId,{method:string;progressToken?:JsonRpcId;lastProgress?:number}>();
  constructor(
    readonly peer: McpPeer,
    readonly limits: McpLimits,
    readonly sessionId: string,
    readonly server = {
      protocolVersion: MCP_PROTOCOL_REVISION as string,
      name: "open-autonomy",
      version: "1",
      capabilities: {} as Record<string, unknown>,
    },
  ) {}
  private negotiated: Record<string, unknown> = {};
  private clientNegotiated:Record<string,unknown>={};
  private initializeResult:
    ReturnType<typeof negotiateMcpInitialize> | undefined;
  private authenticated(headers: Record<string, string>, session = true) {
    const h = headersOf(headers);
    if (
      h.origin !== this.peer.origin ||
      h.authorization !== this.peer.authBinding ||
      h["mcp-protocol-version"] !== MCP_PROTOCOL_REVISION ||
      (session && h["mcp-session-id"] !== this.sessionId)
    )
      throw new Error("MCP HTTP origin, auth, protocol, or session mismatch");
    return h;
  }
  post(request: {
    method: string;
    headers: Record<string, string>;
    body: Uint8Array;
  }) {
    if (this.phase === "closed") throw new Error("HTTP MCP session closed");
    const value = validateMcpHttpRequest(
      request,
      this.peer,
      this.limits,
      this.phase !== "created",
    );
    if (this.phase !== "created") this.authenticated(request.headers);
    if (this.phase === "created") {
      if (value.method !== "initialize")
        throw new Error("first MCP HTTP message must initialize");
      if (
        !plain(value.params) ||
        !plain(value.params.capabilities) ||
        !plain(value.params.clientInfo) ||
        typeof value.params.protocolVersion !== "string" ||
        typeof value.params.clientInfo.name !== "string" ||
        typeof value.params.clientInfo.version !== "string"
      )
        throw new Error("invalid MCP initialize params");
      this.initializeResult = negotiateMcpInitialize(
        value.params as any,
        this.server,
      );
      this.negotiated = clone(this.server.capabilities);
      this.clientNegotiated=clone(value.params.capabilities);
      this.phase = "awaiting-initialized";
    } else if (this.phase === "awaiting-initialized") {
      if (value.method !== "notifications/initialized" || "id" in value)
        throw new Error("MCP initialized notification required");
      if(value.params!==undefined&&(!plain(value.params)||Object.keys(value.params).some(k=>k!=='_meta')))throw new Error('MCP initialized notification params invalid');
      this.phase = "ready";
    } else if (
      value.method === "initialize" ||
      value.method === "notifications/initialized"
    )
      throw new Error("MCP lifecycle message repeated");
    else {
      if (!value.method){if(!("id" in value))throw new Error("unsolicited MCP response");const outbound=this.outbound.get(value.id!);if(!outbound)throw new Error("unsolicited MCP response");if('result'in value)validateMethodResult(outbound.method,value.result);this.outbound.delete(value.id!);return value}
      const allowed = new Set([
        "ping",
        "tools/list",
        "tools/call",
        "resources/list",
        "resources/read",
        "resources/templates/list",
        "prompts/list",
        "prompts/get",
        "completion/complete",
        "logging/setLevel",
        "notifications/cancelled",
        "notifications/progress",
      ]);
      if (!allowed.has(value.method))
        throw new Error("MCP method outside strict protocol state");
      validateMethod(value.method,value.params);
      const capability: Record<string, string | undefined> = {
        "tools/list": "tools",
        "tools/call": "tools",
        "resources/list": "resources",
        "resources/read": "resources",
        "resources/templates/list": "resources",
        "prompts/list": "prompts",
        "prompts/get": "prompts",
        "completion/complete": "completions",
        "logging/setLevel": "logging",
      };
      const cap = capability[value.method];
      if (cap && !(cap in this.negotiated))
        throw new Error(`MCP capability '${cap}' not negotiated`);
      if("id" in value){if(this.pending.has(value.id!)||this.pending.size>=this.limits.maxItems)throw new Error('duplicate or excessive HTTP MCP request id');this.pending.set(value.id!,{method:value.method})}
      if(value.method==='notifications/cancelled'){const id=(value.params as any).requestId;if(!this.pending.delete(id)&&!this.outbound.delete(id))throw new Error('HTTP cancellation does not name pending request')}
      if(value.method==='notifications/progress'){const p=value.params as any,item=[...this.outbound.values()].find(x=>x.progressToken===p.progressToken);if(!item||p.progress<= (item.lastProgress??-Infinity))throw new Error('HTTP progress token/order mismatch');item.lastProgress=p.progress}
    }
    return value;
  }
  negotiatedInitializeResult() {
    if (!this.initializeResult) throw new Error("MCP initialize not received");
    return clone(this.initializeResult);
  }
  respond(id:JsonRpcId){if(!this.pending.delete(id))throw new Error('HTTP response does not name pending request')}
  issueRequest(id:JsonRpcId,method:string,params?:unknown){if(this.phase!=="ready"||this.outbound.has(id)||this.outbound.size>=this.limits.maxItems||!(typeof id==='string'||typeof id==='number'&&Number.isFinite(id)))throw new Error('HTTP outbound request lifecycle invalid');if(method!=='roots/list'||!('roots'in this.clientNegotiated))throw new Error('HTTP outbound method unsupported or client capability not negotiated');validateMethod(method,params);const progressToken=plain(params)&&plain(params._meta)?params._meta.progressToken as JsonRpcId|undefined:undefined;if(progressToken!==undefined&&!(typeof progressToken==="string"||typeof progressToken==="number"&&Number.isFinite(progressToken)))throw new Error('HTTP progress token invalid');const message={jsonrpc:'2.0' as const,id,method,params};validateJsonRpc(message,this.limits);this.outbound.set(id,{method,progressToken});return message}
  responseDisposition(value: JsonRpcMessage) {
    validateJsonRpc(value, this.limits);
    return value.method && !("id" in value)
      ? { status: 202 as const, body: undefined }
      : { status: 200 as const, body: clone(value) };
  }
  get(headers: Record<string, string>) {
    const h = this.authenticated(headers);
    if (
      this.phase !== "ready" ||
      !h.accept
        ?.split(",")
        .map((x) => x.trim())
        .includes("text/event-stream")
    )
      throw new Error("invalid MCP SSE GET");
    return { contentType: "text/event-stream", sessionId: this.sessionId };
  }
  sse(message: JsonRpcMessage, id: string) {
    if (this.phase !== "ready") throw new Error("inactive MCP SSE");
    if (!id || /[\r\n\0]/.test(id)) throw new Error("unsafe MCP SSE event id");
    validateJsonRpc(message, this.limits);
    const data = JSON.stringify(message);
    if (/[\r\n]/.test(data)) throw new Error("unsafe MCP SSE data framing");
    return `id: ${id}\nevent: message\ndata: ${data}\n\n`;
  }
  delete(headers: Record<string, string>) {
    this.authenticated(headers);
    if (this.phase === "closed") throw new Error("HTTP MCP session closed");
    this.phase = "closed";
    return { status: 204 };
  }
}

function canonicalOrigin(value: string) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password)
    throw new Error("only credential-free https MCP resources are allowed");
  u.hash = "";
  return u.origin;
}
export function acceptMcpDiscovery(
  peer: McpPeer,
  payload: {
    tools?: McpTool[];
    resources?: McpResource[];
    prompts?: McpPrompt[];
  },
  limits: McpLimits,
  discoveredAt: string,
  network: McpNetworkVerifier,
): McpDiscovery {
  boundedMessage(payload,limits,"discovery payload");validateMetaTree(payload,"discovery payload");
  if (!Number.isFinite(Date.parse(discoveredAt)))
    throw new Error("invalid discovery time");
  canonicalOrigin(peer.origin);
  const addresses = network.resolve(peer.origin);
  if (!addresses.length || !network.verifyPublic(peer.origin, addresses))
    throw new Error(
      "MCP origin does not resolve to externally verified public addresses",
    );
  const tools = payload.tools ?? [],
    resources = payload.resources ?? [],
    prompts = payload.prompts ?? [];
  for (const [n, v] of [
    ["tools", tools],
    ["resources", resources],
    ["prompts", prompts],
  ] as const)
    if (v.length > limits.maxItems)
      throw new Error(`${n} discovery item limit exceeded`);
  if (
    new Set(tools.map((x) => x.name)).size !== tools.length ||
    new Set(resources.map((x) => x.uri)).size !== resources.length ||
    new Set(prompts.map((x) => x.name)).size !== prompts.length
  )
    throw new Error("duplicate MCP discovery identity");
  for (const t of tools) {
    bounded(t, limits, `tools.${t.name}`);
    validateMetaTree(t, `tools.${t.name}`);
    if (!t.name.trim()) throw new Error("tool name required");
    validateSchema(t.inputSchema, limits, `tools.${t.name}.inputSchema`);
    if (t.outputSchema)
      validateSchema(t.outputSchema, limits, `tools.${t.name}.outputSchema`);
  }
  for (const r of resources) {
    bounded(r, limits, `resources.${r.name}`);
    validateMetaTree(r, `resources.${r.name}`);
    if (
      !r.name.trim() ||
      canonicalOrigin(r.uri) !== canonicalOrigin(peer.origin)
    )
      throw new Error("resource origin/scheme prohibited");
  }
  for (const p of prompts) {
    bounded(p, limits, `prompts.${p.name}`);
    validateMetaTree(p, `prompts.${p.name}`);
    if (
      !p.name.trim() ||
      new Set((p.arguments ?? []).map((x) => x.name)).size !==
        (p.arguments ?? []).length
    )
      throw new Error("invalid prompt discovery");
  }
  return {
    peer: clone(peer),
    limits: clone(limits),
    verifiedAddresses: [...addresses].sort(),
    tools: clone(tools),
    resources: clone(resources),
    prompts: clone(prompts),
    discoveredAt,
  };
}
function verifyGrant(
  discovery: McpDiscovery,
  grant: McpCapabilityGrant,
  context: McpExecutionContext,
  verifier: McpGrantVerifier,
) {
  const expiry=Date.parse(grant.expiresAt);if (
    !verifier.verify(grant, context) ||
    !Number.isFinite(expiry)||expiry <= verifier.now().getTime() ||
    (["tenant", "deployment", "actor", "attempt"] as const).some(
      (k) => grant[k] !== context[k],
    )
  )
    throw new Error("MCP grant is invalid, expired, or execution-mismatched");
  if (
    grant.peerOrigin !== discovery.peer.origin ||
    grant.authBinding !== discovery.peer.authBinding
  )
    throw new Error("MCP grant origin or auth mismatch");
}
export function authorizeMcpToolCall(
  discovery: McpDiscovery,
  grant: McpCapabilityGrant,
  context: McpExecutionContext,
  verifier: McpGrantVerifier,
  request: { tool: string; arguments: unknown; effect: string },
) {
  verifyGrant(discovery, grant, context, verifier);
  if (
    !grant.tools.includes(request.tool) ||
    !grant.effects.includes(request.effect) ||
    !grant.toolEffects[request.tool]?.includes(request.effect)
  )
    throw new Error("MCP discovery does not confer tool authority");
  const tool = discovery.tools.find((x) => x.name === request.tool);
  if (!tool) throw new Error("tool not discovered");
  bounded(request.arguments, discovery.limits, "tool arguments");
  validateAgainst(tool.inputSchema, request.arguments);
  const message = {
    method: "tools/call" as const,
    params: { name: request.tool, arguments: clone(request.arguments) },
  };
  boundedMessage(message, discovery.limits, "tool call");
  return message;
}
export function validateMcpToolResult(
  discovery: McpDiscovery,
  toolName: string,
  result: unknown,
) {
  const tool = discovery.tools.find((x) => x.name === toolName);
  if (!tool?.outputSchema) throw new Error("no declared output schema");
  boundedMessage(result, discovery.limits, "tool result");
  validateAgainst(tool.outputSchema, result, "output");
  return clone(result);
}
function prefixAllows(prefix: string, uri: string) {
  const p = new URL(prefix),
    u = new URL(uri);
  if (p.origin !== u.origin) return false;
  const base = p.pathname.endsWith("/") ? p.pathname : `${p.pathname}/`;
  return u.pathname === p.pathname || u.pathname.startsWith(base);
}
export function authorizeMcpResourceRead(
  discovery: McpDiscovery,
  grant: McpCapabilityGrant,
  context: McpExecutionContext,
  verifier: McpGrantVerifier,
  network: McpNetworkVerifier,
  uri: string,
) {
  verifyGrant(discovery, grant, context, verifier);
  const normalized = new URL(uri);
  normalized.hash = "";
  const found = discovery.resources.some(
      (x) => new URL(x.uri).href === normalized.href,
    ),
    addresses = network.resolve(normalized.origin),
    publicNow =
      addresses.length > 0 &&
      network.verifyPublic(normalized.origin, addresses);
  const selectedAddress = [...addresses]
    .sort()
    .find((address) => discovery.verifiedAddresses.includes(address));
  if (
    !found ||
    !grant.resourcePrefixes.some((p) => prefixAllows(p, normalized.href)) ||
    !publicNow ||
    !selectedAddress
  )
    throw new Error("MCP resource outside grant");
  return {
    method: "resources/read" as const,
    params: { uri: normalized.href },
    connection: {
      origin: normalized.origin,
      address: selectedAddress,
      authBinding: discovery.peer.authBinding,
    },
  };
}

export type McpBoundResourceRead = ReturnType<typeof authorizeMcpResourceRead>;
export async function executeMcpBoundResourceRead<T>(
  authorized: McpBoundResourceRead,
  connect: (target: {
    address: string;
    port: 443;
    serverName: string;
    authorization: string;
    uri: string;
  }) => Promise<T>,
): Promise<T> {
  const uri = new URL(authorized.params.uri),
    origin = new URL(authorized.connection.origin);
  if (
    uri.origin !== origin.origin ||
    origin.protocol !== "https:" ||
    !authorized.connection.address
  )
    throw new Error("invalid bound MCP resource connection");
  return connect({
    address: authorized.connection.address,
    port: 443,
    serverName: origin.hostname,
    authorization: authorized.connection.authBinding,
    uri: uri.href,
  });
}
async function executeBoundPeer<T>(discovery:McpDiscovery,network:McpNetworkVerifier,method:string,params:unknown,connect:(target:{address:string;port:443;serverName:string;authorization:string;method:string;params:unknown})=>Promise<T>){const current=network.resolve(discovery.peer.origin),address=[...current].sort().find(x=>discovery.verifiedAddresses.includes(x));if(!address||!network.verifyPublic(discovery.peer.origin,current))throw new Error('MCP peer address changed or became non-public at effect time');const origin=new URL(discovery.peer.origin);return connect({address,port:443,serverName:origin.hostname,authorization:discovery.peer.authBinding,method,params:clone(params)})}
export function executeMcpBoundToolCall<T>(discovery:McpDiscovery,authorized:ReturnType<typeof authorizeMcpToolCall>,network:McpNetworkVerifier,connect:(target:{address:string;port:443;serverName:string;authorization:string;method:string;params:unknown})=>Promise<T>){return executeBoundPeer(discovery,network,authorized.method,authorized.params,connect)}
export function executeMcpBoundPromptGet<T>(discovery:McpDiscovery,request:{method:"prompts/get";params:unknown},network:McpNetworkVerifier,connect:(target:{address:string;port:443;serverName:string;authorization:string;method:string;params:unknown})=>Promise<T>){return executeBoundPeer(discovery,network,request.method,request.params,connect)}

export function importMcpPrompt(
  prompt: McpPrompt,
  grant: McpCapabilityGrant,
  limits: McpLimits = {
    maxMessageBytes: 1_048_576,
    maxSchemaBytes: 65_536,
    maxItems: 1_000,
    maxStringBytes: 65_536,
  },
): McpMapping<{
  name: string;
  fragments: Array<{
    role: "user";
    text: string;
    trust: "untrusted";
    _meta?: Record<string, unknown>;
    contentMeta?: Record<string, unknown>;
  }>;
  _meta?: Record<string, unknown>;
}> {
  boundedMessage(prompt, limits, "prompt descriptor");
  requireMeta(
    prompt as unknown as Record<string, unknown>,
    "prompt descriptor",
  );
  if (!grant.prompts.includes(prompt.name))
    return {
      losses: [
        {
          code: "trust-not-conferred",
          path: `prompts.${prompt.name}`,
          explanation: "prompt not granted",
        },
      ],
      exact: false,
    };
  const mapped: McpMapping<{
    name: string;
    fragments: Array<{
      role: "user";
      text: string;
      trust: "untrusted";
      _meta?: Record<string, unknown>;
      contentMeta?: Record<string, unknown>;
    }>;
    _meta?: Record<string, unknown>;
  }> = {
    value: {
      name: prompt.name,
      fragments: [],
      ...(prompt._meta ? { _meta: clone(prompt._meta) } : {}),
    },
    losses: [
      {
        code: "trust-not-conferred",
        path: `prompts.${prompt.name}`,
        explanation: "prompt content remains untrusted",
      },
    ],
    exact: false,
  };
  boundedMessage(mapped, limits, "imported prompt");
  return mapped;
}
export function getMcpPrompt(
  discovery: McpDiscovery,
  grant: McpCapabilityGrant,
  context: McpExecutionContext,
  verifier: McpGrantVerifier,
  limits: McpLimits,
  name: string,
  args: Record<string, string>,
  result: unknown,
) {
  const request=authorizeMcpPromptGet(discovery,grant,context,verifier,limits,name,args);void request;
  boundedMessage(result, limits, "prompt result");
  validateMetaTree(result,"prompt result");
  if (!plain(result) || !Array.isArray(result.messages))
    throw new Error("invalid prompt result");
  requireMeta(result, "prompt result");
  const fragments = result.messages.map((raw, index) => {
    if (!plain(raw)||!["user", "assistant"].includes(String(raw.role))||!plain(raw.content)||raw.content.type !== "text"||typeof raw.content.text !== "string")throw new Error(`invalid prompt result message ${index}`);
    requireMeta(raw, `prompt result message ${index}`);requireMeta(raw.content, `prompt result message ${index}.content`);
    return {role: raw.role as "user" | "assistant",text: raw.content.text,trust: "untrusted" as const,_meta: clone(plain(raw._meta) ? raw._meta : undefined),contentMeta: clone(plain(raw.content._meta) ? raw.content._meta : undefined)};
  });
  const mapped = {name,fragments,_meta: clone(plain(result._meta) ? result._meta : undefined),losses: [{code: "trust-not-conferred" as const,path: `prompts.${name}`,explanation: "server prompt text is untrusted context"}]};
  boundedMessage(mapped, limits, "mapped prompt result");return mapped;
}
export function authorizeMcpPromptGet(discovery:McpDiscovery,grant:McpCapabilityGrant,context:McpExecutionContext,verifier:McpGrantVerifier,limits:McpLimits,name:string,args:Record<string,string>){
  verifyGrant(discovery, grant, context, verifier);
  bounded(args, limits, "prompt arguments");
  const prompt = discovery.prompts.find((x) => x.name === name);
  if (!prompt || !grant.prompts.includes(name))
    throw new Error("prompt not discovered or granted");
  for (const a of prompt.arguments ?? []) {
    if (a.required && !(a.name in args))
      throw new Error(`prompt argument ${a.name} required`);
  }
  for (const key of Object.keys(args))
    if (!(prompt.arguments ?? []).some((a) => a.name === key))
      throw new Error(`prompt argument ${key} undeclared`);
  const request={method:'prompts/get' as const,params:{name,arguments:clone(args)}};boundedMessage(request,limits,'prompt get');return request;
}
export function roundTripMcpTool(
  tool: McpTool,
  limits: McpLimits,
): McpMapping<McpTool> {
  bounded(tool, limits, "tool");
  validateMetaTree(tool, "tool");
  const losses = [
    ...schemaLosses(tool.inputSchema, "tool.inputSchema"),
    ...schemaLosses(tool.outputSchema ?? {}, "tool.outputSchema"),
  ];
  if (losses.length) return { losses, exact: false };
  validateSchema(tool.inputSchema, limits, "tool.inputSchema");
  if (tool.outputSchema)
    validateSchema(tool.outputSchema, limits, "tool.outputSchema");
  return { value: clone(tool), losses: [], exact: true };
}
function exactFormElicitationSchema(schema: unknown) {
  if (!plain(schema) || schema.type !== "object" || !plain(schema.properties))
    return false;
  const top = new Set(["type", "properties", "required"]);
  if (Object.keys(schema).some((k) => !top.has(k))) return false;
  return Object.values(schema.properties).every(
    (item) =>
      plain(item) &&
      ["string", "number", "integer", "boolean"].includes(String(item.type)) &&
      !schemaLosses(item).length &&
      !("items" in item) &&
      !("properties" in item),
  );
}
export function mapMcpConstruct(
  kind: string,
  value: unknown,
  limits: McpLimits = {
    maxMessageBytes: 1_048_576,
    maxSchemaBytes: 65_536,
    maxItems: 1_000,
    maxStringBytes: 65_536,
  },
): McpMapping<unknown> {
  bounded(value, limits, kind);
  validateMetaTree(value, kind);
  if (kind === "elicitation") {
    if (
      !plain(value) ||
      typeof value.message !== "string" ||
      !exactFormElicitationSchema(value.requestedSchema)
    )
      return {
        losses: [
          {
            code: "unsupported-field",
            path: "elicitation",
            explanation: "outside official form-elicitation subset",
          },
        ],
        exact: false,
      };
    validateSchema(
      value.requestedSchema,
      limits,
      "elicitation.requestedSchema",
    );
    if (size(value) > limits.maxMessageBytes)
      throw new Error("elicitation message limit exceeded");
    return { value: clone(value), losses: [], exact: true };
  }
  return {
    losses: [
      {
        code: "unsupported-construct",
        path: kind,
        explanation: `MCP construct '${kind}' outside subset`,
      },
    ],
    exact: false,
  };
}

export class McpNativeSession {
  private phase: "created" | "awaiting-initialized" | "ready" | "closed" =
    "created";
  private pending = new Map<
    JsonRpcId,
    {
      method: string;
      progressToken?: JsonRpcId;
      progressTokens: JsonRpcId[];
      cancelled: boolean;
      lastProgress?: number;
      total?: number;
    }
  >();
  private capabilities: Record<string, unknown> = {};
  constructor(
    readonly peer: McpPeer,
    readonly limits: McpLimits,
  ) {}
  initialize(
    request: Parameters<typeof negotiateMcpInitialize>[0],
    server: Parameters<typeof negotiateMcpInitialize>[1],
  ) {
    if (this.phase !== "created") throw new Error("initialize exactly once");
    boundedMessage(request,this.limits,'initialize request');boundedMessage(server,this.limits,'initialize server');validateMetaTree(request,'initialize request');validateMetaTree(server,'initialize server');
    const response = negotiateMcpInitialize(request, server);
    this.capabilities = clone(server.capabilities);
    this.phase = "awaiting-initialized";
    return response;
  }
  initialized() {
    if (this.phase !== "awaiting-initialized")
      throw new Error("initialized notification out of order");
    this.phase = "ready";
    return { jsonrpc: "2.0" as const, method: "notifications/initialized" };
  }
  request(id: JsonRpcId, method: string, params?: unknown) {
    if (this.phase !== "ready" || this.pending.has(id)||this.pending.size>=this.limits.maxItems)
      throw new Error("request lifecycle invalid");
    const capability: Record<string, string | undefined> = {
      ping: undefined,
      "tools/list": "tools",
      "tools/call": "tools",
      "resources/list": "resources",
      "resources/read": "resources",
      "resources/templates/list": "resources",
      "prompts/list": "prompts",
      "prompts/get": "prompts",
      "completion/complete": "completions",
      "logging/setLevel": "logging",
    };
    if (!(method in capability))
      throw new Error("MCP method outside declared subset");
    const required = capability[method];
    if (required && !(required in this.capabilities))
      throw new Error(`MCP capability '${required}' not negotiated`);
    const token =
      plain(params) && plain(params._meta)
        ? (params._meta.progressToken as JsonRpcId | undefined)
        : undefined;
    if(token!==undefined&&!(typeof token==='string'||typeof token==='number'&&Number.isFinite(token)))throw new Error('MCP progress token invalid');
    const message = { jsonrpc: "2.0" as const, id, method, params };
    validateJsonRpc(message, this.limits);
    validateMethod(method,params);
    this.pending.set(id, {
      method,
      progressToken: token,
      progressTokens: [],
      cancelled: false,
    });
    return message;
  }
  progress(
    id: JsonRpcId,
    token: JsonRpcId,
    value: { progress: number; total?: number; message?: string },
  ) {
    const item = this.pending.get(id);
    if (
      !item ||
      item.progressTokens.length>=this.limits.maxItems ||
      item.cancelled ||
      item.progressToken !== token ||
      !Number.isFinite(value.progress) ||
      value.progress < 0 ||
      (item.lastProgress !== undefined &&
        value.progress <= item.lastProgress) ||
      (value.total !== undefined &&
        (!Number.isFinite(value.total) || value.total < value.progress)) ||
      (item.total !== undefined &&
        value.total !== undefined &&
        item.total !== value.total)
    )
      throw new Error("MCP progress must be finite, monotone, and token-bound");
    const message = {
      jsonrpc: "2.0" as const,
      method: "notifications/progress",
      params: { progressToken: token, ...value },
    };
    boundedMessage(message, this.limits, "progress notification");
    item.lastProgress = value.progress;
    if (value.total !== undefined) item.total = value.total;
    item.progressTokens.push(token);
    return message;
  }
  cancel(id: JsonRpcId, reason?: string) {
    const item = this.pending.get(id);
    if (!item || item.cancelled)
      throw new Error("cancellation does not name active request");
    const message = {
      jsonrpc: "2.0" as const,
      method: "notifications/cancelled",
      params: { requestId: id, reason },
    };
    boundedMessage(message, this.limits, "cancellation notification");
    item.cancelled = true;
    return message;
  }
  complete(message: {
    jsonrpc: "2.0";
    id: JsonRpcId;
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
  }) {
    const item = this.pending.get(message.id);
    if (!item) throw new Error("response unknown/completed id");
    if ("result" in message === "error" in message)
      throw new Error("response exactly one result/error");
    validateJsonRpc(message,this.limits);
    if(!item.cancelled&&'result'in message)validateMethodResult(item.method,message.result);
    this.pending.delete(message.id);
    return {
      method: item.method,
      cancelled: item.cancelled,
      response: item.cancelled ? undefined : clone(message),
      discarded: item.cancelled,
      progressTokens: [...item.progressTokens],
    };
  }
  close() {
    if (this.phase === "closed") throw new Error("already closed");
    const abandoned = [...this.pending.keys()];
    this.pending.clear();
    this.phase = "closed";
    return { abandoned };
  }
}
