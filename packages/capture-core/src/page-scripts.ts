/**
 * Scripts evaluated inside the target page (Puppeteer or Playwright), kept as
 * plain strings so they work with both drivers and in Cloudflare Browser Run.
 * No DOM mutation of content: only motion/animation freezing and scroll.
 */

/**
 * Disable smooth scroll before screenshots. Do NOT pause animations/transitions: spike B showed
 * `animation-play-state: paused` pins Framer appear effects at opacity 0 (blank sections).
 * Motion is handled by emulating prefers-reduced-motion in the driver.
 * The only content change is hiding Framer's "Made in Framer" badge (free-plan overlay, not site content).
 */
export const PREPARE_PAGE_SCRIPT = `
(() => {
  const style = document.createElement("style");
  style.setAttribute("data-sitepromo", "freeze");
  style.textContent = "html, body { scroll-behavior: auto !important; } #__framer-badge-container { display: none !important; }";
  document.head.appendChild(style);
})();
`

/**
 * Scroll through the page to trigger lazy loading + Framer appear effects,
 * wait for fonts and images (bounded), then return to top.
 * Returns stats for logging.
 */
export const SETTLE_SCRIPT = `
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const docH = () => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  const step = Math.max(400, Math.floor(window.innerHeight * 0.8));
  const start = performance.now();
  let y = 0;
  let passes = 0;
  while (y < docH() && passes < 60) { window.scrollTo(0, y); await sleep(80); y += step; passes++; }
  window.scrollTo(0, docH());
  await sleep(150);
  window.scrollTo(0, 0);
  await Promise.race([document.fonts.ready, sleep(3000)]);
  const imgs = Array.from(document.images).filter((i) => !i.complete);
  await Promise.race([
    Promise.all(imgs.map((i) => new Promise((r) => { i.addEventListener("load", r, { once: true }); i.addEventListener("error", r, { once: true }); }))),
    sleep(4000),
  ]);
  // Framer scroll "appear" effects leave elements at inline opacity:0 until an IntersectionObserver
  // fires; fast programmatic scrolling can miss it. Reveal only elements Framer itself hid inline.
  let revealed = 0;
  for (const el of document.querySelectorAll('#main [style*="opacity"]')) {
    if (el.style.opacity === "0" && el.getBoundingClientRect().height > 40) {
      el.style.opacity = "1";
      el.style.transform = "none";
      revealed++;
    }
  }
  await sleep(200);
  return { scrollPasses: passes, height: docH(), pendingImages: imgs.length, revealed, ms: Math.round(performance.now() - start) };
})();
`
