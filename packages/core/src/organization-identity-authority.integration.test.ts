import { spawn } from "node:child_process";
import { once } from "node:events";
import { createHmac, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SecretCustody } from "./organization-identity-authority";

let processHandle: ReturnType<typeof spawn>,
  base = "",
  authKey = "";
beforeAll(async () => {
  authKey = randomBytes(32).toString("hex");
  processHandle = spawn(
    process.execPath,
    ["packages/core/src/fixtures/r10-secret-store-server.ts"],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, R10_STORE_AUTH_KEY: authKey },
    },
  );
  let buffer = "";
  processHandle.stdout!.setEncoding("utf8");
  for await (const chunk of processHandle.stdout!) {
    buffer += chunk;
    const line = buffer.split("\n")[0];
    if (line) {
      base = JSON.parse(line).url;
      break;
    }
  }
  if (!base) throw new Error("external secret store did not start");
});
afterAll(async () => {
  processHandle.kill("SIGTERM");
  await Promise.race([
    once(processHandle, "exit"),
    new Promise((resolve) => setTimeout(resolve, 1000)),
  ]);
});
const call = async (
  path: string,
  tenant: string,
  value: Record<string, unknown>,
) => {
  const authorization = createHmac("sha256", authKey)
    .update(tenant)
    .digest("hex");
  const response = await fetch(`${base}/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tenant": tenant,
      "x-workload-signature": authorization,
    },
    body: JSON.stringify(value),
  });
  if (!response.ok)
    throw new Error(`${response.status}: ${await response.text()}`);
  return response.json() as Promise<any>;
};
const adapter: SecretCustody = {
  put: async (input) =>
    call("put", input.tenant, {
      ...input,
      secret: Buffer.from(input.secret).toString("base64"),
    }),
  rotate: async (input) =>
    call("rotate", input.tenant, {
      ...input,
      secret: Buffer.from(input.secret).toString("base64"),
    }),
  revoke: async (input) => {
    await call("revoke", input.tenant, input);
  },
  delete: async (input) => {
    await call("delete", input.tenant, input);
  },
  exchange: async (input) => {
    const result = await call("exchange", input.tenant, input);
    return {
      proofMaterial: Uint8Array.from(
        Buffer.from(result.proofMaterial, "base64"),
      ),
      expiresAt: result.expiresAt,
    };
  },
};

describe("R10-OPS-1: process-isolated secret custody integration", () => {
  test("issues, exchanges, rotates, revokes, deletes, expires, and tenant-isolates a real external lease store", async () => {
    const canary = Uint8Array.from(
        Buffer.from("R10_CANARY_SECRET_NEVER_PORTABLE"),
      ),
      first = await adapter.put({
        operationId: "put-live-1",
        tenant: "acme",
        credentialId: "cred-live",
        generation: 1,
        secret: canary,
        expiresAt: "2099-01-01T00:00:00Z",
      });
    expect(first.reference.provider).toBe("r10-process-store");
    const proof1 = await adapter.exchange({
      tenant: "acme",
      credentialId: "cred-live",
      generation: 1,
      audience: "github",
      requestDigest: "sha256:r1",
    });
    expect(proof1.proofMaterial.length).toBeGreaterThan(0);
    await expect(
      adapter.exchange({
        tenant: "other",
        credentialId: "cred-live",
        generation: 1,
        audience: "github",
        requestDigest: "sha256:r1",
      }),
    ).rejects.toThrow(/403|inactive/i);
    const second = await adapter.rotate({
      operationId: "rotate-live-2",
      tenant: "acme",
      credentialId: "cred-live",
      generation: 2,
      secret: Uint8Array.from(Buffer.from("ROTATED_CANARY")),
      expiresAt: "2099-01-01T00:00:00Z",
    });
    expect(second.reference.locator).toContain("/2");
    await expect(
      adapter.exchange({
        tenant: "acme",
        credentialId: "cred-live",
        generation: 1,
        audience: "github",
        requestDigest: "sha256:stale",
      }),
    ).rejects.toThrow(/403|inactive/i);
    await adapter.revoke({
      operationId: "revoke-live-2",
      tenant: "acme",
      credentialId: "cred-live",
      generation: 2,
    });
    await expect(
      adapter.exchange({
        tenant: "acme",
        credentialId: "cred-live",
        generation: 2,
        audience: "github",
        requestDigest: "sha256:r2",
      }),
    ).rejects.toThrow(/403|inactive/i);
    await adapter.put({
      operationId: "put-expired-1",
      tenant: "acme",
      credentialId: "expired",
      generation: 1,
      secret: Uint8Array.of(1),
      expiresAt: "2000-01-01T00:00:00Z",
    });
    await expect(
      adapter.exchange({
        tenant: "acme",
        credentialId: "expired",
        generation: 1,
        audience: "github",
        requestDigest: "sha256:r3",
      }),
    ).rejects.toThrow(/403|inactive/i);
    await adapter.delete({
      operationId: "delete-live",
      tenant: "acme",
      credentialId: "cred-live",
    });
    const status = await fetch(`${base}/status`, {
      headers: {
        "x-tenant": "acme",
        "x-workload-signature": createHmac("sha256", authKey)
          .update("acme")
          .digest("hex"),
      },
    }).then((value) => value.text());
    expect(status).not.toContain("R10_CANARY_SECRET_NEVER_PORTABLE");
    expect(status).not.toContain("cred-live");
    const forged = await fetch(`${base}/status`, {
      headers: {
        "x-tenant": "other",
        "x-workload-signature": createHmac("sha256", authKey)
          .update("acme")
          .digest("hex"),
      },
    });
    expect(forged.status).toBe(401);
  });
});
