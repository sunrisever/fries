const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const nextArgs = [];
  let explicitOutput = process.env.FRIES_OUTPUT_DIR || "";

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output") {
      explicitOutput = argv[index + 1] || "";
      index += 1;
      continue;
    }
    nextArgs.push(token);
  }

  return { builderArgs: nextArgs, explicitOutput };
}

function resolveOutputDir(explicitOutput) {
  if (explicitOutput) {
    return path.resolve(repoRoot, explicitOutput);
  }

  const isCi = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
  if (isCi) {
    return path.join(repoRoot, "release");
  }

  return path.join(os.homedir(), "Desktop", "Fries Releases");
}

function main() {
  const { builderArgs, explicitOutput } = parseArgs(process.argv.slice(2));
  const outputDir = resolveOutputDir(explicitOutput);
  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`[run-electron-builder] outputDir=${outputDir}`);

  const cliPath = require.resolve("electron-builder/out/cli/cli.js", {
    paths: [repoRoot],
  });
  const args = [
    cliPath,
    "--publish",
    "never",
    ...builderArgs,
    `--config.directories.output=${outputDir}`,
  ];

  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 0);
}

main();
