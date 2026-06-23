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
  window.localStorage.removeItem("letdove-admin-token");
});
await page.reload({ waitUntil: "networkidle" });

const result = {
  loginTitle: await page.locator(".admin-xhs-login-card h1").innerText(),
  loginCardCount: await page.locator(".admin-xhs-login-card").count()
};

await page.locator('input[name="username"]').fill("admin");
await page.locator('input[name="password"]').fill("wrong");
await page.getByRole("button", { name: "Login" }).click();
result.errorVisible = await page.locator(".admin-xhs-login-card p").innerText();

await page.locator('input[name="password"]').fill("adminissimon");
await page.getByRole("button", { name: "Login" }).click();
await page.waitForSelector(".admin-xhs-shell");

result.brandTitle = await page.locator(".admin-xhs-brand span").innerText();
result.sidebar = await page.locator(".admin-xhs-sidebar").count();
result.composePanel = await page.locator(".admin-xhs-compose").count();
result.editorPanel = await page.locator(".admin-xhs-editor").count();
result.mediaCards = await page.locator(".admin-xhs-media-card").count();
result.editorFields = await page.locator(".admin-v3-field").count();
result.uploadInputs = await page.locator('input[type="file"][accept="image/*"]').count();
result.exportButton = await page.getByRole("button", { name: "导出 JSON" }).count();
result.publishButton = await page.getByRole("button", { name: "发布" }).count();
result.consoleMessages = messages;

await browser.close();

console.log(JSON.stringify(result, null, 2));
