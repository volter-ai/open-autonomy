// Write a CompileOutput to disk: generated files verbatim, copied files via a source resolver.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CompileOutput } from './ir';

export function materialize(out: CompileOutput, destDir: string, readSource: (from: string) => string): string[] {
  const written: string[] = [];
  const write = (rel: string, content: string) => {
    const abs = join(destDir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    written.push(rel);
  };
  for (const [path, content] of Object.entries(out.generated)) write(path, content);
  for (const { from, to } of out.copies) write(to, readSource(from));
  return written.sort();
}
