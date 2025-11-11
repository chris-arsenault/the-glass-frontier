"use strict";

import { buildEnvReport,
  collectRequiredEnv,
  computeJobState,
  createJobs,
  executeJobs,
  parseArgs,
  parseDurationMs,
  resolveConfig
 } from "../../_scripts_bak/reminders/reminderRunner.js";
import { loadIcsEvents  } from "../../_scripts_bak/reminders/reminderUtils.js";

describe("reminder runner utilities", () => {
  const config = resolveConfig("stage-deploy-tag7-tier1");
  const events = loadIcsEvents(config.icsPath);

  afterEach(() => {
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_CHANNEL_TIER1_PLATFORM;
    delete process.env.SLACK_CHANNEL_OFFLINE_PUBLISHING;
    delete process.env.SLACK_CHANNEL_CLIENT_OVERLAYS;
    delete process.env.SLACK_CHANNEL_HUB_CONTESTS;
  });

  it("parses durations with units", () => {
    expect(parseDurationMs("5m")).toBe(5 * 60 * 1000);
    expect(parseDurationMs("30s")).toBe(30 * 1000);
    expect(parseDurationMs("1000ms")).toBe(1000);
    expect(parseDurationMs("1.5h")).toBe(1.5 * 60 * 60 * 1000);
  });

  it("parses CLI args with overrides", () => {
    const args = parseArgs([
      "node",
      "script",
      "--send",
      "--json",
      "--window-before",
      "2m",
      "--window-after",
      "15m",
      "--allow-late"
    ]);
    expect(args.mode).toBe("send");
    expect(args.output).toBe("json");
    expect(args.windowBeforeMs).toBe(2 * 60 * 1000);
    expect(args.windowAfterMs).toBe(15 * 60 * 1000);
    expect(args.allowLate).toBe(true);
  });

  it("creates jobs for each configured reminder", () => {
    const jobs = createJobs(config, events);
    expect(jobs).toHaveLength(5);
    const templateIds = jobs.map((job) => job.reminder.templateId);
    expect(templateIds).toEqual(
      expect.arrayContaining([
        "tier1Summary",
        "offlinePublishing",
        "clientOverlays",
        "hubContests",
        "escalation"
      ])
    );
  });

  it("computes job state windows", () => {
    const jobs = createJobs(config, events);
    const summaryJob = jobs.find(
      (job) => job.reminder.templateId === "tier1Summary"
    );
    const scheduled = summaryJob.event.start.valueOf();

    const windowBefore = 5 * 60 * 1000;
    const windowAfter = 10 * 60 * 1000;

    const upcomingState = computeJobState(
      summaryJob,
      new Date(scheduled - windowBefore - 1000),
      windowBefore,
      windowAfter,
      new Set()
    );
    expect(upcomingState).toBe("upcoming");

    const dueState = computeJobState(
      summaryJob,
      new Date(scheduled),
      windowBefore,
      windowAfter,
      new Set()
    );
    expect(dueState).toBe("due");

    const lateState = computeJobState(
      summaryJob,
      new Date(scheduled + windowAfter + 1000),
      windowBefore,
      windowAfter,
      new Set()
    );
    expect(lateState).toBe("late");

    const sentState = computeJobState(
      summaryJob,
      new Date(scheduled),
      windowBefore,
      windowAfter,
      new Set([`${summaryJob.eventUid}::${summaryJob.reminder.templateId}::${summaryJob.reminder.channelEnv}`])
    );
    expect(sentState).toBe("sent");
  });

  it("collects reminder environment requirements", () => {
    const { allEnv } = collectRequiredEnv(config);
    expect(allEnv).toEqual([
      "SLACK_BOT_TOKEN",
      "SLACK_CHANNEL_CLIENT_OVERLAYS",
      "SLACK_CHANNEL_HUB_CONTESTS",
      "SLACK_CHANNEL_OFFLINE_PUBLISHING",
      "SLACK_CHANNEL_TIER1_PLATFORM"
    ]);

    const report = buildEnvReport(config, {
      SLACK_CHANNEL_TIER1_PLATFORM: "C1234567",
      SLACK_CHANNEL_OFFLINE_PUBLISHING: "",
      SLACK_CHANNEL_CLIENT_OVERLAYS: "C7654321"
    });
    const tier1Entry = report.find(
      (entry) => entry.name === "SLACK_CHANNEL_TIER1_PLATFORM"
    );
    const offlineEntry = report.find(
      (entry) => entry.name === "SLACK_CHANNEL_OFFLINE_PUBLISHING"
    );
    expect(tier1Entry).toMatchObject({
      isSet: true,
      valueLength: 8,
      channels: ["#tier1-platform"]
    });
    expect(offlineEntry).toMatchObject({
      isSet: false,
      valueLength: 0,
      channels: ["#offline-publishing"]
    });
  });

  it("aggregates missing environment variables before sending", async () => {
    const jobs = createJobs(config, events);
    const options = {
      mode: "send",
      now: new Date("2025-11-05T09:02:00Z"),
      windowBeforeMs: 5 * 60 * 1000,
      windowAfterMs: 10 * 60 * 1000,
      allowLate: false
    };
    await expect(
      executeJobs(options, config, jobs, [])
    ).rejects.toThrow(
      /Missing environment variables for send mode: SLACK_BOT_TOKEN, SLACK_CHANNEL_TIER1_PLATFORM, SLACK_CHANNEL_OFFLINE_PUBLISHING, SLACK_CHANNEL_CLIENT_OVERLAYS, SLACK_CHANNEL_HUB_CONTESTS\. Run with --check-env to review requirements\./
    );
  });
});
