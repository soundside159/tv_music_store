import { createContext, useContext } from "react";
import type { PlayerEngine } from "@/components/TrackRowPlayer";

export const PlayerContext = createContext<PlayerEngine | null>(null);

export const usePlayer = () => {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
};
