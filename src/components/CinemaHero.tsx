import cinemaHero from "@/assets/cinema-hero.png";

const CinemaHero = () => {
  return (
    <section className="relative w-full pt-8 md:pt-16">
      {/* Cinema Image Container - Screen area preserved for future video */}
      <div className="relative w-full aspect-[16/9] max-h-[80vh] overflow-hidden">
        <img
          src={cinemaHero}
          alt="Premium cinema screening room"
          className="w-full h-full object-cover"
        />
        
        {/* Screen overlay container - for future video integration */}
        <div 
          className="absolute top-[8%] left-[20%] right-[20%] bottom-[40%] 
                     flex items-center justify-center"
          id="cinema-screen"
        >
          {/* Future video or content will go here */}
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center animate-fade-in">
              <h1 className="font-display text-4xl md:text-6xl lg:text-7xl text-gradient-gold tracking-wider mb-4">
                TVMUSICSTORE
              </h1>
              <p className="font-body text-sm md:text-base text-foreground/80 tracking-[0.3em] uppercase">
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
