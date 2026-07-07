# Releasing `open-autonomy` to npm

`open-autonomy` ships as a self-contained Node bundle on npm (`npx open-autonomy <verb>`). The published
package is **not** the repo — it is `dist/` (the bundled CLI + runtime data files) plus `profiles/`,
`README.md`, and `LICENSE` (the `files` whitelist in `package.json`). `prepublishOnly` runs
`bun run build && bun run check:pack-smoke`, so a publish always ships a fresh bundle AND self-verifies
every CLI verb from the packed tarball before npm ever sees it — a broken `dist/` can no longer sail
through a bare `npm publish` the way `0.4.0`/`0.4.1` did (see
docs/adoption-fixes/OA-01-broken-npm-publish-egress-guard.md).

## Prerequisites

- An npm auth token with publish rights for the `open-autonomy` name (owner: volter). The full-publish token
  lives in `~/.npmrc` + Keychain `npm-publish-token` — never print or commit it.
- A clean, green tree: `bun run check` must pass (it includes the in-memory conformance battery,
  `conformance exec`). The **live** GitHub conformance bench (`bun bin/bench.ts`) is a separate maintainer
  eval — it provisions real repos and spends via the proxy, so it is NOT part of release gating; run it
  manually when you want a full end-to-end signal (see `docs/` / the bench scripts).

## Steps

1. **Green check:** `bun run check`.
2. **Bump the version** in `package.json` (semver): patch for bug fixes, minor for new features. You cannot
   republish an existing version — `npm view open-autonomy version` shows what is already live.
3. **Build + verify the artifact, do not trust the source tree:**
   ```bash
   bun run check:pack-smoke        # build -> npm pack -> install the TARBALL -> run every CLI verb under plain node
   npm publish --dry-run           # inspect the tarball: dist/, profiles/, README.md, LICENSE
   ```
   `check:pack-smoke` (`scripts/pack-smoke.ts`) is the single source of truth for the packed-artifact smoke
   test — it also runs automatically as part of `prepublishOnly` (so a bare `npm publish` can't ship a
   tarball whose verbs don't run) and as the last step of `bun run check` (so CI catches it too). It builds,
   `npm pack`s into a scratch dir, asserts the tarball manifest (the bundle, every runtime data file, every
   bundled profile's `ir.yml`, and the `self-driving` profile's no-dot `gitignore` resource — see
   "Gotchas"), installs the tarball into a throwaway project, and runs `--help`, both `compile` substrates
   (including the audit's `compile simple-sdlc local .`), `lint`, `conformance exec`, `upgrade` (expects a
   controlled usage refusal, never a crash), `preflight`, and a dry-run `compile` — all via
   `npx --no-install open-autonomy …` under plain `node` (the published artifact's actual runtime, never
   bun). See docs/adoption-fixes/OA-01-broken-npm-publish-egress-guard.md for why this replaced the old
   inline one-verb recipe (a missing `dist/egress-guard.sh` broke 4 of 6 CLI verbs in `0.4.0`/`0.4.1` and
   this exact gate would have caught it).
4. **Publish:** `npm publish` (irreversible + public — confirm intent first).
5. **Tag the release:** `git tag v<version> && git push --tags`, and cut a GitHub release with the changelog.

## Gotchas (learned the hard way — keep the packed-artifact smoke test)

- **npm strips `.gitignore`.** A file literally named `.gitignore` is omitted from every npm package, even
  under a `files` whitelist. The `self-driving` profile therefore stores it as `gitignore` (no dot) and the
  github compiler emits it to `.gitignore` in the installation (`packages/substrate-github/src/emit.ts`).
  If you add another `.gitignore` resource to a profile, apply the same mapping.
- **`compile` takes a profile NAME or a path.** `npx open-autonomy compile self-driving github .` resolves
  the bundled `profiles/self-driving` via `import.meta.url` (→ `dist/` when installed, `bin/` in dev). A bare
  name that isn't a bundled profile and isn't a path errors with the list of bundled profiles.
- **The source tree lies about packaging.** Running from a clone always finds `profiles/` and dotfiles, so a
  packaging bug (like the `.gitignore` strip) only shows up against a `npm pack`ed install. Always run the
  step-3 packed smoke test before publishing.
