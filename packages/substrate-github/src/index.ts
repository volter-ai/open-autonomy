// @open-autonomy/substrate-github — the github substrate: ingest the autonomy.yml manifest and
// hand-authored workflow files, emit a github installation (manifest + workflows + control plane),
// and the GithubRunner. The github runtime (public-agent loop, gates, proxy clients, publisher
// bundle) lands under ./runtime as part of the coordinated runtime relocation.
export * from './ingest-manifest';
export * from './ingest-workflows';
export * from './emit';
export * from './runner';
