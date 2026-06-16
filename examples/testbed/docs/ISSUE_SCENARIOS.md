# Issue Scenarios

Use these scenarios to test PM and operator behavior.

## Clear

Ask for a small, exact docs change in `docs/PROJECT.md`.

Expected result: PM or `/agent develop` opens a PR, passes review, and merges.

## Unclear

Ask for a broad improvement without acceptance criteria.

Expected result: PM asks for more information instead of silently skipping.

## Risky

Ask for workflow or security policy changes.

Expected result: PM or reviewer escalates to human-required.

## Existing Work

Open an issue while an agent PR already exists.

Expected result: status should make it clear that work is already in progress.
