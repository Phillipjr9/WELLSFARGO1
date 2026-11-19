// Gives every captured page the structure a reader and a screen reader expect,
// using only what the capture already contains:
//
//   1. one main landmark. Pages whose <main> has no id get `id="main-content"`
//      so the app's "Skip to main content" link resolves. The handful of
//      captures with `role="main"` on a div keep the source element.
//   2. no empty headings. The capture kept a few headings whose text was
//      injected by script (`<h2></h2>`, `<h2><br></h2>`); they render as nothing
//      but announce "heading, level 2" to a screen reader, so they are dropped.
//   3. one <h1>. Seven captures start their content at <h2>; those pages get an
//      <h1> built from the page's own <title>, placed inside the landmark, so
//      the document outline starts where a reader expects it to.
//
// No page content is rewritten, reordered or invented, and nothing is inserted
// outside the existing landmark.
//
// Rebuild with: node scripts/repair-landmarks.mjs
import { readFileSync, writeFileSync } from "node:fs";

const CATALOG = "src/public-catalog.json";
const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
const MARK = 'class="wf-page-title"';

/** The page's own <title>, without the trailing site name. */
function headingTitle(page) {
  const raw = String(page.title || "").trim();
  const cut = raw.split(/\s*[|–—]\s*/)[0].trim();
  return cut || raw;
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const emptied = [];
// Captures whose page body sits in a plain container with no landmark at all.
// The container is marked so the renderer can promote exactly that element and
// the title heading goes inside it.
const CONTAINERS = {
  "/locator/wellsfargoadvisors": /<div class="Locator">/,
  "/redeem": /<div id="skipLinkTarget"[^>]*>/,
};

const identified = [];
const kept = [];
const titled = [];
const orphans = [];

for (const [route, page] of Object.entries(catalog)) {
  let html = page.html;
  // A previous run is replaced, not stacked.
  html = html.replace(new RegExp(`<h1\\s+${MARK.replace(/\//g, "\\/")}[^>]*>[\\s\\S]*?</h1>`, "gi"), "");
  // Headings the capture left empty (text arrived by script) carry no content.
  const before = html;
  // Empty means: only whitespace, breaks, comments, or empty spans.
  const blank = String.raw`(?:\s|&nbsp;|<br\s*\/?>|<!--[\s\S]*?-->|<span\b[^>]*>\s*<\/span>)*`;
  html = html.replace(new RegExp(`<(h[1-6])\\b[^>]*>${blank}<\\/\\1>`, "gi"), "");
  if (html !== before) emptied.push(route);

  let main = html.match(/<main\b[^>]*>/i) || html.match(/<div\b[^>]*\brole="main"[^>]*>/i);
  let mainKind = main && /<main\b/i.test(main[0]) ? "main" : "role";
  if (!main && CONTAINERS[route]) {
    const container = CONTAINERS[route].exec(html);
    if (container) {
      const marked = container[0].replace(/^<div\b/i, '<div data-wf-main="true"');
      html = html.replace(container[0], marked);
      main = [marked];
      mainKind = "container";
    }
  }
  if (!main) {
    orphans.push(route);
  } else if (mainKind === "main") {
    if (!/\bid=/.test(main[0])) {
      html = html.replace(main[0], main[0].replace(/^<main\b/i, '<main id="main-content"'));
      identified.push(route);
    } else if (!/id="main-content"/.test(main[0])) {
      kept.push(route);
    }
  }

  if (!/<h1[\s>]/i.test(html) && main) {
    const title = headingTitle(page);
    if (title) {
      const opener = main[0];
      // Insert right after the landmark opens, before any captured content.
      html = html.replace(opener, `${opener}<h1 ${MARK}>${escapeHtml(title)}</h1>`);
      titled.push(`${route} → ${title}`);
    }
  }

  if (html !== page.html) catalog[route] = { ...page, html };
}

writeFileSync(CATALOG, JSON.stringify(catalog));
console.log(`removed empty headings on ${emptied.length} pages`);
console.log(`added id="main-content" to ${identified.length} pages`);
console.log(`kept the source id on ${kept.length} pages that already named their main`);
console.log(`added a title heading to ${titled.length} pages:`);
for (const entry of titled) console.log(`  ${entry}`);
console.log(`pages with no landmark in the capture: ${orphans.length}`);
for (const route of orphans) console.log(`  ${route}`);
