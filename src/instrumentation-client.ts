// Registers the offline app-shell service worker. Only in production: the
// dev server's own hot-reload/asset pipeline would otherwise fight the SW's
// caching. See public/sw.js and plan.md §5.
if (
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  process.env.NODE_ENV === "production"
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.error("EyeOnPit service worker registration failed:", error);
    });
  });
}
