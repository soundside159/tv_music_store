import { cn } from "@/lib/utils";

interface WaveformPreviewProps {
  active?: boolean;
  bars?: number;
  className?: string;
  progress?: number;
  seed?: number;
}

const WaveformPreview = ({ active = false, bars = 96, className, progress = 0, seed = 0 }: WaveformPreviewProps) => (
  <div className={cn("flex h-14 w-full items-end gap-1 overflow-hidden", className)} aria-hidden="true">
    {Array.from({ length: bars }).map((_, index) => {
      const height = 18 + ((index * 17 + seed * 7) % 68);
      const played = progress > 0 && index / Math.max(1, bars - 1) <= progress;

      return (
        <span
          key={index}
          className={cn(
            "w-full min-w-0.5 transition-colors",
            played ? "bg-primary" : active ? "bg-foreground/40" : "bg-foreground/20",
          )}
          style={{ height: `${height}%` }}
        />
      );
    })}
  </div>
);

export default WaveformPreview;
