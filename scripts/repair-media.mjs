// Makes lazily loaded media render in the saved pages.
//
// The Stifel-style "js-lazy" markup on stories.wf.com and a few other pages
// keeps the real image URL in data-src/data-srcset/data-deferred-src and only
// sets src when its own JavaScript runs. That script is not part of the
// capture, so the URL is promoted here. Nothing is generated: every attribute
// keeps the URL Wells Fargo's own markup supplies.
//
// Rebuild with: node scripts/repair-media.mjs
import { readFileSync, writeFileSync } from "node:fs";

const CATALOG = "src/public-catalog.json";
const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));

const ELEMENT = /<(?:img|source|video|audio|iframe)\b[^>]*>/gi;

function promoteAttributes(tag) {
  let updated = tag;
  const pairs = [
    ["data-srcset", "srcset"],
    ["data-src", "src"],
    ["data-deferred-src", "src"],
    ["data-poster", "poster"],
  ];
  for (const [from, to] of pairs) {
    const value = new RegExp(`\\s${from}="([^"]*)"`).exec(updated)?.[1];
    if (!value) continue;
    const existing = new RegExp(`\\s${to}="([^"]*)"`).exec(updated)?.[1];
    // A placeholder (`src=""`, `src="data:..."`) is replaced by the real URL.
    if (!existing || existing === "" || existing.startsWith("data:")) {
      updated = new RegExp(`\\s${to}="[^"]*"`).test(updated)
        ? updated.replace(new RegExp(`\\s${to}="[^"]*"`), ` ${to}="${value}"`)
        : updated.replace(/\/?>$/, (close) => ` ${to}="${value}"${close}`);
    }
    updated = updated.replace(new RegExp(`\\s${from}="[^"]*"`), "");
  }
  // Empty placeholder images, including the commented-out copies the stories
  // templates keep, are dropped so the page never requests the page URL as an
  // image.
  if (/^<!--/.test(updated) || /-->$/.test(updated)) return updated;
  if (updated.includes("<img") && /<img\b[^>]*\ssrc=""/.test(updated)) {
    return updated.replace(/<!--[\s\S]*?-->|<img\b[^>]*\ssrc="[^"]*"[^>]*>/gi, "");
  }
  if (/\ssrc=""/.test(updated) && /^<(?:img|source)\b/i.test(updated)) return "";
  return updated;
}

// Asset paths the stories and credit-card templates leave relative are served
// by the same host as the page, so they are made absolute here.
function absolutize(html, sourceUrl) {
  let origin;
  try {
    origin = new URL(sourceUrl).origin;
  } catch {
    return html;
  }
  // Every image/source element the templates left relative is resolved against
  // the page it came from; the URL itself is untouched.
  return html.replace(/<(?:img|source)\b[^>]*>/gi, (tag) =>
    tag
      .replace(/\s(src|poster)="\/(?!\/)/gi, (match, attribute) => ` ${attribute}="${origin}/`)
      .replace(/\ssrcset="([^"]*)"/gi, (match, value) => {
        if (!value || /^https?:/.test(value)) return match;
        const absolute = value.replace(/(^|[\s,])\/(?!\/)/g, `$1${origin}/`);
        return ` srcset="${absolute}"`;
      }),
  );
}

let changedPages = 0;
let changedTags = 0;
for (const [route, page] of Object.entries(catalog)) {
  let changed = 0;
  const html = absolutize(page.html, page.source).replace(ELEMENT, (tag) => {
    if (!/\sdata-(src|srcset|deferred-src|poster)=/.test(tag)) return tag;
    const updated = promoteAttributes(tag);
    if (updated !== tag) changed += 1;
    return updated;
  });
  // Drop the placeholder images a video player fills in at runtime, and the
  // commented-out copies the stories templates keep next to the real image.
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, (comment) => (/<img\b[^>]*\ssrc=""/.test(comment) ? "" : comment))
    .replace(/<img\b[^>]*\ssrc="[^"]*"[^>]*>/gi, (tag) => (/\ssrc=""|\ssrc="data:/.test(tag) ? "" : tag));
  if (cleaned !== page.html) {
    catalog[route] = { ...page, html: cleaned };
    changedPages += 1;
    changedTags += changed;
  }
}

writeFileSync(CATALOG, JSON.stringify(catalog));
console.log(`promoted lazy media in ${changedTags} elements across ${changedPages} pages`);
