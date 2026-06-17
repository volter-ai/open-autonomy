# Summary

Updated the self-hosted scaffold template docs to make first-time setup clearer for a newly copied repository.

Changes:
- Expanded `templates/self-driving-repo/README.md` with an explicit first-issue flow.
- Added a `First Issue Flow` section to `templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md`.
- Clarified that the setup checklist covers repository variables and secrets before the first `/agent develop` run.

# Tests

- `bun scripts/scaffold-target-repo.ts --target /tmp/open-autonomy-scaffold-smoke --force`
- `bun test scripts/open-autonomy-fleet.test.ts` in `/tmp/open-autonomy-scaffold-smoke`
