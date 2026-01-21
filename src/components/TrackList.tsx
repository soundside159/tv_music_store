import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Download, Music } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Track {
  id: string;
  title: string;
  duration: string;
  composer: string;
}

const TrackList = () => {
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState("full");

  const fakeTracks: Track[] = [
    { id: "1", title: "Epic Horizons", duration: "3:24", composer: "John Williams Style" },
    { id: "2", title: "Dark Suspense", duration: "2:48", composer: "Hans Zimmer Style" },
    { id: "3", title: "Victory March", duration: "4:12", composer: "Thomas Newman Style" },
    { id: "4", title: "Midnight Chase", duration: "3:05", composer: "Ramin Djawadi Style" },
  ];

  const versionButtons = [
    { id: "full", label: "Full Track", disabled: false },
    { id: "15sec", label: "15 sec", disabled: true },
    { id: "30sec", label: "30 sec", disabled: true },
    { id: "60sec", label: "60 sec", disabled: true },
    { id: "loops", label: "Loops", disabled: true },
    { id: "stems", label: "Stems", disabled: true },
  ];

  const togglePlay = (trackId: string) => {
    setPlayingTrack(playingTrack === trackId ? null : trackId);
  };

  const currentTrack = fakeTracks.find(t => t.id === playingTrack);

  return (
    <>
      {/* Track List Panel */}
      <div className="fixed top-20 right-4 lg:right-8 w-80 lg:w-96 z-40">
        <motion.div 
          className="bg-card/80 backdrop-blur-md border border-border/50 rounded-lg overflow-hidden"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <div className="p-4 border-b border-border/50">
            <h3 className="font-display text-lg text-foreground tracking-wide flex items-center gap-2">
              <Music className="w-5 h-5 text-primary" />
              Track Preview
            </h3>
          </div>
          
          <div className="max-h-[calc(100vh-400px)] overflow-y-auto">
            {fakeTracks.map((track, index) => (
              <motion.div
                key={track.id}
                className={`p-4 border-b border-border/30 hover:bg-primary/5 transition-colors cursor-pointer
                           ${playingTrack === track.id ? 'bg-primary/10' : ''}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 + 0.5 }}
                onClick={() => togglePlay(track.id)}
              >
                <div className="flex items-center gap-3">
                  <button 
                    className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center
                               hover:bg-primary/30 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePlay(track.id);
                    }}
                  >
                    {playingTrack === track.id ? (
                      <Pause className="w-4 h-4 text-primary" />
                    ) : (
                      <Play className="w-4 h-4 text-primary ml-0.5" />
                    )}
                  </button>
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="font-body text-sm text-foreground truncate">
                      {track.title}
                    </h4>
                    <p className="font-body text-xs text-muted-foreground truncate">
                      {track.composer}
                    </p>
                  </div>
                  
                  <span className="font-body text-xs text-muted-foreground">
                    {track.duration}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Audio Player Bar - appears when track is playing */}
      <AnimatePresence>
        {playingTrack && currentTrack && (
          <motion.div
            className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border/50 z-50"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Waveform visualization */}
            <div className="h-8 bg-background/50 flex items-center px-4 overflow-hidden">
              <div className="flex-1 flex items-center gap-px h-full">
                {Array.from({ length: 100 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="flex-1 bg-primary/60 rounded-sm"
                    style={{ 
                      height: `${Math.random() * 60 + 20}%`,
                    }}
                    animate={playingTrack ? {
                      height: [`${Math.random() * 40 + 20}%`, `${Math.random() * 60 + 30}%`, `${Math.random() * 40 + 20}%`],
                    } : {}}
                    transition={{
                      duration: 0.5 + Math.random() * 0.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
            </div>
            
            <div className="px-4 py-3">
              <div className="flex items-center gap-4">
                {/* Play/Pause and Track Info */}
                <div className="flex items-center gap-3">
                  <button 
                    className="w-10 h-10 rounded-full bg-primary flex items-center justify-center
                               hover:bg-primary/80 transition-colors"
                    onClick={() => togglePlay(currentTrack.id)}
                  >
                    <Pause className="w-5 h-5 text-primary-foreground" />
                  </button>
                  
                  <div>
                    <h4 className="font-body text-sm text-foreground">
                      {currentTrack.title}
                    </h4>
                    <p className="font-body text-xs text-muted-foreground">
                      {currentTrack.composer}
                    </p>
                  </div>
                </div>

                {/* Time */}
                <div className="font-body text-xs text-muted-foreground ml-auto">
                  0:10 / {currentTrack.duration}
                </div>

                {/* Version Buttons */}
                <div className="flex items-center gap-1 bg-background/50 rounded-lg p-1">
                  {versionButtons.map((btn) => (
                    <button
                      key={btn.id}
                      onClick={() => !btn.disabled && setSelectedVersion(btn.id)}
                      disabled={btn.disabled}
                      className={`px-3 py-1.5 rounded text-xs font-body transition-all
                                 ${selectedVersion === btn.id 
                                   ? 'bg-primary text-primary-foreground' 
                                   : btn.disabled 
                                     ? 'text-muted-foreground/50 cursor-not-allowed'
                                     : 'text-muted-foreground hover:text-foreground hover:bg-background/80'
                                 }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>

                {/* Download Button */}
                <Button 
                  variant="outline" 
                  size="sm"
                  className="gap-2 border-primary/50 text-primary hover:bg-primary/10"
                >
                  <Download className="w-4 h-4" />
                  Download
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default TrackList;
