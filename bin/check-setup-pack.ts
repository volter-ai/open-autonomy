#!/usr/bin/env bun
// TS.1's DRIFT GUARD (task list line 43, extending the check:policy-consumers precedent, bin/check-policy-
// consumers.ts): a SetupPack's HAND-AUTHORED fields (landing_mode, check_realizations, board_seed_recipe,
// maturity_signals, extra_rungs, terminal_stage) are prose MIRRORS of facts the profile's own ir.yml/
// provision.json/SKILL.md already state. Mirrors drift. This gate re-derives each fact independently from
// the profile's own source and fails when the hand-authored pack disagrees — e.g. the pack says `auto-merge`
// but the profile ships no `agent-review` realization (the task's own example), or `human-approval` shows up
// as a landing_mode instead of a required check.
//
// Scope: every profile under `profiles/` that carries a `setup-pack.yml` (TS.1 ships baseline packs for the
// four named profiles only — hello/hello-human/soc2-baseline get theirs in a later TP unit; a profile with
// no pack is simply not part of this gate yet, same "additive, not retroactive" posture check:policy-
// consumers takes toward profiles with no policy.box).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseIr, getSetupPack, SETUP_PACK_FILE } from '@open-autonomy/core';
import type { SetupPack } from '@open-autonomy/core';

function readSkillsCorpus(profileDir: string): string {
  const skillsDir = join(profileDir, 'skills');
  if (!existsSync(skillsDir)) return '';
  const parts: string[] = [];
  for (const agent of readdirSync(skillsDir)) {
    const p = join(skillsDir, agent, 'SKILL.md');
    if (existsSync(p)) parts.push(readFileSync(p, 'utf8'));
  }
  return parts.join('\n');
}

