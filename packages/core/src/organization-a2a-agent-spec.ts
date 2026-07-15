import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { canonicalSemanticJson } from "./organization-canonical";

export const A2A_PROTOCOL_REVISION = "0.3.0" as const;
export const ORACLE_AGENT_SPEC_RELEASE = "25.4.1" as const;
const clone = <T>(x: T): T => structuredClone(x);
const hash = (x: unknown) =>
  `sha256:${createHash("sha256").update(canonicalSemanticJson(x)).digest("hex")}`;
export type TypedAdapterLoss = { code: string; path: string; message: string };
export type AdapterLimits = {
  maxBytes: number;
  maxDepth: number;
  maxNodes: number;
  maxStringBytes: number;
  maxItems: number;
};
export type A2ADiscoveryPolicy = AdapterLimits & { allowedOrigins: string[] };
export const DEFAULT_R13_LIMITS: AdapterLimits = {
  maxBytes: 1_048_576,
  maxDepth: 32,
  maxNodes: 10_000,
  maxStringBytes: 65_536,
  maxItems: 1_000,
};
export type RemoteDocument = {
  finalUrl: string;
  contentType: string;
  bytes: Uint8Array;
  connection: { address: string; verified: true };
};
export type A2ADiscoveryTransport = {
  fetch(
    url: string,
    options: {
      maxBytes: number;
      redirects: "error";
      allowedAddresses: string[];
    },
  ): Promise<RemoteDocument>;
  resolve(host: string): Promise<string[]>;
};
const record = (x: unknown, path = "document"): Record<string, unknown> => {
  if (
    !x ||
    typeof x !== "object" ||
    Array.isArray(x) ||
    Object.getPrototypeOf(x) !== Object.prototype
  )
    throw new Error(`${path} must be a plain object`);
  return x as Record<string, unknown>;
};
const text = (x: unknown, path: string) => {
  if (typeof x !== "string" || !x.trim())
    throw new Error(`${path} must be a nonempty string`);
  return x;
};
function bounded(value: unknown, l: AdapterLimits) {
  let count = 0;
  const seen = new Set<object>(),
    stack: [unknown, number, string][] = [[value, 0, "document"]];
  while (stack.length) {
    const [item, depth, path] = stack.pop()!;
    if (depth > l.maxDepth) throw new Error("document exceeds depth bound");
    if (++count > l.maxNodes) throw new Error("document exceeds node bound");
    if (typeof item === "string" && Buffer.byteLength(item) > l.maxStringBytes)
      throw new Error("document exceeds string bound");
    if (item && typeof item === "object") {
      if (seen.has(item as object)) throw new Error("document is cyclic");
      seen.add(item as object);
      const entries = Array.isArray(item)
        ? item.map((v, i) => [String(i), v] as const)
        : Object.entries(item);
      if (entries.length > l.maxItems)
        throw new Error("document exceeds item bound");
      for (const [k, v] of entries) {
        if (["__proto__", "prototype", "constructor"].includes(k))
          throw new Error("document contains unsafe key");
        if (Buffer.byteLength(k) > l.maxStringBytes)
          throw new Error("document key exceeds string bound");
        stack.push([v, depth + 1, `${path}.${k}`]);
      }
    }
  }
  if (Buffer.byteLength(canonicalSemanticJson(value)) > l.maxBytes)
    throw new Error("document exceeds byte bound");
}
function globalAddress(s: string) {
  if (isIP(s) === 4) {
    const p = s.split(".").map(Number),
      n = ((p[0]! << 24) >>> 0) + (p[1]! << 16) + (p[2]! << 8) + p[3]!;
    const inRange = (base: number, bits: number) =>
      n >>> 0 >= base >>> 0 && n >>> 0 <= (base + (2 ** (32 - bits) - 1)) >>> 0;
    return ![
      [0x00000000, 8],
      [0x0a000000, 8],
      [0x64400000, 10],
      [0x7f000000, 8],
      [0xa9fe0000, 16],
      [0xac100000, 12],
      [0xc0000000, 24],
      [0xc0000200, 24],
      [0xc0a80000, 16],
      [0xc6120000, 15],
      [0xc6336400, 24],
      [0xcb007100, 24],
      [0xe0000000, 4],
      [0xf0000000, 4],
    ].some(([b, m]) => inRange(b!, m!));
  }
  if (isIP(s) === 6) {
    const v = s.toLowerCase();
    const mapped=/^(?:(?:0:){5}ffff:|::ffff:)(?:([0-9a-f]{1,4}):([0-9a-f]{1,4})|(\d+\.\d+\.\d+\.\d+))$/.exec(v);
    if(mapped){const ipv4=mapped[3]??`${parseInt(mapped[1]!,16)>>8}.${parseInt(mapped[1]!,16)&255}.${parseInt(mapped[2]!,16)>>8}.${parseInt(mapped[2]!,16)&255}`;return globalAddress(ipv4)}
    return !(
      v === "::" ||
      v === "::1" ||
      /^0:0:0:0:0:0:0:[01]$/.test(v) ||
      v.startsWith("fc") ||
      v.startsWith("fd") ||
      /^fe[89ab]/.test(v) ||
      v.startsWith("::ffff:") ||
      v.startsWith("2001:db8:")
    );
  }
  return false;
}
function safeUrl(raw: string, p: A2ADiscoveryPolicy, label: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`${label} URL is invalid`);
  }
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (u.protocol !== "https:" || u.username || u.password || u.hash)
    throw new Error(`${label} URL must be credential-free HTTPS`);
  if (host === "localhost" || host.endsWith(".localhost") || isIP(host))
    throw new Error(`${label} URL targets local or literal address`);
  if (!p.allowedOrigins.includes(u.origin))
    throw new Error(`${label} origin is not allowed`);
  return u;
}
async function boundFetch(
  url: URL,
  t: A2ADiscoveryTransport,
  p: A2ADiscoveryPolicy,
) {
  const addresses = await t.resolve(url.hostname);
  if (!addresses.length || addresses.some((x) => !globalAddress(x)))
    throw new Error("resolution contains non-global address");
  const d = await t.fetch(url.href, {
    maxBytes: p.maxBytes,
    redirects: "error",
    allowedAddresses: [...addresses],
  });
  if (
    !d.connection.verified ||
    !addresses.includes(d.connection.address) ||
    !globalAddress(d.connection.address)
  )
    throw new Error("connection was not bound to verified resolution");
  if (d.bytes.byteLength > p.maxBytes)
    throw new Error("remote document exceeds byte bound");
  return d;
}

