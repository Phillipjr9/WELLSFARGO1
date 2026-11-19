// Trims the site chrome that `fetch_page` includes but a <main>-only browser
// capture does not: the header mega-menu ("How can we help?"), the "Popular
// FAQs" block and the Spanish popup / footnote overlay that the source prints
// after the page body.
//
// Usage: node scripts/lib/trim-source.mjs <in.md> <out.md>
import { readFileSync, writeFileSync } from "node:fs";

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error("usage: node scripts/lib/trim-source.mjs <in.md> <out.md>");
  process.exit(1);
}

let text = readFileSync(input, "utf8").replace(/\r\n?/g, "\n");

// Everything before the page's own first-level heading is site chrome.
const heading = text.search(/^# /m);
if (heading > 0) text = text.slice(heading);

// Everything from the first trailing overlay onwards is not page content.
const stop = [
  /^## Footnote\s*$/m,
  /^## Esta página solo está disponible en inglés\s*$/m,
  /^Comienzo de ventana emergente\s*$/m,
  /^Beginning of popup\s*$/m,
  /^Navegó a una página que no está disponible/m,
].map((pattern) => text.search(pattern)).filter((index) => index > 0);
if (stop.length) text = text.slice(0, Math.min(...stop));

// Tracking pixels and image-only decorations carry no text.
text = text
  .split("\n")
  .filter((line) => !/^!\[[^\]]*\]\(https?:\/\/[^)]*\/s\.gif/.test(line.trim()))
  .filter((line) => !/^!\[Close\]/.test(line.trim()))
  .join("\n")
  .replace(/\n{3,}/g, "\n\n")
  .trimEnd();

if (!/^# /m.test(text)) {
  console.error(`${input}: no first-level heading after trimming; wrong page?`);
  process.exit(1);
}

writeFileSync(output, `${text}\n`);
const characters = text.replace(/\s+/g, " ").length;
console.log(`${output}: ${characters} characters, ${(text.match(/^#{1,6} /gm) || []).length} headings, ${(text.match(/\[[^\]]+\]\(/g) || []).length} links`);
