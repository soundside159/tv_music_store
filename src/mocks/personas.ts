import type { Persona, Subscription, User } from "@/types/domain";

const nextMonth = "2026-08-01";

const customer = (id: string, name: string, email: string): User => ({
  id,
  email,
  name,
  role: "customer",
  createdAt: "2026-05-12",
});

const sub = (
  id: string,
  userId: string,
  plan: Subscription["plan"],
  overrides: Partial<Subscription> = {},
): Subscription => ({
  id,
  userId,
  plan,
  interval: plan === "free" ? null : "annual",
  status: "active",
  currentPeriodEnd: nextMonth,
  downloadsUsedThisPeriod: 0,
  ...overrides,
});

export const mockPersonas: Persona[] = [
  { id: "guest", label: "Guest (not signed in)", user: null, subscription: null },
  {
    id: "free-fresh",
    label: "Free — 0 of 3 downloads used",
    user: customer("usr_free_1", "Anna Free", "anna@example.com"),
    subscription: sub("sub_free_1", "usr_free_1", "free"),
  },
  {
    id: "free-limit",
    label: "Free — limit reached (3 of 3)",
    user: customer("usr_free_2", "Leo Limit", "leo@example.com"),
    subscription: sub("sub_free_2", "usr_free_2", "free", { downloadsUsedThisPeriod: 3 }),
  },
  {
    id: "pro",
    label: "Pro subscriber (annual)",
    user: customer("usr_pro_1", "Marta Pro", "marta@example.com"),
    subscription: sub("sub_pro_1", "usr_pro_1", "pro"),
  },
  {
    id: "max",
    label: "Max subscriber (annual)",
    user: customer("usr_max_1", "Studio Max", "studio@example.com"),
    subscription: sub("sub_max_1", "usr_max_1", "max"),
  },
  {
    id: "canceled",
    label: "Canceled — grace period",
    user: customer("usr_cnl_1", "Gone Grace", "grace@example.com"),
    subscription: sub("sub_cnl_1", "usr_cnl_1", "pro", {
      status: "canceled",
      currentPeriodEnd: "2026-07-20",
    }),
  },
  {
    id: "composer",
    label: "Composer dashboard",
    user: {
      id: "usr_comp_1",
      email: "owner@tvmusicstore.com",
      name: "Composer One",
      role: "composer",
      createdAt: "2026-01-10",
    },
    subscription: null,
  },
  {
    id: "admin",
    label: "Admin (owner)",
    user: {
      id: "usr_admin_1",
      email: "admin@tvmusicstore.com",
      name: "Owner Admin",
      role: "admin",
      createdAt: "2026-01-01",
    },
    subscription: null,
  },
];
