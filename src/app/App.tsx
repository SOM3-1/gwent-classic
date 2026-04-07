import { useEffect } from "react";
import { appMarkup } from "./markup";

const scriptSources = [
  "/legacy/cards.js",
  "/legacy/decks.js",
  "/legacy/abilities.js",
  "/legacy/factions.js",
  "/legacy/gwent.js",
  "https://www.youtube.com/iframe_api"
];

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.body.appendChild(script);
  });
}

export default function App() {
  useEffect(() => {
    if (window.__GWENT_LEGACY_LOADED__) {
      return;
    }
    window.__GWENT_LEGACY_LOADED__ = true;
    let cancelled = false;
    (async () => {
      for (const src of scriptSources) {
        if (cancelled) {
          return;
        }
        await loadScript(src);
      }
    })().catch((error) => {
      window.__GWENT_LEGACY_LOADED__ = false;
      throw error;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <div dangerouslySetInnerHTML={{ __html: appMarkup }} />;
}
