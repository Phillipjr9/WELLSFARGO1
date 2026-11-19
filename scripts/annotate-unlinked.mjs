// Adds the "More in this section" block to pages of the capture that act as the
// parent for destinations the capture does not contain (see link-index.json).
// The block links every one of those pages to its real public URL, so a reader
// who came for "What is APR?" is never left without a way to reach it.
//
// Rebuild with: node scripts/annotate-unlinked.mjs
import { readFileSync, writeFileSync } from "node:fs";

const CATALOG = "src/public-catalog.json";
const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
const index = JSON.parse(readFileSync("src/public/link-index.json", "utf8"));
const MARK = 'data-link-index="true"';

function titleCase(slug) {
  const words = slug
    .split(/[-_/]+/)
    .filter(Boolean)
    .map((word) =>
      /^(and|or|the|of|for|to|in|a|an|on|with|your|my)$/i.test(word)
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    );
  if (!words.length) return "Related page";
  words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  return words.join(" ");
}

/** Anchor id for a destination listed in the section index. */
export function sectionAnchor(target) {
  return `wf-ref-${target.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase()}`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Labels for pages whose public URL does not describe the page.
const LABELS = {
  "/military": "Military Resource Center",
  "/military/prepare-for-deployment": "Military: preparing for deployment",
  "/military/veterans": "Support for veterans",
  "/debitlimits": "Debit card limits",
  "/statements": "Statements and documents",
  "/replacemycard": "Replace a lost or damaged card",
  "/directdepositform": "Direct deposit form",
  "/ficoscore": "FICO® Credit Score",
  "/impact": "Responsibility and impact",
  "/spanish": "En español",
  "/wst_transfer": "Wells Fargo stock transfer",
  "/exit/social": "Share this page on social media",
  "/fetch-pdf": "Printable forms",
};

const grouped = new Map();
for (const [target, entry] of Object.entries(index)) {
  if (!entry.route || !entry.fallback) continue;
  if (!catalog[entry.route]) continue;
  if (!grouped.has(entry.route)) grouped.set(entry.route, []);
  grouped.get(entry.route).push(target);
}

let annotated = 0;
let totalLinks = 0;
for (const [route, targets] of grouped) {
  const page = catalog[route];
  // Remove a previous run before adding the current one.
  let html = page.html.replace(
    new RegExp(`\\s*<section[^>]*${MARK.replace(/["]/g, '"')}[\\s\\S]*?</section>`, "gi"),
    "",
  );
  const parentSegments = route.split("/").filter(Boolean);
  const items = targets
    .sort((a, b) => a.localeCompare(b))
    .map((target) => {
      const rest = target.split("/").filter(Boolean).slice(parentSegments.length);
      const label = LABELS[target] || titleCase(rest.join(" ") || target);
      const url = `https://www.wellsfargo.com${target}/`;
      return `<li id="${sectionAnchor(target)}"><a href="${url}" target="_blank" rel="noreferrer">${escapeHtml(label)}<span class="wf-section-link-note">on wellsfargo.com</span></a></li>`;
    })
    .join("");
  const block =
    `<section class="wf-section-index" ${MARK}>` +
    `<h2 class="wf-section-index-title">More in this section</h2>` +
    `<p class="wf-section-index-intro">These pages are part of the same section on wellsfargo.com and open on the official site.</p>` +
    `<ul class="wf-section-index-list">${items}</ul>` +
    `</section>`;
  const close = html.lastIndexOf("</main>");
  html = close >= 0 ? `${html.slice(0, close)}${block}${html.slice(close)}` : `${html}${block}`;
  catalog[route] = { ...page, html };
  annotated += 1;
  totalLinks += items.length;
}

writeFileSync(CATALOG, JSON.stringify(catalog));
console.log(`annotated ${annotated} parent pages with ${totalLinks} source links`);
