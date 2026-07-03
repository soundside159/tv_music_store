import type { Brief, ClaimRequest, SyncOrder, WhitelistChannel } from "@/types/domain";

export const mockWhitelistChannels: WhitelistChannel[] = [
  {
    id: "wl_1",
    userId: "usr_pro_1",
    channelUrl: "https://youtube.com/@martaedits",
    status: "active",
    createdAt: "2026-06-02",
  },
  {
    id: "wl_2",
    userId: "usr_pro_1",
    channelUrl: "https://youtube.com/@martaedits-shorts",
    status: "pending",
    createdAt: "2026-07-01",
  },
  {
    id: "wl_3",
    userId: "usr_max_1",
    channelUrl: "https://youtube.com/@studiomax",
    status: "active",
    createdAt: "2026-05-20",
  },
];

export const mockClaimRequests: ClaimRequest[] = [
  {
    id: "cl_1",
    userId: "usr_max_1",
    trackId: "trk_001",
    composerId: "cmp_1",
    videoUrl: "https://youtube.com/watch?v=abc123",
    status: "done",
    createdAt: "2026-06-18T10:00:00Z",
    resolvedAt: "2026-06-18T16:30:00Z",
  },
  {
    id: "cl_2",
    userId: "usr_free_1",
    trackId: "trk_002",
    composerId: "cmp_1",
    videoUrl: "https://youtube.com/watch?v=def456",
    status: "new",
    createdAt: "2026-07-02T08:15:00Z",
    resolvedAt: null,
  },
];

export const mockSyncOrders: SyncOrder[] = [
  {
    id: "so_1",
    userId: "usr_max_1",
    trackId: "trk_001",
    tier: "broadcast",
    price: 399,
    createdAt: "2026-06-25",
  },
];

export const mockBriefs: Brief[] = [
  {
    id: "br_1",
    name: "Nordic Ads Studio",
    email: "producer@nordicads.example",
    type: "adaptation",
    assignedComposerId: "cmp_1",
    references: "trk_001, 30s cut with softer intro",
    description: "Need the track re-cut to a 30s TV spot with a calmer first 5 seconds.",
    budget: "$150-300",
    deadline: "2026-07-15",
    status: "in_review",
    createdAt: "2026-07-01",
  },
  {
    id: "br_2",
    name: "Pixel Forge Games",
    email: "audio@pixelforge.example",
    type: "custom",
    assignedComposerId: null,
    references: "https://open.spotify.com/track/example",
    description: "Boss fight theme, hybrid orchestral, 2 minutes, loopable.",
    budget: "$500-1000",
    deadline: "2026-08-10",
    status: "new",
    createdAt: "2026-07-02",
  },
];
