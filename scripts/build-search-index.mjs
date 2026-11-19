// Builds the offline search index used when the demo runs without its API
// (a static export, for example). Every entry is text taken from the saved
// public pages: title, headings and the first meaningful paragraph.
//
// Rebuild with: node scripts/build-search-index.mjs
import { readFileSync, writeFileSync } from "node:fs";

const catalog = JSON.parse(readFileSync("src/public-catalog.json", "utf8"));

function textOf(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sectionOf(route) {
  const segment = route.split("/").filter(Boolean)[0] || "home";
  const names = {
    about: "About Wells Fargo",
    "auto-loans": "Auto loans",
    biz: "Small business",
    careers: "Careers",
    cds: "Savings & CDs",
    checking: "Checking",
    cib: "Corporate & Investment Banking",
    com: "Commercial banking",
    "credit-cards": "Credit cards",
    "debit-card": "Debit card",
    es: "En español",
    "financial-education": "Financial education",
    "financial-goals": "Financial goals",
    "foreign-exchange": "Foreign exchange",
    guidance: "Financial guidance",
    help: "Help & support",
    "investing-wealth": "Investing & wealth",
    mortgage: "Home loans",
    "online-banking": "Online banking",
    "personal-loans": "Personal loans",
    "privacy-security": "Privacy & security",
    "savings-cds": "Savings & CDs",
    stories: "Wells Fargo Stories",
    "mobile-online-banking": "Mobile banking",
    premier: "Premier",
    rewards: "Rewards",
    "international-remittances": "Global remittance",
    "goals-credit": "Credit guidance",
    "mobile": "Mobile banking",
    "investing": "Investing",
  };
  return names[segment] || segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const entries = [];
for (const [route, page] of Object.entries(catalog)) {
  if (route.startsWith("/search")) continue;
  const headings = [...page.html.matchAll(/<h([1-3])[^>]*>([\s\S]{0,200}?)<\/h\1>/gi)]
    .map((match) => textOf(match[2]))
    .filter((text) => text.length > 2 && text.length < 120)
    .slice(0, 8);
  const body = textOf(page.html);
  const heading = headings[0] || page.title;
  const excerpt = body.slice(0, 220);
  entries.push({
    route,
    title: (page.title || heading || route).replace(/\s*\|\s*Wells Fargo.*$/i, "").slice(0, 120),
    heading: heading.slice(0, 120),
    section: sectionOf(route),
    headings,
    excerpt,
  });
}

entries.sort((a, b) => a.route.localeCompare(b.route));
writeFileSync("src/public/search-index.json", `${JSON.stringify(entries)}\n`);
console.log(`indexed ${entries.length} public pages for offline search`);