/** Every contradiction check for one profile. Returns human-readable failure lines; empty = no drift. */
export function checkPackDrift(profileDir: string): string[] {
  const errors: string[] = [];
  let pack: SetupPack;
  try {
    pack = getSetupPack(profileDir);
  } catch (e) {
    return [`${profileDir}: pack failed to load/validate — ${(e as Error).message}`];
  }
  const ir = parseIr(readFileSync(join(profileDir, 'ir.yml'), 'utf8'));
  const box = (ir.policy?.box ?? {}) as Record<string, unknown>;
  const ghActions = (box['gh-actions'] ?? {}) as Record<string, unknown>;
  const skillsCorpus = readSkillsCorpus(profileDir);

  const capBases = (name: string) =>
    (ir.agents?.[name]?.capabilities ?? []).map((c) => c.split('@')[0]);
  const hasCapability = (cap: string) => Object.keys(ir.agents ?? {}).some((n) => capBases(n).includes(cap));
  const hasHumanActor = Object.values(ir.agents ?? {}).some((a) => a.kind === 'human');

  const realizes = (check: string) => (pack.check_realizations ?? []).some((cr) => cr.check === check);
  const requires = (check: string) => (pack.required_checks ?? []).includes(check);

  // --- 1. every declared required_check needs a matching realization — "names don't self-realize" -----
  for (const check of pack.required_checks ?? [])
    if (!realizes(check))
      errors.push(`${profileDir}: required_checks includes '${check}' but check_realizations has no entry for it (names don't self-realize — TS.1 provenance)`);
  for (const cr of pack.check_realizations ?? [])
    if (!requires(cr.check))
      errors.push(`${profileDir}: check_realizations declares '${cr.check}' but it is not in required_checks — a realization for a check nobody requires is dead pack state`);

  // --- 2. landing_mode = auto-merge REQUIRES an independent agent-review realization + reviewer agent --
  if (pack.landing_mode === 'auto-merge') {
    if (!realizes('agent-review'))
      errors.push(`${profileDir}: landing_mode is 'auto-merge' but the pack ships no 'agent-review' check_realizations entry (auto-merge needs an independent review status to gate on)`);
    if (!hasCapability('code:review'))
      errors.push(`${profileDir}: landing_mode is 'auto-merge' but no agent in ir.yml holds code:review (no independent reviewer to post agent-review)`);
  }

  // --- 3. landing_mode = manual-after-review must NOT self-check via agent-review -----------------------
  // (DESIGN §Q0: "it ships no agent-review status at all — a self-check on a single shared token would be
  // dishonest"). A pack that claims manual-after-review while also declaring agent-review is contradicting
  // its own doctrine.
  if (pack.landing_mode === 'manual-after-review' && (realizes('agent-review') || requires('agent-review')))
    errors.push(`${profileDir}: landing_mode is 'manual-after-review' but declares an 'agent-review' check — this profile's own doctrine is that a self-check on one shared token is dishonest (no agent-review status should exist here)`);

  // --- 4. landing_mode = pr-free must not carry any GitHub merge-gate fields ------------------------
  if (pack.landing_mode === 'pr-free') {
    if (pack.required_checks !== undefined) errors.push(`${profileDir}: landing_mode is 'pr-free' but required_checks is declared (a PR-free profile has no PR for a check to gate)`);
    if (pack.check_realizations !== undefined) errors.push(`${profileDir}: landing_mode is 'pr-free' but check_realizations is declared`);
    if (pack.enforce_admins !== undefined) errors.push(`${profileDir}: landing_mode is 'pr-free' but enforce_admins is declared (no branch protection applies to a PR-free profile)`);
  }

  // --- 5. required_checks 'human-approval' needs a real kind:human actor (the seam it gates) -----------
  if (requires('human-approval') && !hasHumanActor)
    errors.push(`${profileDir}: required_checks includes 'human-approval' but ir.yml declares no kind:human actor (the required check gates a human seam that doesn't exist here)`);

  // --- 6. required_checks 'security' must be realized via propose_dispatch_checks AND ir must actually
  //        configure that dispatch (policy.box['gh-actions'].propose_dispatch_checks) -------------------
  if (requires('security')) {
    const sec = (pack.check_realizations ?? []).find((cr) => cr.check === 'security');
    if (sec && sec.via !== 'propose_dispatch_checks')
      errors.push(`${profileDir}: 'security' is realized via '${sec.via}' but a bot-opened PR fires no pull_request (GITHUB_TOKEN anti-recursion) — 'security' must be dispatched (via: propose_dispatch_checks)`);
    const dispatched = Array.isArray(ghActions.propose_dispatch_checks) ? (ghActions.propose_dispatch_checks as string[]) : [];
    if (!dispatched.some((w) => w.includes('security')))
      errors.push(`${profileDir}: required_checks includes 'security' but ir.yml's policy.box['gh-actions'].propose_dispatch_checks does not dispatch a security workflow — the check would never post`);
  }

  // --- 7. board_seed_recipe.promotion_fence = 'upstream-ratified' needs the roadmap-ratification loop ---
  // (a roadmap doc role + a roadmap-scoped code:propose agent — the strategist/planner machinery).
  if (pack.board_seed_recipe.promotion_fence === 'upstream-ratified') {
    const hasRoadmapDoc = Boolean(ir.documents?.roles?.roadmap);
    const hasRoadmapCap = Object.values(ir.agents ?? {}).some((a) => (a.capabilities ?? []).includes('code:propose@roadmap'));
    if (!hasRoadmapDoc || !hasRoadmapCap)
      errors.push(`${profileDir}: board_seed_recipe.promotion_fence is 'upstream-ratified' but ir.yml declares neither documents.roles.roadmap nor a code:propose@roadmap agent (no roadmap-ratification loop exists to upstream-ratify anything)`);
  }

  // --- 8. board_seed_recipe.landing_path = 'board-pr-carveout' needs the carve-out actually documented --
  if (pack.board_seed_recipe.landing_path === 'board-pr-carveout' && !/carve-?out/i.test(skillsCorpus))
    errors.push(`${profileDir}: board_seed_recipe.landing_path is 'board-pr-carveout' but no skill under skills/ documents a carve-out (the pack claims a landing path the profile's own SKILL prose never describes)`);

  // --- 9. direction_spec.mode = 'documents.roles' requires ir.documents.roles to actually exist ---------
  if (pack.direction_spec.mode === 'documents.roles' && !ir.documents?.roles)
    errors.push(`${profileDir}: direction_spec.mode is 'documents.roles' but ir.yml declares no documents.roles block`);

  // --- 10. extra_rungs 'proxy-ready' requires a configured proxy_host (the rung's own subject) ----------
  if (pack.extra_rungs.includes('proxy-ready') && !ghActions.proxy_host)
    errors.push(`${profileDir}: extra_rungs declares 'proxy-ready' but ir.yml's policy.box['gh-actions'] has no proxy_host configured (nothing for the rung to prove ready)`);

  return errors;
}

export function profilesWithPack(root = 'profiles'): string[] {
  return readdirSync(root)
    .map((d) => join(root, d))
    .filter((dir) => existsSync(join(dir, 'ir.yml')) && existsSync(join(dir, SETUP_PACK_FILE)));
}

if (import.meta.main) {
  const failures: string[] = [];
  const profiles = profilesWithPack();
  for (const dir of profiles) failures.push(...checkPackDrift(dir));
  if (failures.length) {
    process.stderr.write(`setup-pack FAIL — ${failures.length} drift/contradiction(s) across ${profiles.length} pack(s):\n` + failures.map((f) => `  ${f}\n`).join(''));
    process.exit(1);
  }
  process.stdout.write(`setup-pack OK: ${profiles.length} pack(s) checked, zero hand-authored/ir contradictions\n`);
}
