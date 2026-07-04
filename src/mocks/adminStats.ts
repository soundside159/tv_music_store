// Aggregated business metrics for the admin dashboard (design phase).
// Later these come from D1 queries + Stripe.

export interface AdminStats {
  mrr: number;
  mrrGrowthPct: number;
  subscribers: { free: number; pro: number; max: number };
  freeToPaidPct: number;
  churnPct: number;
  visitors30d: number;
  signups30d: number;
  downloads30d: number;
  revenueStreams: { label: string; amount: number }[];
}

export const mockAdminStats: AdminStats = {
  mrr: 876,
  mrrGrowthPct: 18,
  subscribers: { free: 412, pro: 63, max: 29 },
  freeToPaidPct: 4.6,
  churnPct: 5.2,
  visitors30d: 9340,
  signups30d: 287,
  downloads30d: 1904,
  revenueStreams: [
    { label: "Subscriptions", amount: 876 },
    { label: "Sync licenses", amount: 399 },
    { label: "Custom & adaptation", amount: 300 },
  ],
};

export interface AdminCustomerRow {
  id: string;
  name: string;
  email: string;
  plan: "free" | "pro" | "max";
  ltv: number;
  downloads: number;
  joined: string;
}

export const mockAdminCustomers: AdminCustomerRow[] = [
  { id: "usr_max_1", name: "Studio Max", email: "studio@example.com", plan: "max", ltv: 180, downloads: 214, joined: "2026-03-02" },
  { id: "usr_pro_1", name: "Marta Pro", email: "marta@example.com", plan: "pro", ltv: 84, downloads: 158, joined: "2026-04-11" },
  { id: "usr_cnl_1", name: "Gone Grace", email: "grace@example.com", plan: "pro", ltv: 36, downloads: 61, joined: "2026-05-19" },
  { id: "usr_free_1", name: "Anna Free", email: "anna@example.com", plan: "free", ltv: 0, downloads: 9, joined: "2026-06-07" },
  { id: "usr_free_2", name: "Leo Limit", email: "leo@example.com", plan: "free", ltv: 0, downloads: 12, joined: "2026-06-21" },
];
