export type MusicCollection = {
  id: string;
  title: string;
  shortTitle: string;
  eyebrow: string;
  description: string;
  trackCount: number;
  image: string;
};

export const musicCollections: MusicCollection[] = [
  {
    id: "epic-adventure",
    title: "Epic Adventure Collection",
    shortTitle: "Epic Adventure",
    eyebrow: "Epic Adventure",
    description: "Powerful, cinematic and heroic compositions for trailers, games, and great stories.",
    trackCount: 124,
    image: "/images/collections/epic-adventure.jpg",
  },
  {
    id: "dark-suspense",
    title: "Dark & Suspense Collection",
    shortTitle: "Dark & Suspense",
    eyebrow: "Dark Suspense",
    description: "Tension cues, ominous atmospheres, and slow-burn thriller music for darker edits.",
    trackCount: 98,
    image: "/images/collections/dark-suspense.jpg",
  },
  {
    id: "sci-fi-futuristic",
    title: "Sci-Fi & Futuristic Collection",
    shortTitle: "Sci-Fi & Futuristic",
    eyebrow: "Sci-Fi",
    description: "Otherworldly synth, space tension, and cinematic future worlds.",
    trackCount: 112,
    image: "/images/collections/sci-fi-futuristic.jpg",
  },
  {
    id: "emotional-inspiring",
    title: "Emotional & Inspiring Collection",
    shortTitle: "Emotional & Inspiring",
    eyebrow: "Emotional",
    description: "Warm, human, and reflective music for stories with emotional weight.",
    trackCount: 87,
    image: "/images/collections/emotional-inspiring.jpg",
  },
  {
    id: "orchestral",
    title: "Orchestral Collection",
    shortTitle: "Orchestral",
    eyebrow: "Orchestral",
    description: "String-led cinematic scoring, classical drama, and rich orchestral movement.",
    trackCount: 76,
    image: "/images/collections/orchestral.jpg",
  },
  {
    id: "hybrid-modern",
    title: "Hybrid & Modern Collection",
    shortTitle: "Hybrid & Modern",
    eyebrow: "Hybrid Modern",
    description: "Modern hybrid cues with cinematic pressure, pulse, and trailer-ready impact.",
    trackCount: 93,
    image: "/images/collections/sci-fi-futuristic.jpg",
  },
  {
    id: "action-intense",
    title: "Action & Intense Collection",
    shortTitle: "Action & Intense",
    eyebrow: "Action",
    description: "High-energy cues for chase scenes, reveals, campaigns, and action edits.",
    trackCount: 105,
    image: "/images/collections/dark-suspense.jpg",
  },
];
