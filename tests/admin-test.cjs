const { chromium } = require("playwright");
const assert = require("node:assert/strict");

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 950 } });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.setDefaultTimeout(20000);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Read the server-side workspace, retrying briefly to absorb re-render races.
  async function state() {
    let last;
    for (let i = 0; i < 6; i++) {
      try {
        return await p.evaluate(async () => {
          const key = sessionStorage.getItem("banking-preview-workspace");
          return (
            await (
              await fetch("/api/demo/workspace", {
                headers: key ? { "X-Demo-Workspace": key } : {},
              })
            ).json()
          ).state;
        });
      } catch (e) {
        last = e;
        await sleep(400);
      }
    }
    throw last;
  }
  const bal = (s, id) => s.accounts.find((a) => a.id === id).balance;

  await p.goto("http://127.0.0.1:5173/portal/admin");
  await p.getByRole("heading", { name: "Workspace admin" }).waitFor();
  await p.getByRole("heading", { name: "Sample accounts" }).waitFor();
  const origSavings = bal(await state(), "savings");
  console.log("admin page loaded");

  // Set the savings balance to $5,000.00
  const row = p.locator(".pb-admin-table tr", { hasText: "Way2Save Savings" }).first();
  await row.getByRole("button", { name: "Set" }).click();
  await row.locator("input").fill("5000.00");
  await row.getByRole("button", { name: /Save balance/ }).click();
  await p.getByText("Sample balance updated.").waitFor();
  assert.equal(bal(await state(), "savings"), 500000, "balance set to $5000");
  console.log("set balance ok");

  assert.ok(
    (await state()).transactions.some((t) => t.category === "Admin adjustment"),
    "admin adjustment logged",
  );
  console.log("adjustment logged");

  // Reset the workspace back to the original sample data
  await p.getByRole("button", { name: "Reset workspace" }).click();
  await p.getByRole("button", { name: "Yes, reset workspace" }).click();
  await p.getByText(/reset to the original sample data/).waitFor();
  await sleep(400);
  assert.equal(
    (await p.evaluate(() => location.href)),
    "http://127.0.0.1:5173/portal/admin",
    "still on the admin page",
  );
  assert.equal(bal(await state(), "savings"), origSavings, "balance restored by reset");
  console.log("reset restored balance", bal(await state(), "savings"));

  console.log("page errors:", JSON.stringify(errors));
  assert.equal(errors.length, 0);
  await b.close();
  console.log("ADMIN DASHBOARD PASSED");
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
