# TV Music Store — Backend Highlights

A few representative pieces of the server (Cloudflare Pages Functions, TypeScript,
D1 + R2, no Node runtime, no payment SDKs). Comments trimmed to the essence.

---

## 1. Stripe webhook — signature verification (native Web Crypto)

HMAC-SHA256 exactly as Stripe specs it (`t.payload`), a ±5-min replay window,
and a constant-time compare so response timing can't leak the signature.
Supports multiple `v1=` (secret rotation).

```ts
export const verifyStripeSignature = async (
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> => {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.trim());
  const t = parts.find((p) => p.startsWith("t="))?.slice(2);
  const v1s = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || v1s.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSeconds) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = toHex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`)),
  );

  return v1s.some((v) => {
    if (v.length !== sig.length) return false;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ v.charCodeAt(i);
    return diff === 0;
  });
};
```

---

## 2. Stripe REST client (no SDK, form-encoded)

```ts
export const stripeCall = async <T>(
  secretKey: string,
  method: "GET" | "POST",
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<T> => {
  const encoded = params
    ? new URLSearchParams(
        Object.entries(params).flatMap(([k, v]) =>
          v === undefined ? [] : [[k, String(v)] as [string, string]],
        ),
      ).toString()
    : "";
  const url = `https://api.stripe.com/v1${path}${method === "GET" && encoded ? `?${encoded}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${secretKey}`,
      ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "POST" && encoded ? encoded : undefined,
  });
  const data = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(data.error?.message ?? `Stripe ${path} failed (HTTP ${res.status})`);
  return data;
};
```

---

## 3. Idempotent revenue ledger (a duplicated webhook writes nothing)

Splits gross → tax → fee → net in one place; keyed on `provider_ref`.

```ts
export const recordRevenueEvent = async (
  db: D1Database,
  input: RevenueEventInput,
): Promise<string | null> => {
  await ensureRevenueTables(db);

  const existing = await db
    .prepare(`SELECT id FROM revenue_events WHERE provider_ref = ?1`)
    .bind(input.providerRef)
    .first<{ id: string }>();
  if (existing) return existing.id;

  const gross = Math.max(0, Math.round(input.grossCents));
  const tax = Math.max(0, Math.round(input.taxCents));
  const fee = Math.max(0, Math.round(input.feeCents));
  const net = Math.max(0, gross - tax - fee);
  const id = newId("rev");

  await db
    .prepare(
      `INSERT INTO revenue_events
         (id, source, user_id, provider, provider_ref, gross_cents, tax_cents, fee_cents,
          net_cents, currency, author_share_bps, period_start, period_end, track_id, order_id, status)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,'pending')`,
    )
    .bind(
      id, input.source, input.userId, input.provider, input.providerRef,
      gross, tax, fee, net, input.currency ?? "usd",
      input.authorShareBps ?? DEFAULT_AUTHOR_SHARE_BPS,
      input.periodStart ?? null, input.periodEnd ?? null,
      input.trackId ?? null, input.orderId ?? null,
    )
    .run();

  return id;
};
```

---

## 4. Self-healing prices (survives a Stripe environment switch)

If the stored `price_id` was created in another environment (sandbox, test↔live)
it no longer resolves — verify, else recreate.

```ts
export const ensurePrices = async (
  key: string,
  ctx: Ctx,
  plan: PlanRow,
  interval: "monthly" | "annual",
): Promise<string> => {
  const existing = interval === "annual" ? plan.stripe_price_annual : plan.stripe_price_monthly;
  if (existing) {
    try {
      const p = await stripeCall<{ id: string; active?: boolean }>(key, "GET", `/prices/${existing}`);
      if (p?.id && p.active !== false) return p.id;
    } catch { /* gone / foreign id — recreate */ }
  }

  const product = await stripeCall<{ id: string }>(key, "POST", "/products", {
    name: `TV Music Store ${plan.name}`,
    "metadata[plan]": plan.id,
  });
  const monthly = await stripeCall<{ id: string }>(key, "POST", "/prices", {
    product: product.id, currency: "usd",
    unit_amount: Math.round(plan.price_monthly * 100),
    "recurring[interval]": "month",
    "metadata[plan]": plan.id, "metadata[interval]": "monthly",
  });
  const annual = await stripeCall<{ id: string }>(key, "POST", "/prices", {
    product: product.id, currency: "usd",
    unit_amount: Math.round(plan.price_annual_per_month * 12 * 100),
    "recurring[interval]": "year",
    "metadata[plan]": plan.id, "metadata[interval]": "annual",
  });
  await ctx.env.DB
    .prepare(`UPDATE plan_config SET stripe_price_monthly = ?1, stripe_price_annual = ?2 WHERE id = ?3`)
    .bind(monthly.id, annual.id, plan.id)
    .run();
  return interval === "annual" ? annual.id : monthly.id;
};
```

---

## 5. Webhook dispatcher (verify → route)

```ts
export const onRequestPost = async (ctx: Ctx) => {
  if (!ctx.env.DB) return json({ error: "DB not bound" }, 503);
  const key = ctx.env.STRIPE_SECRET_KEY;
  const whSecret = ctx.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !whSecret) return json({ error: "Webhook not configured" }, 503);

  const payload = await ctx.request.text();
  const ok = await verifyStripeSignature(payload, ctx.request.headers.get("stripe-signature"), whSecret);
  if (!ok) return json({ error: "Invalid signature" }, 400);

  const event = JSON.parse(payload) as { type: string; data: { object: Record<string, unknown> } };

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as { mode?: string; subscription?: string | null } & LicenseCartSession;
      if (s.subscription) {
        const sub = await stripeCall<StripeSubscription>(key, "GET", `/subscriptions/${s.subscription}`);
        await applySubscription(ctx, sub, s.client_reference_id);
      } else if (s.mode === "payment" && s.metadata?.kind === "license_cart") {
        await fulfillLicenseCart(ctx, key, s);
      }
      break;
    }
    case "invoice.paid":
    case "invoice.payment_succeeded":
      await recordStripeInvoice(ctx, key, event.data.object as unknown as StripeInvoice);
      break;
    case "customer.subscription.updated":
      await applySubscription(ctx, event.data.object as unknown as StripeSubscription);
      break;
    case "customer.subscription.deleted": {
      const sub = event.data.object as unknown as StripeSubscription;
      if (sub.metadata?.user_id) {
        await upsertSubscription(ctx.env.DB, sub.metadata.user_id, {
          stripeSubId: sub.id, stripeCustomerId: sub.customer,
          plan: "free", interval: null, status: "canceled",
          currentPeriodEnd: unixToIso(sub.current_period_end),
        });
      }
      break;
    }
    case "charge.refunded":
    case "charge.dispute.created":
    case "charge.dispute.funds_withdrawn":
      /* reverseEvent(...) — back the event out of revenue */
      break;
  }

  return json({ received: true });
};
```

---

## 6. Users — session resolution (cookie → DB, expiry enforced in SQL)

The session token is an opaque cookie; validity (and expiry) is a single JOIN.
IDs are prefixed UUIDs; passwords are PBKDF2 (WebCrypto) — no external auth service.

```ts
export const SESSION_COOKIE = "tvms_session";

export const newId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

export const getSessionUser = async (ctx: Ctx): Promise<SessionUser | null> => {
  const token = getCookie(ctx.request, SESSION_COOKIE);
  if (!token) return null;
  const row = await ctx.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ?1 AND s.expires_at > datetime('now')`,
  )
    .bind(token)
    .first<SessionUser>();
  return row ?? null;
};

