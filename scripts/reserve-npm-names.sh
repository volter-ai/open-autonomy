#!/usr/bin/env bash
#
# Defensively reserve the Open Autonomy package names on npm so nobody can
# squat a confusingly-similar package. Idempotent: a name that already exists
# (and is owned by us) is skipped; only missing names get a placeholder
# published.
#
# Each reserved name gets a minimal placeholder package that points back to the
# canonical repo. Bump PLACEHOLDER_VERSION only if you need to republish.
#
# Usage:
#   ./scripts/reserve-npm-names.sh            # publish any missing names
#   ./scripts/reserve-npm-names.sh --dry-run  # show what would happen
#
# Auth: either be `npm login`'d as a user who can publish, or set NPM_TOKEN to a
# granular access token with write access + "bypass 2FA". When NPM_TOKEN is set
# we route all npm calls through a throwaway userconfig so your global ~/.npmrc
# is untouched.
#
# Note: scoped names (e.g. @open-autonomy/core) require the matching npm org to
# exist first — create it once at https://www.npmjs.com/org/create.
set -euo pipefail

# If a token is provided, publish through an isolated npmrc so we never mutate
# the user's real ~/.npmrc.
if [[ -n "${NPM_TOKEN:-}" ]]; then
  TMP_NPMRC="$(mktemp)"
  {
    echo "registry=https://registry.npmjs.org"
    echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}"
  } > "${TMP_NPMRC}"
  export NPM_CONFIG_USERCONFIG="${TMP_NPMRC}"
  trap 'rm -f "${TMP_NPMRC}"' EXIT
fi

PLACEHOLDER_VERSION="0.0.1"
REPO_URL="https://github.com/volter-ai/open-autonomy"

# The names to hold. Scoped names require the matching npm org to exist first.
#
# NOTE: the no-dash variants `openautonomy` and `openautonomy-cli` are
# deliberately NOT in this list. npm's name-similarity guard rejects them as
# "too similar to" the dashed packages below — which means nobody else can
# register them either, so they're defended for free. Don't add them back; the
# publish would just fail.
NAMES=(
  "open-autonomy"
  "open-autonomy-cli"
  "@open-autonomy/core"
)

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

ME="$(npm whoami)"
echo "npm user: ${ME}"
echo

FAILED=()

for NAME in "${NAMES[@]}"; do
  # Already published? Skip (names are append-only; we never clobber).
  if EXISTING="$(npm view "${NAME}" version 2>/dev/null)"; then
    echo "✓ ${NAME} already reserved (v${EXISTING}) — skipping"
    continue
  fi

  echo "→ ${NAME} is free; preparing placeholder v${PLACEHOLDER_VERSION}"
  if [[ "${DRY_RUN}" == "1" ]]; then
    echo "  (dry-run) would publish ${NAME}"
    continue
  fi

  WORKDIR="$(mktemp -d)"
  trap 'rm -rf "${WORKDIR}"' EXIT

  cat > "${WORKDIR}/package.json" <<JSON
{
  "name": "${NAME}",
  "version": "${PLACEHOLDER_VERSION}",
  "description": "Reserved namespace for the Open Autonomy project. See ${REPO_URL}.",
  "license": "Apache-2.0",
  "homepage": "${REPO_URL}",
  "repository": { "type": "git", "url": "git+${REPO_URL}.git" },
  "keywords": ["open-autonomy", "placeholder", "reserved"],
  "publishConfig": { "access": "public" }
}
JSON

  cat > "${WORKDIR}/README.md" <<MD
# ${NAME}

Reserved placeholder for the **Open Autonomy** project.

This package name is held to prevent name-squatting. It currently ships no
functionality. The canonical project lives at ${REPO_URL}.
MD

  if ( cd "${WORKDIR}" && npm publish --access public ); then
    echo "✓ published ${NAME}@${PLACEHOLDER_VERSION}"
  else
    echo "✗ FAILED to publish ${NAME} (scoped names need the matching npm org to exist first)"
    FAILED+=("${NAME}")
  fi

  rm -rf "${WORKDIR}"
  trap - EXIT
  echo
done

echo
echo "Done. Current ownership:"
for NAME in "${NAMES[@]}"; do
  printf '  %-22s ' "${NAME}"
  npm view "${NAME}" version 2>/dev/null || echo "(not reserved)"
done

if [[ "${#FAILED[@]}" -gt 0 ]]; then
  echo
  echo "Could not reserve: ${FAILED[*]}"
  exit 1
fi
