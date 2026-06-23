// @open-autonomy/substrate-github — the github substrate: ingest the autonomy.yml manifest and
// hand-authored workflow files, emit a github installation (manifest + workflows + control plane),
// and the GithubRunner. The github runtime (the credentialed-agent skill runner, control plane, and
// model-proxy clients) lives under ./runtime.
export * from './ingest-manifest';
export * from './ingest-workflows';
export * from './emit';
export * from './runner';
