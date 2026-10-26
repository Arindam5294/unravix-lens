import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../../functions/api/[[path]].ts";

const call = (env: Record<string, unknown>, url = "https://lens.example/api/health") =>
  (onRequest as unknown as (c: unknown) => Promise<Response>)({ request: new Request(url), env });

test("Pages Function forwards /api/* through the LENS_API service binding", async () => {
  let seen = "";
  const res = await call({ LENS_API: { fetch: async (r: Request) => { seen = r.url; return new Response("ok"); } } });
  assert.equal(await res.text(), "ok");
  assert.equal(seen, "https://lens.example/api/health");
});

test("Pages Function falls back to LENS_API_URL, else a not_configured JSON error", async () => {
  const real = globalThis.fetch;
  let seen = "";
  globalThis.fetch = (async (r: Request) => { seen = r.url; return new Response("ok"); }) as typeof fetch;
  try {
    await call({ LENS_API_URL: "https://unravix-lens-api.example.workers.dev" }, "https://lens.example/api/analyze?x=1");
    assert.equal(seen, "https://unravix-lens-api.example.workers.dev/api/analyze?x=1");
  } finally { globalThis.fetch = real; }
  const res = await call({});
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, "not_configured");
});
