/**
 * Desktop + mobile screenshots for visual QA (playtest-visuals skill).
 * Requires: npm run dev (or PLAYTEST_URL), optional playwright.
 *
 *   node scripts/playtest/capture.mjs
 *   PLAYTEST_URL=http://localhost:5173 node scripts/playtest/capture.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const outDir = path.join(root, "playtest-out");
const baseUrl = process.env.PLAYTEST_URL || "http://127.0.0.1:5173";

async function waitForUrl(url, ms = 60_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.ok || r.status === 304) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

async function main() {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    console.error(
      "PLAYTEST_SKIP: install playwright (`npx playwright install chromium`) for screenshots.",
    );
    console.log("PLAYTEST_SHOT_SKIP");
    process.exit(0);
  }

  await mkdir(outDir, { recursive: true });
  console.log("Waiting for", baseUrl);
  try {
    await waitForUrl(baseUrl);
  } catch (e) {
    console.error(String(e));
    console.error("Start the game with: npm run dev");
    process.exit(1);
  }

  const browser = await playwright.chromium.launch({ headless: true });
  const shots = [
    { name: "desktop-hub.png", w: 1440, h: 900, mobile: false },
    { name: "mobile-hub.png", w: 390, h: 844, mobile: true },
  ];

  for (const s of shots) {
    const context = await browser.newContext({
      viewport: { width: s.w, height: s.h },
      isMobile: s.mobile,
      hasTouch: s.mobile,
      userAgent: s.mobile
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"
        : undefined,
    });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    // Login if form present
    const nameInput = page.locator("#playerName, input[name='name'], #name");
    if (await nameInput.count()) {
      await nameInput.first().fill("ShotBot" + Math.floor(Math.random() * 99));
      const realm = page.locator("#realmInput, input[name='realm']");
      if (await realm.count()) await realm.first().fill("public");
      const btn = page.locator("#loginBtn, button:has-text('Hit the streets'), button:has-text('Play')");
      if (await btn.count()) await btn.first().click();
    }
    // Wait for canvas / game
    await page.waitForTimeout(2500);
    const file = path.join(outDir, s.name);
    await page.screenshot({ path: file, fullPage: false });
    console.log("Wrote", file);
    await context.close();
  }

  await browser.close();
  // Manifest for agents
  await writeFile(
    path.join(outDir, "manifest.json"),
    JSON.stringify({ at: new Date().toISOString(), baseUrl, shots: shots.map((s) => s.name) }, null, 2),
  );
  console.log("PLAYTEST_SHOT_OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
