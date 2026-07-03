import type { Composer, User } from "@/types/domain";

export const mockComposerUsers: User[] = [
  {
    id: "usr_comp_1",
    email: "owner@tvmusicstore.com",
    name: "Composer One",
    role: "composer",
    createdAt: "2026-01-10",
  },
  {
    id: "usr_comp_2",
    email: "composer2@example.com",
    name: "Composer Two",
    role: "composer",
    createdAt: "2026-02-01",
  },
  {
    id: "usr_comp_3",
    email: "composer3@example.com",
    name: "Composer Three",
    role: "composer",
    createdAt: "2026-02-01",
  },
];

export const mockComposers: Composer[] = [
  {
    id: "cmp_1",
    userId: "usr_comp_1",
    slug: "composer-one",
    displayName: "Composer One",
    bio: "Cinematic score composer. Modern score, thriller, game OST and production music with a film-grade hybrid sound.",
    styles: ["Modern Score", "Thriller", "Game OST", "Production"],
    trackCount: 250,
    revenueWeight: 1,
  },
  {
    id: "cmp_2",
    userId: "usr_comp_2",
    slug: "composer-two",
    displayName: "Composer Two",
    bio: "Premium sport and electronic music: drive, energy and modern sound design for action edits and brand videos.",
    styles: ["Sport", "Electronic", "Action"],
    trackCount: 250,
    revenueWeight: 1,
  },
  {
    id: "cmp_3",
    userId: "usr_comp_3",
    slug: "composer-three",
    displayName: "Composer Three",
    bio: "Guitar-driven cinematic tracks: from intimate acoustic textures to wide hybrid rock scores.",
    styles: ["Guitar", "Cinematic Rock", "Acoustic"],
    trackCount: 400,
    revenueWeight: 1,
  },
];
