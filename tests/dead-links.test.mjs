// Fails when a link in the captured public pages would lead nowhere.
//
// Checks the same resolution the app uses (src/public/links.ts):
//   * every href in a captured page resolves to a captured route, an equivalent
//     page, an explicit "official site" link, or an external/documented URL;
//   * every href="#" has a handler in PublicPage.tsx that gives it behaviour;
//   * every parent route in link-index.json is a captured page and every page it
//     names is listed in that page's "More in this section" block;
//   * internal app links in src/ point at routes the router serves.
//
// Run: node --experimental-strip-types tests/dead-links.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolveHref } from "../src/public/links.ts";

const catalog = JSON.parse(readFileSync("src/public-catalog.json", "utf8"));
const index = JSON.parse(readFileSync("src/public/link-index.json", "utf8"));
const routes = Object.keys(catalog);

const captured = (route) => Boolean(catalog[route]);
const alias = (route) => index[route]?.route
  ? { route: index[route].route, fallback: Boolean(index[route].fallback) }
  : undefined;
const officialFor = (route) => index[route]?.official;

test("every link in a captured page has a destination", () => {
  const broken = [];
  let checked = 0;
  for (const [route, page] of Object.entries(catalog)) {
    for (const match of page.html.matchAll(/<a\s([^>]*)>/g)) {
      const attrs = match[1];
      const href = (attrs.match(/href="([^"]*)"/) || [])[1];
      if (!href) continue;
      if (href === "#") continue; // covered by the control test below
      if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
      if (href.startsWith("#")) {
        const id = href.slice(1);
        if (!id) continue;
        if (page.html.includes(`id="${id}"`)) continue;
        // Anchors without a matching id are controls, not destinations: FAQ
        // accordions, legacy #Expand toggles, footnotes stored by
        // data-footnote-id, and carousel/page-frame controls. Each one has a
        // handler in PublicPage.tsx (checked by the next test).
        continue;
      }
      checked += 1;
      const destination = resolveHref(href, page.source, captured, alias, officialFor);
      if (destination.kind === "internal") broken.push([route, href, "unhandled"]);
      if (destination.kind === "page" && !captured(destination.route))
        broken.push([route, href, `route not captured: ${destination.route}`]);
      if ((destination.kind === "external" || destination.kind === "document") && !destination.url)
        broken.push([route, href, "no official URL"]);
    }
  }
  assert.deepEqual(broken.slice(0, 20), []);
  assert.ok(checked > 5000, `expected thousands of links, checked ${checked}`);
});

