// Central mock-data entry point (V2, design-first phase).
// Components must NOT import these files directly — use the hooks in
// src/hooks/useMockData.ts. When the real API lands, only the hooks change.

export { mockPlans } from "./plans";
export { mockComposers, mockComposerUsers } from "./composers";
export { mockPersonas } from "./personas";
export { mockDownloadLog } from "./downloads";
export { mockPayoutPeriods, mockPayoutLines, PLATFORM_SHARE } from "./payouts";
export {
  mockWhitelistChannels,
  mockClaimRequests,
  mockSyncOrders,
  mockBriefs,
} from "./requests";
export { mockComposerTracks } from "./tracks";
export type { ComposerTrackRow } from "./tracks";
export { mockAdminStats, mockAdminCustomers } from "./adminStats";
export type { AdminStats, AdminCustomerRow } from "./adminStats";
