"use strict";

import fs from "fs";
import path from "path";

function unfoldLines(content) {
  const rawLines = String(content)
    .replace(/\r\n/g, "\n")
    .split("\n");
  const unfolded = [];

  for (const line of rawLines) {
    if (!unfolded.length) {
      unfolded.push(line);
      continue;
    }

    if (line.startsWith(" ") || line.startsWith("\t")) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }

  return unfolded;
}

function parseIcsDate(value) {
  if (!value) {
    return null;
  }

  const trimmed = String(value).trim();
  const match = trimmed.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/
  );
  if (match) {
    const [, year, month, day, hour, minute, second] = match;
    return new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
      )
    );
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed);
}

function parseIcs(content) {
  const lines = unfoldLines(content);
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {
        uid: null,
        start: null,
        end: null,
        summary: null,
        description: null
      };
      continue;
    }

    if (line === "END:VEVENT") {
      if (current?.uid) {
        events.push(current);
      }
      current = null;
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith("UID:")) {
      current.uid = line.slice(4).trim();
    } else if (line.startsWith("DTSTART:")) {
      current.start = parseIcsDate(line.slice(8));
    } else if (line.startsWith("DTEND:")) {
      current.end = parseIcsDate(line.slice(6));
    } else if (line.startsWith("SUMMARY:")) {
      current.summary = line.slice(8).trim();
    } else if (line.startsWith("DESCRIPTION:")) {
      current.description = line.slice(12).trim();
    }
  }

  return events;
}

function loadIcsEvents(icsPath) {
  const resolvedPath = path.isAbsolute(icsPath)
    ? icsPath
    : path.join(process.cwd(), icsPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`ICS file not found at ${resolvedPath}`);
  }

  const raw = fs.readFileSync(resolvedPath, "utf8");
  return parseIcs(raw);
}

export {
  loadIcsEvents,
  parseIcs,
  parseIcsDate
};
