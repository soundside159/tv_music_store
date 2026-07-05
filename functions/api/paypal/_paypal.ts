// PayPal REST helpers for one-time track license purchases.
// Files starting with "_" are not routed.

import type { Env } from "../_utils";

// SERVER-SIDE prices — the client never decides what to pay.
// Keep in sync with src/lib/licenses.ts.
// TODO(owner): TEMPORARY TEST PRICES ($1/$2/$3) so purchases can be tested
// end-to-end for a few dollars. Restore 29 / 89 / 249 before going live.
export const LICENSE_PRICES: Record<string, number> = {
  personal: 1,
  commercial: 2,
  professional: 3,
};

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

/** Validates client items and returns them with server-side prices. */
export const validateItems = (
  raw: unknown,
): { slug: string; tier: string; price: number }[] | null => {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 20) return null;
  const out: { slug: string; tier: string; price: number }[] = [];
  const seen = new Set<string>();
  for (const it of raw as OrderItemInput[]) {
    const slug = typeof it?.slug === "string" ? it.slug.trim().slice(0, 80) : "";
    const tier = typeof it?.tier === "string" ? it.tier : "";
    const price = LICENSE_PRICES[tier];
    if (!slug || !price || seen.has(slug)) return null;
    seen.add(slug);
    out.push({ slug, tier, price });
  }
  return out;
};
