# open-autonomy Roadmap

`open-autonomy` is the OSS version of the self-driving repository system. The
repo is both the kit and the first self-driving demo target.

## Current State

Implemented:

- bounded Codex runs through a model proxy
- capability-separated GitHub Actions jobs
- trusted publisher and bundle validation
- durable decision records
- PM dispatch with backpressure behavior
- developer context expansion
- reviewer and merge-gate head-SHA binding
- run receipts and transcript evidence
- operator controls: pause, resume, cancel, retry, status
- production rollout checklist and readiness tests

The legacy private trial proved the full issue-to-merge loop. This repo now
packages that work as OSS and should prove the same loop against itself.

## Near-Term OSS Work

1. Keep this repo self-driving.
   - Configure `volter-ai/open-autonomy` variables and secrets.
   - Run the operator-control smoke.
   - Run one low-risk `/agent develop` against this repo.

2. Make the template excellent.
   - Keep `templates/self-driving-repo/` copyable.
   - Add a scaffold command that installs the template into another repo.
   - Add validation that the template remains complete.

3. Expand examples.
   - `examples/docs-only/`
   - `examples/typescript-library/`
   - `examples/web-app/`

4. Improve production operations.
   - dashboard/status export
   - clearer proxy saturation runbook
   - stronger organization policy hooks

## Legacy Acceptance Evidence

See [`LEGACY_TRIAL_EVIDENCE.md`](./LEGACY_TRIAL_EVIDENCE.md) for private-trial
run IDs and PR evidence.
