#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { rmSync } from "node:fs";
import {
  assertAcceptedGitHubSearch,
  censusTupleDigest,
  leafCountDigest,
  splitCreationRange,
  splitStarRange,
  type CensusRange,
  type CensusTuple,
} from "../../packages/core/src/organization-universality-census";
import {
  verifySourceCensusSingleResponseContract,
  type FrozenSourceCensusSingleResponseContract,
} from "../../packages/core/src/organization-universality-single-response-contract";
import {
  verifyFrozenUniversalityClaim,
  type FrozenUniversalityClaim,
} from "../../packages/core/src/organization-universality-claim";
const campaignId = "organization-universality-2026-v7",
  cutoff = "2026-07-26T23:59:59.999Z",
  root = "docs/universality/campaign-v7/u1-github-raw",
  statePath = `${root}/capture-state.json`;
await mkdir(root, { recursive: true });
const lockPath = `${root}/.capture-lock`;
let ownsLock = false;
try {
  await mkdir(lockPath);
  ownsLock = true;
  await Bun.write(
    `${lockPath}/owner.json`,
    JSON.stringify({
      pid: process.pid,
      campaignId,
      startedAt: new Date().toISOString(),
    }) + "\n",
  );
} catch {
  let owner: any;
  try {
    owner = await Bun.file(`${lockPath}/owner.json`).json();
  } catch {
    throw Error("capture lock is being initialized by another writer");
  }
  try {
    process.kill(owner.pid, 0);
    throw Error(`capture already running as pid ${owner.pid}`);
  } catch (error: any) {
    if (error?.code !== "ESRCH") throw error;
  }
  await rm(lockPath, { recursive: true, force: true });
  await mkdir(lockPath);
  ownsLock = true;
  await Bun.write(
    `${lockPath}/owner.json`,
    JSON.stringify({
      pid: process.pid,
      campaignId,
      startedAt: new Date().toISOString(),
      recoveredStaleOwner: owner.pid,
    }) + "\n",
  );
}
process.on("exit", () => {
  if (ownsLock) rmSync(lockPath, { recursive: true, force: true });
});
type Attempt = {
  attempt: number;
  startedAt: string;
  status: "running" | "failed" | "complete";
  failure?: string;
  completedAt?: string;
  tupleDigest?: string;
  leafCountDigest?: string;
  repositoryCount?: number;
  result?: string;
};
type State = {
  schema: "open-autonomy.github-census-single-response-state.v3";
  campaignId: string;
  registrationCommit: string;
  captureImplementationCommit: string;
  sourceCensusContractDigest: string;
  identityOwners: Record<string, string>;
  identityNodes: Record<string, string>;
  attempts: Attempt[];
  frozen?: {
    firstAttempt: number;
    secondAttempt: number;
    completedAt: string;
    repositoryCount: number;
    population: string;
  };
};
const commit = (
    await Bun.$`git rev-parse 22f4e61^{commit}`.quiet().text()
  ).trim(),
  implementationCommit = (
    await Bun.$`git rev-parse HEAD^{commit}`.quiet().text()
  ).trim();
if (
  Bun.spawnSync([
    "git",
    "merge-base",
    "--is-ancestor",
    commit,
    implementationCommit,
  ]).exitCode !== 0
)
  throw Error(
    "preregistration commit is not an ancestor of capture implementation",
  );
for (const path of [
  "scripts/universality/capture-u1-v7.ts",
  "packages/core/src/organization-universality-census.ts",
  "packages/core/src/organization-universality-single-response-contract.ts",
]) {
  if (
    Bun.spawnSync(["git", "diff", "--quiet", "HEAD", "--", path]).exitCode !== 0
  )
    throw Error(`capture implementation path is dirty: ${path}`);
}
const show = (path: string) => {
    const result = Bun.spawnSync(["git", "show", `${commit}:${path}`]);
    if (result.exitCode !== 0)
      throw Error(`missing preregistered artifact ${path}`);
    return JSON.parse(new TextDecoder().decode(result.stdout));
  },
  contract = verifySourceCensusSingleResponseContract(
    show(
      "docs/universality/campaign-v7/source-census-contract.json",
    ) as FrozenSourceCensusSingleResponseContract,
  ),
  claim = verifyFrozenUniversalityClaim(
    show("docs/universality/campaign-v7/claim.json") as FrozenUniversalityClaim,
  );
