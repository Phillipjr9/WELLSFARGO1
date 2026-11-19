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

## Persistence

`server/api.mjs` creates isolated demo ledgers. An opaque, random workspace identifier is held in an HTTP-only cookie, with a session-scoped identifier for embedded previews that block cookies. Data is saved atomically under `~/.local/share/banking-preview/ledgers-v2` unless `DEMO_DATA_DIR` is set. This is designed for a single Node process, not production financial transactions.

Amounts are integer cents. Server-side validation enforces eligible accounts, sufficient funds, dates, and supported recipients. A confirmation identifier prevents duplicate posting on retries. Future-dated entries appear immediately in the schedule but do not change balances until due. Due entries settle when the workspace is accessed; there is no background payment processor. Exiting the demo deletes the sample workspace and clears the session.

## Verification

```sh
node --test tests/*.test.mjs
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