import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
type Entry = {
  tenant: string;
  credentialId: string;
  generation: number;
  secret: Uint8Array;
  expiresAt: string;
  revoked: boolean;
};
const entries = new Map<string, Entry>(),
  operations = new Map<
    string,
    { reference: { provider: string; locator: string }; leaseId: string }
  >(),
  key = (tenant: string, id: string, generation: number) =>
    `${tenant}/${id}/${generation}`;
const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url),
      tenant = request.headers.get("x-tenant") ?? "",
      body = request.method === "GET" ? {} : ((await request.json()) as any);
    if (!tenant)
      return Response.json({ error: "tenant required" }, { status: 401 });
    const expected = createHmac("sha256", process.env.R10_STORE_AUTH_KEY ?? "")
      .update(tenant)
      .digest();
    const supplied = Buffer.from(
      request.headers.get("x-workload-signature") ?? "",
      "hex",
    );
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      return Response.json(
        { error: "workload authentication failed" },
        { status: 401 },
      );
    if (url.pathname === "/put" || url.pathname === "/rotate") {
      if (body.tenant !== tenant)
        return Response.json({ error: "cross tenant" }, { status: 403 });
      const operationKey = `${tenant}/${body.operationId}`;
      const priorResult = operations.get(operationKey);
      if (priorResult) return Response.json(priorResult);
      if (url.pathname === "/rotate") {
        for (const entry of entries.values()) {
          if (
            entry.tenant === tenant &&
            entry.credentialId === body.credentialId
          ) {
            entry.revoked = true;
            entry.secret.fill(0);
          }
        }
      }
      const secret = Uint8Array.from(Buffer.from(body.secret, "base64")),
        entry = {
          tenant,
          credentialId: body.credentialId,
          generation: body.generation,
          secret,
          expiresAt: body.expiresAt,
          revoked: false,
        };
      entries.set(key(tenant, body.credentialId, body.generation), entry);
      const result = {
        reference: {
          provider: "r10-process-store",
          locator: `credential/${body.credentialId}/${body.generation}`,
        },
        leaseId: randomUUID(),
      };
      operations.set(operationKey, result);
      return Response.json(result);
    }
    if (url.pathname === "/revoke") {
      for (const entry of entries.values())
        if (
          entry.tenant === tenant &&
          entry.credentialId === body.credentialId &&
          entry.generation === body.generation
        ) {
          entry.revoked = true;
          entry.secret.fill(0);
        }
      return Response.json({ ok: true });
    }
    if (url.pathname === "/delete") {
      for (const [id, entry] of entries)
        if (
          entry.tenant === tenant &&
          entry.credentialId === body.credentialId
        ) {
          entry.secret.fill(0);
          entries.delete(id);
        }
      return Response.json({ ok: true });
    }
    if (url.pathname === "/exchange") {
      const entry = entries.get(
        key(tenant, body.credentialId, body.generation),
      );
      if (!entry || entry.revoked || Date.parse(entry.expiresAt) <= Date.now())
        return Response.json({ error: "inactive" }, { status: 403 });
      const material = createHash("sha256")
        .update(entry.secret)
        .update(body.audience)
        .update(body.requestDigest)
        .digest();
      return Response.json({
        proofMaterial: material.toString("base64"),
        expiresAt: entry.expiresAt,
      });
    }
    if (url.pathname === "/status")
      return Response.json({
        entries: [...entries.values()]
          .filter((value) => value.tenant === tenant)
          .map((value) => ({
            credentialId: value.credentialId,
            generation: value.generation,
            revoked: value.revoked,
            expiresAt: value.expiresAt,
          })),
      });
    return new Response("not found", { status: 404 });
  },
});
console.log(JSON.stringify({ url: `http://127.0.0.1:${server.port}` }));
