// Merges the re-captured source files in sources/ into the catalog, so a page
// whose capture held only an error banner renders the page's real content.
//
// Each file was produced by `node scripts/capture-sources.mjs <route> <md>`
// from the original Wells Fargo page. The catalog entry keeps its route and its
// real source URL; only the page body is replaced.
//
// Rebuild with: node scripts/apply-sources.mjs
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIRECTORY = "sources";

// Titles for pages whose capture recorded the campaign host's error page.
const TITLES = {
  "/credit-cards/features": "Credit Card Features & Services | Wells Fargo",
  "/credit-cards/features/balance-transfer": "Wells Fargo Credit Card – Balance Transfer – Wells Fargo",
  "/credit-cards/features/overdraft-protection": "Overdraft Protection – Wells Fargo",
  "/credit-cards/agreements": "Account Documents for Wells Fargo Credit Cards | Wells Fargo",
  "/credit-cards/active-cash/terms": "Wells Fargo Active Cash Credit Card Credit Terms and Conditions",
  "/credit-cards/autograph-visa/terms": "Wells Fargo Autograph Visa Card Terms and Conditions",
  "/credit-cards/autograph-journey-visa/terms": "Wells Fargo Autograph Journey Visa® Card Terms and Conditions",
  "/credit-cards/choice/terms": "Choice Privileges® World Elite Mastercard® Credit Card Terms and Conditions",
  "/credit-cards/choice-select/terms": "Choice Privileges® Select World Elite Mastercard® Credit Card Terms and Conditions",
  "/credit-cards/reflect-visa/terms": "Wells Fargo Reflect Visa Credit Card Credit Terms and Conditions",
  "/credit-cards/terms/onekey": "One Key™ Mastercard® Terms and Conditions",
};
const CATALOG = "src/public-catalog.json";
const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));

if (!existsSync(DIRECTORY)) {
  console.log("no sources/ directory; nothing to apply");
  process.exit(0);
}

let applied = 0;
for (const name of readdirSync(DIRECTORY).filter((file) => file.endsWith(".json")).sort()) {
  const record = JSON.parse(readFileSync(join(DIRECTORY, name), "utf8"));
  const page = catalog[record.route];
  if (!page) {
    console.warn(`${name}: ${record.route} is not a captured route, skipped`);
    continue;
  }
  if (!record.html || !/<h1|<h2/i.test(record.html)) {
    console.warn(`${name}: no page content, skipped`);
    continue;
  }
  const title = TITLES[record.route] || record.title || page.title;
  catalog[record.route] = {
    ...page,
    source: record.source,
    title,
    html: `<html><head><title>${title}</title></head><body><main id="main-content" class="ps-body-wrapper">${record.html}</main></body></html>`,
    styles: [],
    status: 200,
    recaptured: record.capturedAt,
  };
  applied += 1;
  console.log(`${record.route}: ${record.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length} characters of source text`);
}

writeFileSync(CATALOG, JSON.stringify(catalog));
console.log(`applied ${applied} re-captured source page(s)`);
