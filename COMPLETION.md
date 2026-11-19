# Completion report

What the preview contains, what was incomplete, and what is finished. Regenerate the numbers with the commands in [Verifying this report](#verifying-this-report); `npm test` fails if any of the guarantees below regress.

_Last audited: 2026-11-19._

## Coverage

| Measure | Count |
| --- | --- |
| Public pages captured from wellsfargo.com and its product sites | 571 |
| Destinations referenced by those pages but not captured | 666 |
| — handed to an equivalent captured page | 13 |
| — listed in their section's "More in this section" block | 575 |
| — handed to the official page (resource centres, forms, es/ pages) | 78 |
| Real images (all from Wells Fargo media hosts, none generated) | 3,855 |
| Document links (PDF, spreadsheets, CSV) | 1,008 |
| Internal links with no destination | 0 |

Every link resolves to one of: a captured page, an equivalent captured page, the page's section list (with the destination's real `wellsfargo.com` URL), the official page in a new tab, or a named document on the official site.

## Finished in this round

### The homepage

The homepage was the one public page never captured: `/` and `/home` rendered a
hand-written React composition, so the preview showed an interpretation rather
than the source page. It is now captured from the source markup, in the same
shape as every other route:

- `sources/raw/home.html` is the page as published; `sources/home.json` is its
  `<main>` region, title, source URL and stylesheet reference.
  `node scripts/capture-home.mjs` rebuilds it.
- `/` and `/home` both render the capture (the server maps the two, the router
  prefers the capture and falls back to the React page only if it is missing).
- The source's sign-on form posts credentials to the bank, so it is replaced by
  the preview's hand-off panel; the page never asks for a password and no
  credential field survives the capture. A test enforces this.
- The page keeps its own sections (the checking marquee, product directory,
  promo tiles, rate panel, Fargo panel, community cards, contact bar), its real
  photography, its real links, and its own stylesheet: the capture loads
  `https://www.wellsfargo.com/ui/css/homepage-ui/ps-homepage…css` from
  `src/public/source-styles.ts`, which `build-catalog` fetched from the live page.
  The sign-on hand-off keeps the source's `signon-container` / `sign-top` /
  `form-button` structure so the page's stylesheet positions the card over the
  hero exactly as on wellsfargo.com.

### Pages that showed the wrong thing

Eleven product pages were captured from `creditcards.wellsfargo.com`. That host answers **"Offer unavailable" / "Oferta no disponible"** for paths that `www.wellsfargo.com` publishes, so the capture held an error banner instead of the page — and the banner still carried links, so a link check alone could not see the problem.

- `server/public-pages.mjs` now routes `/credit-cards/features`, `/documents`, `/agreements`, `/terms` and `*/terms` to `www.wellsfargo.com`, and keeps the marketing pages on the campaign host.
- All eleven pages were re-captured from the original pages and merged into the catalog: card features, balance transfer, overdraft protection, the account-documents hub, and the Active Cash, Autograph Visa, Autograph Journey Visa, Choice Privileges, Choice Privileges Select, Reflect Visa and One Key terms pages.
- Each keeps the page's own wording: disclosures tables, APR/fee rows, tables of contents, footnotes. The long legal agreements link to the complete document on wellsfargo.com instead of storing a partial copy under the page's name.
- The pages' titles were replaced too — they had been recorded as "Wells Fargo - Technical difficulties".

`sources/` holds each re-captured page beside its real source URL, so the provenance of every replacement is on record and re-runnable:

```sh
node scripts/capture-sources.mjs                 # which routes still need it
node scripts/capture-sources.mjs <route> <page.md>
node scripts/apply-sources.mjs                   # merge into the catalog
```

### Structure every page needs

| Defect | Pages | Fixed by |
| --- | --- | --- |
| No main landmark (`/locator/wellsfargoadvisors`, `/redeem`) | 2 | Container marked `data-wf-main`; renderer promotes it and gives it `role="main"` |
| Landmark with no id, so "Skip to main content" had nothing to reach | 406 | `id="main-content"` added to the existing `<main>` |
| `<main>` that already had a different id | 131 | Source id kept; the app skip link targets the landmark directly |
| Content starting at `<h2>` with no `<h1>` | 8 | `<h1>` built from the page's own `<title>`, inside the landmark, styled `.wf-page-title` |
| Headings that render empty (`<h2></h2>`, `<h2><br></h2>`, `<h2><span></span></h2>`) | 30 | Removed; they announced "heading" with no text |

