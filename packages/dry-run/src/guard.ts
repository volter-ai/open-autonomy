// Fail-closed enforcement for dry-run mode. A dry-run is hermetic BY
// CONSTRUCTION, not by trusting a conditional: endpoints must be loopback,
// credentials must be conspicuously fake, and the process-wide fetch is
// replaced so any non-loopback request rejects instead of leaving the machine.

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', '0.0.0.0']);

export class EgressBlockedError extends Error {
  constructor(url: string) {
    super(`dry-run egress blocked: ${url} is not loopback — a dry-run must never touch external systems`);
    this.name = 'EgressBlockedError';
  }
}

export function isLoopbackUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return LOOPBACK_HOSTS.has(url.hostname);
}

// Credentials allowed in dry-run must be self-evidently fake. A real-looking
// token in a dry-run config is treated as a configuration error, full stop.
const FAKE_CREDENTIAL = /^(fake|test|twin|dry)[-_a-z0-9]*$/i;

export function assertDryRunConfig(config: {
  endpoints: Record<string, string>;
  credentials: Record<string, string>;
}): void {
  for (const [name, url] of Object.entries(config.endpoints)) {
    if (!isLoopbackUrl(url)) {
      throw new Error(`dry-run refused to start: endpoint "${name}" (${url}) is not loopback`);
    }
  }
  for (const [name, value] of Object.entries(config.credentials)) {
    if (!FAKE_CREDENTIAL.test(value)) {
      throw new Error(
        `dry-run refused to start: credential "${name}" does not look conspicuously fake (must match ${FAKE_CREDENTIAL})`,
      );
    }
  }
}

export interface EgressGuard {
  uninstall(): void;
  readonly blocked: string[];
  readonly allowed: string[];
}

// Replace globalThis.fetch with a loopback-only version. Every allowed and
// blocked request is recorded so a scenario can assert "external egress was
// zero" as a checked fact rather than an assumption.
export function installEgressGuard(): EgressGuard {
  const original = globalThis.fetch;
  const blocked: string[] = [];
  const allowed: string[] = [];
  const guarded = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!isLoopbackUrl(url)) {
      blocked.push(url);
      // Reject (not throw): real fetch reports network failure asynchronously,
      // so callers that only handle rejections still see the block.
      return Promise.reject(new EgressBlockedError(url));
    }
    allowed.push(url);
    return original(input, init);
  }) as typeof fetch;
  globalThis.fetch = guarded;
  return {
    blocked,
    allowed,
    uninstall() {
      if (globalThis.fetch === guarded) globalThis.fetch = original;
    },
  };
}
