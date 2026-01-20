import { useState } from "react";
import { Music, Skull, Gamepad2, Clapperboard, LucideIcon } from "lucide-react";

interface Category {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

const Categories = () => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories: Category[] = [
    {
      id: "modern-score",
      title: "Modern Score Music",
      description: "Contemporary orchestral compositions with cinematic depth. Perfect for drama, documentary, and emotional storytelling.",
      icon: Music,
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
      icon: Clapperboard,
    },
  ];

  const handleCategoryClick = (id: string) => {
    setSelectedCategory(selectedCategory === id ? null : id);
  };

  return (
    <section id="catalog" className="relative -mt-32 md:-mt-40 pb-16 bg-transparent z-10">
      <div className="container mx-auto px-6">
        <div className="text-center mb-8">
          <h2 className="font-display text-2xl md:text-3xl text-gradient-gold mb-2 tracking-wide">
            CATALOG
          </h2>
          <p className="font-body text-sm text-muted-foreground max-w-xl mx-auto">
            Explore our curated collection of premium music, crafted for the most demanding productions.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-4 md:gap-6 lg:gap-8">
          {categories.map((category) => {
            const Icon = category.icon;
            const isSelected = selectedCategory === category.id;
            
            return (
              <button
                key={category.id}
                onClick={() => handleCategoryClick(category.id)}
                className={`group relative p-4 md:p-6 bg-card/90 backdrop-blur-sm border 
                           transition-all duration-300 cursor-pointer overflow-hidden text-left
                           w-[calc(50%-0.5rem)] md:w-[200px] lg:w-[220px]
                           ${isSelected 
                             ? 'border-primary bg-primary/10 ring-2 ring-primary/50 scale-[1.02]' 
                             : 'border-border/50 hover:border-primary/50'
                           }`}
              >
                {/* Hover glow effect */}
                <div className={`absolute inset-0 transition-opacity duration-500 pointer-events-none
                                bg-gradient-to-br from-primary/10 to-transparent
                                ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
                
                <div className="relative z-10">
                  <Icon 
                    className={`w-8 h-8 md:w-10 md:h-10 mb-3 md:mb-4 transition-all duration-300
                               ${isSelected ? 'text-primary scale-110' : 'text-primary group-hover:scale-110'}`}
                    strokeWidth={1.5}
                  />
                  
                  <h3 className="font-display text-base md:text-lg text-foreground mb-2 tracking-wide">
                    {category.title}
                  </h3>
                  
                  <p className="font-body text-xs md:text-sm text-muted-foreground leading-relaxed line-clamp-3">
                    {category.description}
                  </p>
                  
                  {isSelected && (
                    <div className="mt-3 flex items-center gap-2 text-primary text-xs font-body animate-fade-in">
                      <span>Selected</span>
                      <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Categories;