if (
  claim.sourceCensusContractDigest !== contract.digest ||
  contract.campaignId !== campaignId ||
  contract.censusCutoff !== cutoff
)
  throw Error("preregistered census contract join mismatch");
const initial: State = {
  schema: "open-autonomy.github-census-single-response-state.v3",
  campaignId,
  registrationCommit: commit,
  captureImplementationCommit: implementationCommit,
  sourceCensusContractDigest: contract.digest,
  identityOwners: {},
  identityNodes: {},
  attempts: [],
};
const validCreatedAt = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
  Number.isFinite(Date.parse(value));
let state: State = (await Bun.file(statePath).exists())
  ? await Bun.file(statePath).json()
  : initial;
if (
  state.schema !== initial.schema ||
  !Array.isArray(state.attempts) ||
  state.attempts.some(
    (attempt, index) =>
      attempt.attempt !== index + 1 ||
      !["running", "failed", "complete"].includes(attempt.status),
  )
)
  throw Error("capture state structure invalid");
state.identityOwners = {};
state.identityNodes = {};
if (
  state.registrationCommit !== commit ||
  state.captureImplementationCommit !== implementationCommit ||
  state.sourceCensusContractDigest !== contract.digest ||
  state.campaignId !== campaignId
)
  throw Error("capture state provenance mismatch");
