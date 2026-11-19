// Builds the destination index for links that point at public pages the
// capture does not contain. Each entry records either an equivalent captured
// page or the section of the parent page that renders the same content.
//
// Rebuild with: node scripts/build-link-index.mjs
import { readFileSync, writeFileSync } from "node:fs";

const CATALOG = "src/public-catalog.json";
const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
const routes = Object.keys(catalog);
const captured = new Set(routes);
const norm = (p) => p.split("#")[0].split("?")[0].replace(/\/+$/, "") || "/";
const segments = (p) => p.split("/").filter(Boolean);

// Source markup uses question marks, percent signs and long words as anchor
// text; keep slugs readable and stable.
function slug(text) {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&amp;|&#\d+;/gi, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function headText(html, tag = "h[1-3]") {
  const re = new RegExp(`<${tag.split("[")[0]}[^>]*>([\\s\\S]{0,160}?)</`, "gi");
  const match = re.exec(html);
  return match ? match[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "";
}

// The label the source link itself carries describes the destination best.
const linkLabels = new Map();
const linkOrigins = new Map();
for (const [route, page] of Object.entries(catalog)) {
  let base;
  try {
    base = new URL(page.source);
  } catch {
    continue;
  }
  for (const m of page.html.matchAll(/<a\s([^>]*)>([\s\S]{0,160}?)<\/a>/g)) {
    const href = (m[1].match(/href="([^"]+)"/) || [])[1];
    if (!href || !href.startsWith("/")) continue;
    let url;
    try {
      url = new URL(href.replace(/&amp;/g, "&"), base);
    } catch {
      continue;
    }
    let local = norm(url.pathname);
    if (url.hostname === "creditcards.wellsfargo.com") local = norm(`/credit-cards${local}`);
    else if (url.hostname === "getmoneyready.wf.com") local = norm(`/guidance${local}`);
    else if (url.hostname === "stories.wf.com") local = norm(`/stories${local}`);
    const text = m[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!text || text.length < 4 || /^(opens|download|learn more|read more|view|shop|explore)$/i.test(text)) continue;
    if (!linkLabels.has(local) || linkLabels.get(local).length < text.length) linkLabels.set(local, text);
    if (!linkOrigins.has(local)) linkOrigins.set(local, new Set());
    linkOrigins.get(local).add(route);
  }
}

// Every uncaptured destination referenced by the catalog.
const uncaptured = new Map();
for (const [route, page] of Object.entries(catalog)) {
  let base;
  try {
    base = new URL(page.source);
  } catch {
    continue;
  }
  for (const m of page.html.matchAll(/href="(\/[^"]+)"/g)) {
    const raw = m[1].replace(/&amp;/g, "&");
    let url;
    try {
      url = new URL(raw, base);
    } catch {
      continue;
    }
    let local = norm(url.pathname);
    if (url.hostname === "creditcards.wellsfargo.com") local = norm(`/credit-cards${local}`);
    else if (url.hostname === "getmoneyready.wf.com") local = norm(`/guidance${local}`);
    else if (url.hostname === "stories.wf.com") local = norm(`/stories${local}`);
    else if (url.hostname !== "www.wellsfargo.com") continue;
    if (local === "/" || captured.has(local)) continue;
    if (/\.(pdf|zip|docx?|xlsx?|pptx?|csv|ics)$/i.test(local)) continue;
    if (!uncaptured.has(local)) uncaptured.set(local, new Set());
    uncaptured.get(local).add(route);
  }
}

const index = {};
const stats = { alias: 0, section: 0, official: 0 };

for (const target of [...uncaptured.keys()].sort()) {
  const label = linkLabels.get(target) || "";
  const parts = segments(target);
  let alias;
  // 1. Duplicated section prefix: /credit-cards/credit-cards/... -> /credit-cards/...
  if (parts.length > 1 && parts[0] === parts[1]) {
    const candidate = norm(`/${parts.slice(1).join("/")}`);
    if (captured.has(candidate)) alias = candidate;
  }
  // 2. /section/index -> /section
  if (!alias && parts.at(-1) === "index") {
    const candidate = norm(`/${parts.slice(0, -1).join("/")}`);
    if (captured.has(candidate)) alias = candidate;
  }
  // 3. Spanish locale variant -> the English page we do have.
  if (!alias && parts.includes("es")) {
    const at = parts.indexOf("es");
    const candidate = norm(`/${[...parts.slice(0, at), ...parts.slice(at + 1)].join("/")}`);
    if (captured.has(candidate)) alias = candidate;
  }
  // 4. Same trailing slug inside the same top-level section.
  if (!alias) {
    const last = parts.at(-1);
    const matches = routes.filter((r) => {
      const s = segments(r);
      return s.at(-1) === last && s[0] === parts[0];
    });
    if (matches.length === 1) alias = matches[0];
  }
  if (alias) {
    const equivalent = alias === target || alias === norm(target.replace(/\/index$/, ""));
    index[target] = equivalent ? { route: alias } : { route: alias, fallback: true };
    stats.alias += 1;
    continue;
  }
  // 5. Section anchor on the nearest captured parent page. The parent page is
  //    annotated at build time by scripts/annotate-sections.mjs, which gives
  //    every referenced child its own numbered section placeholder.
  const parents = [];
  const stack = [...parts];
  while (stack.length > 1) {
    stack.pop();
    const candidate = `/${stack.join("/")}`;
    if (captured.has(candidate)) {
      parents.push(candidate);
      if (parents.length === 1) break;
    }
  }
  if (parents.length) {
    const origins = linkOrigins.get(target) ?? new Set();
    const parent = parents.find((candidate) => origins.has(candidate)) ?? parents[0];
    index[target] = { route: parent, fallback: true };
    stats.section += 1;
    continue;
  }
  index[target] = { official: `https://www.wellsfargo.com${target}/` };
  stats.official += 1;
}

// Destinations that resolve to unrelated content should not be linked to a
// captured page at all: they open their real public URL instead.
for (const [target, entry] of Object.entries(index)) {
  if (entry.route && entry.fallback && segments(target)[0] !== segments(entry.route)[0]) {
    index[target] = { official: `https://www.wellsfargo.com${target}/` };
    stats.official += 1;
    stats.section -= 1;
  }
}

const ordered = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync("src/public/link-index.json", `${JSON.stringify(ordered, null, 0)}\n`);
console.log(`indexed ${Object.keys(ordered).length} un-captured destinations`, stats);
void headText;