export type UntrustedA2ACard = {
  cardId: string;
  endpointId: string;
  sourceUrl: string;
  endpointUrl: string;
  name: string;
  skills: unknown[];
  capabilities?: unknown;
  description?: string;
  preferredTransport?: unknown;
  additionalInterfaces?: unknown;
  extensions: Record<string, unknown>;
  source: Record<string, unknown>;
  trusted: false;
  authorityGranted: false;
  digest: string;
};
export async function discoverA2ACard(
  raw: string,
  t: A2ADiscoveryTransport,
  p: A2ADiscoveryPolicy,
): Promise<UntrustedA2ACard> {
  const requested = safeUrl(raw, p, "discovery"),
    d = await boundFetch(requested, t, p),
    final = safeUrl(d.finalUrl, p, "final");
  if (final.href !== requested.href)
    throw new Error("redirected discovery is prohibited");
  if (!/^application\/(?:json|a2a\+json)(?:;|$)/i.test(d.contentType))
    throw new Error("remote card media type is unsupported");
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(d.bytes));
  } catch {
    throw new Error("remote card is invalid JSON");
  }
  bounded(parsed, p);
  const card = record(parsed, "card");
  if (card.protocolVersion !== A2A_PROTOCOL_REVISION)
    throw new Error("unsupported A2A protocol revision");
  const endpoint = safeUrl(text(card.url, "card.url"), p, "agent endpoint");
  const skills =
    card.skills === undefined
      ? []
      : Array.isArray(card.skills)
        ? clone(card.skills)
        : (() => {
            throw new Error("card.skills must be an array");
          })();
  for (const [i, s] of skills.entries()) {
    const v = record(s, `skills.${i}`);
    text(v.id, `skills.${i}.id`);
    text(v.name, `skills.${i}.name`);
  }
  if(new Set(skills.map(s=>(s as Record<string,unknown>).id)).size!==skills.length)throw new Error('card skill ids must be unique');
  const known = new Set([
      "protocolVersion",
      "name",
      "url",
      "skills",
      "capabilities",
      "description",
      "preferredTransport",
      "additionalInterfaces",
    ]),
    extensions = Object.fromEntries(
      Object.entries(card).filter(([k]) => !known.has(k)),
    ),
    digest = hash(card);
  return {
    cardId: `a2a-card:${digest.slice(7)}`,
    endpointId: `a2a-endpoint:${hash(endpoint.href).slice(7)}`,
    sourceUrl: requested.href,
    endpointUrl: endpoint.href,
    name: text(card.name, "card.name"),
    skills,
    ...(card.capabilities !== undefined
      ? { capabilities: clone(card.capabilities) }
      : {}),
    ...(card.description !== undefined
      ? { description: text(card.description, "card.description") }
      : {}),
    ...(card.preferredTransport !== undefined
      ? { preferredTransport: clone(card.preferredTransport) }
      : {}),
    ...(card.additionalInterfaces !== undefined
      ? { additionalInterfaces: clone(card.additionalInterfaces) }
      : {}),
    extensions: clone(extensions),
    source: clone(card),
    trusted: false,
    authorityGranted: false,
    digest,
  };
}

