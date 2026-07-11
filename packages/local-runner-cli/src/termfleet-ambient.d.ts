// @volter/oa never bundles or depends-on termfleet/@termfleet/core (they are the ADOPTER repo's own
// runtime deps, resolved dynamically from ITS node_modules at CWD — see src/env.ts's
// `defaultResolveDefaultProvider` and src/sessions.ts's `defaultSessionRunner`, both dynamic `import()`s
// keyed off `process.cwd()`, never a static package dependency of this workspace member). This ambient
// declaration exists ONLY so `tsc` can typecheck the dynamic-import call site without the real package
// installed in THIS monorepo's dependency graph — it mirrors the one function the OA-09 provider-origin
// resolve actually calls, nothing more.
declare module '@termfleet/core/local-providers.js' {
  export function resolveDefaultProvider(opts: { url?: string }): Promise<{ baseUrl: string; source: string }>;
}