// Admin without a browser session: local tools present x-admin-token == ADMIN_API_TOKEN.
export const adminTokenOk = (ctx: Ctx): boolean => {
  const t = ctx.request.headers.get("x-admin-token");
  return !!ctx.env.ADMIN_API_TOKEN && !!t && t === ctx.env.ADMIN_API_TOKEN;
};
```

Password hashing (PBKDF2-SHA256, 100k iterations, per-user salt — all in-runtime):

```ts
const deriveBits = async (password: string, salt: Uint8Array, iterations: number) => {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as unknown as BufferSource, iterations },
    key, 256,
  );
};
```

---

## 7. Composers — the right *name* on the file

A composer has a legal cue-sheet name and a public pseudonym. The customer must
see the **pseudonym** on every file they unzip — never the passport name — so the
filename builder resolves `display_name` first, `cue_name` only as a fallback for
old profiles. The cue name still prints on the licence PDF / cue sheet.

```ts
const composerName = await (async () => {
  if (!track?.composer_id) return "";
  try {
    const c = await ctx.env.DB.prepare(
      `SELECT cue_name, display_name FROM composers WHERE id = ?1`,
    )
      .bind(track.composer_id)
      .first<{ cue_name: string | null; display_name: string | null }>();
    return (c?.display_name || c?.cue_name || "").trim();
  } catch {
    const c = await ctx.env.DB.prepare(`SELECT display_name FROM composers WHERE id = ?1`)
      .bind(track.composer_id)
      .first<{ display_name: string | null }>();
    return (c?.display_name || "").trim();
  }
})();

// "tvmusicstore.com_1685_Composer Name_Title (30sec).wav" — for every audio file we put in a zip.
const stem = ["tvmusicstore.com", trackCode, sanitizeFilename(composerName), sanitizeFilename(tidyTitle(track?.title ?? slug))]
  .filter(Boolean)
  .join("_");
```
