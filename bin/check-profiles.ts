#!/usr/bin/env bun
// Smoke-check the profile catalog: every profile in profiles/ must parse and compile to each of its
// declared targets, with every copied file resolving to a real source in the profile. This guards the
// whole catalog (hello, self-driving, simple-sdlc, ...) against IR-spec or substrate drift — the deep
// per-file mirror/dogfood checks for self-driving live in check-compile / check-dogfood.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseIr } from '@open-autonomy/core';
import { compileGithub } from '@open-autonomy/substrate-github';
import { compileLocal } from '@open-autonomy/substrate-local';

const ROOT = 'profiles';
const errs: string[] = [];
const profiles = readdirSync(ROOT).filter((d) => existsSync(join(ROOT, d, 'ir.yml')));

for (const name of profiles) {
  const dir = join(ROOT, name);
  let ir;
  try {
    ir = parseIr(readFileSync(join(dir, 'ir.yml'), 'utf8'));
  } catch (e) {
    errs.push(`${name}: parse failed — ${(e as Error).message}`);
    continue;
  }
  for (const target of ir.targets) {
    try {
      const out =
        target === 'github' ? compileGithub(ir) : target === 'local' ? compileLocal(ir) : null;
      if (!out) {
        errs.push(`${name}: unknown target "${target}"`);
        continue;
      }
      for (const { from } of out.copies)
        if (!existsSync(join(dir, from))) errs.push(`${name} -> ${target}: copy source missing: ${from}`);
      if (!Object.keys(out.generated).length) errs.push(`${name} -> ${target}: produced no files`);

      // Import-closure completeness: every shipped scripts/*.ts must have its local `./X.js` imports also
      // shipped. This guards the leak boundary from BOTH sides — a profile that forgets a dep of one of its
      // own scripts (broken install), and a generic-runtime file that grows a dep on profile-only code
      // (which would force that code back into every install). A missing edge fails CI, not production.
      const produced = new Map<string, string>(Object.entries(out.generated));
      for (const { from, to } of out.copies)
        if (existsSync(join(dir, from))) produced.set(to, readFileSync(join(dir, from), 'utf8'));
      for (const [path, content] of produced) {
        if (!path.startsWith('scripts/') || !path.endsWith('.ts')) continue;
        for (const m of content.matchAll(/from '\.\/([a-zA-Z0-9_-]+)\.js'/g)) {
          const dep = `scripts/${m[1]}.ts`;
          if (!produced.has(dep)) errs.push(`${name} -> ${target}: ${path} imports ./${m[1]}.js but ${dep} is not shipped`);
        }
      }

      console.log(
        `compile OK: ${name} -> ${target} (${Object.keys(out.generated).length} generated, ${out.copies.length} copies resolve)`,
      );
    } catch (e) {
      errs.push(`${name} -> ${target}: compile failed — ${(e as Error).message}`);
    }
  }

  // Skill identity invariant: a skill's SKILL.md frontmatter `name` MUST equal its folder (the agent's
  // behavior). The local launch prompt triggers the skill by that name (`$name` for codex, `/name` for
  // Claude Code) and the skill is installed under .{codex,claude}/skills/<behavior>/ — so a frontmatter
  // name that differs from the folder makes the trigger unresolvable.
  const skillsDir = join(dir, 'skills');
  if (existsSync(skillsDir)) {
    for (const behavior of readdirSync(skillsDir)) {
      const skillFile = join(skillsDir, behavior, 'SKILL.md');
      if (!existsSync(skillFile)) continue;
      const fm = readFileSync(skillFile, 'utf8').match(/^name:\s*(.+?)\s*$/m)?.[1];
      if (fm !== behavior) {
        errs.push(`${name}: skill "${behavior}" frontmatter name "${fm ?? '(missing)'}" must equal its folder "${behavior}" (the launch trigger resolves by name)`);
      }
    }
  }
}

if (errs.length) {
  console.error(`profiles check FAILED — ${errs.length}:\n  ${errs.join('\n  ')}`);
  process.exit(1);
}
console.log(`profiles OK: ${profiles.length} profile(s) compile to all declared targets`);
