// Last-resort error guard for every /api/* function.
//
// When D1 is unavailable (e.g. the free-plan daily read limit — outage of
// 2026-11-03) any unguarded query throws, and Cloudflare shows its raw
// "Error 1101 — Worker threw exception" page. Here such a crash becomes a
// clean 503 JSON the app can show, and the Google sign-in callback goes back
// to /login with a readable reason instead of a Cloudflare error page.

interface MwCtx {
  request: Request;
  next: () => Promise<Response>;
}

export const onRequest = async (ctx: MwCtx): Promise<Response> => {
  try {
    return await ctx.next();
  } catch (e) {
    const url = new URL(ctx.request.url);
    console.error("API crash", url.pathname, e instanceof Error ? e.message : String(e));
    if (ctx.request.method === "GET" && url.pathname.startsWith("/api/auth/google")) {
      return Response.redirect(
        `${url.origin}/login?error=${encodeURIComponent("Sign-in is temporarily unavailable. Please try again in a few minutes.")}`,
        302,
      );
    }
    return new Response(
      JSON.stringify({ error: "The service is temporarily unavailable. Please try again in a few minutes." }),
      {
        status: 503,
        headers: { "content-type": "application/json; charset=utf-8", "retry-after": "120", "cache-control": "no-store" },
      },
    );
  }
};
