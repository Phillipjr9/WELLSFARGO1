# Online Banking Demo

An independent, sample-data banking workspace built with React and a Node.js API. It does not connect to Wells Fargo, Zelle, a payment network, or any real account. No banking credentials are required.

## Run

```sh
npm install
npm run dev
```

Open `/` or `/portal` for the account overview. The separate public-homepage preview is at `/home`.

```sh
npm run build
npm start
```

The production server defaults to port 3000. `PORT`, `HOST`, and `DEMO_DATA_DIR` are configurable. `npm run preview` also includes the demo API. A static-only deployment can use the same ledger in local storage; static hosts must rewrite client routes to `index.html`. Fonts and illustrations are bundled with the frontend.

## Workspace

| Route | Feature |
| --- | --- |
| `/portal` | Summary, account actions, spending, recent activity, upcoming payments |
| `/portal/accounts/:id` | Account-specific balances and searchable activity |
| `/portal/activity` | Search, account and direction filters, CSV export |
| `/portal/transfers` | Internal transfers with one-time, weekly, or monthly frequency |
| `/portal/transfers/external` | Link a fictional bank and transfer in either direction |
| `/portal/send-money` | Person-to-person payments to sample contacts |
| `/portal/wires` | Simulated domestic wires to preset recipients |
| `/portal/bill-pay` | Pay or schedule sample bills |
| `/portal/account-payment` | Pay down a sample card or loan |
| `/portal/payments` | Transfer history and schedule management |
| `/portal/payments/:id` | Persistent demo receipt, edit or cancel a scheduled payment |
| `/portal/statements` | Monthly sample activity reports, clearly labeled text downloads |
| `/portal/settings` | Persistent privacy and notification preferences |
| `/portal/inbox` | Workspace notifications and payment alerts |
| `/portal/spending` | Category totals derived from transactions |

## Public pages and links

Every public page in the preview is the captured markup of the real page, including its own photography, stylesheets and disclosures. `src/public-catalog.json` holds the pages; `src/public/link-index.json` holds the destination for every public page the capture references but does not contain.

A link always resolves to something real:

| Destination | Behaviour |
| --- | --- |
| Page in the capture | Opens from the saved copy, with its in-page anchors |
| Page not in the capture, but an equivalent page is | Opens the equivalent captured page |
| Page in a section the capture documents | Opens that section; the page lists every such destination under "More in this section" with its real `wellsfargo.com` URL |
| Page with no captured section at all | Opens its real public URL |
| PDFs, other documents, and third-party sites | Names the document and its host, then opens the original in a new tab |
| Secure sign-on, appointments, branch locator | Explains that the service lives on the official site and links to it |

Controls the source markup left to Wells Fargo's own JavaScript also work: footnote references (numbered, symbolic and `data-footnote-id` disclosures), FAQ accordions, legacy `#Expand` accordions, balloon-help definitions, the share pop-up, print, feedback, the contact bar and the rate/image carousels.

### The homepage

`/` and `/home` render the capture of `https://www.wellsfargo.com/` from `sources/home.json`. `sources/raw/home.html` is the page as published and `node scripts/capture-home.mjs` rebuilds the record from it. The source's sign-on form is replaced by the preview's hand-off panel, so the page never asks for a password; everything else — sections, photography, links — is the page itself. Its styles live in `src/public/home-styles.css`.

### Re-captured pages

Eleven product pages were originally captured from `creditcards.wellsfargo.com`, which answers "Offer unavailable" for paths that `www.wellsfargo.com` publishes (card features, account documents, card terms). Those pages are now captured from the correct host:

- `server/public-pages.mjs` sends `/credit-cards/features`, `/documents`, `/agreements`, `/terms` and `*/terms` to `www.wellsfargo.com`, and keeps the marketing pages on the campaign host.
- `sources/*.json` holds the re-captured page text with its real source URL. `node scripts/capture-sources.mjs` lists which routes still need it; `node scripts/capture-sources.mjs <route> <page.md>` records one; `node scripts/apply-sources.mjs` merges them into the catalog. Both run as part of `catalog:links` and `catalog:build`.

Each page keeps the wording of the original, and the long legal agreements link to the complete document on wellsfargo.com rather than storing a partial copy under the page's name.

`npm run catalog:links` rebuilds the index, the section lists and the offline search index after a new capture. `npm run test:links` fails if any link in the capture, any `href="#"` control, any image, any internal app link, any page without a main landmark and an `<h1>`, or any page that shows an error banner instead of its content has no working destination.

## Search

With the demo server running, `/search` uses the live public search. Without it (a static build, or a server with no outbound network), `/search` searches the saved pages through `src/public/search-index.json`, with category filters and no empty results page.

## Persistence

`server/api.mjs` creates isolated demo ledgers. An opaque, random workspace identifier is held in an HTTP-only cookie, with a session-scoped identifier for embedded previews that block cookies. Data is saved atomically under `~/.local/share/banking-preview/ledgers-v2` unless `DEMO_DATA_DIR` is set. This is designed for a single Node process, not production financial transactions.

Amounts are integer cents. Server-side validation enforces eligible accounts, sufficient funds, dates, and supported recipients. A confirmation identifier prevents duplicate posting on retries. Future-dated entries appear immediately in the schedule but do not change balances until due. Due entries settle when the workspace is accessed; there is no background payment processor. Exiting the demo deletes the sample workspace and clears the session.

## Verification

```sh
npm test                 # ledger/API tests plus the link and media audit
npx tsc --noEmit
npm run build
```

For the browser suite, run `npx playwright install --with-deps chromium` once, start the dev server, then run `npm run test:browser` in a second terminal. Set `TEST_ORIGIN` to test another running server. Tests create isolated sample workspaces and do not contact any financial institution.

## Public references

- [Transfers](https://www.wellsfargo.com/online-banking/transfers/): account selection, frequency, date, review, submit, and scheduled activity.
- [Account activity](https://www.wellsfargo.com/online-banking/deposit-details/): balances, search, account actions, and transaction downloads.
- [Bill Pay](https://www.wellsfargo.com/online-banking/bill-pay/): payees, amounts, scheduling, and payment history.
- [Privacy and legal information](https://www.wellsfargo.com/privacy-security/): official footer destinations.

The interface is a demo design informed by public materials, not a copy of a private authenticated session. All transfers, notices, and reports are fictional.