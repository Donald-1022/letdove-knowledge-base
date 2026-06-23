import { chromium } from "playwright";

const url = process.env.LETDOVE_URL ?? "http://localhost:3000/library";
const baseUrl = new URL(url);
const executablePath =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const browser = await chromium.launch({
  executablePath,
  headless: true
});

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleMessages = [];

page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) {
    consoleMessages.push(`${message.type()}: ${message.text()}`);
  }
});

page.on("pageerror", (error) => {
  consoleMessages.push(`pageerror: ${error.message}`);
});

await page.goto(url, { waitUntil: "networkidle" });

const result = {
  title: await page.locator("h1").innerText(),
  cardCount: await page.locator(".lexicon-card").count(),
  hasContent: (await page.locator("body").innerText()).trim().length > 0,
  overlayCount: await page
    .locator("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay")
    .count()
};

await page.locator(".lexicon-card").first().click();
await page.waitForSelector(".post-modal");
result.modalTitle = await page.locator(".post-title").first().innerText();
result.modalCode = await page.locator(".post-code").first().innerText();
result.modalImages = await page.locator(".post-media img").count();
await page.keyboard.press("Escape");

await page.getByLabel("Switch to dark mode").click();
result.themeAfterToggle = await page.evaluate(() => document.documentElement.dataset.theme);

await page.getByLabel("Search title, code, and description").fill("P01_Q01");
result.filteredCount = await page.locator(".lexicon-card").count();

await page.goto(new URL("/letdove/P01_Q01/", baseUrl).toString(), { waitUntil: "networkidle" });
result.detailTitle = await page.locator("h1").innerText();
result.detailImages = await page.locator(".detail-hero-media > img").count();
result.detailHeroHeight = await page.locator(".detail-hero-media").evaluate((node) => Math.round(node.getBoundingClientRect().height));
result.detailNextImageButton = await page.getByRole("button", { name: "Next detail image" }).count();
await page.getByRole("button", { name: "Copy code" }).click();
await page.waitForTimeout(150);
result.detailCodeCopied = await page.getByRole("button", { name: "Code copied" }).count();

await page.evaluate(() => window.localStorage.removeItem("letdove-admin-token"));
await page.goto(new URL("/admin/", baseUrl).toString(), { waitUntil: "networkidle" });
await page.waitForSelector(".admin-xhs-login-card");
result.adminLoginTitle = await page.locator(".admin-xhs-login-card h1").innerText();
result.consoleMessages = consoleMessages;

await browser.close();

console.log(JSON.stringify(result, null, 2));
