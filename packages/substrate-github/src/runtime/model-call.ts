// A transparent provider model call. There is NO proxy dialect here: the request is a stock provider
// wire-API call configured purely by the SDKs' own standard env vars — `OPENAI_BASE_URL`/`OPENAI_API_KEY`
// and `ANTHROPIC_BASE_URL`/`ANTHROPIC_API_KEY`. The box's model endpoint is whatever those point at: a
// bounded proxy on github, a local endpoint locally, or the real provider directly. The agent never
// knows which — it just makes the call. Whoever stands up the box (the runner) sets the env; minting,
// bounding, and auditing happen behind the endpoint, invisibly. Callers parse their own structured
// output from the returned text.
/** One bounded completion against the box's model endpoint. Returns the model's text. */
export async function modelComplete(provider: string, model: string, prompt: string, maxTokens = 800): Promise<string> {
  return provider === 'anthropic' ? anthropic(model, prompt, maxTokens) : openai(model, prompt, maxTokens);
}

async function openai(model: string, prompt: string, maxTokens: number): Promise<string> {
  const base = process.env.OPENAI_BASE_URL;
  const key = process.env.OPENAI_API_KEY;
  if (!base || !key) throw new Error('OPENAI_BASE_URL and OPENAI_API_KEY are required');
  const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`OpenAI model call failed: ${res.status}`);
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return body.choices?.[0]?.message?.content ?? '';
}

async function anthropic(model: string, prompt: string, maxTokens: number): Promise<string> {
  const base = process.env.ANTHROPIC_BASE_URL;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!base || !key) throw new Error('ANTHROPIC_BASE_URL and ANTHROPIC_API_KEY are required');
  const res = await fetch(`${base.replace(/\/$/, '')}/v1/messages`, {
    method: 'POST',
    // Native Anthropic auth is `x-api-key`; we also send `Authorization: Bearer` so the same call works
    // against a bounded proxy that authenticates by bearer token (the github box endpoint today). A real
    // Anthropic endpoint uses x-api-key and ignores the extra header.
    headers: { 'x-api-key': key, authorization: `Bearer ${key}`, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Anthropic model call failed: ${res.status}`);
  const body = (await res.json()) as { content?: Array<{ text?: string }> };
  return body.content?.map((p) => p.text ?? '').join('\n') ?? '';
}
