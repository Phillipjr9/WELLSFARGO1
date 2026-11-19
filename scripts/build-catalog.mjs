import { writeFileSync } from "node:fs";
import * as cheerio from "cheerio";
import { chromium } from "playwright";
import { extractPublicPage, isSecureDestination, sourceForPath } from "../server/public-pages.mjs";

const sourcePaths = ["/", "/sitemap/"];
const routes = new Set([
  "/checking/", "/savings-cds/", "/credit-cards/", "/mortgage/", "/personal-loans/", "/auto-loans/",
  "/investing-wealth/", "/premier/", "/guidance/", "/about/", "/help/", "/help/rates/", "/help/routing-number/",
  "/privacy-security/", "/online-banking/transfers/", "/online-banking/bill-pay/", "/online-banking/deposit-details/",
  "/online-banking/online-access-agreement/", "/sitemap/", "/es/", "/biz/", "/com/", "/cib/", "/careers/",
  "/financial-goals/", "/financial-goals/borrow/", "/stories/",
]);
for (const route of sourcePaths) {
  const html = await (await fetch(new URL(route, "https://www.wellsfargo.com"))).text();
  const $ = cheerio.load(html);
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href?.startsWith("/") && !href.startsWith("//")) routes.add(href.split(/[?#]/)[0]);
  });
}
const aliases = {
  "/savings/": "/savings-cds/", "/cds/": "/savings-cds/certificate-of-deposit/", "/home-loans/": "/mortgage/",
  "/business/": "/biz/", "/commercial/": "/com/", "/corporate/": "/cib/", "/investing/": "/investing-wealth/",
  "/lifesync/": "/mobile-online-banking/lifesync/", "/routing-number/": "/help/routing-number/", "/rates/": "/help/rates/",
  "/espanol/": "/es/", "/jobs/": "/careers/",
};
Object.keys(aliases).forEach((route) => routes.add(route));

const entries = {};
const failed = [];
const queue = [...routes].filter((route) => route !== "/" && route !== "/home/").sort();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "en-US" });
let done = 0;
async function worker() {
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(25000);
  while (queue.length) {
    const route = queue.shift();
    const requested = sourceForPath(route);
    try {
      await context.clearCookies();
      const response = await page.goto(requested, { waitUntil: "domcontentloaded" });
      if (isSecureDestination(page.url())) throw new Error("Secure destination");
      if (response && !response.ok()) throw new Error(`Public page returned ${response.status()}`);
      // Public campaigns, product images and comparison panels are populated after DOMContentLoaded.
      await page.waitForTimeout(3000);
      const rendered = await page.evaluate(() => ({
        title: document.title,
        main: document.querySelector("main")?.outerHTML || document.body.outerHTML,
        styles: [...document.querySelectorAll('link[rel="stylesheet"]')].map(link => link.href),
      }));
      const html = `<html><head><title>${rendered.title}</title>${rendered.styles.map(url => `<link rel="stylesheet" href="${url}">`).join("")}</head><body>${rendered.main}</body></html>`;
      const record = extractPublicPage(html, requested, page.url());
      if (!record.html.includes("<h1") && !record.html.includes("<h2")) throw new Error("No public page content found");
      entries[route.replace(/\/+$/, "") || "/"] = record;
    } catch (error) { failed.push([route, error.message]); }
    done += 1;
    if (done % 20 === 0) console.log(`${done} rendered public pages checked`);
  }
  await page.close();
}
await Promise.all(Array.from({ length: 5 }, worker));
await browser.close();
writeFileSync("src/public-catalog.json", JSON.stringify(entries));
console.log(`Saved ${Object.keys(entries).length} source-backed routes. ${failed.length} unavailable:`);
console.log(failed);
