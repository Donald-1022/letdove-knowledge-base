import { chromium } from "playwright";

const url = process.env.LETDOVE_URL ?? "http://localhost:3000/letdove";
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
  overlayCount: await page
    .locator("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay")
    .count(),
  hasContent: (await page.locator("body").innerText()).trim().length > 0,
  adminLinksOnMain: await page.getByRole("link", { name: "Admin" }).count()
};

await page.locator(".lexicon-card").first().click();
await page.waitForSelector(".post-modal");
result.firstModalCode = await page.locator(".post-code").first().innerText();
result.modalImageDots = await page.locator(".media-dots span").count();
result.previousImageButtonAtStart = await page.getByRole("button", { name: "Previous image" }).count();
result.nextImageButtonAtStart = await page.getByRole("button", { name: "Next image" }).count();
result.contentPagerButtons = await page.getByRole("button", { name: /Previous card|Next card/ }).count();
await page.getByRole("button", { name: "Next image" }).click();
result.previousImageButtonAfterNext = await page.getByRole("button", { name: "Previous image" }).count();
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(250);
result.afterArrowCode = await page.locator(".post-code").first().innerText();
await page.keyboard.press("Escape");

await page.getByLabel("Switch to dark mode").click();
result.themeAfterToggle = await page.evaluate(() => document.documentElement.dataset.theme);
await page.getByLabel("Filter by L1 category").selectOption("design");
result.l1FilteredCount = await page.locator(".lexicon-card").count();
await page.getByLabel("Filter by L2 category").selectOption("composition");
result.l2FilteredCount = await page.locator(".lexicon-card").count();
await page.getByLabel("Filter by series").selectOption("S01 Shot Grammar");
result.seriesFilteredCount = await page.locator(".lexicon-card").count();
await page.getByRole("button", { name: "Reset filters" }).click();

await page.getByLabel("Search title, tags, code, and description").fill("P01_Q01");
result.filteredCount = await page.locator(".lexicon-card").count();

await page.locator(".lexicon-card").first().click();
await page.waitForSelector(".post-modal");
result.modalTitle = await page.locator(".post-title").first().innerText();
result.modalCode = await page.locator(".post-code").first().innerText();
result.modalVisible = await page.locator(".post-modal").isVisible();
await page.getByRole("button", { name: "Copy link" }).click();
await page.waitForTimeout(150);
result.copyButtonVisible = await page.getByRole("button", { name: "Copied" }).count();

await page.goto(new URL("/letdove/P01_Q01/", baseUrl).toString(), { waitUntil: "networkidle" });
result.detailTitle = await page.locator("h1").innerText();
result.detailBlocks = await page.locator(".detail-block").count();
result.detailImages = await page.locator(".detail-hero-media > img").count();
result.detailHeroHeight = await page.locator(".detail-hero-media").evaluate((node) => Math.round(node.getBoundingClientRect().height));
result.detailOpenPageButtons = await page.getByRole("link", { name: "Open page" }).count();
result.detailNextImageButton = await page.getByRole("button", { name: "Next detail image" }).count();
await page.getByRole("button", { name: "Copy code" }).click();
await page.waitForTimeout(150);
result.detailCodeCopied = await page.getByRole("button", { name: "Code copied" }).count();
await page.evaluate(() => window.localStorage.removeItem("letdove-admin-auth"));
await page.goto(new URL("/admin/", baseUrl).toString(), { waitUntil: "networkidle" });
await page.waitForSelector(".admin-list-item");
result.adminTitle = await page.locator("h1").innerText();
result.adminListCount = await page.locator(".admin-list-item").count();
result.adminTemplateButton = await page.getByRole("button", { name: "Template" }).count();
result.adminDashboardCards = await page.locator(".admin-dashboard-strip div").count();
result.adminBoardCards = await page.locator(".admin-card-board .admin-list-item").count();
result.consoleMessages = consoleMessages;

await browser.close();

console.log(JSON.stringify(result, null, 2));
