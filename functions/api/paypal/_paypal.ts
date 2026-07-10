// PayPal REST helpers for one-time track license purchases.
// Files starting with "_" are not routed.

import { DEFAULT_LICENSE_PRICES, type Env } from "../_utils";

// SERVER-SIDE prices — the client never decides what to pay. The LIVE values
// come from site_config (admin dashboard → "License prices" card) via
// getLicensePrices(db); this map is only the fallback when the DB is down.
export const LICENSE_PRICES: Record<string, number> = { ...DEFAULT_LICENSE_PRICES };

export const paypalBase = (env: Env): string =>
  env.PAYPAL_ENV === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";

export const paypalConfigured = (env: Env): boolean =>
  Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET);

export const paypalToken = async (env: Env): Promise<string> => {
  const res = await fetch(`${paypalBase(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description ?? `PayPal auth failed (HTTP ${res.status})`);
  }
  return data.access_token;
};

export const paypalCall = async <T>(
  env: Env,
  token: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> => {
  const res = await fetch(`${paypalBase(env)}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(data.message ?? `PayPal ${path} failed (HTTP ${res.status})`);
  return data;
};

export interface OrderItemInput {
  slug: string;
  tier: string;
}

/** Validates client items and prices them with the given server-side map. */
export const validateItems = (
  raw: unknown,
  prices: Record<string, number> = LICENSE_PRICES,
): { slug: string; tier: string; price: number }[] | null => {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 20) return null;
  const out: { slug: string; tier: string; price: number }[] = [];
  const seen = new Set<string>();
  for (const it of raw as OrderItemInput[]) {
    const slug = typeof it?.slug === "string" ? it.slug.trim().slice(0, 80) : "";
    const tier = typeof it?.tier === "string" ? it.tier : "";
    const price = prices[tier];
    if (!slug || !price || seen.has(slug)) return null;
    seen.add(slug);
    out.push({ slug, tier, price });
  }
  return out;
};