export type A2ATextPart = {
  kind: "text";
  text: string;
  metadata?: Record<string, unknown>;
  extensions: Record<string, unknown>;
};
export type A2AFilePart = {
  kind: "file";
  file: {
    name?: string;
    mimeType?: string;
    uri?: string;
    bytes?: string;
    extensions: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
  extensions: Record<string, unknown>;
};
export type A2ADataPart = {
  kind: "data";
  data: unknown;
  metadata?: Record<string, unknown>;
  extensions: Record<string, unknown>;
};
export type A2APart = A2ATextPart | A2AFilePart | A2ADataPart;
export type A2AMessage = {
  kind: "message";
  messageId: string;
  role: "user" | "agent";
  parts: A2APart[];
  taskId?: string;
  contextId?: string;
  metadata?: Record<string, unknown>;
  extensions: Record<string, unknown>;
};
export type A2AArtifact = {
  artifactId: string;
  name?: string;
  description?: string;
  parts: A2APart[];
  metadata?: Record<string, unknown>;
  extensions: Record<string, unknown>;
};
export type Mapped<T> = {
  value: T;
  losses: TypedAdapterLoss[];
  exact: boolean;
  source: unknown;
};
function parsePart(
  input: unknown,
  path: string,
  p: A2ADiscoveryPolicy,
): Mapped<A2APart> {
  bounded(input, p);
  const v = record(input, path),
    kind = text(v.kind, `${path}.kind`),
    topKnown = new Set(["kind", "metadata",kind]),
    extensions = Object.fromEntries(
      Object.entries(v).filter(([k]) => !topKnown.has(k)),
    ),
    metadata =
      v.metadata === undefined
        ? undefined
        : clone(record(v.metadata, `${path}.metadata`));
  let value: A2APart;
  if (kind === "text")
    value = {
      kind,
      text: text(v.text, `${path}.text`),
      ...(metadata ? { metadata } : {}),
      extensions: clone(extensions),
    };
  else if (kind === "data") {
    if (!("data" in v)) throw new Error(`${path}.data is required`);
    value = {
      kind,
      data: clone(v.data),
      ...(metadata ? { metadata } : {}),
      extensions: clone(extensions),
    };
  } else if (kind === "file") {
    const f = record(v.file, `${path}.file`),
      uri = f.uri === undefined ? undefined : text(f.uri, `${path}.file.uri`),
      b64 =
        f.bytes === undefined ? undefined : text(f.bytes, `${path}.file.bytes`);
    if (Boolean(uri) === Boolean(b64))
      throw new Error(`${path}.file requires exactly one uri or bytesBase64`);
    if (uri) safeUrl(uri, p, `${path}.file`);
    if (b64) {
      if (
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          b64,
        )
      )
        throw new Error("invalid base64");
      if (Buffer.from(b64, "base64").byteLength > p.maxBytes)
        throw new Error("decoded file exceeds byte bound");
    }
    const fk = new Set(["name", "mimeType", "uri", "bytes"]),
      fx = Object.fromEntries(Object.entries(f).filter(([k]) => !fk.has(k)));
    value = {
      kind,
      file: {
        ...(f.name !== undefined
          ? { name: text(f.name, `${path}.file.name`) }
          : {}),
        ...(f.mimeType !== undefined
          ? { mimeType: text(f.mimeType, `${path}.file.mimeType`) }
          : {}),
        ...(uri ? { uri } : {}),
        ...(b64 ? { bytes: b64 } : {}),
        extensions: clone(fx),
      },
      ...(metadata ? { metadata } : {}),
      extensions: clone(extensions),
    };
  } else throw new Error(`${path}.kind is unsupported`);
  return { value, losses: [], exact: true, source: clone(input) };
}
export function mapA2AMessage(
  input: unknown,
  p: A2ADiscoveryPolicy = { ...DEFAULT_R13_LIMITS, allowedOrigins: [] },
): Mapped<A2AMessage> {
  bounded(input, p);
  const v = record(input, "message");
  if (v.kind !== undefined && v.kind !== "message")
    throw new Error("message.kind is unsupported");
  if (!Array.isArray(v.parts))
    throw new Error("message.parts must be an array");
  const parts = v.parts.map((x, i) => parsePart(x, `message.parts.${i}`, p)),
    known = new Set([
      "kind",
      "messageId",
      "role",
      "parts",
      "taskId",
      "contextId",
      "metadata",
    ]),
    ext = Object.fromEntries(Object.entries(v).filter(([k]) => !known.has(k))),
    role = text(v.role, "message.role");
  if (role !== "user" && role !== "agent")
    throw new Error("message.role unsupported");
  return {
    value: {
      kind: "message",
      messageId: text(v.messageId, "message.messageId"),
      role,
      parts: parts.map((x) => x.value),
      ...(v.taskId !== undefined
        ? { taskId: text(v.taskId, "message.taskId") }
        : {}),
      ...(v.contextId !== undefined
        ? { contextId: text(v.contextId, "message.contextId") }
        : {}),
      ...(v.metadata !== undefined
        ? { metadata: clone(record(v.metadata, "message.metadata")) }
        : {}),
      extensions: clone(ext),
    },
    losses: [],
    exact: true,
    source: clone(input),
  };
}
export function mapA2AArtifact(
  input: unknown,
  p: A2ADiscoveryPolicy = { ...DEFAULT_R13_LIMITS, allowedOrigins: [] },
): Mapped<A2AArtifact> {
  bounded(input, p);
  const v = record(input, "artifact");
  if (!Array.isArray(v.parts))
    throw new Error("artifact.parts must be an array");
  const parts = v.parts.map((x, i) => parsePart(x, `artifact.parts.${i}`, p)),
    known = new Set(["artifactId", "name", "description", "parts", "metadata"]),
    ext = Object.fromEntries(Object.entries(v).filter(([k]) => !known.has(k)));
  return {
    value: {
      artifactId: text(v.artifactId, "artifact.artifactId"),
      ...(v.name !== undefined ? { name: text(v.name, "artifact.name") } : {}),
      ...(v.description !== undefined
        ? { description: text(v.description, "artifact.description") }
        : {}),
      parts: parts.map((x) => x.value),
      ...(v.metadata !== undefined
        ? { metadata: clone(record(v.metadata, "artifact.metadata")) }
        : {}),
      extensions: clone(ext),
    },
    losses: [],
    exact: true,
    source: clone(input),
  };
}
export function exportExactA2A<T>(m: Mapped<T>) {
  if (!m.exact || m.losses.length)
    throw new Error("lossy A2A mapping cannot be exported as exact");
  return clone(m.source);
}
export function verifyExactA2ARoundTrip(i: unknown, m: Mapped<unknown>) {
  return (
    m.exact &&
    !m.losses.length &&
    canonicalSemanticJson(i) === canonicalSemanticJson(exportExactA2A(m))
  );
}

