const os = require("os");
const path = require("path");
const { runSelfCheck } = require("../electron/self-check.cjs");

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) {
    return undefined;
  }
  return process.argv[index + 1];
}

async function main() {
  const appDataRoot = process.env.APPDATA
    ? path.join(process.env.APPDATA, "Token Chowhound")
    : path.join(os.homedir(), "AppData", "Roaming", "Token Chowhound");

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
