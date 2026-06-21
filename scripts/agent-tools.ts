// Baseline capability tools for the agent loop. These are the substrate-agnostic, read-side tools every
// agent gets (they work in any checkout — a github CI job or a local clone): read a file, list files, run
// a bounded command. Capability-specific, side-effecting tools (comment, create_task, launch,
// propose_change) are provided per substrate. The loop calls these by name; it never knows their impl.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Tool } from './agent-loop.js';

// Keep a path inside the root so a tool call can't read outside the work area.
function within(root: string, p: string): string | null {
  const full = resolve(root, p);
  return full === root || full.startsWith(root + '/') ? full : null;
}

/** read_file: return a file's text (bounded), confined to `root`. */
export function readFileTool(root = '.'): Tool {
  const base = resolve(root);
  return {
    name: 'read_file',
    description: 'Read a UTF-8 text file by repo-relative path. Returns its contents (truncated if large).',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    async run(args) {
      const full = within(base, String(args.path ?? ''));
      if (!full) return 'error: path is outside the work area';
      if (!existsSync(full) || !statSync(full).isFile()) return `error: no such file: ${args.path}`;
      const body = readFileSync(full, 'utf8');
      return body.length > 20_000 ? `${body.slice(0, 20_000)}\n…(truncated)` : body;
    },
  };
}

/** list_files: the repo's tracked/visible files (bounded), confined to `root`. */
export function listFilesTool(root = '.'): Tool {
  const base = resolve(root);
  const walk = (dir: string, out: string[]): string[] => {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e === '.git' || e === 'dist') continue;
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walk(full, out);
      else out.push(relative(base, full));
      if (out.length >= 800) break;
    }
    return out;
  };
  return {
    name: 'list_files',
    description: 'List the files in the work area (repo-relative paths).',
    parameters: { type: 'object', properties: {}, required: [] },
    async run() {
      return walk(base, []).sort().join('\n');
    },
  };
}

/** run_cmd: run a bounded shell command in `root` and return combined output. Use for tests/checks. The
 *  caller decides whether to grant this tool (a read-only decision agent should NOT get it). */
export function runCmdTool(root = '.', timeoutMs = 120_000): Tool {
  return {
    name: 'run_cmd',
    description: 'Run a shell command in the work area (e.g. `bun test`). Returns combined stdout+stderr and the exit code.',
    parameters: { type: 'object', properties: { cmd: { type: 'string' } }, required: ['cmd'] },
    async run(args) {
      const cmd = String(args.cmd ?? '');
      if (!cmd) return 'error: empty command';
      const r = spawnSync('bash', ['-lc', cmd], { cwd: resolve(root), encoding: 'utf8', timeout: timeoutMs, maxBuffer: 4_000_000 });
      const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
      const tail = out.length > 16_000 ? `…(truncated)\n${out.slice(-16_000)}` : out;
      return `exit ${r.status ?? 'null'}${r.signal ? ` (signal ${r.signal})` : ''}\n${tail}`;
    },
  };
}