export type A2AWorkProjection = {
  mappingVersion: "open-autonomy.a2a-task-map.v1";
  taskId: string;
  workId: string;
  state:
    | "queued"
    | "active"
    | "blocked"
    | "completed"
    | "failed"
    | "cancelled"
    | "rejected";
  condition?: "awaiting-input" | "authentication-required";
  contextId?: string;
  status: Record<string, unknown>;
  messages: A2AMessage[];
  artifacts: A2AArtifact[];
  metadata?: Record<string, unknown>;
  extensions: Record<string, unknown>;
  losses: TypedAdapterLoss[];
};
const states: Record<
  string,
  {
    state: A2AWorkProjection["state"];
    condition?: A2AWorkProjection["condition"];
  }
> = {
  submitted: { state: "queued" },
  working: { state: "active" },
  "input-required": { state: "blocked", condition: "awaiting-input" },
  "auth-required": { state: "blocked", condition: "authentication-required" },
  completed: { state: "completed" },
  failed: { state: "failed" },
  canceled: { state: "cancelled" },
  rejected: { state: "rejected" },
};
export function projectA2ATask(
  input: unknown,
  p: A2ADiscoveryPolicy = { ...DEFAULT_R13_LIMITS, allowedOrigins: [] },
): A2AWorkProjection {
  bounded(input, p);
  const v = record(input, "task"),
    id = text(v.id, "task.id"),
    status = record(v.status, "task.status"),
    remote = text(status.state, "task.status.state"),
    mapped = states[remote],
    losses: TypedAdapterLoss[] = mapped
      ? []
      : [
          {
            code: "A2A_TASK_STATE_UNSUPPORTED",
            path: "status.state",
            message: `state ${remote} has no projection`,
          },
        ];
  if (v.history !== undefined && !Array.isArray(v.history))
    throw new Error("task.history must be an array");
  if (v.artifacts !== undefined && !Array.isArray(v.artifacts))
    throw new Error("task.artifacts must be an array");
  const ms = Array.isArray(v.history)
      ? v.history.map((x) => mapA2AMessage(x, p))
      : [],
    as = Array.isArray(v.artifacts)
      ? v.artifacts.map((x) => mapA2AArtifact(x, p))
      : [],
    known = new Set([
      "id",
      "contextId",
      "status",
      "history",
      "artifacts",
      "metadata",
    ]),
    ext = Object.fromEntries(Object.entries(v).filter(([k]) => !known.has(k)));
  for(const message of ms.map(x=>x.value)){if(message.taskId!==undefined&&message.taskId!==id)throw new Error('task history message task identity mismatch');if(message.contextId!==undefined&&v.contextId!==undefined&&message.contextId!==v.contextId)throw new Error('task history message context identity mismatch');}
  if(v.contextId===undefined&&new Set(ms.map(x=>x.value.contextId).filter((x):x is string=>x!==undefined)).size>1)throw new Error('task history contains multiple unbound contexts');
  return {
    mappingVersion: "open-autonomy.a2a-task-map.v1",
    taskId: `a2a-task:${id}`,
    workId: `org-work:${hash({ protocol: A2A_PROTOCOL_REVISION, id }).slice(7)}`,
    ...(mapped ?? { state: "blocked" as const }),
    ...(v.contextId !== undefined
      ? { contextId: text(v.contextId, "task.contextId") }
      : {}),
    status: clone(status),
    messages: ms.map((x) => x.value),
    artifacts: as.map((x) => x.value),
    ...(v.metadata !== undefined
      ? { metadata: clone(record(v.metadata, "task.metadata")) }
      : {}),
    extensions: clone(ext),
    losses,
  };
}

