import { cn } from "@/lib/utils";

interface WaveformPreviewProps {
  active?: boolean;
  bars?: number;
  className?: string;
  seed?: number;
}

const WaveformPreview = ({ active = false, bars = 96, className, seed = 0 }: WaveformPreviewProps) => (
  <div className={cn("flex h-14 w-full items-end gap-1 overflow-hidden", className)} aria-hidden="true">
    {Array.from({ length: bars }).map((_, index) => {
      const height = 18 + ((index * 17 + seed * 7) % 70);

      return (
        <span
          key={index}
          className={cn("w-full min-w-1 transition-opacity", active ? "bg-primary/75" : "bg-primary/35")}
          style={{ height: `${height}%` }}
        />
      );
    })}
  </div>
);

export default WaveformPreview;