for await (const relative of new Bun.Glob("attempt-*/*.headers.json").scan(
  root,
)) {
  const headerPath = `${root}/${relative}`,
    header = await Bun.file(headerPath).json();
  if (header.status !== 200) continue;
  const bodyPath = headerPath.replace(/\.headers\.json$/, ".json.gz");
  if (!(await Bun.file(bodyPath).exists()))
    throw Error("retained accepted response body missing");
  const raw = Bun.gunzipSync(
      new Uint8Array(await Bun.file(bodyPath).arrayBuffer()),
    ),
    digest = `sha256:${createHash("sha256").update(raw).digest("hex")}`;
  if (digest !== header.bodyDigest) throw Error("raw-body-digest-mismatch");
  let value;
  try {
    value = assertAcceptedGitHubSearch(
      JSON.parse(new TextDecoder().decode(raw)),
    );
  } catch {
    continue;
  }
  if (value.incomplete_results) continue;
  for (const item of value.items) {
    const name = item.full_name.toLowerCase(),
      owner = state.identityOwners[item.node_id],
      node = state.identityNodes[name];
    if ((owner && owner !== name) || (node && node !== item.node_id))
      throw Error("node-id-alias");
    state.identityOwners[item.node_id] = name;
    state.identityNodes[name] = item.node_id;
  }
}
const atomicWrite = async (path: string, contents: string) => {
  const temporary = `${path}.tmp`;
  await Bun.write(temporary, contents);
  await rename(temporary, path);
};
await atomicWrite(statePath, JSON.stringify(state, null, 2) + "\n");
const validatePass = async (attempt: Attempt) => {
  const expectedResult = `${root}/attempt-${String(attempt.attempt).padStart(2, "0")}/accepted-pass.json`;
  const expectedManifest = `${root}/attempt-${String(attempt.attempt).padStart(2, "0")}/accepted-evidence-manifest.json`;
  if (
    attempt.status !== "complete" ||
    attempt.result !== expectedResult ||
    !(await Bun.file(expectedResult).exists())
  )
    throw Error("complete-pass-result-invalid");
  const value = await Bun.file(expectedResult).json();
  if (
    value.schema !== "open-autonomy.github-census-pass.v1" ||
    value.campaignId !== campaignId ||
    value.registrationCommit !== commit ||
    value.captureImplementationCommit !== implementationCommit ||
    value.sourceCensusContractDigest !== contract.digest ||
    value.attempt !== attempt.attempt ||
    value.startedAt !== attempt.startedAt ||
    value.completedAt !== attempt.completedAt ||
    value.tupleDigest !== attempt.tupleDigest ||
    value.leafCountDigest !== attempt.leafCountDigest ||
    value.repositoryCount !== value.repositories?.length ||
    value.evidenceManifest !== expectedManifest ||
    !Number.isFinite(Date.parse(value.startedAt)) ||
    !Number.isFinite(Date.parse(value.completedAt)) ||
    Date.parse(value.startedAt) > Date.parse(value.completedAt) ||
    Date.parse(value.completedAt) >= Date.parse(cutoff)
  )
    throw Error("complete-pass-provenance-invalid");
  const ids = new Set<string>(),
    tuples: CensusTuple[] = [];
  for (const row of value.repositories) {
    if (
      !row.nodeId ||
      ids.has(row.nodeId) ||
      !Number.isSafeInteger(row.stars) ||
      !Number.isFinite(Date.parse(row.observedAt))
    )
      throw Error("complete-pass-row-invalid");
    ids.add(row.nodeId);
    tuples.push({
      node_id: row.nodeId,
      full_name: row.repository,
      stargazers_count: row.stars,
      fork: row.fork,
      archived: row.archived,
    });
  }
  if (
    censusTupleDigest(tuples) !== value.tupleDigest ||
    leafCountDigest(Object.entries(value.leafCounts)) !== value.leafCountDigest
  )
    throw Error("complete-pass-digest-invalid");
  const manifest = await Bun.file(expectedManifest).json();
  if (
    manifest.schema !== "open-autonomy.github-census-evidence-manifest.v1" ||
    manifest.campaignId !== campaignId ||
    manifest.attempt !== attempt.attempt ||
    manifest.registrationCommit !== commit ||
    manifest.captureImplementationCommit !== implementationCommit ||
    manifest.sourceCensusContractDigest !== contract.digest ||
    `sha256:${createHash("sha256").update(JSON.stringify(manifest.requests)).digest("hex")}` !==
      manifest.manifestDigest ||
    manifest.manifestDigest !== value.evidenceManifestDigest
  )
    throw Error("evidence-manifest-invalid");
  const manifestedHeaders = new Set<string>(),
    rawRows = new Map<string, any>(),
    responses = new Map<string, any>();
  for (const ref of manifest.requests) {
    const prefix = `${root}/attempt-${String(attempt.attempt).padStart(2, "0")}/`;
    const bodyMatch = ref.body.match(
        new RegExp(
          `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d{5})\\.json\\.gz$`,
        ),
      ),
      headerMatch = ref.headers.match(
        new RegExp(
          `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d{5})\\.headers\\.json$`,
        ),
      );
    if (!bodyMatch || !headerMatch || bodyMatch[1] !== headerMatch[1])
      throw Error("evidence-path-invalid");
    const headerBytes = new Uint8Array(
        await Bun.file(ref.headers).arrayBuffer(),
      ),
      header = JSON.parse(new TextDecoder().decode(headerBytes)),
      raw = Bun.gunzipSync(
        new Uint8Array(await Bun.file(ref.body).arrayBuffer()),
      );
    manifestedHeaders.add(ref.headers);
    if (
      `sha256:${createHash("sha256").update(raw).digest("hex")}` !==
        ref.digest ||
      `sha256:${createHash("sha256").update(headerBytes).digest("hex")}` !==
        ref.headerDigest ||
      header.bodyDigest !== ref.digest ||
      header.url !== ref.url ||
      header.status !== 200 ||
      typeof header.headers?.["content-type"] !== "string" ||
      !header.headers["content-type"]
        .toLowerCase()
        .startsWith("application/json") ||
      !Number.isFinite(Date.parse(header.startedAt)) ||
      !Number.isFinite(Date.parse(header.observedAt)) ||
      Date.parse(header.startedAt) > Date.parse(header.observedAt) ||
      Date.parse(header.observedAt) >= Date.parse(cutoff)
    )
      throw Error("raw-evidence-invalid");
    const parsed = assertAcceptedGitHubSearch(
      JSON.parse(new TextDecoder().decode(raw)),
    );
    if (
      parsed.incomplete_results ||
      parsed.items.some((item: any) => !validCreatedAt(item.created_at))
    )
      throw Error("raw-evidence-invalid");
    const url = new URL(header.url);
    if (
      url.origin !== "https://api.github.com" ||
      url.pathname !== "/search/repositories" ||
      url.searchParams.get("sort") !== "stars" ||
      url.searchParams.get("order") !== "desc"
    )
      throw Error("evidence-url-invalid");
    const key = `${url.searchParams.get("q")}|${url.searchParams.get("per_page")}|${url.searchParams.get("page")}`;
    if (responses.has(key)) throw Error("duplicate-accepted-request");
    responses.set(key, { parsed, observedAt: header.observedAt });
  }
  const rangeQuery = (range: CensusRange) =>
    [
      `stars:${range.stars[0]}..${range.stars[1]}`,
      "fork:true",
      range.created ? `created:${range.created[0]}..${range.created[1]}` : null,
    ]
      .filter(Boolean)
      .join(" ");
  const rootResponse = responses.get("stars:>=1000 fork:true|100|1"),
    maximum = rootResponse?.parsed.items[0]?.stargazers_count;
  if (!Number.isSafeInteger(maximum) || maximum < 1000)
    throw Error("raw-traversal-root-invalid");
  const queue: CensusRange[] = [{ stars: [1000, maximum] }],
    replayedLeaves: Array<[string, number]> = [],
    expectedKeys: string[] = ["stars:>=1000 fork:true|100|1"];
  while (queue.length) {
    const range = queue.shift()!,
      countKey = `${rangeQuery(range)}|100|1`,
      countResponse = responses.get(countKey),
      count = countResponse?.parsed.total_count;
    expectedKeys.push(countKey);
    if (!Number.isSafeInteger(count))
      throw Error("raw-traversal-count-missing");
    if (count > 100) {
      const [lo, hi] = range.stars;
      if (lo < hi) {
        const [low, high] = splitStarRange(range.stars);
        queue.unshift({ ...range, stars: low }, { ...range, stars: high });
        continue;
      }
      const dates =
        range.created ??
        (["2007-10-29", value.startedAt.slice(0, 10)] as [string, string]);
      if (dates[0] === dates[1]) throw Error("raw-traversal-overflow");
      const [low, high] = splitCreationRange(dates);
      queue.unshift({ ...range, created: low }, { ...range, created: high });
      continue;
    }
    if (countResponse.parsed.items.length !== count)
      throw Error("raw-terminal-count-mismatch");
    replayedLeaves.push([JSON.stringify(range), count]);
    for (const item of countResponse.parsed.items) {
      if (
        !validCreatedAt(item.created_at) ||
        item.stargazers_count < range.stars[0] ||
        item.stargazers_count > range.stars[1] ||
        (range.created &&
          (item.created_at.slice(0, 10) < range.created[0] ||
            item.created_at.slice(0, 10) > range.created[1]))
      )
        throw Error("raw-item-outside-leaf");
      const row = {
        repository: item.full_name,
        nodeId: item.node_id,
        stars: item.stargazers_count,
        defaultBranch: item.default_branch,
        license: item.license?.spdx_id ?? "NOASSERTION",
        fork: item.fork,
        archived: item.archived,
        createdAt: item.created_at,
        description: item.description,
        topics: item.topics ?? [],
        htmlUrl: item.html_url,
        observedAt: countResponse.observedAt,
      };
      if (rawRows.has(item.node_id))
        throw Error("raw-cross-range-membership-drift");
      rawRows.set(item.node_id, row);
    }
  }
  if (JSON.stringify(expectedKeys) !== JSON.stringify([...responses.keys()]))
    throw Error("unexpected-or-reordered-accepted-request");
  if (
    rawRows.size !== replayedLeaves.reduce((sum, [, count]) => sum + count, 0)
  )
    throw Error("raw-row-count-mismatch");
  if (
    JSON.stringify(Object.fromEntries(replayedLeaves)) !==
    JSON.stringify(value.leafCounts)
  )
    throw Error("raw-leaf-traversal-mismatch");
  for await (const relative of new Bun.Glob("*.headers.json").scan(
    `${root}/attempt-${String(attempt.attempt).padStart(2, "0")}`,
  )) {
    const path = `${root}/attempt-${String(attempt.attempt).padStart(2, "0")}/${relative}`,
      header = await Bun.file(path).json();
    if (header.status === 200 && !manifestedHeaders.has(path))
      throw Error("accepted-evidence-omitted-from-manifest");
  }
  if (
    rawRows.size !== value.repositories.length ||
    value.repositories.some(
      (row: any) =>
        JSON.stringify(rawRows.get(row.nodeId)) !== JSON.stringify(row),
    )
  )
    throw Error("complete-pass-not-derived-from-raw");
  return value;
};
const finalizeIfReady = async () => {
  const completed = state.attempts.filter((x) => x.status === "complete");
  if (
    completed.length > 2 ||
    (completed.length === 2 &&
      state.attempts.at(-1)!.attempt !== completed[1].attempt)
  )
    throw Error("attempt-history-after-second-complete-pass");
  if (completed.length < 2) {
    if (state.frozen) throw Error("frozen-state-without-two-passes");
    return false;
  }
  const [first, second] = completed,
    firstPass = await validatePass(first),
    secondPass = await validatePass(second);
  const byNode = new Map<string, any[]>();
  for (const [pass, value] of [
    [first.attempt, firstPass],
    [second.attempt, secondPass],
  ] as const)
    for (const row of value.repositories) {
      const observation = {
        pass,
        observedAt: row.observedAt,
        repository: row.repository,
        stars: row.stars,
        defaultBranch: row.defaultBranch,
        license: row.license,
        fork: row.fork,
        archived: row.archived,
        createdAt: row.createdAt,
        description: row.description,
        topics: row.topics,
        htmlUrl: row.htmlUrl,
      };
      byNode.set(row.nodeId, [...(byNode.get(row.nodeId) ?? []), observation]);
    }
  const repositories = [...byNode.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([nodeId, observations]) => ({
      nodeId,
      canonicalAdoptionValue: Math.max(...observations.map((x) => x.stars)),
      observations: observations.sort(
        (a, b) => a.pass - b.pass || a.observedAt.localeCompare(b.observedAt),
      ),
    }));
  const population = "docs/universality/campaign-v7/u1-github-enumeration.json",
    publishedAt = new Date().toISOString();
  if (
    !Number.isFinite(Date.parse(second.completedAt!)) ||
    Date.parse(second.completedAt!) >= Date.parse(cutoff)
  )
    throw Error("second-complete-pass-after-cutoff");
  const artifact = {
    schema: "open-autonomy.github-exhaustive-single-response-enumeration.v3",
    campaignId,
    registrationCommit: commit,
    captureImplementationCommit: implementationCommit,
    sourceCensusContractDigest: contract.digest,
    observationScope: contract.completion.aggregation.observationScope,
    frameFreezeTime: second.completedAt,
    publishedAt,
    censusCutoff: cutoff,
    firstCompleteAttempt: first.attempt,
    secondCompleteAttempt: second.attempt,
    passEvidence: [
      {
        attempt: first.attempt,
        result: first.result,
        tupleDigest: first.tupleDigest,
        leafCountDigest: first.leafCountDigest,
      },
      {
        attempt: second.attempt,
        result: second.result,
        tupleDigest: second.tupleDigest,
        leafCountDigest: second.leafCountDigest,
      },
    ],
    repositoryCount: repositories.length,
    repositories,
  };
  await atomicWrite(population, JSON.stringify(artifact, null, 2) + "\n");
  state.frozen = {
    firstAttempt: first.attempt,
    secondAttempt: second.attempt,
    completedAt: second.completedAt!,
    repositoryCount: repositories.length,
    population,
  };
  await atomicWrite(statePath, JSON.stringify(state, null, 2) + "\n");
  return true;
};
if (await finalizeIfReady()) {
  console.log(JSON.stringify(state.frozen, null, 2));
  process.exit(0);
}
const credential = Bun.spawnSync(["git", "credential", "fill"], {
  stdin: Buffer.from("protocol=https\nhost=github.com\n\n"),
});
const password = new TextDecoder()
  .decode(credential.stdout)
  .split("\n")
  .find((x) => x.startsWith("password="))
  ?.slice(9);
