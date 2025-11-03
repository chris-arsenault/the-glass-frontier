"use strict";

const TENSION_WEIGHTS = {
  calm: 1,
  steady: 2,
  rising: 3,
  crisis: 4
};

const DEFAULT_TENSION = "steady";
const DEFAULT_ACT_ID = "act:default";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

class SummaryComposer {
  constructor(options = {}) {
    this.maxSummaryLength = options.maxSummaryLength || 320;
  }

  compose({ transcript = [], sessionMetadata = {}, safetyEvents = [] } = {}) {
    if (!Array.isArray(transcript)) {
      throw new Error("summary_composer_requires_transcript");
    }

    const scenes = segmentScenes(transcript);
    const sceneBreakdown = scenes.map((scene, index) =>
      this.#composeSceneSummary(scene, index, sessionMetadata)
    );
    const actSummary = composeActSummaries(sceneBreakdown, transcript, sessionMetadata);
    const playerHighlights = extractPlayerHighlights(transcript);
    const safetyNotes = composeSafetyNotes(sceneBreakdown, safetyEvents);
    const statistics = composeStatistics(sceneBreakdown, transcript, safetyNotes, playerHighlights);

    return {
      sceneBreakdown,
      actSummary,
      playerHighlights,
      safetyNotes,
      statistics
    };
  }

  #composeSceneSummary(scene, index, sessionMetadata) {
    const summaryText = clampSummary(buildSceneSummaryText(scene.entries), this.maxSummaryLength);
    const tension = computeTension(scene.entries);
    const unresolvedHooks = collectUnresolvedHooks(scene.entries);
    const keyMoments = collectKeyMoments(scene.entries);
    const safetyFlags = collectSafetyFlags(scene.entries);
    const { start, end } = computeTimeRange(scene.entries);
    const tags = Array.from(scene.tags);

    return {
      sceneId: scene.sceneId,
      title: scene.title || resolveSceneTitle(scene, index, sessionMetadata),
      actId: scene.actId || DEFAULT_ACT_ID,
      summary: summaryText,
      tension,
      unresolvedHooks,
      keyMoments,
      safetyFlags,
      tags,
      timeRange: {
        start,
        end
      }
    };
  }
}

function segmentScenes(transcript) {
  const scenes = new Map();
  transcript.forEach((entry, index) => {
    if (!entry) {
      return;
    }

    const sceneId = entry.sceneId || `${DEFAULT_ACT_ID}:scene:${index + 1}`;
    if (!scenes.has(sceneId)) {
      scenes.set(sceneId, {
        sceneId,
        entries: [],
        order: index,
        actId: entry.actId || entry.metadata?.actId || DEFAULT_ACT_ID,
        title: entry.metadata?.sceneTitle || entry.metadata?.scene?.title || null,
        tags: new Set(),
        actTitle: entry.metadata?.actTitle || entry.metadata?.act?.title || null
      });
    }

    const descriptor = scenes.get(sceneId);
    descriptor.entries.push(normalizeEntry(entry));
    collectTags(entry, descriptor.tags);
    if (!descriptor.actId && entry.metadata?.actId) {
      descriptor.actId = entry.metadata.actId;
    }
    if (!descriptor.actTitle && entry.metadata?.actTitle) {
      descriptor.actTitle = entry.metadata.actTitle;
    }
  });

  return Array.from(scenes.values()).sort((left, right) => left.order - right.order);
}

function normalizeEntry(entry) {
  return {
    turnId: entry.turnId || null,
    sceneId: entry.sceneId || null,
    actId: entry.actId || entry.metadata?.actId || DEFAULT_ACT_ID,
    speaker: entry.speaker || entry.role || "gm",
    text: entry.text || "",
    timestamp: entry.timestamp || entry.metadata?.timestamp || null,
    metadata: clone(entry.metadata || {})
  };
}

function collectTags(entry, tagSet) {
  const tags = entry?.metadata?.tags;
  if (!Array.isArray(tags)) {
    return;
  }

  tags.forEach((tag) => {
    if (typeof tag === "string" && tag.trim()) {
      tagSet.add(tag.trim());
    }
  });
}

function resolveSceneTitle(scene, index, sessionMetadata) {
  const sessionScenes = sessionMetadata?.scenes;
  if (Array.isArray(sessionScenes)) {
    const matching = sessionScenes.find((candidate) => candidate.sceneId === scene.sceneId);
    if (matching?.title) {
      return matching.title;
    }
  }

  return `Scene ${index + 1}`;
}

function buildSceneSummaryText(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "";
  }

  const gmEntries = entries.filter((entry) => entry.speaker === "gm");
  if (gmEntries.length === 0) {
    return entries.map((entry) => entry.text).join(" ");
  }

  const first = gmEntries[0]?.text || "";
  const last = gmEntries[gmEntries.length - 1]?.text || "";
  if (!first) {
    return last;
  }
  if (!last || last === first) {
    return first;
  }

  return `${first} … ${last}`;
}

