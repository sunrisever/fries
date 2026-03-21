const os = require("os");
const path = require("path");
const fs = require("fs");
const { runSelfCheck } = require("../electron/self-check.cjs");

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) {
    return undefined;
  }
  return process.argv[index + 1];
}

async function main() {
  const appDataBase = process.env.APPDATA
    ? process.env.APPDATA
    : path.join(os.homedir(), "AppData", "Roaming");
  const candidateRoots = ["Fries", "fries", "Token Chowhound", "ai-account-console"].map((dir) =>
    path.join(appDataBase, dir),
  );
  const candidateStates = candidateRoots
    .map((root) => {
      const stateFile = path.join(root, "subscriptions.json");
      if (!fs.existsSync(stateFile)) {
        return null;
      }
      return {
        root,
        stateFile,
        mtimeMs: fs.statSync(stateFile).mtimeMs,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  const appDataRoot = candidateStates[0]?.root || candidateRoots[0];

  const stateFile = getArg("--state") || path.join(appDataRoot, "subscriptions.json");
  const snapshotsDir = getArg("--snapshots") || path.join(appDataRoot, "data", "snapshots");
  const timelineLogFile = getArg("--timeline") || path.join(appDataRoot, "data", "timeline-events.json");

  const report = await runSelfCheck({
    stateFile,
    snapshotsDir,
    timelineLogFile,
  });

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[self-check] FAILED");
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
