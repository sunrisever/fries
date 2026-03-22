import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { chromium } from "playwright";

const chromeUserDataDir =
  process.env.CHROME_USER_DATA_DIR ||
  path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "User Data");
const profileName = process.env.CHROME_PROFILE || "Default";
const chromeExecutable =
  process.env.CHROME_EXE ||
  path.join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe");

async function copyRecursive(source, destination) {
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      if (["Code Cache", "GPUCache", "Cache", "Service Worker", "Crashpad"].includes(entry.name)) {
        continue;
      }
      await copyRecursive(sourcePath, destinationPath);
      continue;
    }

    await fs.copyFile(sourcePath, destinationPath);
  }
}

async function prepareUserDataClone() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-account-console-"));
  await fs.copyFile(path.join(chromeUserDataDir, "Local State"), path.join(tempRoot, "Local State"));
  await copyRecursive(path.join(chromeUserDataDir, profileName), path.join(tempRoot, profileName));
  return tempRoot;
}

async function inspectPage(context, targetUrl) {
  const page = await context.newPage();
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(3000);

  const result = {
    url: page.url(),
    title: await page.title(),
    text: ((await page.locator("body").innerText().catch(() => "")) || "").slice(0, 1200),
  };

  await page.close();
  return result;
}

async function main() {
  const cloneDir = await prepareUserDataClone();
  console.log(`Using cloned profile: ${cloneDir}`);

  const context = await chromium.launchPersistentContext(cloneDir, {
    executablePath: chromeExecutable,
    channel: undefined,
    headless: false,
  });

  try {
    const chatgpt = await inspectPage(context, "https://chatgpt.com/");
    const teamPanel = await inspectPage(context, "https://team.vi.edu.kg/");
    console.log(JSON.stringify({ chatgpt, teamPanel }, null, 2));
  } finally {
    await context.close();
    await fs.rm(cloneDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
