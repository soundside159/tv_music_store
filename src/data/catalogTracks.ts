export type TrackCategory = "modern-score" | "thriller" | "game-ost" | "production";

export type TrackVersion =
  | "full"
  | "no-drums"
  | "no-drums-no-synths"
  | "drums-bass"
  | "drums-perc"
  | "middle"
  | "short"
  | "60s"
  | "30s"
  | "15s"
  | "1min"
  | "35s"
  | "commercial"
  | "banjo"
  | "indian-throat"
  | "banjo-indian";

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
  /** composers.slug — links the row's "by <artist>" line to /artist/<slug>. */
  artistSlug?: string;
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
  /** Square cover art URL (1000x1000 recommended). Optional — placeholder shown when absent. */
  cover?: string;
  /** Small square thumbnail (track rows). Falls back to `cover` when absent. */
  coverThumb?: string;
  /** Public track code (1000-9999) — appears in the URL slug and filenames. */
  code?: number;
  /** Admin-curated category membership; when absent, [category] is the fallback. */
  categoryIds?: string[];
  /** True when the track ships stems (shown as a STEMS badge; Max-plan download). */
  hasStems?: boolean;
  /** ISO date the track row was created (live API only; drives the "New" sort). */
  createdAt?: string;
  /** All-time download count from download_log (live API only; drives "Popular"). */
  downloads?: number;
  /** draft | published — drafts are only visible on admin pages (?drafts=1). */
  status?: string;
  /** pending | approved | rejected — composer uploads await admin review. */
  moderation?: string;
}

export const categoryLabels: Record<TrackCategory, string> = {
  "modern-score": "Modern Score",
  thriller: "Thriller",
  "game-ost": "Game OST",
  production: "Production",
};

