import { chromium } from "playwright-core";
const exe = "/home/user/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome";
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errors.push("PAGEERROR " + String(e).slice(0, 200)));
await page.goto("http://127.0.0.1:5173/home", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(3500);
await page.screenshot({ path: "shot-top.png", clip: { x: 0, y: 0, width: 1440, height: 900 } });
const info = await page.evaluate(() => {
  const btn = document.querySelector("#btnSignon");
  const card = document.querySelector(".signon-container");
  const cs = btn ? getComputedStyle(btn) : null;
  const ccs = card ? getComputedStyle(card) : null;
  const styles = [...document.querySelectorAll("style")].map((s) => s.textContent.length);
  return {
    shadowHosts: [...document.querySelectorAll("*")].filter((e) => e.shadowRoot).length,
    cardDisplay: ccs?.display, cardPos: ccs?.position, cardH: ccs?.height,
    btnBg: cs?.backgroundColor, btnColor: cs?.color, btnDisplay: cs?.display,
    btnRect: btn ? btn.getBoundingClientRect().toJSON() : null,
    styleTags: styles.length, styleBytes: styles.reduce((a, b) => a + b, 0),
    mastheadSignOn: (() => { const a = document.querySelector(".masthead-signon"); if (!a) return null; const c = getComputedStyle(a); return { text: a.textContent, color: c.color, bg: c.backgroundColor }; })(),
  };
});
console.log(JSON.stringify(info, null, 1));
console.log("console errors:", errors.slice(0, 5));
await browser.close();
