import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({
    headless: false,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  const page = await browser.newPage();
  const records = [];

  page.on("request", (request) => {
    if (request.url().includes("team.vi.edu.kg") || request.url().includes("api-team.vi.edu.kg")) {
      records.push({
        kind: "request",
        method: request.method(),
        url: request.url(),
        postData: request.postData() || "",
      });
    }
  });

  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("team.vi.edu.kg") || url.includes("api-team.vi.edu.kg")) {
      let body = "";
      try {
        body = await response.text();
      } catch {
        body = "";
      }

      records.push({
        kind: "response",
        status: response.status(),
        url,
        body: body.slice(0, 2000),
      });
    }
  });

  await page.goto("https://team.vi.edu.kg/", { waitUntil: "networkidle", timeout: 45000 });
  await page.getByRole("button", { name: "状态查询" }).click();
  await page.getByPlaceholder("请输入兑换码").fill("T-4FFFEC-B7ADA1-4562CA-PPLCGP");
  await page.getByPlaceholder("请输入绑定邮箱").fill("sunriseforever747@outlook.com");
  await page.getByRole("button", { name: "查询状态" }).click();
  await page.waitForTimeout(5000);

  console.log(JSON.stringify(records, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
