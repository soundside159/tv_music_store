import { motion, AnimatePresence } from "framer-motion";
import cinemaHero from "@/assets/cinema-hero.png";
import cinemaThriller from "@/assets/cinema-thriller.png";

interface CinemaHeroProps {
  selectedCategory: string;
}

const CinemaHero = ({ selectedCategory }: CinemaHeroProps) => {
  const heroImages: Record<string, string> = {
    "modern-score": cinemaHero,
    "thriller": cinemaThriller,
    "game-ost": cinemaHero, // Placeholder - will use default for now
    "production": cinemaHero, // Placeholder - will use default for now
  };

  const currentImage = heroImages[selectedCategory] || cinemaHero;

  return (
    <section className="relative w-full">
      {/* Cinema Image Container - Screen area preserved for future video */}
      <div className="relative w-full aspect-[16/9] max-h-[85vh] overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.img
            key={selectedCategory}
            src={currentImage}
            alt="Premium cinema screening room"
            className="w-full h-full object-cover object-[center_28%]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          />
        </AnimatePresence>

        {/* Screen overlay container - for future video integration */}
        <div
          className="absolute top-[8%] left-[20%] right-[20%] bottom-[40%] 
                     flex items-center justify-center"
          id="cinema-screen"
        >
          {/* Future video or content will go here */}
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center animate-fade-in">
              <h1 className="font-display text-4xl md:text-6xl lg:text-7xl text-black tracking-wider mb-4">
                TVMUSICSTORE
              </h1>
              <p className="font-body text-sm md:text-base text-black/80 tracking-[0.3em] uppercase">
                Premium Music for Film & Television
              </p>
            </div>
          </div>
        </div>

        {/* Gradient overlay at bottom for seamless transition */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </div>
    </section>
  );
};

export default CinemaHero;
