import { useState, useEffect } from "react";
import Navigation from "@/components/Navigation";
import CinemaHero from "@/components/CinemaHero";
import Categories from "@/components/Categories";
import Footer from "@/components/Footer";
import LoadingScreen from "@/components/LoadingScreen";
import TrackList from "@/components/TrackList";

const Index = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("modern-score");

  useEffect(() => {
    // Preload the cinema hero image
    const img = new Image();
    img.src = "/src/assets/cinema-hero.png";
    img.onload = () => {
      // Image loaded, we can start showing content
      setShowContent(true);
    };
    img.onerror = () => {
      // Even on error, show content after a short delay
      setShowContent(true);
    };
  }, []);

  const handleLoadingComplete = () => {
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-background">
      {isLoading && <LoadingScreen onComplete={handleLoadingComplete} />}
      
      {showContent && (
        <>
          <Navigation />
          <main>
            <CinemaHero selectedCategory={selectedCategory} />
            <Categories 
              selectedCategory={selectedCategory} 
              onCategoryChange={setSelectedCategory} 
            />
          </main>
          <TrackList />
          <Footer />
        </>
      )}
    </div>
  );
};

export default Index;
