"use strict";

import fs from "fs";
import path from "path";
import { fetch  } from "undici.js";

import tier1ReminderConfig from "./tier1ReminderConfig";
import { loadIcsEvents  } from "./reminderUtils.js";

const CONFIG_REGISTRY = {
  [tier1ReminderConfig.id]: tier1ReminderConfig
};

function parseDurationMs(value, fallbackMs) {
  if (!value && value !== 0) {
    return fallbackMs;
  }

  const trimmed = String(value).trim().toLowerCase();
  if (!trimmed.length) {
    return fallbackMs;
  }

  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)(ms|s|m|h)?$/);
  if (!match) {
    throw new Error(`Invalid duration "${value}"`);
  }

  const [, numericPart, unit] = match;
  const numeric = Number.parseFloat(numericPart);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid duration value "${value}"`);
  }

  switch (unit) {
    case "h":
      return numeric * 60 * 60 * 1000;
    case "m":
      return numeric * 60 * 1000;
    case "s":
      return numeric * 1000;
    case "ms":
    case undefined:
      return numeric;
    default:
      throw new Error(`Unsupported duration unit for "${value}"`);
  }
}

function parseArgs(argv = process.argv) {
  const defaults = {
    configId: tier1ReminderConfig.id,
    mode: "preview",
    output: "text",
    checkEnv: false,
    allowLate: false,
    force: false,
    windowBeforeMs: parseDurationMs("5m"),
    windowAfterMs: parseDurationMs("10m"),
    now: new Date()
  };

  const options = { ...defaults };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--config":
        options.configId = argv[++index] || options.configId;
        break;
      case "--preview":
        options.mode = "preview";
        break;
      case "--send":
        options.mode = "send";
        break;
      case "--json":
        options.output = "json";
        break;
      case "--text":
        options.output = "text";
        break;
      case "--allow-late":
        options.allowLate = true;
        break;
      case "--check-env":
        options.checkEnv = true;
        break;
      case "--force":
        options.force = true;
        break;
      case "--window-before":
        options.windowBeforeMs = parseDurationMs(
          argv[++index],
          options.windowBeforeMs
        );
        break;
      case "--window-after":
        options.windowAfterMs = parseDurationMs(
          argv[++index],
          options.windowAfterMs
        );
        break;
      case "--now":
        options.now = new Date(argv[++index]);
        if (Number.isNaN(options.now.valueOf())) {
          throw new Error(`Invalid --now timestamp "${argv[index]}"`);
        }
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        if (arg && arg.startsWith("--")) {
          console.warn(`[reminder-runner] Unknown option ${arg} ignored`);
        }
        break;
    }
  }

  return options;
}

function resolveConfig(configId) {
  const config = CONFIG_REGISTRY[configId];
  if (!config) {
    const valid = Object.keys(CONFIG_REGISTRY).join(", ") || "<none>";
    throw new Error(
      `Unknown reminder configuration "${configId}". Valid options: ${valid}`
    );
  }
  return config;
}

function createJobs(config, events) {
  const eventMap = new Map();
  for (const event of events) {
    eventMap.set(event.uid, event);
  }

  const jobs = [];

  for (const eventConfig of config.events) {
    const event = eventMap.get(eventConfig.uid);
    if (!event) {
      throw new Error(
        `ICS file missing expected event ${eventConfig.uid} for schedule ${config.id}`
      );
    }

    for (const reminder of eventConfig.reminders) {
      const template = config.templates[reminder.templateId];
      if (!template) {
        throw new Error(
          `Missing template "${reminder.templateId}" for schedule ${config.id}`
        );
      }

      jobs.push({
        scheduleId: config.id,
        eventUid: event.uid,
        label: eventConfig.label,
        reminder,
        template,
        event
      });
    }
  }

  return jobs;
}

function loadExecutionLog(logPath) {
  const resolvedPath = path.isAbsolute(logPath)
    ? logPath
    : path.join(process.cwd(), logPath);

  if (!fs.existsSync(resolvedPath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(resolvedPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("Execution log root must be an array");
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `Failed to load execution log at ${resolvedPath}: ${error.message}`
    );
  }
}

function writeExecutionLog(logPath, entries) {
  const resolvedPath = path.isAbsolute(logPath)
    ? logPath
    : path.join(process.cwd(), logPath);
  const directory = path.dirname(resolvedPath);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(resolvedPath, JSON.stringify(entries, null, 2) + "\n", {
    encoding: "utf8"
  });
}

function makeJobKey(job) {
  return `${job.eventUid}::${job.reminder.templateId}::${job.reminder.channelEnv}`;
}

function computeJobState(job, now, windowBeforeMs, windowAfterMs, executedSet) {
  if (executedSet.has(makeJobKey(job))) {
    return "sent";
  }

  const scheduledAt = job.event.start?.valueOf();
  if (!Number.isFinite(scheduledAt)) {
    return "unknown";
  }

  const lowerBound = scheduledAt - windowBeforeMs;
  const upperBound = scheduledAt + windowAfterMs;
  const current = now.valueOf();

  if (current < lowerBound) {
    return "upcoming";
  }
  if (current > upperBound) {
    return "late";
  }

  return "due";
}

async function postToSlack(token, channel, text) {
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      channel,
      text
    })
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(
      `Slack API request failed with ${response.status}: ${bodyText}`
    );
  }

  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(
      `Slack API error: ${payload.error || "unknown_error"} (channel: ${channel})`
    );
  }

  return payload;
}

function formatJob(job, state, channelId) {
  const scheduledAt = job.event.start
    ? job.event.start.toISOString()
    : "unknown";
  return {
    scheduleId: job.scheduleId,
    eventUid: job.eventUid,
    label: job.label,
    channelEnv: job.reminder.channelEnv,
    channelId,
    fallbackChannel: job.reminder.fallbackChannel,
    templateId: job.reminder.templateId,
    scheduledAt,
    state
  };
}

async function executeJobs(options, config, jobs, executionLog) {
  const executedSet = new Set(
    executionLog.map((entry) => makeJobKey(entry))
  );
  const results = [];
  const now = options.now;
  const dueJobs = [];

  for (const job of jobs) {
    const envValue =
      job.reminder.channelEnv && process.env[job.reminder.channelEnv]
        ? process.env[job.reminder.channelEnv]
        : null;
    const channelId = envValue ? String(envValue).trim() : null;
    const state = computeJobState(
      job,
      now,
      options.windowBeforeMs,
      options.windowAfterMs,
      executedSet
    );
    const formatted = formatJob(job, state, channelId);
    results.push({ job, summary: formatted });

    if (state === "due" || (state === "late" && options.allowLate)) {
      if (!options.force && executedSet.has(makeJobKey(job))) {
        continue;
      }
      dueJobs.push({ job, channelId });
    }
  }

  if (options.mode !== "send") {
    return results;
  }

  const requiredEnv = new Set(["SLACK_BOT_TOKEN"]);
  for (const { job } of dueJobs) {
    if (job.reminder.channelEnv) {
      requiredEnv.add(job.reminder.channelEnv);
    }
  }

  const missingEnv = Array.from(requiredEnv).filter((envName) => {
    const value = process.env[envName];
    return !value || !String(value).trim().length;
  });

  if (missingEnv.length > 0) {
    throw new Error(
      `Missing environment variables for send mode: ${missingEnv.join(
        ", "
      )}. Run with --check-env to review requirements.`
    );
  }

  const token = String(process.env.SLACK_BOT_TOKEN).trim();

  const newLogEntries = [...executionLog];
  const timestamp = new Date().toISOString();

  for (const { job, channelId } of dueJobs) {
    if (!channelId) {
      throw new Error(
        `Missing environment variable ${job.reminder.channelEnv} for reminder targeting ${job.reminder.fallbackChannel}`
      );
    }

    await postToSlack(token, channelId, job.template);

    const entry = {
      eventUid: job.eventUid,
      templateId: job.reminder.templateId,
      channelEnv: job.reminder.channelEnv,
      channelId,
      sentAt: timestamp
    };
    newLogEntries.push(entry);
    results.push({ job, summary: { ...formatJob(job, "sent", channelId) } });
    executedSet.add(makeJobKey(job));
  }

  if (dueJobs.length > 0) {
    writeExecutionLog(config.logPath, newLogEntries);
  }

  return results;
}

function renderResults(results, output) {
  if (output === "json") {
    const serialized = results.map((entry) => entry.summary);
    console.log(JSON.stringify(serialized, null, 2));
    return;
  }

  const grouped = results.reduce((acc, entry) => {
    const state = entry.summary.state || "unknown";
    if (!acc[state]) {
      acc[state] = [];
    }
    acc[state].push(entry.summary);
    return acc;
  }, {});

  const states = Object.keys(grouped).sort();
  for (const state of states) {
    console.log(`[${state}]`);
    for (const summary of grouped[state]) {
      const channelLabel =
        summary.channelId || `env:${summary.channelEnv || "unset"}`;
      console.log(
        `  • ${summary.label} → ${channelLabel} @ ${summary.scheduledAt} (${summary.templateId})`
      );
    }
  }
}

function collectRequiredEnv(config) {
  const channelMap = new Map();
  for (const event of config.events) {
    for (const reminder of event.reminders) {
      if (!reminder.channelEnv) {
        continue;
      }
      if (!channelMap.has(reminder.channelEnv)) {
        channelMap.set(reminder.channelEnv, new Set());
      }
      const targets = channelMap.get(reminder.channelEnv);
      if (reminder.fallbackChannel) {
        targets.add(reminder.fallbackChannel);
      }
    }
  }

  return {
    allEnv: [
      "SLACK_BOT_TOKEN",
      ...Array.from(channelMap.keys()).sort((a, b) => a.localeCompare(b))
    ],
    channelTargets: channelMap
  };
}

function buildEnvReport(config, envSource = process.env) {
  const { allEnv, channelTargets } = collectRequiredEnv(config);
  return allEnv.map((envName) => {
    const rawValue = envSource[envName];
    const isSet =
      typeof rawValue === "string" && rawValue.trim().length > 0;
    const channels = channelTargets.has(envName)
      ? Array.from(channelTargets.get(envName)).sort()
      : [];
    return {
      name: envName,
      isSet,
      valueLength: isSet ? rawValue.trim().length : 0,
      channels
    };
  });
}

function renderEnvReport(report, output) {
  if (output === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  for (const entry of report) {
    const status = entry.isSet ? "present" : "missing";
    const lengthLabel = entry.isSet ? ` (length ${entry.valueLength})` : "";
    const channelLabel =
      entry.channels.length > 0
        ? ` targets: ${entry.channels.join(", ")}`
        : entry.name === "SLACK_BOT_TOKEN"
        ? " targets: Slack API access token"
        : "";
    console.log(
      `[${status}] ${entry.name}${lengthLabel}${channelLabel}`
    );
  }
}

async function main(argv = process.argv) {
  const options = parseArgs(argv);

  if (options.help) {
    console.log(
      "Usage: node scripts/reminders/runTier1Reminders.js [options]\n" +
        "  --preview              Preview upcoming reminders (default)\n" +
        "  --send                 Send reminders via Slack\n" +
        "  --check-env            Report required Slack environment variables\n" +
        "  --config <id>          Reminder configuration to execute\n" +
        "  --window-before <dur>  Lead window before scheduled time (default 5m)\n" +
        "  --window-after <dur>   Tail window after scheduled time (default 10m)\n" +
        "  --allow-late           Allow sending reminders even if window elapsed\n" +
        "  --force                Ignore execution log and send even if recorded\n" +
        "  --now <timestamp>      Override current time (ISO string)\n" +
        "  --json                 Emit JSON output instead of text\n" +
        "  --text                 Emit text output (default)\n"
    );
    return;
  }

  const config = resolveConfig(options.configId);

  if (options.checkEnv) {
    const report = buildEnvReport(config);
    renderEnvReport(report, options.output);
    return;
  }

  const events = loadIcsEvents(config.icsPath);
  const jobs = createJobs(config, events);
  const executionLog = options.force
    ? []
    : loadExecutionLog(config.logPath);
  const results = await executeJobs(options, config, jobs, executionLog);
  renderResults(results, options.output);
}

export {
  CONFIG_REGISTRY,
  buildEnvReport,
  collectRequiredEnv,
  computeJobState,
  createJobs,
  executeJobs,
  loadExecutionLog,
  main,
  parseArgs,
  parseDurationMs,
  renderResults,
  resolveConfig,
  writeExecutionLog
};
