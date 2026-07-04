// Curated playlists (use-case based). Later managed from the admin panel;
// for the design phase this is the mock source.

export interface CuratedPlaylist {
  id: string;
  slug: string;
  title: string;
  description: string;
  image: string;
  trackIds: string[];
}

export const mockPlaylists: CuratedPlaylist[] = [
  {
    id: "pl_movie_trailers",
    slug: "movie-trailers",
    title: "Movie Trailers",
    description: "Big hits, risers and heroic momentum — cues built to sell a story in 60 seconds.",
    image: "/images/collections/epic-adventure.jpg",
    trackIds: ["trk_106", "trk_112", "trk_109", "trk_001", "trk_102"],
  },
  {
    id: "pl_corporate",
    slug: "corporate-business",
    title: "Corporate & Business",
    description: "Confident, optimistic and clean — for brand films, presentations and product launches.",
    image: "/images/collections/emotional-inspiring.jpg",
    trackIds: ["trk_107", "trk_104", "trk_110"],
  },
  {
    id: "pl_documentary",
    slug: "documentary",
    title: "Documentary",
    description: "Human, organic and honest — scores for real stories, nature and history.",
    image: "/images/collections/orchestral.jpg",
    trackIds: ["trk_108", "trk_105", "trk_101", "trk_114", "trk_103"],
  },
  {
    id: "pl_game_battles",
    slug: "game-battles",
    title: "Game Battles",
    description: "Boss fights, chases and adrenaline — aggressive hybrid and fantasy action.",
    image: "/images/collections/dark-suspense.jpg",
    trackIds: ["trk_111", "trk_109", "trk_002", "trk_113"],
  },
  {
    id: "pl_emotional",
    slug: "emotional-stories",
    title: "Emotional Stories",
    description: "Tender strings and warm builds for the moments that matter.",
    image: "/images/collections/sci-fi-futuristic.jpg",
    trackIds: ["trk_103", "trk_101", "trk_110", "trk_104", "trk_114"],
  },
];
