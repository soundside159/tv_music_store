import { Sparkles, Edit, MessageSquare } from "lucide-react";

const CustomWork = () => {
  const services = [
    {
      icon: Sparkles,
      title: "Original Composition",
      description: "Bespoke soundtracks tailored to your vision",
    },
    {
      icon: Edit,
      title: "Track Customization",
      description: "Adapt existing catalog tracks to your needs",
    },
    {
      icon: MessageSquare,
      title: "Consultation",
      description: "Expert guidance on music selection and licensing",
    },
  ];

  return (
    <section id="custom" className="py-24 cinema-gradient">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl md:text-4xl text-gradient-gold mb-4 tracking-wide">
              CUSTOM WORK
            </h2>
            <p className="font-body text-muted-foreground max-w-xl mx-auto">
              Need something unique? Our composers create exclusive music tailored to your project's specific requirements.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            {services.map((service) => (
              <div key={service.title} className="text-center">
                <service.icon 
                  className="w-12 h-12 text-primary mx-auto mb-4" 
                  strokeWidth={1.5} 
                />
                <h3 className="font-display text-lg text-foreground mb-2">
                  {service.title}
                </h3>
                <p className="font-body text-sm text-muted-foreground">
                  {service.description}
                </p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <a
              href="#contact"
              className="inline-block font-body text-sm tracking-wide px-8 py-4
                       bg-primary text-primary-foreground
                       hover:bg-primary/90 transition-all duration-300
                       glow-gold-subtle hover:glow-gold"
            >
              Request Custom Work
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CustomWork;
