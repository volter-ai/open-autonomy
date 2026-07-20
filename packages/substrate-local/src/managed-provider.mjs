#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MANAGED_PROVIDER_SCHEMA = 'open-autonomy.managed-provider.v1';
const OWNER_SCHEMA = 'open-autonomy.managed-provider-owner.v1';
const HERE = dirname(fileURLToPath(import.meta.url));

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

function expandPath(value) {
  if (value === '~') return homedir();
  if (value.startsWith('~/')) return join(homedir(), value.slice(2));
  return isAbsolute(value) ? value : resolve(value);
}

export function validateManagedProviderConfig(input) {
  if (!input || typeof input !== 'object') throw new Error('managed provider configuration is missing');
  if (input.schema !== MANAGED_PROVIDER_SCHEMA || input.mode !== 'managed' || input.kind !== 'virtual-tmux') {
    throw new Error(`managed provider must use schema ${MANAGED_PROVIDER_SCHEMA}, mode managed, and kind virtual-tmux`);
  }
  if (typeof input.name !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(input.name)) {
    throw new Error('managed provider name must be 3-64 lowercase letters, digits, dots, underscores, or hyphens');
  }
  if (typeof input.url !== 'string') throw new Error('managed provider url is required');
  let url;
  try {
    url = new URL(input.url);
  } catch {
    throw new Error(`managed provider url is invalid: ${input.url}`);
  }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('managed provider url must be an explicit loopback URL such as http://127.0.0.1:17620');
  }
  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('managed provider port must be between 1024 and 65535');
  if (typeof input.runtimeDir !== 'string' || !input.runtimeDir.trim()) throw new Error('managed provider runtimeDir is required');
  const runtimeDir = expandPath(input.runtimeDir.trim());
  const tmuxSocket = input.tmuxSocket ?? input.name;
  if (typeof tmuxSocket !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(tmuxSocket)) {
    throw new Error('managed provider tmuxSocket must be 3-64 lowercase letters, digits, dots, underscores, or hyphens');
  }
  const count = input.count ?? 1;
  const maxWindows = input.maxWindows ?? 16;
  const reapEndedAfterSeconds = input.reapEndedAfterSeconds ?? 300;
  if (!Number.isInteger(count) || count < 0 || count > 8) throw new Error('managed provider count must be an integer from 0 through 8');
  if (!Number.isInteger(maxWindows) || maxWindows < 1 || maxWindows > 128) throw new Error('managed provider maxWindows must be an integer from 1 through 128');
  if (!Number.isInteger(reapEndedAfterSeconds) || reapEndedAfterSeconds < 0 || reapEndedAfterSeconds > 86_400) {
    throw new Error('managed provider reapEndedAfterSeconds must be an integer from 0 through 86400');
  }
  return {
    schema: MANAGED_PROVIDER_SCHEMA,
    mode: 'managed',
    kind: 'virtual-tmux',
    name: input.name,
    url: url.origin,
    runtimeDir,
    tmuxSocket,
    count,
    maxWindows,
    reapEndedAfterSeconds,
  };
}

function ownerPath(config) {
  return join(config.runtimeDir, 'owner.json');
}

function readOwner(config) {
  const path = ownerPath(config);
  if (!existsSync(path)) return undefined;
  let owner;
  try {
    owner = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`managed provider owner record is unreadable: ${path}`);
  }
  if (
    owner?.schema !== OWNER_SCHEMA ||
    owner.name !== config.name ||
    owner.url !== config.url ||
    owner.kind !== config.kind ||
    owner.tmuxSocket !== config.tmuxSocket ||
    typeof owner.instanceId !== 'string' ||
    !owner.instanceId
  ) {
    throw new Error(`managed provider owner record does not match the configured provider: ${path}`);
  }
  return owner;
}

