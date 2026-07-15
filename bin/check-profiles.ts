#!/usr/bin/env bun
// Smoke-check the profile catalog: every profile in profiles/ must parse and compile to each of its
// declared targets, with every copied file resolving to a real source in the profile. This guards the
// whole catalog (hello, self-driving, simple-sdlc, ...) against IR-spec or substrate drift — the deep
// per-file mirror/dogfood checks for self-driving live in check-compile / check-dogfood.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseIr, isInstallOwned, validateSkillFrontmatterIn } from '@open-autonomy/core';
import { compileGithub } from '@open-autonomy/substrate-github';
import { compileLocal } from '@open-autonomy/substrate-local';

const ROOT = 'profiles';
const errs: string[] = [];
const profiles = readdirSync(ROOT).filter((d) => existsSync(join(ROOT, d, 'ir.yml')));

// Drift guard: a code-host resource (CI/supply-chain/standards) that more than one github profile carries is
// a SHARED STANDARD — every install of it should be byte-identical, so the security posture can't silently
// fork (e.g. one profile's security.yml falling behind another's). We collect each github profile's resolved
// resource copies (install-path -> bytes) and, after the catalog compiles, assert every path carried by 2+
// profiles matches. Install-owned files (README/package.json/CONSTITUTION/…) are seeded-once and legitimately
// differ per install, so they're exempt — the same authority that lets `upgrade` never overwrite them.
const githubResources = new Map<string, Map<string, string>>(); // profile -> (install path -> content)

// TC.1 sibling guard: SKILLS are NOT part of `resources:` (they resolve from the fixed convention path
// `skills/<behavior>/SKILL.md`, see packages/substrate-*/src/emit.ts) so the `resources:`-scoped drift
// guard above never sees them, and it only runs for a `gh-actions` target — which would silently exempt
// local-only profiles from ever being checked. A handful of skills are
// nonetheless meant to be ONE canonical doctrine shipped byte-identical to every profile that carries it
// (today: `audit`, shared by the three profiles that declare it — docs/oa-setup-feasibility's
// OA-INSTALL-IMPLEMENTATION-TASKS.md). This is the same "each profile carries its own copy; check:profiles'
// byte-identity guard keeps the copies honest" precedent docs/CODE_HOST_RESOURCES.md already documents for
// standards docs — extended here to cover skills, and to every declared target (not gh-actions only), since
// a shared skill's byte-identity matters on a local-only profile exactly as much as on a hosted one.
const SHARED_SKILLS = ['audit'];
const sharedSkills = new Map<string, Map<string, string>>(); // behavior -> (profile -> content)

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
        target === 'gh-actions' ? compileGithub(ir) : target === 'local' ? compileLocal(ir) : null;
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

      // record this github profile's declared verbatim resources for the cross-profile drift guard (below).
      // ONLY the IR's `resources:` list — those are code-host files carried as-is. Skill installs are also
      // `copies` but are per-profile BEHAVIOR (two profiles' `pm` skills legitimately differ), not standards.
      if (target === 'gh-actions') {
        const declared = new Set(ir.resources);
        const carried = new Map<string, string>();
        for (const { from, to } of out.copies)
          if (declared.has(to) && existsSync(join(dir, from))) carried.set(to, readFileSync(join(dir, from), 'utf8'));
        githubResources.set(name, carried);
      }
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

  // Skill identity invariant (BL-22 dev/03, docs/SPEC.md#the-ir): a skill's SKILL.md frontmatter `name`
  // MUST equal its folder (the agent's behavior) — shared with the compile CLI (validateSkillFrontmatterIn)
  // so an external profile author gets the same signal this repo's own catalog is checked against.
  for (const e of validateSkillFrontmatterIn(ir, dir)) errs.push(`${name}: ${e}`);

  // Record this profile's copy of any designated SHARED skill, target-independent (the physical source
  // file — profiles/<name>/skills/<behavior>/SKILL.md — is the same bytes regardless of which target it
  // compiles to, so read it once per profile rather than once per target).
  for (const behavior of SHARED_SKILLS) {
    const skillPath = join(dir, 'skills', behavior, 'SKILL.md');
    if (!existsSync(skillPath)) continue;
    if (!sharedSkills.has(behavior)) sharedSkills.set(behavior, new Map());
    sharedSkills.get(behavior)!.set(name, readFileSync(skillPath, 'utf8'));
  }
}

// Cross-profile drift guard: every install-path carried by 2+ github profiles must be byte-identical
// (install-owned files exempt — they are per-install by design).
const byPath = new Map<string, Array<{ profile: string; content: string }>>();
for (const [profile, carried] of githubResources)
  for (const [path, content] of carried) {
    if (isInstallOwned(path)) continue;
    (byPath.get(path) ?? byPath.set(path, []).get(path)!).push({ profile, content });
  }
let sharedChecked = 0;
for (const [path, carriers] of byPath) {
  if (carriers.length < 2) continue;
  sharedChecked++;
  const baseline = carriers[0];
  const diverged = carriers.filter((c) => c.content !== baseline.content).map((c) => c.profile);
  if (diverged.length)
    errs.push(
      `shared standard "${path}" has drifted: profiles [${[baseline.profile, ...diverged].join(', ')}] carry different bytes — a shared code-host resource must be identical across github profiles (sync them, or if the divergence is intentional the file isn't a shared standard).`,
    );
}

// Cross-profile drift guard for SHARED SKILLS (TC.1): every profile carrying a designated shared skill
// (SHARED_SKILLS above) must ship byte-identical prose, regardless of target — a diverged copy of a
// doctrine that claims to be "one shared skill" is exactly the class of silent fork the resources guard
// above exists to catch for standards docs.
let sharedSkillsChecked = 0;
for (const [behavior, byProfile] of sharedSkills) {
  if (byProfile.size < 2) continue;
  sharedSkillsChecked++;
  const entries = [...byProfile.entries()];
  const [baselineProfile, baselineContent] = entries[0];
  const diverged = entries.filter(([, content]) => content !== baselineContent).map(([profile]) => profile);
  if (diverged.length)
    errs.push(
      `shared skill "${behavior}" has drifted: profiles [${[baselineProfile, ...diverged].join(', ')}] carry different bytes for skills/${behavior}/SKILL.md — a skill declared as one shared doctrine (SHARED_SKILLS in bin/check-profiles.ts) must be byte-identical across every profile that carries it (sync them, or if the divergence is intentional it isn't a shared skill — drop it from SHARED_SKILLS).`,
    );
}

if (errs.length) {
  console.error(`profiles check FAILED — ${errs.length}:\n  ${errs.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `profiles OK: ${profiles.length} profile(s) compile to all declared targets; ${sharedChecked} shared standard resource(s) byte-identical across github profiles; ${sharedSkillsChecked} shared skill(s) byte-identical across all carrying profiles`,
);
