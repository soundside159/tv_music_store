// Canonical Use Case / Genre / Mood vocabularies. Single source of truth for
// the catalog filter sidebar AND the admin track editor (values are joined
// with " / " in tracks.use_case / genre / mood and split by splitFilterValues).

export const useCaseOptions = [
  "Movie Trailer",
  "Film & TV",
  "Documentary",
  "Advertising",
  "Crime & Thriller",
  "Business",
  "Video Game",
  "Sports",
  "Technology",
  "Travel",
  "Nature",
  "Luxury",
];

export const genreOptions = [
  "Neo-Classical",
  "Action",
  "Drama",
  "Dark Score",
  "Sci-Fi",
  "Fantasy",
  "Horror",
];

export const moodOptions = [
  "Emotional",
  "Powerful",
  "Inspiring",
  "Suspenseful",
  "Aggressive",
  "Tense",
  "Heroic",
  "Hopeful",
  "Uplifting",
  "Beautiful",
];

export interface Vocabularies {
  useCase: string[];
  genre: string[];
  mood: string[];
}

/** Fallback used until the live lists load from /api/content (admin-editable). */
export const defaultVocabularies: Vocabularies = {
  useCase: useCaseOptions,
  genre: genreOptions,
  mood: moodOptions,
};
