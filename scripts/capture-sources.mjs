// Replaces captures that hold only an error banner with the page's real
// content, captured from the original Wells Fargo page.
//
// A handful of product pages were captured from `creditcards.wellsfargo.com`,
// which answers "Offer unavailable" for paths that are published on
// `www.wellsfargo.com` instead (features, card documents, terms, agreements).
// Those routes are re-captured from the correct host and their real text is
// stored beside the catalog:
//
//   sources/<route>.json   { route, source, title, capturedAt, html }
//
// `node scripts/capture-sources.mjs` reports which routes need the re-capture;
// `node scripts/capture-sources.mjs <route> <file.md>` applies one, converting
// the Markdown that `fetch_page` returned for the original page into the same
// markup a browser capture would have produced. Nothing is written by hand and
// no wording is changed.
//
// Finally `apply-sources.mjs` merges the files into src/public-catalog.json.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderMarkdown } from "./lib/markdown.mjs";
import { sourceForPath } from "../server/public-pages.mjs";

const CATALOG = "src/public-catalog.json";
const DIRECTORY = "sources";
const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));

// Markers the campaign host prints instead of a page.
const BROKEN = [/Offer unavailable/i, /Oferta no disponible/i];

const applyOne = (route, markdownPath) => {
  const page = catalog[route];
  if (!page) throw new Error(`${route} is not a captured route`);
  const markdown = readFileSync(markdownPath, "utf8");
  if (BROKEN.some((pattern) => pattern.test(markdown))) {
    throw new Error(`${markdownPath} still holds the "Offer unavailable" banner, not the page`);
  }
  const html = renderMarkdown(markdown);
  if (!/<h1|<h2/i.test(html)) throw new Error(`${markdownPath} has no heading; is it the right page?`);
  const source = sourceForPath(route);
  const record = {
    route,
    source,
    title: page.title,
    capturedAt: new Date().toISOString().slice(0, 10),
    html,
  };
  mkdirSync(DIRECTORY, { recursive: true });
  const file = join(DIRECTORY, `${route.replace(/^\//, "").replace(/\//g, "__")}.json`);
  writeFileSync(file, `${JSON.stringify(record, null, 1)}\n`);
  console.log(`${route}\n  ${markdown.length} characters of source text → ${file}\n  headings: ${(html.match(/<h[1-6]>/g) || []).length}, links: ${(html.match(/<a /g) || []).length}`);
};

const [route, markdownPath] = process.argv.slice(2);
if (route && markdownPath) {
  applyOne(route, markdownPath);
} else {
  const broken = Object.entries(catalog)
    .filter(([, page]) => {
      const text = page.html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ");
      return BROKEN.some((pattern) => pattern.test(text));
    })
    .map(([route]) => route);
  const captured = existsSync(DIRECTORY) ? readdirSync(DIRECTORY).filter((name) => name.endsWith(".json")).length : 0;
  console.log(`${broken.length} captured routes still show the campaign host's error banner:`);
  for (const route of broken) console.log(`  ${route}  →  needs ${sourceForPath(route)}`);
  console.log(`\n${captured} re-captured source file(s) ready in ${DIRECTORY}/`);
  if (broken.length) console.log("Apply one with: node scripts/capture-sources.mjs <route> <markdown-file>");
}