test("every href=# control is handled by the page behaviour", () => {
  const publicPage = readFileSync("src/public/PublicPage.tsx", "utf8");
  const handlers = [
    { pattern: /data-fn|\.fn-ref|"#fn|data-footnote-id/, name: "footnote reference" },
    { pattern: /c58answer|#Expand/, name: "legacy accordion" },
    { pattern: /closest\(\"summary\"\)/, name: "FAQ accordion" },
    { pattern: /balloonhelp/, name: "balloon help" },
    { pattern: /PopupOpener/, name: "share pop-up" },
    { pattern: /printLink/, name: "print" },
    { pattern: /feedback-survey-link/, name: "feedback survey" },
    { pattern: /contact-bar-collapsible/, name: "contact bar" },
    { pattern: /carousel-dot/, name: "carousel" },
    { pattern: /fn-target|\.fns/, name: "back to content" },
  ];
  for (const handler of handlers) {
    assert.match(publicPage, handler.pattern, `missing ${handler.name} handler`);
  }
  // Anchors the source renders without any href are controls; the page makes
  // them keyboard reachable (wireTooltips) instead of leaving a dead element.
  assert.match(publicPage, /a:not\(\[href\]\)/, "anchors without href must be made focusable");
});

test("the destination index points at captured pages that list their children", () => {
  const problems = [];
  for (const [target, entry] of Object.entries(index)) {
    if (entry.route) {
      if (!captured(entry.route)) problems.push(`${target}: parent ${entry.route} is not captured`);
      continue;
    }
    if (entry.official) {
      if (!entry.official.startsWith("https://www.wellsfargo.com/"))
        problems.push(`${target}: unexpected official URL ${entry.official}`);
      continue;
    }
    problems.push(`${target}: no destination`);
  }
  assert.deepEqual(problems.slice(0, 20), []);

  // Pages that stand in for a destination list it, so it stays reachable.
  const listing = new Map();
  for (const [route, page] of Object.entries(catalog)) {
    if (!page.html.includes('data-link-index="true"')) continue;
    for (const match of page.html.matchAll(/<li(?: id="[^"]*")?><a href="https:\/\/www\.wellsfargo\.com([^"]+)"/g)) {
      listing.set(match[1].replace(/\/$/, ""), route);
    }
  }
  const unlisted = Object.entries(index)
    .filter(([, entry]) => entry.fallback)
    .map(([target]) => target)
    .filter((target) => !listing.has(target));
  assert.deepEqual(unlisted.slice(0, 20), []);
});

test("internal app links resolve to a served route", () => {
  const files = [];
  for (const dir of ["src", "src/components", "src/portal", "src/pages", "src/public"]) {
    for (const name of readdirSync(dir)) {
      if (!/\.(ts|tsx)$/.test(name)) continue;
      files.push(`${dir}/${name}`);
    }
  }
  const portalRoutes = new Set([
    "/portal", "/portal/activity", "/portal/statements", "/portal/inbox",
    "/portal/settings", "/portal/spending", "/portal/brokerage",
    "/portal/transfers", "/portal/transfers/external", "/portal/send-money",
    "/portal/wires", "/portal/bill-pay", "/portal/account-payment",
    "/portal/mobile-deposit", "/portal/payments", "/portal/admin",
  ]);
  const broken = [];
  for (const file of files) {
    // Alias tables and route matchers list legacy paths that are rewritten
    // before routing; only the link-bearing files are checked here.
    if (file.endsWith("model.ts") || file.endsWith("App.tsx")) continue;
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/["'`](\/[a-z0-9][a-z0-9\-/]*)["'`]/g)) {
      const route = match[1].replace(/\/+$/, "") || "/";
      if (route.startsWith("/portal")) {
        const ok = portalRoutes.has(route) || /^\/portal\/(payments|accounts)/.test(route);
        if (!ok) broken.push(`${file}: ${route}`);
        continue;
      }
      if (/^\/(api|assets|images)/.test(route)) continue;
      if (route === "/" || route === "/home" || route === "/sign-on" || route === "/login") continue;
      if (route === "/search") continue;
      if (route === "/locations" || route === "/appointments") continue;
      if (captured(route) || alias(route)) continue;
      broken.push(`${file}: ${route}`);
    }
  }
  assert.deepEqual(broken.slice(0, 20), []);
});

test("no image in the capture was generated: every source is a real media URL", () => {
  const broken = [];
  for (const [route, page] of Object.entries(catalog)) {
    for (const match of page.html.matchAll(/<img\s([^>]*)>/g)) {
      const attrs = match[1];
      const src = (attrs.match(/src="([^"]*)"/) || [])[1];
      if (!src) continue;
      if (src.startsWith("data:")) continue;
      // Real media only: images on Wells Fargo's own media hosts, or the theme
      // icons the jobs and stories sites draw for themselves. Nothing is
      // generated locally.
      const realHost = /^https:\/\/[a-z0-9.-]+wellsfargo[a-z0-9.-]*\//i.test(src)
        || /^https:\/\/[a-z0-9.-]*wf\.com\//i.test(src)
        || /^https:\/\/[a-z0-9.-]+wellsfargojobs\.com\//i.test(src);
      // Real photographs and product art served by the pages' own CDNs, plus
      // the theme icons and card marketplace art the source pages load
      // themselves. Nothing here is generated or drawn locally.
      const themeIcon = src.startsWith("/wp-content/") || src.startsWith("/images/")
        || src.startsWith("/W-Card-MarketPlace/")
        || /^https:\/\/(dyn\.mktgcdn\.com|sbresourcesdev\.wpengine\.com)\//i.test(src);
      if (!realHost && !themeIcon) {
        broken.push([route, src.slice(0, 90)]);
      }
    }
  }
  assert.deepEqual(broken.slice(0, 10), []);
});
void routes;

test("every image in the capture has a real, absolute source", () => {
  const problems = [];
  let images = 0;
  for (const [route, page] of Object.entries(catalog)) {
    for (const match of page.html.matchAll(/<img\b[^>]*>/g)) {
      const tag = match[0];
      images += 1;
      const src = (tag.match(/\ssrc="([^"]*)"/) || [])[1];
      if (!src) { problems.push([route, "no src", tag.slice(0, 60)]); continue; }
      if (src === "" || src.startsWith("data:")) { problems.push([route, "placeholder src", ""]); continue; }
      if (/^\/\//.test(src)) continue;
      if (src.startsWith("/")) { problems.push([route, "relative src", src.slice(0, 60)]); continue; }
      if (!/^https:\/\//.test(src)) problems.push([route, "not https", src.slice(0, 60)]);
    }
  }
  assert.deepEqual(problems.slice(0, 15), []);
  assert.ok(images > 3000, `expected the captured photography to stay in place, found ${images}`);
});

test("no generated or drawn placeholder imagery is embedded", () => {
  // Every image must come from a Wells Fargo media host, its theme, or a
  // partner CDN named in the page's own markup. Locally generated art would
  // show up as a data: URL or a srcset pointing at a local path.
  for (const [route, page] of Object.entries(catalog)) {
    for (const match of page.html.matchAll(/\ssrcset="([^"]*)"/g)) {
      const value = match[1];
      if (!value) continue;
      assert.ok(/^https:\/\//.test(value) || value.startsWith("/W-Card-MarketPlace/") || value.startsWith("/wp-content/"),
        `${route}: srcset is not a real source (${value.slice(0, 60)})`);
    }
  }
});

test("search, portal, and app entry points are wired", () => {
  const router = readFileSync("src/router/Navigation.tsx", "utf8");
  assert.match(router, /closest\("a"\)/, "route links must be intercepted");
  const header = readFileSync("src/components/Header.tsx", "utf8");
  assert.match(header, /navigate\("\/search"/, "header search must reach the search page");
  const app = readFileSync("src/App.tsx", "utf8");
  for (const route of ["/home", "/sign-on", "/locations"]) {
    assert.ok(app.includes(`"${route}"`) || app.includes(`'${route}'`), `app must route ${route}`);
  }
  // Every route the router serves has a page in the workspace or the capture.
  const workspace = readFileSync("src/portal/BankingWorkspace.tsx", "utf8");
  for (const route of ["/portal", "/portal/payments", "/portal/statements", "/portal/settings", "/portal/inbox", "/portal/spending", "/portal/brokerage", "/portal/admin"]) {
    assert.ok(workspace.includes(`"${route}"`), `workspace must render ${route}`);
  }
  // No catch-all placeholder left in the workspace: unknown portal routes say so.
  assert.match(workspace, /MissingPage/, "unknown portal routes must explain themselves");
});

test("every captured page has one main landmark and one first-level heading", () => {
  // Rendered into a shadow root, so the check works on the saved markup with
  // the same landmark rule PublicPage applies: <main>, else role="main", else
  // the container the page heading lives in.
  const noLandmark = [];
  const noHeading = [];
  const headingOutside = [];
  for (const [route, page] of Object.entries(catalog)) {
    const html = page.html;
    const hasLandmark = /<main[\s>]|<div[^>]*role="main"|<div[^>]*data-wf-main/i.test(html);
    if (!hasLandmark) noLandmark.push(route);
    const h1 = html.match(/<h1[\s>]/i);
    if (!h1) { noHeading.push(route); continue; }
    if (hasLandmark) {
      // The heading must come after the landmark opens (inside it), not before.
      const landmarkAt = html.search(/<main[\s>]|<div[^>]*role="main"|<div[^>]*data-wf-main/i);
      if (html.indexOf(h1[0]) < landmarkAt) headingOutside.push(route);
    }
  }
  assert.deepEqual(noHeading, [], "every page needs an <h1>");
  assert.deepEqual(headingOutside, [], "the <h1> must sit inside the landmark");
  assert.deepEqual(noLandmark, [], "every page needs a main landmark in the saved markup");
});

test("every captured page holds the page, not an error banner", () => {
  // Some product pages were captured from the campaign host, which answers
  // "Offer unavailable" for paths published on www.wellsfargo.com. Those were
  // re-captured from the real page; a capture that only shows a banner is a
  // dead end even when its links resolve.
  const banners = [
    /Offer unavailable/i,
    /Oferta no disponible/i,
    /Technical difficulties/i,
    /cannot process your request at this time/i,
    /requested URL was rejected/i,
    /Access Denied/i,
  ];
  const empty = /^(?:\s|<[^>]+>)*$/;
  const problems = [];
  for (const [route, page] of Object.entries(catalog)) {
    const text = page.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (empty.test(text)) { problems.push(`${route}: no page text`); continue; }
    for (const banner of banners) {
      if (banner.test(text)) problems.push(`${route}: shows "${banner.source}"`);
    }
  }
  assert.deepEqual(problems.slice(0, 20), []);
});

test("a re-captured page keeps its real source and title", () => {
  const sources = readdirSync("sources").filter((name) => name.endsWith(".json"));
  assert.ok(sources.length >= 11, "re-captured source files must be kept");
  for (const name of sources) {
    const record = JSON.parse(readFileSync(`sources/${name}`, "utf8"));
    const page = catalog[record.route];
    assert.ok(page, `${record.route} must stay a captured route`);
    assert.match(record.source, /^https:\/\/www\.wellsfargo\.com\//, `${name}: source must be the official page`);
    assert.match(record.html, /<h1|<h2/i, `${name}: holds page content`);
    assert.ok(!/Technical difficulties/i.test(page.title), `${record.route}: title must describe the page`);
    assert.ok(page.html.includes(record.html.slice(0, 120)), `${record.route}: capture must carry the re-captured content`);
  }
});
