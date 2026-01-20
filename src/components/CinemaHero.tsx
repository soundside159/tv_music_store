import { motion, AnimatePresence } from "framer-motion";
import cinemaHero from "@/assets/cinema-hero.png";
import cinemaThriller from "@/assets/cinema-thriller.png";
import cinemaGame from "@/assets/cinema-game.png";
import cinemaProduction from "@/assets/cinema-production.png";

interface CinemaHeroProps {
  selectedCategory: string;
}

interface CategoryContent {
  image: string;
  title: string;
  subtitle: string;
}

const CinemaHero = ({ selectedCategory }: CinemaHeroProps) => {
  const categoryContent: Record<string, CategoryContent> = {
    "modern-score": {
      image: cinemaHero,
      title: "Modern Score Music",
      subtitle: "Contemporary drama, documentary, and emotional storytelling.",
    },
    "thriller": {
      image: cinemaThriller,
      title: "Thriller Music",
      subtitle: "Tension and suspense for crime dramas and thrillers.",
    },
    "game-ost": {
      image: cinemaGame,
      title: "Game OST Music",
      subtitle: "Epic soundtracks for missions, exploration, and boss battles.",
    },
    "production": {
      image: cinemaProduction,
      title: "Production Music",
      subtitle: "Versatile tracks for TV, corporate videos, and commercials.",
    },
  };

  const currentContent = categoryContent[selectedCategory] || categoryContent["modern-score"];

  return (
    <section className="relative w-full">
      {/* Cinema Image Container - Screen area preserved for future video */}
      <div className="relative w-full aspect-[16/9] max-h-[85vh] overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.img
            key={selectedCategory}
            src={currentContent.image}
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
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedCategory}
                className="text-center"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4 }}
              >
                <h1 className="font-display text-4xl md:text-6xl lg:text-7xl text-black tracking-wider mb-4">
                  {currentContent.title}
                </h1>
                <p className="font-body text-sm md:text-base text-black/80 tracking-[0.3em] uppercase max-w-xl mx-auto">
                  {currentContent.subtitle}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Gradient overlay at bottom for seamless transition */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </div>
    </section>
  );
};

export default CinemaHero;
