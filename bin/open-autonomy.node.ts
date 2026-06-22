// Node entry point for the published CLI. The library code is bun-native and uses a few bun globals
// (Bun.YAML); under node we polyfill them with portable libs BEFORE loading the CLI, then delegate.
import { parse, stringify } from 'yaml';
const g = globalThis as unknown as { Bun?: { YAML?: unknown } };
g.Bun ??= {};
g.Bun.YAML ??= { parse, stringify };
await import('./open-autonomy.ts');
