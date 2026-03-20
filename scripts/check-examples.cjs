const fs = require("fs/promises");
const path = require("path");
const { runSelfCheck } = require("../electron/self-check.cjs");

async function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const sampleRoot = path.join(repoRoot, "examples", "sample-data");
  const stateFile = path.join(sampleRoot, "subscriptions.example.json");
  const snapshotFile = path.join(sampleRoot, "snapshots", "openai-snapshot.example.json");

  const [stateRaw, snapshotRaw] = await Promise.all([
    fs.readFile(stateFile, "utf8"),
    fs.readFile(snapshotFile, "utf8"),
  ]);

  const state = JSON.parse(stateRaw);
  const snapshot = JSON.parse(snapshotRaw);

  if (typeof state.settings?.performanceMode !== "boolean") {
    throw new Error("示例状态缺少 settings.performanceMode。");
  }

  const matchingAccount = Array.isArray(state.accounts)
    ? state.accounts.find((account) => account.id === snapshot.accountId)
    : null;

  if (!matchingAccount) {
    throw new Error(`示例快照 ${snapshot.id} 找不到对应账号 ${snapshot.accountId}。`);
  }

  const report = await runSelfCheck({
    stateFile,
    snapshotsDir: path.join(sampleRoot, "snapshots"),
    timelineLogFile: null,
  });

  const errors = report.issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    throw new Error(`示例数据自检失败：${errors.map((issue) => issue.title).join("；")}`);
  }

  console.log(`[check:examples] OK - ${report.summary.accounts} accounts, ${report.summary.snapshots} snapshots.`);
}

main().catch((error) => {
  console.error("[check:examples] FAILED");
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
