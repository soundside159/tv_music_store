// AUTO-GENERATED from src/data/catalogTracks.ts + musicCollections.ts (2026-07-05).
// Used by /api/admin/content action seed_catalog. Not routed (underscore prefix).

export const seedCollections = [
  {
    "id": "epic-adventure",
    "title": "Epic Adventure Collection",
    "shortTitle": "Epic Adventure",
    "description": "Powerful, cinematic and heroic compositions for trailers, games, and great stories.",
    "image": "/images/collections/epic-adventure.jpg",
    "sort": 0
  },
  {
    "id": "dark-suspense",
    "title": "Dark & Suspense Collection",
    "shortTitle": "Dark & Suspense",
    "description": "Tension cues, ominous atmospheres, and slow-burn thriller music for darker edits.",
    "image": "/images/collections/dark-suspense.jpg",
    "sort": 1
  },
  {
    "id": "sci-fi-futuristic",
    "title": "Sci-Fi & Futuristic Collection",
    "shortTitle": "Sci-Fi & Futuristic",
    "description": "Otherworldly synth, space tension, and cinematic future worlds.",
    "image": "/images/collections/sci-fi-futuristic.jpg",
    "sort": 2
  },
  {
    "id": "emotional-inspiring",
    "title": "Emotional & Inspiring Collection",
    "shortTitle": "Emotional & Inspiring",
    "description": "Warm, human, and reflective music for stories with emotional weight.",
    "image": "/images/collections/emotional-inspiring.jpg",
    "sort": 3
  },
  {
    "id": "orchestral",
    "title": "Orchestral Collection",
    "shortTitle": "Orchestral",
    "description": "String-led cinematic scoring, classical drama, and rich orchestral movement.",
    "image": "/images/collections/orchestral.jpg",
    "sort": 4
  },
  {
    "id": "hybrid-modern",
    "title": "Hybrid & Modern Collection",
    "shortTitle": "Hybrid & Modern",
    "description": "Modern hybrid cues with cinematic pressure, pulse, and trailer-ready impact.",
    "image": "/images/collections/sci-fi-futuristic.jpg",
    "sort": 5
  },
  {
    "id": "action-intense",
    "title": "Action & Intense Collection",
    "shortTitle": "Action & Intense",
    "description": "High-energy cues for chase scenes, reveals, campaigns, and action edits.",
    "image": "/images/collections/dark-suspense.jpg",
    "sort": 6
  }
];