export type A2AStreamEvent = {
  kind: "task" | "status-update" | "artifact-update" | "message";
  taskId: string;
  contextId: string;
  final: boolean;
  value: A2AWorkProjection | A2AMessage | A2AArtifact | Record<string, unknown>;
  append?: boolean;
  lastChunk?: boolean;
  metadata?: Record<string, unknown>;
  extensions: Record<string, unknown>;
};
export class A2AStreamProjection {
  private ended = false;
  private task?: string;
  private context?: string;
  private artifacts=new Map<string,{closed:boolean}>();
  accept(
    input: unknown,
    l: AdapterLimits = DEFAULT_R13_LIMITS,
  ): A2AStreamEvent {
    bounded(input, l);
    const v = record(input, "stream"),
      kind = text(v.kind, "stream.kind");
    if (!["task", "status-update", "artifact-update", "message"].includes(kind))
      throw new Error("unsupported A2A stream event");
    const task = text(kind === "task" ? v.id : v.taskId, "stream.taskId"),
      incomingContext =
        v.contextId === undefined
          ? undefined
          : text(v.contextId, "stream.contextId"),
      context = incomingContext ?? this.context;
    if (!context)
      throw new Error("stream.contextId is required on the first event");
    if (kind === "status-update" && typeof v.final !== "boolean")
      throw new Error("status-update.final must be boolean");
    if (kind !== "status-update" && v.final !== undefined)
      throw new Error("final is only valid on status-update");
    if (this.ended) throw new Error("A2A stream finality violation");
    if (this.task !== undefined && this.task !== task)
      throw new Error("A2A stream task identity changed");
    if (this.context !== undefined && this.context !== context)
      throw new Error("A2A stream context identity changed");
    let mapped: A2AStreamEvent["value"],
      append: boolean | undefined,
      lastChunk: boolean | undefined;
    if (kind === "status-update")
      mapped = clone(record(v.status, "stream.status"));
    else if (kind === "artifact-update") {
      const artifact=mapA2AArtifact(v.artifact, { ...l, allowedOrigins: [] }).value;mapped = artifact;
      if (v.append !== undefined && typeof v.append !== "boolean")
        throw new Error("stream.append must be boolean");
      if (v.lastChunk !== undefined && typeof v.lastChunk !== "boolean")
        throw new Error("stream.lastChunk must be boolean");
      append = v.append as boolean | undefined;
      lastChunk = v.lastChunk as boolean | undefined;
      const prior=this.artifacts.get(artifact.artifactId);if(prior?.closed)throw new Error('artifact update follows its last chunk');
    } else if (kind === "message")
      mapped = mapA2AMessage(v, { ...l, allowedOrigins: [] }).value;
    else mapped = projectA2ATask(v, { ...l, allowedOrigins: [] });
    const known = new Set(
        kind === "status-update"
          ? ["kind", "taskId", "contextId", "final", "status", "metadata"]
          : kind === "artifact-update"
            ? [
                "kind",
                "taskId",
                "contextId",
                "final",
                "artifact",
                "append",
                "lastChunk",
                "metadata",
              ]
            : kind === "message"
              ? [
                  "kind",
                  "messageId",
                  "role",
                  "parts",
                  "taskId",
                  "contextId",
                  "metadata",
                  "final",
                ]
              : [
                  "kind",
                  "id",
                  "taskId",
                  "contextId",
                  "status",
                  "history",
                  "artifacts",
                  "metadata",
                  "final",
                ],
      ),
      extensions = Object.fromEntries(
        Object.entries(v).filter(([k]) => !known.has(k)),
      ),
      terminal = kind === "status-update" ? v.final === true : false,
      event = {
        kind: kind as A2AStreamEvent["kind"],
        taskId: task,
        contextId: context,
        final: terminal,
        value: mapped,
        ...(append !== undefined ? { append } : {}),
        ...(lastChunk !== undefined ? { lastChunk } : {}),
        ...(v.metadata !== undefined
          ? { metadata: clone(record(v.metadata, "stream.metadata")) }
          : {}),
        extensions: clone(extensions),
      };
    this.task ??= task;
    this.context ??= context;
    if(kind==='artifact-update')this.artifacts.set((mapped as A2AArtifact).artifactId,{closed:lastChunk===true});
    this.ended = terminal;
    return event;
  }
}
export function mapA2ACancellation(
  input: unknown,
  l: AdapterLimits = DEFAULT_R13_LIMITS,
) {
  bounded(input, l);
  const v = record(input, "cancellation");
  if (v.jsonrpc !== "2.0" || !(typeof v.id==='string'||typeof v.id==='number'&&Number.isSafeInteger(v.id)))
    throw new Error("invalid tasks/cancel JSON-RPC identity");
  if(Number('method'in v)+Number('result'in v)+Number('error'in v)!==1)throw new Error('cancellation JSON-RPC requires exactly one method, result, or error');
  if (v.method !== undefined) {
    if (v.method !== "tasks/cancel")
      throw new Error("unsupported cancellation method");
    const params = record(v.params, "cancellation.params"),
      known = new Set(["id", "metadata"]),
      extensions = Object.fromEntries(
        Object.entries(params).filter(([k]) => !known.has(k)),
      );
    return {
      jsonrpc: "2.0" as const,
      id: v.id as string | number,
      method: "tasks/cancel" as const,
      params: {
        id: text(params.id, "cancellation.params.id"),
        ...(params.metadata !== undefined
          ? {
              metadata: clone(
                record(params.metadata, "cancellation.params.metadata"),
              ),
            }
          : {}),
        extensions: clone(extensions),
      },
    };
  }
  if (v.result !== undefined) {
    const task = projectA2ATask(v.result, { ...l, allowedOrigins: [] });
    return {
      jsonrpc: "2.0" as const,
      id: v.id as string | number,
      result: task,
    };
  }
  if (v.error !== undefined) {
    const error = record(v.error, "cancellation.error");
    if (!Number.isInteger(error.code) || typeof error.message !== "string")
      throw new Error("invalid cancellation error");
    return {
      jsonrpc: "2.0" as const,
      id: v.id as string | number,
      error: clone(error),
    };
  }
  throw new Error("cancellation response requires result or error");
}
export async function dereferenceA2AFilePart(
  part: A2AFilePart,
  t: A2ADiscoveryTransport,
  p: A2ADiscoveryPolicy,
) {
  if (!part.file.uri) throw new Error("file part has no remote URI");
  const requested = safeUrl(part.file.uri, p, "file part"),
    d = await boundFetch(requested, t, p),
    final = safeUrl(d.finalUrl, p, "file result");
  if (final.href !== requested.href)
    throw new Error("file dereference redirect prohibited");
  if (!/^application\//i.test(d.contentType))
    throw new Error("file media type unsupported");
  return Uint8Array.from(d.bytes);
}

export type AgentSpecDocument = {
  component_type: "Agent" | "Flow";
  id: string;
  name: string;
  agentspec_version: typeof ORACLE_AGENT_SPEC_RELEASE;
  [key: string]: unknown;
};
export type ImportedAgentSpec = {
  release: typeof ORACLE_AGENT_SPEC_RELEASE;
  kind: "behavior" | "flow";
  componentId: string;
  behaviorId?: string;
  flowId?: string;
  name: string;
  specId: string;
  trusted: false;
  authorityGranted: false;
  extensions: Record<string, unknown>;
  fieldDispositions: Array<{
    path: string;
    disposition: "mapped" | "retained-extension" | "typed-loss";
  }>;
  losses: TypedAdapterLoss[];
  source: AgentSpecDocument;
};
function semanticLosses(x: unknown) {
  const out: TypedAdapterLoss[] = [],
    stack: [unknown, string][] = [[x, ""]];
  while (stack.length) {
    const [v, path] = stack.pop()!;
    if (v && typeof v === "object")
      for (const [k, c] of Object.entries(v)) {
        const p = path ? `${path}.${k}` : k;
        if (["authority", "governance", "lifecycle"].includes(k))
          out.push({
            code: `AGENT_SPEC_${k.toUpperCase()}_UNSUPPORTED`,
            path: p,
            message: `${k} is preserved but not granted or enforced`,
          });
        stack.push([c, p]);
      }
  }
  return out;
}
function sourcePaths(value: unknown) {
  const out: string[] = [],
    stack: Array<[unknown, string]> = Object.entries(
      record(value, "agent-spec"),
    ).map(([k, v]) => [v, k]);
  while (stack.length) {
    const [item, path] = stack.pop()!;
    out.push(path);
    if (item && typeof item === "object")
      for (const [k, v] of Object.entries(item))
        stack.push([v, `${path}.${k}`]);
  }
  return out.sort();
}
export function importOracleAgentSpec(
  input: unknown,
  l: AdapterLimits = DEFAULT_R13_LIMITS,
): ImportedAgentSpec {
  bounded(input, l);
  const v = record(input, "agent-spec");
  if (v.agentspec_version !== ORACLE_AGENT_SPEC_RELEASE)
    throw new Error("unsupported Oracle Agent Spec release");
  const type = text(v.component_type, "component_type");
  if (type !== "Agent" && type !== "Flow")
    throw new Error("only Agent and Flow components are supported");
  const id = text(v.id, "id"),
    name = text(v.name, "name"),
    losses = semanticLosses(v),
    common = new Set([
      "component_type",
      "id",
      "name",
      "agentspec_version",
      "description",
    ]),
    agentFields = new Set([
      "system_prompt",
      "inputs",
      "outputs",
      "tools",
      "llm_config",
      "component_plugin_name",
      "component_plugin_version",
    ]),
    flowFields = new Set([
      "start_node",
      "nodes",
      "edges",
      "component_plugin_name",
      "component_plugin_version",
    ]),
    known = new Set([
      ...common,
      ...(type === "Agent" ? agentFields : flowFields),
    ]),
    extensions = Object.fromEntries(
      Object.entries(v).filter(([k]) => !known.has(k)),
    );
  const lossPaths = losses.map((x) => x.path),
    semanticTop = new Set([
      "component_type",
      "id",
      "name",
      "agentspec_version",
      "description",
      "system_prompt",
      "start_node",
      "nodes",
      "edges",
    ]),
    fieldDispositions: Array<{
      path: string;
      disposition: "mapped" | "retained-extension" | "typed-loss";
    }> = sourcePaths(v).map((path) => ({
      path,
      disposition: lossPaths.some(
        (loss) => path === loss || path.startsWith(`${loss}.`),
      )
        ? "typed-loss"
        : semanticTop.has(path.split(".")[0]!)
          ? "mapped"
          : "retained-extension",
    }));
  if (
    type === "Agent" &&
    v.system_prompt !== undefined &&
    typeof v.system_prompt !== "string"
  )
    throw new Error("system_prompt must be a string");
  if (type === "Agent") {
    for (const field of ["inputs", "outputs", "tools"] as const)
      if (v[field] !== undefined && !Array.isArray(v[field]))
        throw new Error(`${field} must be an array`);
    if (v.llm_config !== undefined)
      text(
        record(v.llm_config, "llm_config").$component_ref,
        "llm_config.$component_ref",
      );
  }
  if (type === "Flow") {
    if (
      v.start_node === undefined ||
      !("$component_ref" in record(v.start_node, "start_node"))
    )
      throw new Error("Flow start_node must be a component reference");
    if (!Array.isArray(v.nodes)) throw new Error("Flow nodes must be an array");
    if (!Array.isArray(v.edges)) throw new Error("Flow edges must be an array");
    const nodeIds = v.nodes.map((raw, index) =>
      text(record(raw, `nodes.${index}`).id, `nodes.${index}.id`),
    );
    if (new Set(nodeIds).size !== nodeIds.length)
      throw new Error("Flow node ids must be unique");
    const start = text(
      record(v.start_node, "start_node").$component_ref,
      "start_node.$component_ref",
    );
    if (!nodeIds.includes(start))
      throw new Error("Flow start_node reference is unresolved");
    for (const [index, raw] of v.edges.entries()) {
      const edge = record(raw, `edges.${index}`),
        from = text(
          record(edge.from_node, `edges.${index}.from_node`).$component_ref,
          `edges.${index}.from_node.$component_ref`,
        ),
        to = text(
          record(edge.to_node, `edges.${index}.to_node`).$component_ref,
          `edges.${index}.to_node.$component_ref`,
        );
      if (!nodeIds.includes(from) || !nodeIds.includes(to))
        throw new Error(`Flow edge ${index} reference is unresolved`);
    }
  }
  const componentId = `agent-spec-component:${hash({ type, id }).slice(7)}`;
  return {
    release: ORACLE_AGENT_SPEC_RELEASE,
    kind: type === "Agent" ? "behavior" : "flow",
    componentId,
    ...(type === "Agent"
      ? { behaviorId: `agent-spec-behavior:${hash(id).slice(7)}` }
      : { flowId: `agent-spec-flow:${hash(id).slice(7)}` }),
    name,
    specId: `agent-spec-document:${hash(v).slice(7)}`,
    trusted: false,
    authorityGranted: false,
    extensions: clone(extensions),
    fieldDispositions,
    losses,
    source: clone(v) as AgentSpecDocument,
  };
}
export function exportOracleAgentSpec(v: ImportedAgentSpec) {
  if (v.losses.length)
    throw new Error("lossy Agent Spec import cannot be exported as exact");
  return clone(v.source);
}
export function verifyExactAgentSpecRoundTrip(
  i: unknown,
  v: ImportedAgentSpec,
) {
  return (
    !v.losses.length &&
    canonicalSemanticJson(i) === canonicalSemanticJson(exportOracleAgentSpec(v))
  );
}
export type AgentSpecActorAuthorization = {
  tenant: string;
  organization: string;
  specDigest: string;
  actorId: string;
  capabilities: string[];
  signer: string;
  algorithm: string;
  statementDigest: string;
  signature: string;
};
export const agentSpecActorAuthorizationDigest = (
  v: Omit<AgentSpecActorAuthorization, "statementDigest" | "signature">,
) => hash(v);
export function authorizeAgentSpecActor(
  c: ImportedAgentSpec,
  a: AgentSpecActorAuthorization,
  trust: { verify(v: AgentSpecActorAuthorization): boolean },
) {
  const { statementDigest, signature: _, ...statement } = a;
  if (
    c.losses.length ||
    a.specDigest !== hash(c.source) ||
    statementDigest !== agentSpecActorAuthorizationDigest(statement) ||
    !trust.verify(a)
  )
    throw new Error("Agent Spec actor lift is lossy, unbound, or unauthorized");
  if (a.actorId.startsWith("agent-spec-") || a.actorId === c.source.id)
    throw new Error("actor identity collides with component namespace");
  if(!a.tenant.trim()||!a.organization.trim()||!a.actorId.trim()||!a.signer.trim()||!a.algorithm.trim()||a.capabilities.some(x=>!x.trim())||new Set(a.capabilities).size!==a.capabilities.length)throw new Error('Agent Spec actor authorization identity or capabilities invalid');
  return {
    actorId: `org-actor:${a.actorId}`,
    tenant: a.tenant,
    organization: a.organization,
    specId: c.specId,
    componentId: c.componentId,
    capabilities: [...a.capabilities],
    authorityGranted: true as const,
    authorizationDigest: statementDigest,
  };
}
