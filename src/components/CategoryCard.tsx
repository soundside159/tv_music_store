import { LucideIcon } from "lucide-react";

interface CategoryCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  delay?: number;
}

const CategoryCard = ({ title, description, icon: Icon, delay = 0 }: CategoryCardProps) => {
  return (
    <div 
      className="group relative p-8 bg-card border border-border/50 
                 hover:border-primary/50 transition-all duration-500
                 cursor-pointer overflow-hidden"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Hover glow effect */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 
                      transition-opacity duration-500 pointer-events-none
                      bg-gradient-to-br from-primary/5 to-transparent" />
      
      <div className="relative z-10">
        <Icon 
          className="w-10 h-10 text-primary mb-6 
                     group-hover:scale-110 transition-transform duration-300" 
          strokeWidth={1.5}
        />
        
        <h3 className="font-display text-xl text-foreground mb-3 tracking-wide">
          {title}
        </h3>
        
        <p className="font-body text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
        
        <div className="mt-6 flex items-center gap-2 text-primary text-sm font-body
                        opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <span>Explore</span>
          <span className="transform group-hover:translate-x-1 transition-transform duration-300">
            →
          </span>
        </div>
      </div>
    </div>
  );
};

export default CategoryCard;
