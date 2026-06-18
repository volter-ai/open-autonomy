# Open Autonomy — working notes

## Editing shared control files

`templates/self-driving-repo/` is the source of truth for shared control files
(skills under `.codex/skills/`, `.open-autonomy/*`, `.github/workflows/`,
`scripts/`, `AGENTS.md`, `docs/CONSTITUTION.md`). Edit them **there**, then
propagate into the local/canonical repo with the upgrade tool — do not hand-edit
canonical and the template separately, because they drift (the strategist skill
once landed in canonical but was missing from the packet).

```
bun scripts/open-autonomy-upgrade.ts --template templates/self-driving-repo --target . --apply
```

After upgrading, the remaining plan should be empty; an empty plan doubles as a
template↔canonical parity check.

Known gaps to fix before relying on this fully: `MANAGED_PREFIXES` in
`scripts/open-autonomy-upgrade.ts` omits `.codex/skills/` and `docs/`, so those
do not propagate yet, and the template is a subset of canonical (applying it can
strip canonical-only managed content). Until fixed, mirror skills/docs by hand.
