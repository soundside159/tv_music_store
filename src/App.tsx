import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import SoundEffects from "./pages/SoundEffects";
import Catalog from "./pages/Catalog";
import Discover from "./pages/Discover";
import Guides from "./pages/Guides";
import Collections from "./pages/Collections";
import CollectionDetail from "./pages/CollectionDetail";
import Playlists from "./pages/Playlists";
import PlaylistDetail from "./pages/PlaylistDetail";
import TrackDetail from "./pages/TrackDetail";
import Pricing from "./pages/Pricing";
import Sync from "./pages/Sync";
import Custom from "./pages/Custom";
import Artist from "./pages/Artist";
import Licensing from "./pages/Licensing";
import Account from "./pages/Account";
import Cart from "./pages/Cart";
import Composer from "./pages/Composer";
import Admin from "./pages/Admin";
import RouteBeacon from "./lib/analytics";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// SPA navigation keeps the scroll position — landing mid-page on a playlist
// after scrolling the homepage reads as a bug. Every PATHNAME change starts
// the new page at the top; query-param changes (catalog filters etc.) don't
// jump. Instant, not smooth: smooth scrolling across a route change looks
// like the page is running away.
const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};
import Login from "./pages/Login";
import Contact from "./pages/Contact";
import LicenseTerms from "./pages/LicenseTerms";
import Privacy from "./pages/Privacy";
import Refunds from "./pages/Refunds";
import NotFound from "./pages/NotFound";
import DevPersonaSwitcher from "./components/DevPersonaSwitcher";
import DownloadOptionsModal from "./components/DownloadOptionsModal";
import LicenseModal from "./components/LicenseModal";
import PlanModal from "./components/PlanModal";
import AttributionModal from "./components/AttributionModal";
import WelcomeModal from "./components/WelcomeModal";
import { PlayerProvider } from "./components/PlayerProvider";
import { useContentReady } from "./hooks/useContent";

const queryClient = new QueryClient();

/** Warms the /api/content cache on EVERY page load (any route) — this is what
 *  hydrates the live license prices, vocabularies, trending etc. even when the
 *  visitor lands directly on a track page and hits F5. */
const ContentBoot = () => {
  useContentReady();
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        {/* Pageview beacon for Admin -> Analytics (see src/lib/analytics.tsx). */}
        <ScrollToTop />
        <RouteBeacon />
        <ContentBoot />
        <DevPersonaSwitcher />
        <PlayerProvider>
          <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/catalog" element={<Catalog />} />
          {/* Sound effects: landing, one category, and search — all paged in the DB. */}
          <Route path="/sound-effects" element={<SoundEffects />} />
          <Route path="/sound-effects/:category" element={<SoundEffects />} />
          {/* SEO tag landing pages: /discover, /discover/moods/happy, … */}
          <Route path="/discover" element={<Discover />} />
          <Route path="/discover/:group/:tag" element={<Discover />} />
          {/* Answer library — the pages AI engines quote. */}
          <Route path="/guides" element={<Guides />} />
          <Route path="/guides/:slug" element={<Guides />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/collection/:slug" element={<CollectionDetail />} />
          <Route path="/playlists" element={<Playlists />} />
          <Route path="/playlist/:slug" element={<PlaylistDetail />} />
          <Route path="/track/:slug" element={<TrackDetail />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/sync" element={<Sync />} />
          <Route path="/custom" element={<Custom />} />
          <Route path="/artist/:slug" element={<Artist />} />
          <Route path="/licensing" element={<Licensing />} />
          <Route path="/account" element={<Account />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/composer" element={<Composer />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/login" element={<Login />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/license-terms" element={<LicenseTerms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/refunds" element={<Refunds />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
          </Routes>
          <DownloadOptionsModal />
          <LicenseModal />
          <PlanModal />
          <AttributionModal />
          <WelcomeModal />
        </PlayerProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
