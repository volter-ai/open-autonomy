import { expect, test } from "bun:test";
import { runR24V5BundleCli } from "./organization-r24-v5";

test("R24 V5 bundle CLI rejects unknown, missing, and surplus arguments", async () => {
  const io = {
    read: async () => "{}",
    secure: async () => true,
    write: () => undefined,
  };
  await expect(runR24V5BundleCli([], io)).rejects.toThrow("usage:");
  await expect(runR24V5BundleCli(["unknown"], io)).rejects.toThrow("usage:");
  await expect(runR24V5BundleCli(["bundle-verify", "one"], io)).rejects.toThrow(
    "usage:",
  );
  await expect(
    runR24V5BundleCli(["bundle-verify", "one", "two", "three"], io),
  ).rejects.toThrow("usage:");
  await expect(
    runR24V5BundleCli(
      ["bundle-finalize", "a", "p", "c", "t", "at"],
      io,
    ),
  ).rejects.toThrow("usage:");
});
