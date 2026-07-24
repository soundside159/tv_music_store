// Domain types for the V2 subscription model.
// Mirrors the planned D1 schema in docs/TVMUSICSTORE_MASTER_PLAN.md (section 6).
// UI components must consume these through hooks (src/hooks/useMockData.ts),
// never by importing mock files directly.

export type PlanId = "free" | "pro" | "max";
export type BillingInterval = "monthly" | "annual";
export type UserRole = "customer" | "composer" | "admin";
export type SubscriptionStatus = "active" | "canceled" | "past_due";
export type ModerationStatus = "pending" | "approved" | "rejected";
export type TrackPublishStatus = "draft" | "scheduled" | "published";
export type DownloadFormat = "mp3" | "wav" | "stems";
export type WhitelistStatus = "pending" | "active" | "rejected";
export type ClaimStatus = "new" | "in_progress" | "done";
export type PayoutStatus = "draft" | "final" | "paid";
export type SyncTier = "standard" | "broadcast";
export type BriefType = "adaptation" | "custom";
export type BriefStatus = "new" | "in_review" | "accepted" | "delivered" | "declined";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string; // ISO date
}

export interface Composer {
  id: string;
  userId: string;
  slug: string;
  displayName: string;
  bio: string;
  styles: string[];
  trackCount: number;
  /** Relative weight in the author pool; 1 by default. */
  revenueWeight: number;
}

export interface PlanConfig {
  id: PlanId;
  name: string;
  priceMonthly: number; // USD
  priceAnnualPerMonth: number; // USD, effective monthly price when billed yearly
  downloadLimit: number | null; // null = unlimited
  wavAndStems: boolean;
  commercialLicense: boolean;
  whitelistSlots: number;
  prioritySupport: boolean;
  highlights: string[];
}

export interface Subscription {
  id: string;
  userId: string;
  plan: PlanId;
  interval: BillingInterval | null; // null for free
  status: SubscriptionStatus;
  currentPeriodEnd: string; // ISO date
  /** Canceled in the billing portal — stays active until currentPeriodEnd. */
  cancelAtPeriodEnd?: boolean;
  /** MP3 downloads used in the current period (relevant for free plan). */
  downloadsUsedThisPeriod: number;
}

export interface DownloadLogEntry {
  id: string;
  userId: string;
  trackId: string;
  composerId: string;
  planAtDownload: PlanId;
  format: DownloadFormat;
  createdAt: string; // ISO datetime
  /** Present on live API entries; mock entries resolve titles via catalogTracks. */
  trackTitle?: string;
  /** Track slug (live API entries) — used to re-download from the dashboard. */
  trackSlug?: string;
}

export interface WhitelistChannel {
  id: string;
  userId: string;
  channelUrl: string;
  status: WhitelistStatus;
  createdAt: string;
}

export interface ClaimRequest {
  id: string;
  userId: string;
  trackId: string;
  composerId: string;
  videoUrl: string;
  status: ClaimStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export interface PayoutPeriod {
  id: string;
  month: string; // "2026-06"
  netRevenue: number; // USD after Stripe fees
  platformShare: number;
  authorPool: number;
  status: PayoutStatus;
}

export interface PayoutLine {
  id: string;
  periodId: string;
  composerId: string;
  downloadsCount: number;
  weightedPoints: number;
  amount: number; // USD
}

export interface SyncOrder {
  id: string;
  userId: string;
  trackId: string;
  tier: SyncTier;
  price: number;
  createdAt: string;
}

export interface Brief {
  id: string;
  name: string;
  email: string;
  type: BriefType;
  assignedComposerId: string | null;
  references: string;
  description: string;
  budget: string;
  deadline: string;
  status: BriefStatus;
  createdAt: string;
}

/**
 * Mock personas let the owner preview every UI state while designing.
 * Each persona bundles a user with the session state around them.
 */
export type PersonaId =
  | "guest"
  | "free-fresh" // 0 of 3 downloads used
  | "free-limit" // 3 of 3 used — upgrade pressure state
  | "pro"
  | "max"
  | "canceled" // grace period
  | "composer"
  | "admin";

export interface Persona {
  id: PersonaId;
  label: string;
  user: User | null;
  subscription: Subscription | null;
}
