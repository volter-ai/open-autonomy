# Releasing `open-autonomy` to npm

`open-autonomy` ships as a self-contained Node bundle on npm (`npx open-autonomy <verb>`). The published
package is **not** the repo — it is `dist/` (the bundled CLI + runtime data files) plus `profiles/`,
`README.md`, and `LICENSE` (the `files` whitelist in `package.json`). `prepublishOnly` runs `bun run build`,
so a publish always ships a fresh bundle.

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
   bun run build
   npm publish --dry-run          # inspect the tarball: dist/, profiles/, README.md, LICENSE
   ```
   Then smoke-test the *packed* artifact in a throwaway repo (this catches packaging bugs the source tree
   hides — see "Gotchas"):
   ```bash
   TGZ=$(npm pack); T=$(mktemp -d); (cd "$T" && git init -q && npm init -y >/dev/null && npm install "$OLDPWD/$TGZ" \
     && npx --no-install open-autonomy compile self-driving github . && test -f .gitignore && ls .github/workflows)
   rm -f "$TGZ"
   ```
   Expect a clean exit, `.gitignore` written, and the 8 workflows laid down.
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