const p = (slug: string, file: string) => `/audio/previews/${slug}/${file}.mp3`;

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
      { id: "full", label: "Full Mix", duration: "0:51", src: p("a-few-clicks-to-destruction", "full-mix") },
      { id: "no-drums-no-synths", label: "No Drums / No Synths", duration: "0:51", src: p("a-few-clicks-to-destruction", "no-drums-no-synths") },
      { id: "drums-bass", label: "Drums / Bass", duration: "0:51", src: p("a-few-clicks-to-destruction", "drums-bass") },
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
      { id: "full", label: "Full Mix", duration: "1:09", src: p("a-journey-in-other-worlds", "full-mix") },
      { id: "no-drums", label: "No Drums", duration: "1:09", src: p("a-journey-in-other-worlds", "no-drums") },
      { id: "drums-perc", label: "Drums / Perc", duration: "1:09", src: p("a-journey-in-other-worlds", "drums-perc") },
    ],
  },
  {
    id: "trk_101",
    slug: "alive-violin",
    title: "Alive Violin",
    artist: "TVMUSICSTORE",
    category: "modern-score",
    genre: "Neo-Classical",
    mood: "Emotional / Inspiring",
    useCase: "Film & TV / Documentary",
    styleOf: "Expressive solo violin score",
    bpm: 90,
    duration: "2:02",
    priceFrom: 39,
    description:
      "An expressive neo-classical violin piece with a warm build — for human stories, documentaries and emotional film moments.",
    tags: ["Violin", "Emotional", "Documentary", "Neo-Classical"],
    collectionIds: ["emotional-inspiring", "orchestral"],
    audioVersions: [
      { id: "full", label: "Full Mix", duration: "2:02", src: p("alive-violin", "full") },
      { id: "60s", label: "60 sec", duration: "1:06", src: p("alive-violin", "60s") },
      { id: "30s", label: "30 sec", duration: "0:34", src: p("alive-violin", "30s") },
    ],
  },
  {
    id: "trk_102",
    slug: "all-consuming-darkness",
    title: "All Consuming Darkness",
    artist: "TVMUSICSTORE",
    category: "thriller",
    genre: "Dark Score",
    mood: "Tense",
    useCase: "Crime & Thriller / Movie Trailer",
    styleOf: "Creeping dread cue",
    bpm: 80,
    duration: "1:12",
    priceFrom: 39,
    description:
      "A slow, consuming dark cue with growing pressure — built for thrillers, crime scenes and ominous reveals.",
    tags: ["Dark", "Tension", "Thriller", "Trailer"],
    collectionIds: ["dark-suspense", "hybrid-modern"],
    audioVersions: [
      { id: "full", label: "Full Mix", duration: "1:12", src: p("all-consuming-darkness", "full") },
      { id: "middle", label: "Middle Version", duration: "0:48", src: p("all-consuming-darkness", "middle") },
      { id: "short", label: "Short Version", duration: "0:27", src: p("all-consuming-darkness", "short") },
    ],
  },
  {
    id: "trk_103",
    slug: "all-my-emotions",
    title: "All My Emotions",
    artist: "TVMUSICSTORE",
    category: "modern-score",
    genre: "Drama",
    mood: "Emotional",
    useCase: "Film & TV / Documentary",
    styleOf: "Heartfelt drama theme",
    bpm: 75,
    duration: "1:29",
    priceFrom: 39,
    description:
      "A heartfelt orchestral drama theme that swells from intimacy to warmth — for stories with emotional weight.",
    tags: ["Emotional", "Drama", "Strings", "Cinematic"],
    collectionIds: ["emotional-inspiring", "orchestral"],
    audioVersions: [
      { id: "full", label: "Full Mix", duration: "1:29", src: p("all-my-emotions", "full") },
      { id: "1min", label: "1 min", duration: "1:02", src: p("all-my-emotions", "1min") },
      { id: "35s", label: "35 sec", duration: "0:35", src: p("all-my-emotions", "35s") },
    ],
  },
  {
    id: "trk_104",
    slug: "always-together",
    title: "Always Together",
    artist: "TVMUSICSTORE",
    category: "modern-score",
    genre: "Drama / Neo-Classical",
    mood: "Hopeful",
    useCase: "Film & TV / Business",
    styleOf: "Warm togetherness theme",
    bpm: 95,
    duration: "1:12",
    priceFrom: 39,
    description:
      "A warm, hopeful cue about connection — fits family stories, brand films and uplifting montages.",
    tags: ["Hopeful", "Warm", "Family", "Uplifting"],
    collectionIds: ["emotional-inspiring"],
    audioVersions: [
      { id: "full", label: "Full Mix", duration: "1:12", src: p("always-together", "full") },
      { id: "middle", label: "Middle Version", duration: "0:50", src: p("always-together", "middle") },
      { id: "short", label: "Short Version", duration: "0:26", src: p("always-together", "short") },
    ],
  },
  {
    id: "trk_105",
    slug: "american-history",
    title: "American History",
    artist: "TVMUSICSTORE",
    category: "production",
    genre: "Folk / Americana",
    mood: "Inspiring",
    useCase: "Documentary / Travel",
    styleOf: "Frontier-spirit Americana",
    bpm: 100,
    duration: "1:10",
    priceFrom: 39,
    description:
      "An Americana journey with banjo and throat-sung textures in alternate mixes — documentaries, heritage stories, wide landscapes.",
    tags: ["Americana", "Folk", "Documentary", "Banjo"],
    collectionIds: ["emotional-inspiring"],
    audioVersions: [
      { id: "full", label: "Drums Version", duration: "1:10", src: p("american-history", "full") },
      { id: "banjo", label: "Banjo Version", duration: "1:10", src: p("american-history", "banjo") },
      { id: "indian-throat", label: "Indian Throat Version", duration: "1:10", src: p("american-history", "indian-throat") },
      { id: "banjo-indian", label: "Banjo & Indian Throat", duration: "1:10", src: p("american-history", "banjo-indian") },
    ],
  },
  {
    id: "trk_106",
    slug: "an-epic-trailer",
    title: "An Epic Trailer",
    artist: "TVMUSICSTORE",
    category: "modern-score",
    genre: "Action",
    mood: "Powerful / Heroic",
    useCase: "Movie Trailer",
    styleOf: "Modern epic trailer cue",
    bpm: 140,
    duration: "1:20",
    priceFrom: 39,
    description:
      "A rising epic trailer cue with heavy hits and heroic momentum — cut-downs ready for 60 and 40 second spots.",
    tags: ["Trailer", "Epic", "Action", "Heroic"],
    collectionIds: ["epic-adventure", "action-intense"],
    audioVersions: [
      { id: "full", label: "Full Mix", duration: "1:20", src: p("an-epic-trailer", "full") },
      { id: "middle", label: "Middle Version", duration: "0:56", src: p("an-epic-trailer", "middle") },
      { id: "short", label: "Short Version", duration: "0:40", src: p("an-epic-trailer", "short") },
    ],
  },
  {
    id: "trk_107",
    slug: "an-exciting-future",
    title: "An Exciting Future",
    artist: "TVMUSICSTORE",
    category: "modern-score",
    genre: "Sci-Fi",
    mood: "Uplifting / Inspiring",
    useCase: "Technology / Business",
    styleOf: "Optimistic future score",
    bpm: 120,
    duration: "1:37",
    priceFrom: 39,
    description:
      "An optimistic, forward-looking cue for tech launches, innovation films and bright corporate visions.",
    tags: ["Technology", "Inspiring", "Corporate", "Future"],
    collectionIds: ["sci-fi-futuristic", "emotional-inspiring"],
    audioVersions: [
      { id: "full", label: "Full Mix", duration: "1:37", src: p("an-exciting-future", "full") },
      { id: "middle", label: "Middle Version", duration: "0:56", src: p("an-exciting-future", "middle") },
      { id: "short", label: "Short Version", duration: "0:23", src: p("an-exciting-future", "short") },
    ],
  },
  {
    id: "trk_108",
    slug: "ancient-life",
    title: "Ancient Life",
    artist: "TVMUSICSTORE",
    category: "production",
    genre: "World / Ethnic",
    mood: "Beautiful",
    useCase: "Documentary / Nature",
    styleOf: "Ancient world textures",
    bpm: 85,
    duration: "2:07",
    priceFrom: 39,
    description:
      "Ethnic textures and organic percussion evoking ancient worlds — nature documentaries, history and travel films. Ad-ready cut-downs included.",
    tags: ["World", "Documentary", "Nature", "Ethnic"],
    collectionIds: ["orchestral", "emotional-inspiring"],
    audioVersions: [
      { id: "full", label: "Full Mix", duration: "2:07", src: p("ancient-life", "full") },
      { id: "60s", label: "60 sec", duration: "1:05", src: p("ancient-life", "60s") },
      { id: "30s", label: "30 sec", duration: "0:22", src: p("ancient-life", "30s") },
      { id: "15s", label: "15 sec", duration: "0:12", src: p("ancient-life", "15s") },
    ],
  },
  {
    id: "trk_109",
    slug: "angel-sword",
    title: "Angel Sword",
    artist: "TVMUSICSTORE",
    category: "game-ost",
    genre: "Fantasy",
    mood: "Heroic",
    useCase: "Video Game / Movie Trailer",
    styleOf: "Heroic fantasy battle theme",
    bpm: 130,
    duration: "2:03",
    priceFrom: 39,
    description:
      "A heroic fantasy battle theme with soaring brass and choir-like lifts — game battles, fantasy trailers, boss fights.",
    tags: ["Fantasy", "Game", "Heroic", "Battle"],
    collectionIds: ["epic-adventure", "orchestral"],
    audioVersions: [
      { id: "full", label: "Full Mix", duration: "2:03", src: p("angel-sword", "full") },
      { id: "middle", label: "Middle Version", duration: "0:57", src: p("angel-sword", "middle") },
      { id: "commercial", label: "Commercial Cut", duration: "0:37", src: p("angel-sword", "commercial") },
      { id: "short", label: "Short Version", duration: "0:30", src: p("angel-sword", "short") },
    ],
  },
  {
    id: "trk_110",
    slug: "angel-wings",
    title: "Angel Wings",
    artist: "TVMUSICSTORE",
    category: "modern-score",
    genre: "Neo-Classical",
    mood: "Beautiful / Hopeful",
    useCase: "Film & TV",
    styleOf: "Ethereal uplift moment",
    bpm: 70,
    duration: "0:36",
    priceFrom: 39,
    description:
      "A short ethereal lift with airy strings — transitions, reveals and moments of grace.",
    tags: ["Ethereal", "Strings", "Beautiful", "Uplift"],
    collectionIds: ["emotional-inspiring", "orchestral"],
    audioVersions: [
      { id: "full", label: "Full Mix", duration: "0:36", src: p("angel-wings", "full") },
      { id: "short", label: "Short Version", duration: "0:20", src: p("angel-wings", "short") },
    ],
  },
  {
    id: "trk_111",
    slug: "angry-beasts",
    title: "Angry Beasts",
    artist: "TVMUSICSTORE",
    category: "game-ost",
    genre: "Action / Horror",
    mood: "Aggressive",
    useCase: "Video Game / Sports",
    styleOf: "Ferocious action driver",
    bpm: 150,
    duration: "0:48",
    priceFrom: 39,
    description:
      "A ferocious hybrid action cue with snarling low brass and pounding drums — creature fights, extreme sports, chase edits.",
    tags: ["Action", "Aggressive", "Game", "Drums"],
    collectionIds: ["action-intense", "dark-suspense"],
    audioVersions: [
      { id: "full", label: "Full Mix", duration: "0:48", src: p("angry-beasts", "full") },
      { id: "short", label: "Short Version", duration: "0:24", src: p("angry-beasts", "short") },
    ],
  },
  {
    id: "trk_112",
    slug: "annihilation",
    title: "Annihilation",
    artist: "TVMUSICSTORE",
    category: "thriller",
    genre: "Dark Score / Action",
    mood: "Aggressive / Tense",
    useCase: "Movie Trailer / Video Game",
    styleOf: "Destructive trailer hybrid",
    bpm: 145,
    duration: "0:50",
    priceFrom: 39,
    description:
      "A destructive hybrid cue with braams and relentless percussion — dark trailers, apocalyptic reveals, boss intros.",
    tags: ["Trailer", "Dark", "Hybrid", "Intense"],
    collectionIds: ["action-intense", "hybrid-modern", "dark-suspense"],
    audioVersions: [
      { id: "full", label: "Full Mix", duration: "0:50", src: p("annihilation", "full") },
      { id: "short", label: "Short Version", duration: "0:26", src: p("annihilation", "short") },
    ],
  },
  {
    id: "trk_113",
    slug: "another-world",
    title: "Another World",
    artist: "TVMUSICSTORE",
    category: "game-ost",
    genre: "Fantasy / Sci-Fi",
    mood: "Suspenseful",
    useCase: "Video Game / Technology",
    styleOf: "Mysterious new-world theme",
    bpm: 100,
    duration: "1:09",
    priceFrom: 39,
    description:
      "A mysterious world-building cue with shimmering textures — exploration scenes, sci-fi openings, discovery moments.",
    tags: ["Sci-Fi", "Game", "Mysterious", "Exploration"],
    collectionIds: ["sci-fi-futuristic", "epic-adventure"],
    audioVersions: [
      { id: "full", label: "Full Mix", duration: "1:09", src: p("another-world", "full") },
      { id: "short", label: "Short Version", duration: "0:39", src: p("another-world", "short") },
    ],
  },
  {
    id: "trk_114",
    slug: "antique-violin",
    title: "Antique Violin",
    artist: "TVMUSICSTORE",
    category: "production",
    genre: "Neo-Classical",
    mood: "Emotional / Beautiful",
    useCase: "Documentary / Luxury",
    styleOf: "Vintage chamber elegance",
    bpm: 80,
    duration: "1:41",
    priceFrom: 39,
    description:
      "An elegant chamber piece with a vintage violin voice — luxury brands, period stories and refined documentaries.",
    tags: ["Violin", "Elegant", "Luxury", "Classical"],
    collectionIds: ["orchestral", "emotional-inspiring"],
    audioVersions: [
      { id: "full", label: "Full Mix", duration: "1:41", src: p("antique-violin", "full") },
      { id: "middle", label: "Middle Version", duration: "1:09", src: p("antique-violin", "middle") },
      { id: "short", label: "Short Version", duration: "0:43", src: p("antique-violin", "short") },
    ],
  },
];
