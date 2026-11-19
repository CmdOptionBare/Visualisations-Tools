/**
 * Load a JSON file relative to the current viz page (same-origin, no CORS).
 * Prefer paths like "./data/foo.json" so they work under /<slug>/.
 */
export async function loadJson(relativePath) {
  const url = new URL(relativePath, window.location.href);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load ${url.pathname}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
