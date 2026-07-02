export type TrackCategory = "modern-score" | "thriller" | "game-ost" | "production";

export type TrackVersion = "full" | "60s" | "30s" | "15s" | "loop" | "stems";

export interface CatalogTrack {
  id: string;
  slug: string;
  title: string;
  category: TrackCategory;
  genre: string;
  mood: string;
  useCase: string;
  styleOf: string;
  bpm: number;
  duration: string;
  priceFrom: number;
  hasStems: boolean;
  isFree: boolean;
  description: string;
  versions: TrackVersion[];
}

export const categoryLabels: Record<TrackCategory, string> = {
  "modern-score": "Modern Score",
  thriller: "Thriller",
  "game-ost": "Game OST",
  production: "Production",
};

export const catalogTracks: CatalogTrack[] = [
  {
    id: "trk_001",
    slug: "epic-horizons",
    title: "Epic Horizons",
    category: "modern-score",
    genre: "Cinematic Orchestral",
    mood: "Hopeful",
    useCase: "Documentary / Brand Film",
    styleOf: "Adventure score",
    bpm: 92,
    duration: "3:24",
    priceFrom: 39,
    hasStems: true,
    isFree: false,
    description: "A broad orchestral cue for emotional reveals, brand stories, and premium documentaries.",
    versions: ["full", "60s", "30s", "15s", "stems"],
  },
  {
    id: "trk_002",
    slug: "dark-suspense",
    title: "Dark Suspense",
    category: "thriller",
    genre: "Hybrid Tension",
    mood: "Dark",
    useCase: "Crime Trailer",
    styleOf: "Modern thriller score",
    bpm: 78,
    duration: "2:48",
    priceFrom: 39,
    hasStems: true,
    isFree: false,
    description: "Low pulses, sharp rises, and controlled pressure for trailers, cold opens, and investigations.",
    versions: ["full", "60s", "30s", "loop", "stems"],
  },
  {
    id: "trk_003",
    slug: "victory-march",
    title: "Victory March",
    category: "game-ost",
    genre: "Epic Fantasy",
    mood: "Heroic",
    useCase: "Game Boss Fight",
    styleOf: "Fantasy adventure",
    bpm: 126,
    duration: "4:12",
    priceFrom: 39,
    hasStems: false,
    isFree: false,
    description: "A mission-ready orchestral theme with heroic brass, driving percussion, and loopable energy.",
    versions: ["full", "60s", "30s", "loop"],
  },
  {
    id: "trk_004",
    slug: "midnight-chase",
    title: "Midnight Chase",
    category: "thriller",
    genre: "Action Tension",
    mood: "Urgent",
    useCase: "Trailer / Chase Scene",
    styleOf: "Pulse-driven cinema",
    bpm: 138,
    duration: "3:05",
    priceFrom: 39,
    hasStems: true,
    isFree: false,
    description: "Fast pulses and cinematic impacts for pursuit scenes, urgent promos, and high-stakes edits.",
    versions: ["full", "60s", "30s", "15s", "stems"],
  },
  {
    id: "trk_005",
    slug: "corporate-cinematic-rise",
    title: "Corporate Cinematic Rise",
    category: "production",
    genre: "Corporate Cinematic",
    mood: "Confident",
    useCase: "Commercial / Corporate Video",
    styleOf: "Premium brand film",
    bpm: 104,
    duration: "2:36",
    priceFrom: 39,
    hasStems: false,
    isFree: true,
    description: "Clean piano, warm strings, and a confident build for launches, reels, and business stories.",
    versions: ["full", "60s", "30s", "15s"],
  },
  {
    id: "trk_006",
    slug: "documentary-tension-bed",
    title: "Documentary Tension Bed",
    category: "modern-score",
    genre: "Documentary",
    mood: "Investigative",
    useCase: "Documentary Underscore",
    styleOf: "Minimal dramatic score",
    bpm: 86,
    duration: "3:18",
    priceFrom: 39,
    hasStems: false,
    isFree: true,
    description: "A restrained bed for interviews, investigative pacing, and story sections that need quiet gravity.",
    versions: ["full", "60s", "30s", "loop"],
  },
];