function writeOwner(config, health) {
  const path = ownerPath(config);
  const temp = `${path}.${process.pid}.tmp`;
  const owner = {
    schema: OWNER_SCHEMA,
    name: config.name,
    url: config.url,
    kind: config.kind,
    tmuxSocket: config.tmuxSocket,
    instanceId: health.instanceId,
    claimedAt: new Date().toISOString(),
  };
  writeFileSync(temp, `${JSON.stringify(owner, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, path);
  return owner;
}

export async function probeManagedProvider(url, timeoutMs = 1_500) {
  let response;
  try {
    response = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    return { reachable: false, error: error instanceof Error ? error.message : String(error) };
  }
  let body;
  try {
    body = await response.json();
  } catch {
    return { reachable: true, status: response.status, health: undefined };
  }
  return { reachable: true, status: response.status, health: body };
}

function assertOwnedHealth(config, owner, probe, context) {
  if (!probe.reachable) return undefined;
  const health = probe.health;
  if (!health || probe.status !== 200 || health.ok !== true || health.provider !== 'virtual-tmux' || typeof health.instanceId !== 'string') {
    throw new Error(`${context}: ${config.url} is occupied but is not a healthy virtual-tmux provider`);
  }
  if (!owner) {
    throw new Error(`${context}: ${config.url} already hosts provider ${health.instanceId}, but ${config.name} has no owner record; refusing to adopt it`);
  }
  if (health.instanceId !== owner.instanceId) {
    throw new Error(`${context}: ${config.url} hosts provider ${health.instanceId}, expected owned instance ${owner.instanceId}; refusing the collision`);
  }
  return health;
}

function resolveTermfleetCli(repoRoot) {
  const pkgPath = join(repoRoot, 'node_modules', 'termfleet', 'package.json');
  if (!existsSync(pkgPath)) throw new Error(`termfleet is not installed at ${pkgPath}`);
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.termfleet;
  if (typeof bin !== 'string' || !bin) throw new Error(`installed termfleet package has no termfleet bin entry: ${pkgPath}`);
  return resolve(dirname(pkgPath), bin);
}

function spawnProvider(config, repoRoot) {
  const cli = resolveTermfleetCli(repoRoot);
  const logPath = join(config.runtimeDir, 'provider.log');
  const logFd = openSync(logPath, 'a', 0o600);
  let child;
  try {
    child = spawn(
      process.execPath,
      [
        cli,
        'provider',
        'serve',
        '--kind',
        'virtual-tmux',
        '--prefix',
        config.name,
        '--count',
        String(config.count),
        '--max-windows',
        String(config.maxWindows),
        '--reap-ended-after',
        String(config.reapEndedAfterSeconds),
        '--cwd',
        config.runtimeDir,
        '--host',
        '127.0.0.1',
        '--port',
        String(new URL(config.url).port),
      ],
      {
        cwd: config.runtimeDir,
        detached: true,
        env: {
          ...process.env,
          TERMFLEET_HOME: join(config.runtimeDir, 'termfleet-home'),
          TERMFLEET_TMUX_SOCKET: config.tmuxSocket,
        },
        stdio: ['ignore', logFd, logFd],
      },
    );
    child.unref();
  } finally {
    closeSync(logFd);
  }
  writeFileSync(join(config.runtimeDir, 'provider.pid'), `${child.pid ?? ''}\n`, { mode: 0o600 });
  return { pid: child.pid, exited: () => child.exitCode !== null };
}

/** Make the owned provider visible in the ordinary local Termfleet console. The provider runtime keeps an
 * isolated TERMFLEET_HOME so its ownership/current-provider records cannot collide with a person's global
 * Termfleet context; registration therefore has to be explicit. It is repeated on every ensure (including
 * healthy reuse), which makes it self-healing after either the console or its registry restarts.
 *
 * Console absence is not a provider failure: headless installs are valid and the scheduler must keep its
 * pinned provider alive. The next ensure retries registration and reports the current visibility result. */
export function registerManagedProvider(config, repoRoot, options = {}) {
  const consoleUrl = (options.consoleUrl || process.env.TERMFLEET_CONSOLE_URL || 'http://127.0.0.1:7373').replace(/\/$/, '');
  const cli = options.cli || resolveTermfleetCli(repoRoot);
  const run = options.spawnSync ?? spawnSync;
  const result = run(
    process.execPath,
    [
      cli,
      'registry',
      'register-local',
      '--console-url',
      consoleUrl,
      '--url',
      config.url,
      '--label',
      config.name,
      '--alias',
      config.name,
    ],
    { cwd: config.runtimeDir, encoding: 'utf8', timeout: 5_000 },
  );
  if (result.status === 0) {
    return { visible: true, consoleUrl, detail: `registered as ${config.name}` };
  }
  const detail = String(result.stderr || result.stdout || `exit ${result.status ?? 'unknown'}`).trim();
  return { visible: false, consoleUrl, detail };
}

async function acquireLock(runtimeDir, wait, timeoutMs = 10_000) {
  const path = join(runtimeDir, 'ensure.lock');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const fd = openSync(path, 'wx', 0o600);
      writeFileSync(fd, `${process.pid}\n`);
      return () => {
        closeSync(fd);
        try {
          unlinkSync(path);
        } catch {}
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let pid = 0;
      try {
        pid = Number(readFileSync(path, 'utf8').trim());
      } catch {}
      let live = false;
      if (Number.isInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 0);
          live = true;
        } catch {}
      }
      if (live) {
        await wait(100);
        continue;
      }
      try {
        unlinkSync(path);
      } catch {}
    }
  }
  throw new Error(`timed out waiting for managed provider ensure lock in ${runtimeDir}`);
}

export async function ensureManagedProvider(input, options = {}) {
  const config = validateManagedProviderConfig(input);
  const repoRoot = options.repoRoot ? resolve(options.repoRoot) : process.cwd();
  mkdirSync(config.runtimeDir, { recursive: true, mode: 0o700 });
  mkdirSync(join(config.runtimeDir, 'termfleet-home'), { recursive: true, mode: 0o700 });
  const wait = options.sleep ?? sleep;
  const release = await acquireLock(config.runtimeDir, wait, options.lockTimeoutMs);
  const probe = options.probe ?? probeManagedProvider;
  const launch = options.spawn ?? ((cfg) => spawnProvider(cfg, repoRoot));
  const register = options.register ?? ((cfg) => registerManagedProvider(cfg, repoRoot, options));
  try {
    const owner = readOwner(config);
    const initial = await probe(config.url);
    const healthy = assertOwnedHealth(config, owner, initial, 'managed provider reuse refused');
    if (healthy) {
      const registration = await register(config);
      return { action: 'reused', config, instanceId: healthy.instanceId, pid: undefined, registration };
    }

    const child = launch(config);
    const deadline = Date.now() + (options.startTimeoutMs ?? 20_000);
    let lastProbe = initial;
    while (Date.now() < deadline) {
      await wait(options.pollMs ?? 250);
      lastProbe = await probe(config.url);
      if (lastProbe.reachable) break;
      if (child.exited?.()) throw new Error(`managed provider ${config.name} exited before becoming healthy; see ${join(config.runtimeDir, 'provider.log')}`);
    }
    if (!lastProbe.reachable) {
      throw new Error(`managed provider ${config.name} did not become healthy within ${options.startTimeoutMs ?? 20_000}ms; see ${join(config.runtimeDir, 'provider.log')}`);
    }
    const startedHealth = lastProbe.health;
    if (!startedHealth || lastProbe.status !== 200 || startedHealth.ok !== true || startedHealth.provider !== 'virtual-tmux' || typeof startedHealth.instanceId !== 'string') {
      throw new Error(`managed provider start reached ${config.url}, but its health identity is invalid`);
    }
    if (owner && startedHealth.instanceId !== owner.instanceId) {
      throw new Error(`managed provider ${config.name} restarted with instance ${startedHealth.instanceId}, expected ${owner.instanceId}; refusing identity drift`);
    }
    const claimed = owner ?? writeOwner(config, startedHealth);
    const registration = await register(config);
    return { action: owner ? 'restarted' : 'started', config, instanceId: claimed.instanceId, pid: child.pid, registration };
  } finally {
    release();
  }
}

async function main() {
  const schedulePath = resolve(process.env.AUTONOMY_SCHEDULE || 'scheduler/schedule.json');
  const schedule = JSON.parse(readFileSync(schedulePath, 'utf8'));
  if (!schedule.provider) throw new Error(`schedule has no managed provider configuration: ${schedulePath}`);
  const result = await ensureManagedProvider(schedule.provider, { repoRoot: resolve(dirname(schedulePath), '..') });
  console.log(JSON.stringify({
    action: result.action,
    name: result.config.name,
    url: result.config.url,
    instanceId: result.instanceId,
    pid: result.pid ?? null,
    console: result.registration,
  }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[managed-provider] ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
