const fs = require("fs/promises");
const path = require("path");

async function read(filePath) {
  return fs.readFile(filePath, "utf8");
}

function expectIncludes(haystack, needle, message) {
  if (!haystack.includes(needle)) {
    throw new Error(message);
  }
}

async function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const packageJson = JSON.parse(await read(path.join(repoRoot, "package.json")));
  const readme = await read(path.join(repoRoot, "README.md"));
  const readmeCn = await read(path.join(repoRoot, "README_CN.md"));
  const sampleReadme = await read(path.join(repoRoot, "examples", "sample-data", "README.md"));
  const changelog = await read(path.join(repoRoot, "CHANGELOG.md"));
  const appTsx = await read(path.join(repoRoot, "src", "App.tsx"));
  const agents = await read(path.join(repoRoot, "AGENTS.md"));
  const claude = await read(path.join(repoRoot, "CLAUDE.md"));

  const version = packageJson.version;
  const versionLiteral = `const APP_VERSION = "${version}"`;

  expectIncludes(appTsx, versionLiteral, `src/App.tsx 里的 APP_VERSION 没有同步到 ${version}。`);
  expectIncludes(readme, "subscriptions.json", "README.md 还没有切换到 subscriptions.json。");
  expectIncludes(readmeCn, "subscriptions.json", "README_CN.md 还没有切换到 subscriptions.json。");
  expectIncludes(readme, "subscriptions.example.json", "README.md 还没有切换到 subscriptions.example.json。");
  expectIncludes(readmeCn, "subscriptions.example.json", "README_CN.md 还没有切换到 subscriptions.example.json。");
  expectIncludes(readme, version, "README.md 当前版本号没有更新。");
  expectIncludes(readmeCn, version, "README_CN.md 当前版本号没有更新。");
  expectIncludes(readme, "npm run check", "README.md 缺少 npm run check。");
  expectIncludes(readmeCn, "npm run check", "README_CN.md 缺少 npm run check。");
  expectIncludes(readme, "npm run self-check", "README.md 缺少 npm run self-check。");
  expectIncludes(readmeCn, "npm run self-check", "README_CN.md 缺少 npm run self-check。");
  expectIncludes(sampleReadme, "subscriptions.example.json", "示例数据 README 仍在引用旧文件名。");
  expectIncludes(changelog, version, "CHANGELOG.md 没有当前版本记录。");
  expectIncludes(agents, "subscriptions.json", "AGENTS.md 还在引用旧状态文件名。");
  expectIncludes(claude, "subscriptions.json", "CLAUDE.md 还在引用旧状态文件名。");

  console.log(`[check:release] OK - release docs aligned with ${version}.`);
}

main().catch((error) => {
  console.error("[check:release] FAILED");
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
