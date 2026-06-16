# Legacy Trial Evidence

`open-autonomy` was seeded from the private
`volter-ai/volter-public-agent-trial` repository.

Important live evidence from that trial:

- Phase 5 review/merge hardening: Actions run `27632534829` merged PR #67 for
  issue #66.
- Phase 6 evidence quality: Actions run `27632884925` merged PR #69 for issue
  #68 and promoted `run-receipt.json` plus `transcript.md` into session history.
- Phase 7 operator controls: issue #70 live-tested `/agent pause`, a paused
  `/agent develop` block before model minting, `/agent status`, and
  `/agent resume`.
- Push CI for production rollout checks: runs `27633852289` and `27633924814`.

The legacy repo remains useful for historical smoke logs. New OSS work should
happen in `volter-ai/open-autonomy`.
