import { Music, Skull, Gamepad2, Clapperboard } from "lucide-react";
import CategoryCard from "./CategoryCard";

const Categories = () => {
  const categories = [
    {
      title: "Modern Score",
      description: "Contemporary orchestral compositions with cinematic depth. Perfect for drama, documentary, and emotional storytelling.",
      icon: Music,
    },
    {
      title: "Thriller",
      description: "Tension-building soundscapes and dark atmospheres. Designed for suspense, horror, and psychological narratives.",
      icon: Skull,
    },
    {
      title: "Game OST",
      description: "Dynamic and adaptive music for interactive media. From epic adventures to ambient exploration themes.",
      icon: Gamepad2,
    },
    {
      title: "Production",
      description: "Broadcast-ready tracks for commercials, trailers, and corporate media. High-impact, versatile compositions.",
      icon: Clapperboard,
    },
  ];

  return (
    <section id="catalog" className="py-24 bg-background">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl md:text-4xl text-gradient-gold mb-4 tracking-wide">
            CATALOG
          </h2>
          <p className="font-body text-muted-foreground max-w-xl mx-auto">
            Explore our curated collection of premium music, crafted for the most demanding productions.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {categories.map((category, index) => (
            <CategoryCard
              key={category.title}
              title={category.title}
              description={category.description}
              icon={category.icon}
              delay={index * 100}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Categories;
