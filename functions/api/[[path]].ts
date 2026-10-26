// Cloudflare Pages Function: forwards /api/* from the Lens Pages site to the API Worker.
// Preferred: a Service binding named LENS_API -> Worker "unravix-lens-api" (Pages > Settings > Bindings).
// Fallback: env var LENS_API_URL = https://unravix-lens-api.<subdomain>.workers.dev
// public/_routes.json limits Functions to /api/*, so static files never invoke this.

export interface PagesEnv {
  LENS_API?: Fetcher;
  LENS_API_URL?: string;
}

export const onRequest: PagesFunction<PagesEnv> = async ({ request, env }) => {
  if (env.LENS_API) return env.LENS_API.fetch(request);
  if (env.LENS_API_URL) {
    const u = new URL(request.url);
    const target = new URL(u.pathname + u.search, env.LENS_API_URL);
    return fetch(new Request(target.toString(), request));
  }
  return new Response(JSON.stringify({ ok: false, error: { code: "not_configured", message: "Lens API is not connected." } }), {
    status: 503,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
};
