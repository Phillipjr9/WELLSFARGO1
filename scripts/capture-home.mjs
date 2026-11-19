// Captures the homepage from the source markup pasted from www.wellsfargo.com.
//
// The homepage was the one public page never captured: it was a hand-written
// React composition, so the preview did not show the source page. This records
// the real page the same way every other route is recorded — its <main> region,
// its stylesheet, its title and its source URL — so /home renders the original.
//
// The markup is reduced exactly like server/public-pages.mjs does for a live
// capture, then written in the same shape as sources/*.json:
//
//   sources/home.json   { route: "/home", source, title, html }
//
// Rebuild with: node scripts/capture-home.mjs
import { readFileSync, writeFileSync } from "node:fs";

const RAWS = ["sources/raw/home.html"];
const OUT = "sources/home.json";
const SOURCE = "https://www.wellsfargo.com/";

let markup = "";
for (const file of RAWS) {
  try {
    markup = readFileSync(file, "utf8");
    console.log(`read ${file}`);
    break;
  } catch {
    /* try the next candidate */
  }
}
if (!markup) {
  console.error(`No homepage markup found. Save the page's HTML as ${RAWS.join(" or ")}.`);
  process.exit(1);
}

const title = (markup.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || "Wells Fargo Bank";

// The source's own stylesheet for this page.
const styles = [...markup.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/gi)]
  .map((match) => match[1])
  .filter((href) => !href.startsWith("data:"))
  .map((href) => new URL(href, SOURCE).href);

// Keep the <main> region only, as a browser capture does.
const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(markup);
if (!main) {
  console.error("The markup has no <main> element; is it the full page?");
  process.exit(1);
}
let body = main[0];

// The sign-on card is captured exactly as the source has it -- same elements,
// same classes, same headings, same labels, the Show toggle, the Save username
// option, the hidden fields, the Sign On submit, the tooltip. The page's own
// stylesheet positions it over the hero and no substitute lays out the same, so
// substituting anything made the card look wrong.
//
// It is a real login form, though, and this is a copy of the page, not the
// bank: the markup is made inert at render time by @/public/PublicPage.tsx
// (wireSignon), which writes a note into the card, opens Sign On at the bank's
// own sign-in page, and blocks submission. Nothing typed here is sent or stored.
// Nothing about the card is edited below.

// Lazy images the source swaps in by script keep their real source.
body = body
  .replace(/<img([^>]*?)\sdata-deferred-src="([^"]+)"([^>]*?)\ssrc=""([^>]*)>/gi,
    (_m, before, src, middle, after) => `<img${before} src="${src}"${middle}${after}>`)
  .replace(/\sdata-deferred-src="[^"]*"/gi, "")
  .replace(/\sclass="deferred"/gi, "");

// The page's own heading is visually hidden; the capture needs one to announce.
const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(body);
const plainTitle = title.split(/\s*[|–—]\s*/)[0].trim();
if (!h1) body = body.replace(/<main\b[^>]*>/i, (open) => `${open}<h1 class="hidden">${plainTitle}</h1>`);

// Tracking images and empty <script> remnants carry nothing a reader needs.
body = body
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<img\b[^>]*\ssrc="[^"]*\/s\.gif[^"]*"[^>]*>/gi, "")
  .replace(/<\/(input|img|br|hr)>/gi, "");

// The page's real stylesheet. It is already stored in src/public/source-styles.ts
// (fetched from the live page by scripts/fetch-source-styles.mjs) and is packed
// into style-data.ts, so the capture loads the page's own CSS.
const record = {
  route: "/home",
  source: SOURCE,
  title,
  capturedAt: new Date().toISOString().slice(0, 10),
  styles,
  html: body,
};

writeFileSync(OUT, `${JSON.stringify(record, null, 1)}\n`);

const text = body.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
console.log(`${OUT}: "${title}"`);
console.log(`  ${text.length} characters of page text`);
console.log(`  ${(body.match(/<h[1-6][\s>]/g) || []).length} headings, ${(body.match(/<img\s/g) || []).length} images, ${(body.match(/<a\s/g) || []).length} links`);
console.log(`  source stylesheet(s):`);
for (const url of styles) console.log(`    ${url}`);
