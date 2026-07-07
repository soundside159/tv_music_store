import { useEffect } from "react";

// Lightweight per-route SEO: sets <title>, meta description, canonical, OG tags
// and an optional JSON-LD block. Zero dependencies. Search engines that render
// JavaScript (Google, Bing) pick this up; the static tags in index.html cover
// JS-less bots for the homepage. For full JS-less coverage of every route,
// prerendering/SSR would be the next step (see docs/SEO.md).

interface SeoOptions {
  title?: string;
  description?: string;
  /** Absolute or root-relative path for the canonical URL, e.g. "/pricing". */
  path?: string;
  image?: string;
  /** A schema.org object rendered as <script type="application/ld+json">. */
  jsonLd?: Record<string, unknown> | null;
}

const SITE = "https://tvmusicstore.com";

const upsertMeta = (attr: "name" | "property", key: string, content: string) => {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
};

const upsertLink = (rel: string, href: string) => {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
};

export const useSeo = ({ title, description, path, image, jsonLd }: SeoOptions): void => {
  useEffect(() => {
    if (title) document.title = title;
    if (description) {
      upsertMeta("name", "description", description);
      upsertMeta("property", "og:description", description);
      upsertMeta("name", "twitter:description", description);
    }
    if (title) {
      upsertMeta("property", "og:title", title);
      upsertMeta("name", "twitter:title", title);
    }
    if (path) {
      const url = path.startsWith("http") ? path : `${SITE}${path}`;
      upsertLink("canonical", url);
      upsertMeta("property", "og:url", url);
    }
    if (image) {
      const img = image.startsWith("http") ? image : `${SITE}${image}`;
      upsertMeta("property", "og:image", img);
      upsertMeta("name", "twitter:image", img);
    }

    const prev = document.getElementById("route-jsonld");
    if (prev) prev.remove();
    if (jsonLd) {
      const s = document.createElement("script");
      s.type = "application/ld+json";
      s.id = "route-jsonld";
      s.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, path, image, JSON.stringify(jsonLd ?? null)]);
};
