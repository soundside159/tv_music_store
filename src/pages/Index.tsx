import Navigation from "@/components/Navigation";
import CinemaHero from "@/components/CinemaHero";
import Categories from "@/components/Categories";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        <CinemaHero />
        <Categories />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
