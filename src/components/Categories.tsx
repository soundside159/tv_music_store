import { motion } from "framer-motion";
import { Clapperboard, Skull, Gamepad2, Youtube, LucideIcon } from "lucide-react";

interface Category {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

interface CategoriesProps {
  selectedCategory: string;
  onCategoryChange: (id: string) => void;
}

const Categories = ({ selectedCategory, onCategoryChange }: CategoriesProps) => {
  const categories: Category[] = [
    {
      id: "modern-score",
      title: "Modern Score Music",
      description: "Contemporary orchestral compositions with cinematic depth. Perfect for drama, documentary, and emotional storytelling.",
      icon: Clapperboard,
    },
    {
      id: "thriller",
      title: "Thriller Music",
      description: "Tension-building soundscapes and dark atmospheres. Designed for suspense, horror, and psychological narratives.",
      icon: Skull,
    },
    {
      id: "game-ost",
      title: "Game OST Music",
      description: "Dynamic and adaptive music for interactive media. From epic adventures to ambient exploration themes.",
      icon: Gamepad2,
    },
    {
      id: "production",
      title: "Production Music",
      description: "Broadcast-ready tracks for commercials, trailers, and corporate media. High-impact, versatile compositions.",
      icon: Youtube,
    },
  ];

  const handleCategoryClick = (id: string) => {
    onCategoryChange(id);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.3,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0.25, 0.46, 0.45, 0.94] as const,
      },
    },
  };

  const headerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
      },
    },
  };

  return (
    <section id="catalog" className="relative -mt-32 md:-mt-40 pb-16 bg-transparent z-10">
      <div className="w-full px-4 sm:px-6 md:px-8 lg:px-12">
        <motion.div 
          className="text-center mb-8"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={headerVariants}
        >
          <h2 className="font-display text-2xl md:text-3xl text-gradient-gold mb-2 tracking-wide">
            CATALOG
          </h2>
          <p className="font-body text-sm text-muted-foreground max-w-xl mx-auto">
            Explore our curated collection of premium music, crafted for the most demanding productions.
          </p>
        </motion.div>

        <motion.div 
          className="flex justify-center gap-4 sm:gap-6 md:gap-8 lg:gap-10"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={containerVariants}
        >
          {categories.map((category) => {
            const Icon = category.icon;
            const isSelected = selectedCategory === category.id;
            
            return (
              <motion.button
                key={category.id}
                variants={itemVariants}
                onClick={() => handleCategoryClick(category.id)}
                className={`group relative p-4 md:p-5 bg-card/90 backdrop-blur-sm border 
                           transition-all duration-300 cursor-pointer overflow-hidden text-center
                           flex-1 min-w-0
                           ${isSelected 
                             ? 'border-primary bg-primary/10 ring-2 ring-primary/50' 
                             : 'border-border/50 hover:border-primary/50'
                           }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {/* Selected indicator - top right */}
                {isSelected && (
                  <motion.div 
                    className="absolute top-2 right-2 flex items-center gap-1.5 text-primary text-xs font-body"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span>Selected</span>
                  </motion.div>
                )}
                
                {/* Hover glow effect */}
                <div className={`absolute inset-0 transition-opacity duration-500 pointer-events-none
                                bg-gradient-to-br from-primary/10 to-transparent
                                ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
                
                <div className="relative z-10 flex flex-col items-center">
                  <Icon 
                    className={`w-8 h-8 md:w-10 md:h-10 mb-3 transition-all duration-300
                               ${isSelected ? 'text-primary scale-110' : 'text-primary group-hover:scale-110'}`}
                    strokeWidth={1.5}
                  />
                  
                  <h3 className="font-display text-sm md:text-base lg:text-lg text-foreground tracking-wide">
                    {category.title}
                  </h3>
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
};

export default Categories;