if (!password)
  throw Error(
    "authenticated GitHub credential required for bounded exhaustive capture",
  );
let transportReady = false;
for (let attempt = 1; attempt <= 3 && !transportReady; attempt++) {
  try {
    const response = await fetch("https://api.github.com/rate_limit", {
      headers: {
        Authorization: `Bearer ${password}`,
        "User-Agent": "open-autonomy-universality-census-preflight",
      },
    });
    transportReady = response.status === 200;
    await response.arrayBuffer();
  } catch {}
  if (!transportReady)
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
}
if (!transportReady)
  throw Error(
    "GitHub transport preflight failed before census attempt accounting",
  );
const save = () =>
    atomicWrite(statePath, JSON.stringify(state, null, 2) + "\n"),
  sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
class RetryPass extends Error {}
const rangeKey = (range: CensusRange) => JSON.stringify(range),
  query = (range: CensusRange) =>
    [
      `stars:${range.stars[0]}..${range.stars[1]}`,
      "fork:true",
      range.created ? `created:${range.created[0]}..${range.created[1]}` : null,
    ]
      .filter(Boolean)
      .join(" ");
async function runPass(attempt: Attempt) {
  const dir = `${root}/attempt-${String(attempt.attempt).padStart(2, "0")}`;
  await mkdir(dir, { recursive: true });
  let sequence = 0;
  const evidenceRefs: Array<{
    body: string;
    headers: string;
    url: string;
    digest: string;
    headerDigest: string;
  }> = [];
  const request = async (q: string, perPage: number, page: number) => {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${perPage}&page=${page}`;
    for (;;) {
      const id = String(++sequence).padStart(5, "0"),
        startedAt = new Date().toISOString();
      let response: Response, bytes: Uint8Array;
      try {
        response = await fetch(url, {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${password}`,
            "User-Agent": "open-autonomy-universality-census",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
        bytes = new Uint8Array(await response.arrayBuffer());
      } catch (error) {
        await Bun.write(
          `${dir}/${id}.transport-error.json`,
          JSON.stringify(
            {
              url,
              startedAt,
              failedAt: new Date().toISOString(),
              error: String(error),
            },
            null,
            2,
          ) + "\n",
        );
        throw new RetryPass("transport-failure");
      }
      const observedAt = new Date().toISOString(),
        headers = Object.fromEntries(response.headers.entries()),
        digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        body = `${dir}/${id}.json.gz`,
        headerPath = `${dir}/${id}.headers.json`;
      await Bun.write(body, Bun.gzipSync(bytes));
      await Bun.write(
        headerPath,
        JSON.stringify(
          {
            url,
            startedAt,
            observedAt,
            status: response.status,
            headers,
            bodyDigest: digest,
          },
          null,
          2,
        ) + "\n",
      );
      const reset = Number(response.headers.get("x-ratelimit-reset") ?? 0);
      if (response.status === 403 && Number.isFinite(reset) && reset > 0) {
        if (Date.now() >= Date.parse(cutoff))
          throw Error("accepted-response-at-or-after-cutoff");
        await sleep(
          Math.max(1000, Math.min(60_000, reset * 1000 - Date.now() + 1000)),
        );
        continue;
      }
      if (response.status !== 200)
        throw new RetryPass("non-rate-limit-non-200");
      if (Date.parse(observedAt) >= Date.parse(cutoff))
        throw Error("accepted-response-at-or-after-cutoff");
      if (
        !response.headers
          .get("content-type")
          ?.toLowerCase()
          .startsWith("application/json")
      )
        throw new RetryPass("malformed-response-schema");
      let parsed: unknown;
      try {
        parsed = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        throw new RetryPass("malformed-response-schema");
      }
      let value;
      try {
        value = assertAcceptedGitHubSearch(parsed);
      } catch {
        throw new RetryPass("malformed-response-schema");
      }
      if (value.incomplete_results)
        throw new RetryPass("incomplete-results-true");
      if (value.items.some((item: any) => !validCreatedAt(item.created_at)))
        throw new RetryPass("malformed-response-schema");
      const stored = Bun.gunzipSync(
          new Uint8Array(await Bun.file(body).arrayBuffer()),
        ),
        storedDigest = `sha256:${createHash("sha256").update(stored).digest("hex")}`,
        headerBytes = new Uint8Array(await Bun.file(headerPath).arrayBuffer()),
        headerDigest = `sha256:${createHash("sha256").update(headerBytes).digest("hex")}`;
      if (storedDigest !== digest) throw Error("raw-body-digest-mismatch");
      evidenceRefs.push({
        body,
        headers: headerPath,
        url,
        digest,
        headerDigest,
      });
      return { value, observedAt };
    }
  };
  const passStartedAt = attempt.startedAt,
    rootResult = (await request("stars:>=1000 fork:true", 100, 1)).value,
    maximum = rootResult.items[0]?.stargazers_count;
  if (!Number.isSafeInteger(maximum) || maximum < 1000)
    throw new RetryPass("malformed-response-schema");
  const queue: CensusRange[] = [{ stars: [1000, maximum] }],
    leaves: Array<[string, number]> = [],
    repositories = new Map<string, any>(),
    names = new Map<string, string>();
  while (queue.length) {
    const range = queue.shift()!,
      response = await request(query(range), 100, 1),
      count = response.value.total_count;
    if (count > 100) {
      const [lo, hi] = range.stars;
      if (lo < hi) {
        const [low, high] = splitStarRange(range.stars);
        queue.unshift({ ...range, stars: low }, { ...range, stars: high });
        continue;
      }
      const dates =
        range.created ??
        (["2007-10-29", passStartedAt.slice(0, 10)] as [string, string]);
      if (dates[0] === dates[1]) throw Error("unpartitionable-overflow-leaf");
      const [low, high] = splitCreationRange(dates);
      queue.unshift({ ...range, created: low }, { ...range, created: high });
      continue;
    }
    if (response.value.items.length !== count)
      throw new RetryPass("cross-range-membership-drift");
    const key = rangeKey(range);
    leaves.push([key, count]);
    for (const item of response.value.items) {
      if (
        item.stargazers_count < range.stars[0] ||
        item.stargazers_count > range.stars[1] ||
        repositories.has(item.node_id)
      )
        throw new RetryPass(
          repositories.has(item.node_id)
            ? "cross-range-membership-drift"
            : "range-item-outside-query",
        );
      if (
        range.created &&
        (!validCreatedAt(item.created_at) ||
          item.created_at.slice(0, 10) < range.created[0] ||
          item.created_at.slice(0, 10) > range.created[1])
      )
        throw new RetryPass("range-item-outside-query");
      const name = item.full_name.toLowerCase(),
        owner = state.identityOwners[item.node_id],
        node = state.identityNodes[name];
      if ((owner && owner !== name) || (node && node !== item.node_id))
        throw Error("node-id-alias");
      state.identityOwners[item.node_id] = name;
      state.identityNodes[name] = item.node_id;
      names.set(item.node_id, name);
      repositories.set(item.node_id, {
        repository: item.full_name,
        nodeId: item.node_id,
        stars: item.stargazers_count,
        defaultBranch: item.default_branch,
        license: item.license?.spdx_id ?? "NOASSERTION",
        fork: item.fork,
        archived: item.archived,
        createdAt: item.created_at,
        description: item.description,
        topics: item.topics ?? [],
        htmlUrl: item.html_url,
        observedAt: response.observedAt,
      });
    }
    await save();
  }
  const expected = leaves.reduce((sum, [, count]) => sum + count, 0);
  if (repositories.size !== expected)
    throw new RetryPass("cross-range-membership-drift");
  for (const ref of evidenceRefs) {
    const headerBytes = new Uint8Array(
        await Bun.file(ref.headers).arrayBuffer(),
      ),
      header = JSON.parse(new TextDecoder().decode(headerBytes)),
      stored = Bun.gunzipSync(
        new Uint8Array(await Bun.file(ref.body).arrayBuffer()),
      ),
      actual = `sha256:${createHash("sha256").update(stored).digest("hex")}`,
      actualHeader = `sha256:${createHash("sha256").update(headerBytes).digest("hex")}`;
    if (
      actual !== ref.digest ||
      actualHeader !== ref.headerDigest ||
      header.bodyDigest !== ref.digest ||
      header.url !== ref.url ||
      header.status !== 200 ||
      Date.parse(header.observedAt) >= Date.parse(cutoff)
    )
      throw Error("raw-body-digest-mismatch");
  }
  const rows = [...repositories.values()].sort((a, b) =>
      a.nodeId.localeCompare(b.nodeId),
    ),
    tuples: CensusTuple[] = rows.map((r) => ({
      node_id: r.nodeId,
      full_name: r.repository,
      stargazers_count: r.stars,
      fork: r.fork,
      archived: r.archived,
    })),
    completedAt = new Date().toISOString();
  if (Date.parse(completedAt) >= Date.parse(cutoff))
    throw Error("second-complete-pass-after-cutoff");
  const result = `${dir}/accepted-pass.json`,
    manifest = `${dir}/accepted-evidence-manifest.json`,
    tupleDigest = censusTupleDigest(tuples),
    countsDigest = leafCountDigest(leaves),
    manifestDigest = `sha256:${createHash("sha256").update(JSON.stringify(evidenceRefs)).digest("hex")}`,
    provenance = {
      registrationCommit: commit,
      captureImplementationCommit: implementationCommit,
      sourceCensusContractDigest: contract.digest,
    };
  await Bun.write(
    manifest,
    JSON.stringify(
      {
        schema: "open-autonomy.github-census-evidence-manifest.v1",
        campaignId,
        ...provenance,
        attempt: attempt.attempt,
        manifestDigest,
        requests: evidenceRefs,
      },
      null,
      2,
    ) + "\n",
  );
  await Bun.write(
    result,
    JSON.stringify(
      {
        schema: "open-autonomy.github-census-pass.v1",
        campaignId,
        ...provenance,
        attempt: attempt.attempt,
        startedAt: passStartedAt,
        completedAt,
        tupleDigest,
        leafCountDigest: countsDigest,
        evidenceManifest: manifest,
        evidenceManifestDigest: manifestDigest,
        leafCounts: Object.fromEntries(leaves),
        repositoryCount: rows.length,
        repositories: rows,
      },
      null,
      2,
    ) + "\n",
  );
  return {
    completedAt,
    result,
    tupleDigest,
    leafCountDigest: countsDigest,
    repositoryCount: rows.length,
  };
}
if (state.attempts.at(-1)?.status === "running") {
  state.attempts.at(-1)!.status = "failed";
  state.attempts.at(-1)!.failure = "transport-failure";
  await save();
}
while (state.attempts.length < 4 && !state.frozen) {
  const attempt: Attempt = {
    attempt: state.attempts.length + 1,
    startedAt: new Date().toISOString(),
    status: "running",
  };
  state.attempts.push(attempt);
  await save();
  try {
    Object.assign(attempt, await runPass(attempt), {
      status: "complete" as const,
    });
    await save();
    if (await finalizeIfReady()) break;
  } catch (error) {
    attempt.status = "failed";
    attempt.failure = String(error instanceof Error ? error.message : error);
    await save();
    if (!(error instanceof RetryPass)) {
      await Bun.write(
        `${root}/invalidation.json`,
        JSON.stringify(
          {
            schema: "open-autonomy.github-census-invalidation.v1",
            campaignId,
            registrationCommit: commit,
            captureImplementationCommit: implementationCommit,
            sourceCensusContractDigest: contract.digest,
            reason: attempt.failure,
            attempts: state.attempts,
          },
          null,
          2,
        ) + "\n",
      );
      throw error;
    }
  }
  console.log(
    JSON.stringify({
      attempt: attempt.attempt,
      status: attempt.status,
      failure: attempt.failure,
      repositories: attempt.repositoryCount,
      tupleDigest: attempt.tupleDigest,
    }),
  );
}
if (!state.frozen) {
  await Bun.write(
    `${root}/invalidation.json`,
    JSON.stringify(
      {
        schema: "open-autonomy.github-census-invalidation.v1",
        campaignId,
        registrationCommit: commit,
        captureImplementationCommit: implementationCommit,
        sourceCensusContractDigest: contract.digest,
        reason: "four-total-attempts-with-fewer-than-two-complete-passes",
        attempts: state.attempts,
      },
      null,
      2,
    ) + "\n",
  );
  throw Error("four-total-attempts-with-fewer-than-two-complete-passes");
}
console.log(JSON.stringify(state.frozen, null, 2));
