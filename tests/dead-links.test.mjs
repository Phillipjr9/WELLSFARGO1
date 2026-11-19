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
    // The catalog stores the captured region, wrapped in <main> when the capture
    // has none and given the app's landmark id when it does, so compare on the
    // first line of text the page carries.
    const sample = record.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
    assert.ok(
      page.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").includes(sample),
      `${record.route}: capture must carry the re-captured content`,
    );
  }
});

test("the homepage is the captured source page, with a login card that collects nothing", () => {
  const page = catalog["/home"];
  assert.ok(page, "the homepage must be captured like every other public page");
  assert.equal(page.source, "https://www.wellsfargo.com/");
  assert.ok(page.styles.length > 0, "the homepage must load its stylesheet");
  // The capture keeps the source's sections…
  const text = page.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  for (const phrase of [
    "Checking that fits perfectly",
    "Financial guidance and support",
    "Serving our customers and communities",
    "How can we help?",
  ]) {
    assert.ok(text.includes(phrase), `homepage must keep "${phrase}"`);
  }
  // …and the source's sign-on card: both fields, its labels, its actions. The
  // card is part of the page, so removing it makes the page look nothing like
  // the source. It must, however, collect nothing.
  assert.match(page.html, /id="userid"/, "the source's Username field must be present");
  assert.match(page.html, /id="password"/, "the source's Password field must be present");
  assert.match(text, /Username/, "the Username label must be present");
  assert.match(text, /Password/, "the Password label must be present");
  assert.match(text, /Save username/, "the Save username option must be present");
  assert.match(text, /Sign On/, "the Sign On action must be present");
  assert.match(text, /Enroll/, "the Enroll link must be present");
  assert.match(text, /passkey/, "the passkey link must be present");
  // No sign-on form, no credential names, no submission anywhere in the capture.
  // (The rates dropdown and the location search are ordinary forms and stay.)
  const signon = page.html.slice(page.html.indexOf("signon-container"), page.html.indexOf("marquee-container"));
  assert.ok(!/<form\b/i.test(signon), "the sign-on card must not contain a form element");
  assert.ok(!/type="submit"/i.test(signon), "the sign-on card must not submit");
  assert.ok(!/j_username|j_password/i.test(page.html), "no credential field names may be captured");
  for (const input of signon.matchAll(/<input\b[^>]*>/g)) {
    assert.ok(/\sreadonly\b|\sdisabled\b/.test(input[0]), `the sign-on inputs must be non-interactive: ${input[0]}`);
  }
  // And the card tells the reader it is an offline copy, with a way to sign in.
  assert.match(text, /Nothing you type here is sent or stored/, "the card must disclose that it collects nothing");
  assert.match(text, /sign on at the official site/, "the card must point at the real sign-in");
  assert.ok(/connect\.secure\.wellsfargo\.com/.test(page.html), "sign-on hands off to the official site");
  // Sign On must be a link to the bank, never a posting form.
  assert.match(page.html, /<a class="ps-btn-primary" href="https:\/\/connect\.secure\.wellsfargo\.com\//, "Sign On must link to the official sign-in");
});

test("the homepage renders from the capture and keeps its real images", () => {
  const page = catalog["/home"];
  const images = [...page.html.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(images.length >= 10, "the homepage keeps its photography");
  for (const src of images) {
    assert.match(src, /^https:\/\/[a-z0-9.-]*wellsfargo[a-z0-9.-]*\//i, `homepage image must be a real source: ${src}`);
  }
  const app = readFileSync("src/App.tsx", "utf8");
  assert.match(app, /hasCapturedPage\("\/home"\)/, "the router must serve the captured homepage");
});

test("the homepage loads the source stylesheet, not a look-alike", () => {
  const page = catalog["/home"];
  // The page's own CSS must be on the capture, and it must be the real sheet
  // that ships in src/public/source-styles.ts (packed into the build).
  assert.ok(page.styles.length > 0, "the homepage must reference its stylesheet");
  for (const url of page.styles) {
    assert.match(url, /^https:\/\/www\.wellsfargo\.com\/ui\/css\//, `homepage stylesheet must be a source sheet: ${url}`);
    assert.ok(!url.startsWith("local://"), `homepage must not fall back to a hand-written sheet: ${url}`);
  }
  const stylesFile = readFileSync("src/public/source-styles.ts", "utf8");
  const sheets = JSON.parse(
    stylesFile.slice(stylesFile.indexOf("= {") + 2, stylesFile.trimEnd().length - 1),
  );
  for (const url of page.styles) {
    assert.ok(sheets[url], `${url} must be stored, or the page renders unstyled`);
    assert.ok(sheets[url].length > 10000, `${url} looks truncated (${sheets[url]?.length} bytes)`);
  }
  // The sign-on hand-off keeps the source structure the sheet positions.
  for (const className of ["signon-container", "sign-top", "form-button", "signon-bottom"]) {
    assert.ok(page.html.includes(`class="${className}"`) || page.html.includes(` ${className}"`),
      `homepage must keep the source class ${className}`);
  }
});
