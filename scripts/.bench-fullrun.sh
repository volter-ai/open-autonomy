#!/usr/bin/env bash
# One-shot conformance pipeline on the current HEAD. Dev-only throwaway (dot-prefixed, gitignored-by-name).
set -uo pipefail
cd /Volumes/PeakSSD/open-autonomy
WL=self-driving-conformance
PROFILE=self-driving
OLD=volter-test-fixtures/bench-self-driving-conformance-self-driving-mqrlu7n6

echo "### HEAD: $(git rev-parse --short HEAD)"
echo "### teardown old forensics cell $OLD"
bun bin/bench.ts --teardown --repo "$OLD" 2>&1 | tail -3 || echo "(teardown old: non-fatal)"

echo "### LIVE: provision fresh cell"
LIVE=$(bun bin/bench.ts --live --workload "$WL" --profile "$PROFILE" 2>&1)
echo "$LIVE"
REPO=$(echo "$LIVE" | grep -oE 'volter-test-fixtures/bench-[a-z0-9-]+' | tail -1)
if [ -z "$REPO" ]; then echo "### FATAL: could not parse repo from --live output"; exit 1; fi
echo "### REPO=$REPO"

echo "### DRIVE: overclock heartbeat until settled"
bun bin/bench.ts --drive --repo "$REPO" 2>&1 | tail -40

echo "### OPERATE: operator-sim drive+verify"
bun bin/bench.ts --operate --repo "$REPO" 2>&1 | tail -60

echo "### SCORE: coverage grade"
bun bin/bench.ts --score --repo "$REPO" --workload "$WL" 2>&1 | tail -40

echo "### DONE REPO=$REPO"