export const seedTracks = [
  {
    "id": "trk_001",
    "slug": "a-few-clicks-to-destruction",
    "title": "A Few Clicks To Destruction",
    "category": "thriller",
    "genre": "Hybrid Thriller",
    "mood": "Dark",
    "useCase": "Trailer / Horror / Tension",
    "styleOf": "Slow-burn destruction cue",
    "bpm": 70,
    "duration": "0:51",
    "description": "A dark hybrid cue with pressure, low movement, and stripped alternate mixes for tension edits and destructive reveals.",
    "tags": [
      "Trailer",
      "Horror",
      "Tension",
      "Dark"
    ],
    "collectionIds": [
      "dark-suspense",
      "hybrid-modern",
      "action-intense"
    ],
    "versions": [
      {
        "versionId": "full",
        "label": "Full Mix",
        "duration": "0:51",
        "previewSrc": "/audio/previews/a-few-clicks-to-destruction/full-mix.mp3",
        "sort": 0
      },
      {
        "versionId": "no-drums-no-synths",
        "label": "No Drums / No Synths",
        "duration": "0:51",
        "previewSrc": "/audio/previews/a-few-clicks-to-destruction/no-drums-no-synths.mp3",
        "sort": 1
      },
      {
        "versionId": "drums-bass",
        "label": "Drums / Bass",
        "duration": "0:51",
        "previewSrc": "/audio/previews/a-few-clicks-to-destruction/drums-bass.mp3",
        "sort": 2
      }
    ]
  },
  {
    "id": "trk_002",
    "slug": "a-journey-in-other-worlds",
    "title": "A Journey in Other Worlds",
    "category": "game-ost",
    "genre": "Fantasy Adventure",
    "mood": "Epic",
    "useCase": "Game / Fantasy / Adventure",
    "styleOf": "Otherworldly adventure score",
    "bpm": 160,
    "duration": "1:09",
    "description": "A fast orchestral fantasy cue for game worlds, adventure trailers, fantasy sequences, and high-energy story beats.",
    "tags": [
      "Game",
      "Fantasy",
      "Adventure",
      "Epic"
    ],
    "collectionIds": [
      "epic-adventure",
      "orchestral",
      "emotional-inspiring"
    ],
    "versions": [
      {
        "versionId": "full",
        "label": "Full Mix",
        "duration": "1:09",
        "previewSrc": "/audio/previews/a-journey-in-other-worlds/full-mix.mp3",
        "sort": 0
      },
      {
        "versionId": "no-drums",
        "label": "No Drums",
        "duration": "1:09",
        "previewSrc": "/audio/previews/a-journey-in-other-worlds/no-drums.mp3",
        "sort": 1
      },
      {
        "versionId": "drums-perc",
        "label": "Drums / Perc",
        "duration": "1:09",
        "previewSrc": "/audio/previews/a-journey-in-other-worlds/drums-perc.mp3",
        "sort": 2
      }
    ]
  },
  {
    "id": "trk_101",
    "slug": "alive-violin",
    "title": "Alive Violin",
    "category": "modern-score",
    "genre": "Neo-Classical",
    "mood": "Emotional / Inspiring",
    "useCase": "Film & TV / Documentary",
    "styleOf": "Expressive solo violin score",
    "bpm": 90,
    "duration": "2:02",
    "description": "An expressive neo-classical violin piece with a warm build — for human stories, documentaries and emotional film moments.",
    "tags": [
      "Violin",
      "Emotional",
      "Documentary",
      "Neo-Classical"
    ],
    "collectionIds": [
      "emotional-inspiring",
      "orchestral"
    ],
    "versions": [
      {
        "versionId": "full",
        "label": "Full Mix",
        "duration": "2:02",
        "previewSrc": "/audio/previews/alive-violin/full.mp3",
        "sort": 0
      },
      {
        "versionId": "60s",
        "label": "60 sec",
        "duration": "1:06",
        "previewSrc": "/audio/previews/alive-violin/60s.mp3",
        "sort": 1
      },
      {
        "versionId": "30s",
        "label": "30 sec",
        "duration": "0:34",
        "previewSrc": "/audio/previews/alive-violin/30s.mp3",
        "sort": 2
      }
    ]
  },
  {
    "id": "trk_102",
    "slug": "all-consuming-darkness",
    "title": "All Consuming Darkness",
    "category": "thriller",
    "genre": "Dark Score",
    "mood": "Tense",
    "useCase": "Crime & Thriller / Movie Trailer",
    "styleOf": "Creeping dread cue",
    "bpm": 80,
    "duration": "1:12",
    "description": "A slow, consuming dark cue with growing pressure — built for thrillers, crime scenes and ominous reveals.",
    "tags": [
      "Dark",
      "Tension",
      "Thriller",
      "Trailer"
    ],
    "collectionIds": [
      "dark-suspense",
      "hybrid-modern"
    ],
    "versions": [
      {
        "versionId": "full",
        "label": "Full Mix",
        "duration": "1:12",
        "previewSrc": "/audio/previews/all-consuming-darkness/full.mp3",
        "sort": 0
      },
      {
        "versionId": "middle",
        "label": "Middle Version",
        "duration": "0:48",
        "previewSrc": "/audio/previews/all-consuming-darkness/middle.mp3",
        "sort": 1
      },
      {
        "versionId": "short",
        "label": "Short Version",
        "duration": "0:27",
        "previewSrc": "/audio/previews/all-consuming-darkness/short.mp3",
        "sort": 2
      }
    ]
  },
  {
    "id": "trk_103",
    "slug": "all-my-emotions",
    "title": "All My Emotions",
    "category": "modern-score",
    "genre": "Drama",
    "mood": "Emotional",
    "useCase": "Film & TV / Documentary",
    "styleOf": "Heartfelt drama theme",
    "bpm": 75,
    "duration": "1:29",
    "description": "A heartfelt orchestral drama theme that swells from intimacy to warmth — for stories with emotional weight.",
    "tags": [
      "Emotional",
      "Drama",
      "Strings",
      "Cinematic"
    ],
    "collectionIds": [
      "emotional-inspiring",
      "orchestral"
    ],
    "versions": [
      {
        "versionId": "full",
        "label": "Full Mix",
        "duration": "1:29",
        "previewSrc": "/audio/previews/all-my-emotions/full.mp3",
        "sort": 0
      },
      {
        "versionId": "1min",
        "label": "1 min",
        "duration": "1:02",
        "previewSrc": "/audio/previews/all-my-emotions/1min.mp3",
        "sort": 1
      },
      {
        "versionId": "35s",
        "label": "35 sec",
        "duration": "0:35",
        "previewSrc": "/audio/previews/all-my-emotions/35s.mp3",
        "sort": 2
      }
    ]
  },
  {
    "id": "trk_104",
    "slug": "always-together",
    "title": "Always Together",
    "category": "modern-score",
    "genre": "Drama / Neo-Classical",
    "mood": "Hopeful",
    "useCase": "Film & TV / Business",
    "styleOf": "Warm togetherness theme",
    "bpm": 95,
    "duration": "1:12",
    "description": "A warm, hopeful cue about connection — fits family stories, brand films and uplifting montages.",
    "tags": [
      "Hopeful",
      "Warm",
      "Family",
      "Uplifting"
    ],
    "collectionIds": [
      "emotional-inspiring"
    ],
    "versions": [
      {
        "versionId": "full",
        "label": "Full Mix",
        "duration": "1:12",
        "previewSrc": "/audio/previews/always-together/full.mp3",
        "sort": 0
      },
      {
        "versionId": "middle",
        "label": "Middle Version",
        "duration": "0:50",
        "previewSrc": "/audio/previews/always-together/middle.mp3",
        "sort": 1
      },
      {
        "versionId": "short",
        "label": "Short Version",
        "duration": "0:26",
        "previewSrc": "/audio/previews/always-together/short.mp3",
        "sort": 2
      }
    ]
  },
  {
    "id": "trk_105",
    "slug": "american-history",
    "title": "American History",
    "category": "production",
    "genre": "Folk / Americana",
    "mood": "Inspiring",
    "useCase": "Documentary / Travel",
    "styleOf": "Frontier-spirit Americana",
    "bpm": 100,
    "duration": "1:10",
    "description": "An Americana journey with banjo and throat-sung textures in alternate mixes — documentaries, heritage stories, wide landscapes.",
    "tags": [
      "Americana",
      "Folk",
      "Documentary",
      "Banjo"
    ],
    "collectionIds": [
      "emotional-inspiring"
    ],
    "versions": [
      {
        "versionId": "full",
        "label": "Drums Version",
        "duration": "1:10",
        "previewSrc": "/audio/previews/american-history/full.mp3",
        "sort": 0
      },
      {
        "versionId": "banjo",
        "label": "Banjo Version",
        "duration": "1:10",
        "previewSrc": "/audio/previews/american-history/banjo.mp3",
        "sort": 1
      },
      {
        "versionId": "indian-throat",
        "label": "Indian Throat Version",
        "duration": "1:10",
        "previewSrc": "/audio/previews/american-history/indian-throat.mp3",
        "sort": 2
      },
      {
        "versionId": "banjo-indian",
        "label": "Banjo & Indian Throat",
        "duration": "1:10",
        "previewSrc": "/audio/previews/american-history/banjo-indian.mp3",
        "sort": 3
      }
    ]
  },
  {
    "id": "trk_106",
    "slug": "an-epic-trailer",
    "title": "An Epic Trailer",
    "category": "modern-score",
    "genre": "Action",
    "mood": "Powerful / Heroic",
    "useCase": "Movie Trailer",
    "styleOf": "Modern epic trailer cue",
    "bpm": 140,
    "duration": "1:20",
    "description": "A rising epic trailer cue with heavy hits and heroic momentum — cut-downs ready for 60 and 40 second spots.",
    "tags": [
      "Trailer",
      "Epic",
      "Action",
      "Heroic"
    ],
    "collectionIds": [
      "epic-adventure",
      "action-intense"
    ],
    "versions": [
      {
        "versionId": "full",
        "label": "Full Mix",
        "duration": "1:20",
        "previewSrc": "/audio/previews/an-epic-trailer/full.mp3",
        "sort": 0
      },
      {
        "versionId": "middle",
        "label": "Middle Version",
        "duration": "0:56",
        "previewSrc": "/audio/previews/an-epic-trailer/middle.mp3",
        "sort": 1
      },
      {
        "versionId": "short",
        "label": "Short Version",
        "duration": "0:40",
        "previewSrc": "/audio/previews/an-epic-trailer/short.mp3",
        "sort": 2
      }
    ]
  },
  {
    "id": "trk_107",
    "slug": "an-exciting-future",
    "title": "An Exciting Future",
    "category": "modern-score",
    "genre": "Sci-Fi",
    "mood": "Uplifting / Inspiring",
    "useCase": "Technology / Business",
    "styleOf": "Optimistic future score",
    "bpm": 120,
    "duration": "1:37",
    "description": "An optimistic, forward-looking cue for tech launches, innovation films and bright corporate visions.",
    "tags": [
      "Technology",
      "Inspiring",
      "Corporate",
      "Future"
    ],
    "collectionIds": [
      "sci-fi-futuristic",
      "emotional-inspiring"
    ],
    "versions": [
      {
        "versionId": "full",
        "label": "Full Mix",
        "duration": "1:37",
        "previewSrc": "/audio/previews/an-exciting-future/full.mp3",
        "sort": 0
      },
      {
        "versionId": "middle",
        "label": "Middle Version",
        "duration": "0:56",
        "previewSrc": "/audio/previews/an-exciting-future/middle.mp3",
        "sort": 1
      },
      {
        "versionId": "short",
        "label": "Short Version",
        "duration": "0:23",
        "previewSrc": "/audio/previews/an-exciting-future/short.mp3",
        "sort": 2
      }
    ]
  },
  {
    "id": "trk_108",
    "slug": "ancient-life",
    "title": "Ancient Life",
    "category": "production",
    "genre": "World / Ethnic",
    "mood": "Beautiful",
    "useCase": "Documentary / Nature",
    "styleOf": "Ancient world textures",
    "bpm": 85,
    "duration": "2:07",
    "description": "Ethnic textures and organic percussion evoking ancient worlds — nature documentaries, history and travel films. Ad-ready cut-downs included.",
    "tags": [
      "World",
      "Documentary",
      "Nature",
      "Ethnic"
    ],
    "collectionIds": [
      "orchestral",
      "emotional-inspiring"
    ],
    "versions": [
      {
        "versionId": "full",
        "label": "Full Mix",
        "duration": "2:07",
        "previewSrc": "/audio/previews/ancient-life/full.mp3",
        "sort": 0
      },
      {
        "versionId": "60s",
        "label": "60 sec",
        "duration": "1:05",
        "previewSrc": "/audio/previews/ancient-life/60s.mp3",
        "sort": 1
      },
      {
        "versionId": "30s",
        "label": "30 sec",
        "duration": "0:22",
        "previewSrc": "/audio/previews/ancient-life/30s.mp3",
        "sort": 2
      },
      {
        "versionId": "15s",
        "label": "15 sec",
        "duration": "0:12",
        "previewSrc": "/audio/previews/ancient-life/15s.mp3",
        "sort": 3
      }
    ]
  },
  {
    "id": "trk_109",
    "slug": "angel-sword",
    "title": "Angel Sword",
    "category": "game-ost",
    "genre": "Fantasy",
    "mood": "Heroic",
    "useCase": "Video Game / Movie Trailer",
    "styleOf": "Heroic fantasy battle theme",
    "bpm": 130,
    "duration": "2:03",
    "description": "A heroic fantasy battle theme with soaring brass and choir-like lifts — game battles, fantasy trailers, boss fights.",
    "tags": [
      "Fantasy",
      "Game",
      "Heroic",
      "Battle"
    ],
    "collectionIds": [
      "epic-adventure",
      "orchestral"
    ],
    "versions": [
      {
        "versionId": "full",
        "label": "Full Mix",
        "duration": "2:03",
        "previewSrc": "/audio/previews/angel-sword/full.mp3",
        "sort": 0
      },
      {
        "versionId": "middle",
        "label": "Middle Version",
        "duration": "0:57",
        "previewSrc": "/audio/previews/angel-sword/middle.mp3",
        "sort": 1
      },
      {
        "versionId": "commercial",
        "label": "Commercial Cut",
        "duration": "0:37",
        "previewSrc": "/audio/previews/angel-sword/commercial.mp3",
        "sort": 2
      },
      {
        "versionId": "short",
        "label": "Short Version",
        "duration": "0:30",
        "previewSrc": "/audio/previews/angel-sword/short.mp3",
        "sort": 3
      }
    ]
  },
  {
    "id": "trk_110",
    "slug": "angel-wings",
    "title": "Angel Wings",
    "category": "modern-score",
    "genre": "Neo-Classical",
    "mood": "Beautiful / Hopeful",
    "useCase": "Film & TV",
    "styleOf": "Ethereal uplift moment",
    "bpm": 70,
    "duration": "0:36",
    "description": "A short ethereal lift with airy strings — transitions, reveals and moments of grace.",
    "tags": [
      "Ethereal",
      "Strings",
      "Beautiful",
      "Uplift"
    ],
    "collectionIds": [
      "emotional-inspiring",
      "orchestral"
    ],
    "versions": [
      {
        "versionId": "full",
        "label": "Full Mix",
        "duration": "0:36",
        "previewSrc": "/audio/previews/angel-wings/full.mp3",
        "sort": 0
      },
      {
        "versionId": "short",
        "label": "Short Version",
        "duration": "0:20",
        "previewSrc": "/audio/previews/angel-wings/short.mp3",
        "sort": 1
      }
    ]
  },
  {
    "id": "trk_111",
    "slug": "angry-beasts",
    "title": "Angry Beasts",
    "category": "game-ost",
    "genre": "Action / Horror",
    "mood": "Aggressive",
    "useCase": "Video Game / Sports",
    "styleOf": "Ferocious action driver",
    "bpm": 150,
    "duration": "0:48",
    "description": "A ferocious hybrid action cue with snarling low brass and pounding drums — creature fights, extreme sports, chase edits.",
    "tags": [
      "Action",
      "Aggressive",
      "Game",
      "Drums"
    ],
    "collectionIds": [
      "action-intense",
      "dark-suspense"
    ],
    "versions": [
      {
        "versionId": "full",
        "label": "Full Mix",
        "duration": "0:48",
        "previewSrc": "/audio/previews/angry-beasts/full.mp3",
        "sort": 0
      },
      {
        "versionId": "short",
        "label": "Short Version",
        "duration": "0:24",
        "previewSrc": "/audio/previews/angry-beasts/short.mp3",
        "sort": 1
      }
    ]
  },
  {
    "id": "trk_112",
    "slug": "annihilation",
    "title": "Annihilation",
    "category": "thriller",
    "genre": "Dark Score / Action",
    "mood": "Aggressive / Tense",
    "useCase": "Movie Trailer / Video Game",
    "styleOf": "Destructive trailer hybrid",
    "bpm": 145,
    "duration": "0:50",
    "description": "A destructive hybrid cue with braams and relentless percussion — dark trailers, apocalyptic reveals, boss intros.",
    "tags": [
      "Trailer",
      "Dark",
      "Hybrid",
      "Intense"
    ],
    "collectionIds": [
      "action-intense",
      "hybrid-modern",
      "dark-suspense"
    ],
    "versions": [
      {
        "versionId": "full",
        "label": "Full Mix",
        "duration": "0:50",
        "previewSrc": "/audio/previews/annihilation/full.mp3",
        "sort": 0
      },
      {
        "versionId": "short",
        "label": "Short Version",
        "duration": "0:26",
        "previewSrc": "/audio/previews/annihilation/short.mp3",
        "sort": 1
      }
    ]
  },
  {
    "id": "trk_113",
    "slug": "another-world",
    "title": "Another World",
    "category": "game-ost",
    "genre": "Fantasy / Sci-Fi",
    "mood": "Suspenseful",
    "useCase": "Video Game / Technology",
    "styleOf": "Mysterious new-world theme",
    "bpm": 100,
    "duration": "1:09",
    "description": "A mysterious world-building cue with shimmering textures — exploration scenes, sci-fi openings, discovery moments.",
    "tags": [
      "Sci-Fi",
      "Game",
      "Mysterious",
      "Exploration"
    ],
    "collectionIds": [
      "sci-fi-futuristic",
      "epic-adventure"
    ],
    "versions": [
      {
        "versionId": "full",
        "label": "Full Mix",
        "duration": "1:09",
        "previewSrc": "/audio/previews/another-world/full.mp3",
        "sort": 0
      },
      {
        "versionId": "short",
        "label": "Short Version",
        "duration": "0:39",
        "previewSrc": "/audio/previews/another-world/short.mp3",
        "sort": 1
      }
    ]
  },
  {
    "id": "trk_114",
    "slug": "antique-violin",
    "title": "Antique Violin",
    "category": "production",
    "genre": "Neo-Classical",
    "mood": "Emotional / Beautiful",
    "useCase": "Documentary / Luxury",
    "styleOf": "Vintage chamber elegance",
    "bpm": 80,
    "duration": "1:41",
    "description": "An elegant chamber piece with a vintage violin voice — luxury brands, period stories and refined documentaries.",
    "tags": [
      "Violin",
      "Elegant",
      "Luxury",
      "Classical"
    ],
    "collectionIds": [
      "orchestral",
      "emotional-inspiring"
    ],
    "versions": [
      {
        "versionId": "full",
        "label": "Full Mix",
        "duration": "1:41",
        "previewSrc": "/audio/previews/antique-violin/full.mp3",
        "sort": 0
      },
      {
        "versionId": "middle",
        "label": "Middle Version",
        "duration": "1:09",
        "previewSrc": "/audio/previews/antique-violin/middle.mp3",
        "sort": 1
      },
      {
        "versionId": "short",
        "label": "Short Version",
        "duration": "0:43",
        "previewSrc": "/audio/previews/antique-violin/short.mp3",
        "sort": 2
      }
    ]
  }
];