function clampSummary(text, maxLength) {
  if (!text || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

function computeTension(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return {
      level: DEFAULT_TENSION,
      spikes: []
    };
  }

  let weightTotal = 0;
  let weightCount = 0;
  const spikes = [];

  entries.forEach((entry) => {
    const tensionValue =
      entry.metadata?.tension || (entry.speaker === "gm" ? DEFAULT_TENSION : null);
    if (!tensionValue) {
      return;
    }

    const tension = tensionValue.toLowerCase();
    const weight = TENSION_WEIGHTS[tension] || TENSION_WEIGHTS[DEFAULT_TENSION];
    weightTotal += weight;
    weightCount += 1;

    if (weight >= TENSION_WEIGHTS.rising) {
      spikes.push({
        turnId: entry.turnId || null,
        timestamp: entry.timestamp || null,
        level: tension,
        summary: clampSummary(entry.text, 160)
      });
    }
  });

  const average = weightCount === 0 ? TENSION_WEIGHTS[DEFAULT_TENSION] : weightTotal / weightCount;
  const level = resolveTensionLevel(average);

  return {
    level,
    spikes
  };
}

function resolveTensionLevel(averageWeight) {
  if (averageWeight >= 3.5) {
    return "crisis";
  }
  if (averageWeight >= 2.5) {
    return "rising";
  }
  if (averageWeight >= 1.75) {
    return "steady";
  }
  return "calm";
}

function collectUnresolvedHooks(entries) {
  const hooks = new Set();
  entries.forEach((entry) => {
    const metadataHooks = entry.metadata?.hooks;
    if (Array.isArray(metadataHooks)) {
      metadataHooks.forEach((hook) => {
        if (hook?.status === "open" && hook.title) {
          hooks.add(JSON.stringify({ title: hook.title, type: hook.type || null }));
        } else if (typeof hook === "string") {
          hooks.add(JSON.stringify({ title: hook, type: null }));
        }
      });
    }

    const unresolved = entry.metadata?.unresolvedHooks;
    if (Array.isArray(unresolved)) {
      unresolved.forEach((value) => {
        if (typeof value === "string") {
          hooks.add(JSON.stringify({ title: value, type: null }));
        }
      });
    }
  });

  return Array.from(hooks).map((hook) => JSON.parse(hook));
}

function collectKeyMoments(entries) {
  const moments = [];
  entries.forEach((entry) => {
    if (entry.metadata?.keyMoment) {
      moments.push({
        turnId: entry.turnId || null,
        description: entry.metadata.keyMoment,
        speaker: entry.speaker
      });
    }

    if (Array.isArray(entry.metadata?.highlights)) {
      entry.metadata.highlights.forEach((highlight) => {
        if (typeof highlight === "string") {
          moments.push({
            turnId: entry.turnId || null,
            description: highlight,
            speaker: entry.speaker
          });
        }
      });
    }
  });

  return moments;
}

function collectSafetyFlags(entries) {
  const safetyFlags = [];
  entries.forEach((entry) => {
    if (!Array.isArray(entry.metadata?.safetyFlags)) {
      return;
    }

    entry.metadata.safetyFlags.forEach((flag) => {
      if (flag && typeof flag.id === "string") {
        safetyFlags.push({
          turnId: entry.turnId || null,
          flag: flag.id,
          severity: flag.severity || "medium",
          description: flag.description || null
        });
      } else if (typeof flag === "string") {
        safetyFlags.push({
          turnId: entry.turnId || null,
          flag,
          severity: "medium",
          description: null
        });
      }
    });
  });

  return safetyFlags;
}

function computeTimeRange(entries) {
  let start = null;
  let end = null;

  entries.forEach((entry) => {
    if (!entry.timestamp) {
      return;
    }
    const timestamp = new Date(entry.timestamp).toISOString();
    if (!start || timestamp < start) {
      start = timestamp;
    }
    if (!end || timestamp > end) {
      end = timestamp;
    }
  });

  return { start, end };
}

function composeActSummaries(sceneBreakdown, transcript, sessionMetadata) {
  const actMap = new Map();

  sceneBreakdown.forEach((scene, index) => {
    const actId = scene.actId || DEFAULT_ACT_ID;
    if (!actMap.has(actId)) {
      actMap.set(actId, {
        actId,
        scenes: [],
        summaryParts: [],
        hooks: [],
        tags: new Map(),
        actTitle: resolveActTitle(actId, sessionMetadata, index)
      });
    }

    const descriptor = actMap.get(actId);
    descriptor.scenes.push(scene.sceneId);
    descriptor.summaryParts.push(scene.summary);
    descriptor.hooks.push(...scene.unresolvedHooks);
    accumulateTags(descriptor.tags, scene.tags);
  });

  const momentumByAct = extractMomentumByAct(transcript);

  return Array.from(actMap.values()).map((descriptor, index) => {
    const summary = descriptor.summaryParts.filter(Boolean).join(" ");
    const momentum = momentumByAct.get(descriptor.actId) || null;
    const themes = selectDominantThemes(descriptor.tags);

    return {
      actId: descriptor.actId,
      title: descriptor.actTitle || `Act ${index + 1}`,
      summary: clampSummary(summary, 640),
      scenes: descriptor.scenes,
      unresolvedHooks: descriptor.hooks,
      dominantThemes: themes,
      momentumArc: momentum
    };
  });
}

function resolveActTitle(actId, sessionMetadata, fallbackIndex) {
  const acts = sessionMetadata?.acts;
  if (Array.isArray(acts)) {
    const matching = acts.find((entry) => entry.actId === actId);
    if (matching?.title) {
      return matching.title;
    }
  }

  return `Act ${fallbackIndex + 1}`;
}

function accumulateTags(target, tags) {
  tags.forEach((tag) => {
    const current = target.get(tag) || 0;
    target.set(tag, current + 1);
  });
}

function selectDominantThemes(tagCounts) {
  return Array.from(tagCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([tag, weight]) => ({
      tag,
      weight
    }));
}

function extractMomentumByAct(transcript) {
  const momentum = new Map();

  transcript.forEach((entry) => {
    const actId = entry.actId || entry.metadata?.actId || DEFAULT_ACT_ID;
    if (!entry.metadata?.momentum) {
      return;
    }

    if (!momentum.has(actId)) {
      momentum.set(actId, {
        start: null,
        end: null,
        trajectory: []
      });
    }

    const descriptor = momentum.get(actId);
    const snapshot = entry.metadata.momentum;
    if (typeof snapshot.value === "number") {
      if (descriptor.start === null) {
        descriptor.start = snapshot.value;
      }
      descriptor.end = snapshot.value;
    }

    if (typeof snapshot.delta === "number" || snapshot.reason) {
      descriptor.trajectory.push({
        turnId: entry.turnId || null,
        delta: snapshot.delta || 0,
        reason: snapshot.reason || null,
        resultingValue: snapshot.value !== undefined ? snapshot.value : null
      });
    }
  });

  return momentum;
}

function extractPlayerHighlights(transcript) {
  const highlights = {
    achievements: [],
    assetsEarned: [],
    debtsIncurred: [],
    reputationShifts: [],
    memorableQuotes: [],
    momentumChanges: []
  };

  transcript.forEach((entry) => {
    if (entry.speaker !== "player" && entry.role !== "player") {
      return;
    }

    const metadata = entry.metadata || {};

    appendArray(highlights.achievements, metadata.achievements);
    appendArray(highlights.assetsEarned, metadata.assetsGranted || metadata.assetsEarned);
    appendArray(highlights.debtsIncurred, metadata.debtsIncurred);
    appendArray(highlights.reputationShifts, metadata.reputationShifts);

    if (metadata.highlightQuote) {
      highlights.memorableQuotes.push({
        turnId: entry.turnId || null,
        quote: entry.text,
        context: metadata.highlightQuote
      });
    }

    if (metadata.momentum && (metadata.momentum.delta || metadata.momentum.value !== undefined)) {
      highlights.momentumChanges.push({
        turnId: entry.turnId || null,
        delta: metadata.momentum.delta || 0,
        resultingValue: metadata.momentum.value !== undefined ? metadata.momentum.value : null,
        reason: metadata.momentum.reason || null
      });
    }
  });

  return highlights;
}

function appendArray(target, source) {
  if (!Array.isArray(source) || source.length === 0) {
    return;
  }
  source.forEach((value) => {
    if (typeof value === "string") {
      target.push(value);
    } else if (value && typeof value.title === "string") {
      target.push(value);
    }
  });
}

function composeSafetyNotes(sceneBreakdown, safetyEvents) {
  const notes = [];

  sceneBreakdown.forEach((scene) => {
    scene.safetyFlags.forEach((flag) => {
      notes.push({
        type: "transcript",
        sceneId: scene.sceneId,
        turnId: flag.turnId,
        flag: flag.flag,
        severity: flag.severity,
        description: flag.description || null
      });
    });
  });

  (safetyEvents || []).forEach((event) => {
    notes.push({
      type: "event",
      sceneId: event.sceneId || null,
      turnId: event.turnId || null,
      flag: (event.flags || [])[0] || "safety_event",
      severity: event.severity || "medium",
      description: event.description || null,
      occurredAt: event.timestamp || null
    });
  });

  return notes;
}

function composeStatistics(sceneBreakdown, transcript, safetyNotes, playerHighlights) {
  const turnCount = transcript.length;
  const playerActionCount = transcript.filter(
    (entry) => entry.speaker === "player" || entry.role === "player"
  ).length;
  const gmActionCount = transcript.filter(
    (entry) => entry.speaker === "gm" || entry.role === "gm"
  ).length;
  const unresolvedHooks = sceneBreakdown.reduce(
    (count, scene) => count + (scene.unresolvedHooks?.length || 0),
    0
  );

  return {
    turnCount,
    sceneCount: sceneBreakdown.length,
    playerActionCount,
    gmActionCount,
    safetyFlagCount: safetyNotes.length,
    hooksOutstanding: unresolvedHooks,
    momentumEvents: playerHighlights.momentumChanges.length
  };
}

module.exports = {
  SummaryComposer
};
