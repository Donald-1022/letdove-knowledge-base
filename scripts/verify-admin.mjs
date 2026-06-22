import { chromium } from "playwright";

const baseUrl = process.env.LETDOVE_URL ?? "http://localhost:3000";

const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  headless: true
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const messages = [];

page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) {
    messages.push(`${message.type()}: ${message.text()}`);
  }
});

await page.goto(`${baseUrl}/admin/`, { waitUntil: "networkidle" });
await page.evaluate(() => {
  window.localStorage.removeItem("letdove-admin-auth");
});
await page.reload({ waitUntil: "networkidle" });

const result = {
  loginTitle: await page.locator(".admin-v2-login-card h1").innerText(),
  loginCardCount: await page.locator(".admin-v2-login-card").count()
};

await page.locator('input[name="username"]').fill("admin");
await page.locator('input[name="password"]').fill("wrong");
await page.getByRole("button", { name: "Login" }).click();
result.errorVisible = await page.locator(".admin-v2-login-card p").innerText();

await page.locator('input[name="password"]').fill("admin");
await page.getByRole("button", { name: "Login" }).click();
await page.waitForSelector(".admin-v2-grid");

result.topbarTitle = await page.locator(".admin-v2-topbar h1").innerText();
result.leftPanel = await page.locator(".admin-v2-left").count();
result.centerPanel = await page.locator(".admin-v2-center").count();
result.rightPanel = await page.locator(".admin-v2-right").count();
result.listItems = await page.locator(".admin-v2-list-item").count();
result.editorFields = await page.locator(".admin-v2-field").count();
result.previewCards = await page.locator(".admin-v2-preview-card").count();
result.uploadInputs = await page.locator('input[type="file"][accept="image/*"]').count();
result.exportButton = await page.getByRole("button", { name: "Export JSON" }).count();
result.publishButton = await page.getByRole("button", { name: "Publish" }).count();
result.consoleMessages = messages;

await browser.close();

console.log(JSON.stringify(result, null, 2));