`scripts/repair-landmarks.mjs` does all of it, uses nothing but what the capture already holds, and runs in `catalog:links` / `catalog:build`.

### Hand-offs that name what they open

- A document link (PDF, spreadsheet, CSV) now says **"This PDF opens on www.wellsfargo.com"** and names the file, instead of a generic "you are leaving" notice.
- A link to a page the capture does not hold opens its section list, scrolls to that destination's own entry, and highlights it — the reader sees exactly where the link pointed instead of landing at the top of a long page.
- Pages that only exist on the official site keep their "This page lives on wellsfargo.com" panel.

### Tests

`npm test`: **25** ledger/API tests and **13** link-and-content tests, all passing. New this round:

- every captured page has one main landmark and one first-level heading, and the heading sits inside the landmark;
- no captured page holds an error banner or has no text at all (the "Offer unavailable" class of bug);
- every re-captured page in `sources/` is still a captured route, keeps an `https://www.wellsfargo.com/` source, has a real title, and is the content the catalog serves;
- the homepage is the captured source page: its own sections and photography, its stylesheet, and no credential form anywhere in it.

## Known limits

These are properties of the source pages or of the environment, not unfinished work.

| Item | Why it stands |
| --- | --- |
| `/mybt` | The original page is Wells Fargo's cookie-required notice ("We're Sorry — To complete an online application, you must have cookies enabled"). The capture is that page, and it now says so via its own `<h1>`. |
| `/savings-cds/platinum/platinum-monthly-service-fee`, `/checking/product-selector`, `/help/rates`, `/about/teamworks`, `/mortgage/apply/loan-estimate`, `/redeem`, `/help/feedback` | The source pages are genuinely short, and the capture matches the live page. Checked on 2026-11-19 against wellsfargo.com: `/help/rates` holds the same heading, sentence and all five rate links; `/about/teamworks` the same paragraph, Careers link and Continue button; `/checking/product-selector` the same question and answers; the Platinum fee page is a one-sentence disclosure that the Platinum page links to with its title as the label. Nothing is truncated. |
| `/credit-cards/terms/onekey` | The official One Key terms page itself currently answers "We're sorry, but we cannot process your request at this time." The preview shows the document's title, the phone number the official page gives, and a link to the document. |
| 56 pages with a heading-level jump (e.g. `h1 → h3`) | Present in the source markup itself (accordion panels, card tiles). Fixed only where a page had no `h1` at all; renumbering the source's own hierarchy would misrepresent it. |
| Content behind the source's own JavaScript (rate tables, the branch locator, card comparison panels) | The capture holds the rendered markup from capture time. Where the source loads more on interaction, the preview says so and links the official page; there is no live data feed. |
| Secure areas (sign-on, appointments, applications) | Never captured by design: the preview hands these to the official site. |
| Browser-driven test suite | Cannot run in this sandbox (no browser system libraries). Every check above is a `node --experimental-strip-types` test over the catalog instead. |

## Verifying this report

```sh
npm run catalog:links      # rebuild index, section lists, search index, packed catalog
npm test                   # ledger/API + link, media, landmark and banner audits
npx tsc --noEmit
npm run build
```

| Check | Command |
| --- | --- |
| Captured routes | `node -e 'console.log(Object.keys(require("./src/public-catalog.json")).length)'` |
| Destinations with no target | `node scripts/build-link-index.mjs` (prints the alias/section/official split) |
| Images | `npm run test:links` — tests 5–7 |
| Landmarks and headings | `npm run test:links` — test 9 |
| Error banners | `npm run test:links` — test 10 |
| Re-captured pages | `npm run test:links` — test 11 |
| Pages needing a re-capture | `node scripts/capture-sources.mjs` |
