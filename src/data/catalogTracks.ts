export type TrackCategory = "modern-score" | "thriller" | "game-ost" | "production";

export type TrackVersion = "full" | "no-drums" | "no-drums-no-synths" | "drums-bass" | "drums-perc";

export interface TrackAudioVersion {
  id: TrackVersion;
  label: string;
  src: string;
  duration: string;
}

export interface CatalogTrack {
  id: string;
  slug: string;
  title: string;
  artist: string;
  category: TrackCategory;
  genre: string;
  mood: string;
  useCase: string;
  styleOf: string;
  bpm: number;
  duration: string;
  priceFrom: number;
  description: string;
  tags: string[];
  collectionIds: string[];
  audioVersions: TrackAudioVersion[];
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
    slug: "a-few-clicks-to-destruction",
    title: "A Few Clicks To Destruction",
    artist: "TVMUSICSTORE",
    category: "thriller",
    genre: "Hybrid Thriller",
    mood: "Dark",
    useCase: "Trailer / Horror / Tension",
    styleOf: "Slow-burn destruction cue",
    bpm: 70,
    duration: "0:51",
    priceFrom: 39,
    description:
      "A dark hybrid cue with pressure, low movement, and stripped alternate mixes for tension edits and destructive reveals.",
    tags: ["Trailer", "Horror", "Tension", "Dark"],
    collectionIds: ["dark-suspense", "hybrid-modern", "action-intense"],
    audioVersions: [
      {
        id: "full",
        label: "Full Mix",
        duration: "0:51",
        src: "/audio/previews/a-few-clicks-to-destruction/full-mix.mp3",
      },
      {
        id: "no-drums-no-synths",
        label: "No Drums / No Synths",
        duration: "0:51",
        src: "/audio/previews/a-few-clicks-to-destruction/no-drums-no-synths.mp3",
      },
      {
        id: "drums-bass",
        label: "Drums / Bass",
        duration: "0:51",
        src: "/audio/previews/a-few-clicks-to-destruction/drums-bass.mp3",
      },
    ],
  },
  {
    id: "trk_002",
    slug: "a-journey-in-other-worlds",
    title: "A Journey in Other Worlds",
    artist: "TVMUSICSTORE",
    category: "game-ost",
    genre: "Fantasy Adventure",
    mood: "Epic",
    useCase: "Game / Fantasy / Adventure",
    styleOf: "Otherworldly adventure score",
    bpm: 160,
    duration: "1:09",
    priceFrom: 39,
    description:
      "A fast orchestral fantasy cue for game worlds, adventure trailers, fantasy sequences, and high-energy story beats.",
    tags: ["Game", "Fantasy", "Adventure", "Epic"],
    collectionIds: ["epic-adventure", "orchestral", "emotional-inspiring"],
    audioVersions: [
      {
        id: "full",
        label: "Full Mix",
        duration: "1:09",
        src: "/audio/previews/a-journey-in-other-worlds/full-mix.mp3",
      },
      {
        id: "no-drums",
        label: "No Drums",
        duration: "1:09",
        src: "/audio/previews/a-journey-in-other-worlds/no-drums.mp3",
      },
      {
        id: "drums-perc",
        label: "Drums / Perc",
        duration: "1:09",
        src: "/audio/previews/a-journey-in-other-worlds/drums-perc.mp3",
      },
    ],
  },
];
