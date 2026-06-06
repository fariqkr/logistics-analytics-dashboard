// One-off screenshot capture for the README. Not part of the app.
// Uses system Chrome via puppeteer-core (installed with --no-save).
//
// Key lesson: do NOT use { fullPage: true } with Recharts. fullPage resizes the
// viewport at capture time, which makes ResponsiveContainer re-measure and blank
// the chart. Instead use a tall FIXED viewport and a normal screenshot.
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3000";
const OUT = "docs/screenshots";
const W = 1320;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickByText(page, text) {
  const ok = await page.evaluate((t) => {
    const btn = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent || "").trim() === t || (b.textContent || "").includes(t),
    );
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }, text);
  if (!ok) throw new Error(`button not found: ${text}`);
}

async function shoot(browser, { path, url, height, prepare, waitFor }) {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height, deviceScaleFactor: 2 });
  await page.bringToFront();
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle0" });
  await sleep(500);
  if (prepare) await prepare(page);
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 30000 });
  await sleep(3000); // let charts finish animating in the fixed viewport
  await page.screenshot({ path: `${OUT}/${path}` });
  console.log("saved", path);
  await page.close();
}

const run = async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: [
      "--no-sandbox",
      "--hide-scrollbars",
      "--force-color-profile=srgb",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
    ],
  });

  // 1) Dashboard — tall viewport to fit KPI cards + 5 charts.
  await shoot(browser, {
    path: "dashboard.png",
    url: "/",
    height: 1900,
    waitFor: ".recharts-surface",
  });

  // 2) NL answer with a breakdown CHART + explainability summary.
  await shoot(browser, {
    path: "nl-answer.png",
    url: "/chat",
    height: 1040,
    prepare: async (page) => {
      await page.type("input", "What is the delay rate for each carrier?");
      await clickByText(page, "Ask");
    },
    waitFor: ".recharts-bar-rectangle path",
  });

  // 3) NL answer with the structured plan + underlying rows expanded.
  await shoot(browser, {
    path: "explainability.png",
    url: "/chat",
    height: 1500,
    prepare: async (page) => {
      await page.type("input", "Average delivery time by region");
      await clickByText(page, "Ask");
      await page.waitForSelector(".recharts-bar-rectangle path", { timeout: 30000 });
      await sleep(2500);
      await clickByText(page, "Show structured plan");
      await clickByText(page, "Show underlying rows");
    },
  });

  // 4) Forecast answer (history + forecast lines).
  await shoot(browser, {
    path: "forecast.png",
    url: "/chat",
    height: 1080,
    prepare: async (page) => {
      await clickByText(page, "Forecast demand for PAINT for the next 3 months");
    },
    waitFor: ".recharts-line-curve, .recharts-line path",
  });

  await browser.close();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
