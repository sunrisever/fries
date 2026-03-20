const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { runSelfCheck } = require("../electron/self-check.cjs");

async function withTempWorkspace(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fries-test-"));
  try {
    return await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("example data passes self-check without errors", async () => {
  const repoRoot = path.resolve(__dirname, "..");
  const report = await runSelfCheck({
    stateFile: path.join(repoRoot, "examples", "sample-data", "subscriptions.example.json"),
    snapshotsDir: path.join(repoRoot, "examples", "sample-data", "snapshots"),
    timelineLogFile: null,
  });

  assert.equal(report.ok, true);
  assert.equal(report.summary.errors, 0);
});

test("self-check catches duplicated signatures, orphan snapshots, and duplicate timeline events", async () =>
  withTempWorkspace(async (root) => {
    const stateFile = path.join(root, "subscriptions.json");
    const snapshotsDir = path.join(root, "snapshots");
    const timelineFile = path.join(root, "timeline-events.json");

    await fs.mkdir(snapshotsDir, { recursive: true });

    const duplicatedExpiry = "2026/04/16 16:51:07";
    const state = {
      version: 3,
      profile: {},
      settings: {
        syncIntervalMinutes: 1,
        snapshotRetentionDays: 14,
        autoSyncOnLaunch: true,
        themeMode: "system",
        themePreset: "nordic-blue",
        locale: "zh-CN",
        visualEffectMode: "solid",
        performanceMode: false,
        timelineScope: "week",
        analyticsRange: "day",
        analyticsChartMode: "line",
        heatmapScope: "month",
      },
      accounts: [
        {
          id: "a1",
          provider: "OpenAI",
          accountLabel: "Team A",
          email: "same@example.com",
          plan: "ChatGPT Business",
          cluster: "openai",
          status: "active",
          priority: 1,
          isActive: true,
          statusDetail: "",
          usageLabel: "",
          usagePercent: 0,
          trackingMode: "window",
          sourceLabel: "test",
          notes: [],
          liveUsage: {
            provider: "OpenAI",
            accountEmail: "same@example.com",
            plan: "ChatGPT Business",
            subscriptionActiveUntil: duplicatedExpiry,
            fiveHour: {},
            sevenDay: {},
            sourceLabel: "test",
            syncedAt: "2026/03/20 10:00:00",
          },
        },
        {
          id: "a2",
          provider: "OpenAI",
          accountLabel: "Team B",
          email: "same@example.com",
          plan: "ChatGPT Business",
          cluster: "openai",
          status: "ready",
          priority: 2,
          isActive: false,
          statusDetail: "",
          usageLabel: "",
          usagePercent: 0,
          trackingMode: "window",
          sourceLabel: "test",
          notes: [],
          liveUsage: {
            provider: "OpenAI",
            accountEmail: "same@example.com",
            plan: "ChatGPT Business",
            subscriptionActiveUntil: duplicatedExpiry,
            fiveHour: {},
            sevenDay: {},
            sourceLabel: "test",
            syncedAt: "2026/03/20 10:00:00",
          },
        },
      ],
      activityLog: [],
      timelineLog: [
        { id: "t1", kind: "depleted7d", accountId: "a1", at: "2026/03/20 10:00:00" },
        { id: "t2", kind: "depleted7d", accountId: "a1", at: "2026/03/20 10:00:00" },
        { id: "t3", kind: "switch", sourceAccountId: "a1", targetAccountId: "missing", at: "2026/03/20 10:10:00" },
      ],
    };

    await fs.writeFile(stateFile, JSON.stringify(state, null, 2), "utf8");
    await fs.writeFile(timelineFile, JSON.stringify(state.timelineLog, null, 2), "utf8");
    await fs.writeFile(
      path.join(snapshotsDir, "orphan.json"),
      JSON.stringify(
        {
          id: "s1",
          accountId: "missing",
          accountLabel: "ghost",
          email: "ghost@example.com",
          plan: "ChatGPT Business",
          provider: "OpenAI",
          recordedAt: "2026/03/20 10:20:00",
          syncedAt: "2026/03/20 10:20:00",
          subscriptionActiveUntil: "2026/05/01 00:00:00",
          fiveHour: {},
          sevenDay: {},
        },
        null,
        2,
      ),
      "utf8",
    );

    const report = await runSelfCheck({
      stateFile,
      snapshotsDir,
      timelineLogFile: timelineFile,
    });

    assert.equal(report.ok, false);
    assert.ok(report.issues.some((issue) => issue.code === "OPENAI_SIGNATURE_DUPLICATED"));
    assert.ok(report.issues.some((issue) => issue.code === "TIMELINE_DUPLICATED"));
    assert.ok(report.issues.some((issue) => issue.code === "TIMELINE_ORPHAN_ACCOUNT"));
    assert.ok(report.issues.some((issue) => issue.code === "SNAPSHOT_ORPHAN_ACCOUNT"));
  }));
