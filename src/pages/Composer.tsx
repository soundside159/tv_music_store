import { Navigate, useSearchParams } from "react-router-dom";
import { COMPOSER_SECTION_IDS, type ComposerSectionId } from "@/components/ComposerPanel";

// The composer studio lives INSIDE /account now (sidebar "Composer" group) —
// this route only redirects old links/bookmarks there, keeping ?section=.

const Composer = () => {
  const [searchParams] = useSearchParams();
  const s = searchParams.get("section");
  const section: ComposerSectionId = COMPOSER_SECTION_IDS.includes(s as ComposerSectionId)
    ? (s as ComposerSectionId)
    : "dashboard";
  return <Navigate to={`/account?section=composer-${section}`} replace />;
};

export default Composer;
