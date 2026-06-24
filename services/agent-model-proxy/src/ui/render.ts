// Render a hono/jsx element tree to an HTML string. The platform UI is server-rendered straight from the
// ledger (Durable Object) state — this turns a <Component/> tree into the HTML the worker returns. Sync only
// (no Suspense/async components), which is all the funding page needs.
export function render(node: unknown): string {
  return String(node);
}
