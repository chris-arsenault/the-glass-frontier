"use strict";

const {
  computeJobState,
  createJobs,
  parseArgs,
  parseDurationMs,
  resolveConfig
} = require("../../scripts/reminders/reminderRunner");
const { loadIcsEvents } = require("../../scripts/reminders/reminderUtils");

describe("reminder runner utilities", () => {
  const config = resolveConfig("stage-deploy-tag7-tier1");
  const events = loadIcsEvents(config.icsPath);

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
});
