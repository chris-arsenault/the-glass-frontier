"use strict";

const { v4: uuid } = require("uuid");
const { getDefaultLexicon } = require("./lexicon");
const { listCapabilities } = require("../../moderation/prohibitedCapabilitiesRegistry");

const CONTROL_GAIN_KEYWORDS = [
  "seized",
  "secured",
  "claimed",
  "captured",
  "took control of",
  "stabilised",
  "stabilized",
  "liberated"
];

const CONTROL_LOSS_KEYWORDS = ["lost", "ceded", "abandoned", "retreated from"];

const STATUS_KEYWORDS = [
  { pattern: /under (serious )?threat/i, status: "threatened" },
  { pattern: /(devastated|ruined|ravaged)/i, status: "devastated" },
  { pattern: /(stabilised|stabilized|secured)/i, status: "stable" }
];

const UNCERTAIN_TOKENS = ["rumor", "rumour", "rumored", "rumoured", "allegedly", "unconfirmed"];

function escapeRegExp(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function computeConfidence(matchType, sentence) {
  let score = 0.5;
  if (matchType === "canonical") {
    score = 0.95;
  } else if (matchType === "alias") {
    score = 0.85;
  } else if (matchType === "fuzzy") {
    score = 0.55;
  }

  const lowered = sentence.toLowerCase();
  if (UNCERTAIN_TOKENS.some((token) => lowered.includes(token))) {
    score -= 0.3;
  }

  return Math.max(0, Math.min(0.99, score));
}

function buildAliasSets(lexicon) {
  return lexicon.map((entry) => {
    const aliasList = [];
    aliasList.push({
      alias: entry.canonicalName,
      type: "canonical",
      boundaryMatcher: new RegExp(`\\b${escapeRegExp(entry.canonicalName)}\\b`, "i"),
      lowered: entry.canonicalName.toLowerCase()
    });

    (entry.aliases || []).forEach((alias) => {
      aliasList.push({
        alias,
        type: "alias",
        boundaryMatcher: new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i"),
        lowered: alias.toLowerCase()
      });
    });

    return {
      entry,
      aliases: aliasList
    };
  });
}

function findAliasMatch(sentence, aliasDescriptors) {
  for (const descriptor of aliasDescriptors) {
    if (descriptor.boundaryMatcher.test(sentence)) {
      return { type: descriptor.type, value: descriptor.alias };
    }
  }

  for (const descriptor of aliasDescriptors) {
    if (sentence.toLowerCase().includes(descriptor.lowered)) {
      return { type: "fuzzy", value: descriptor.alias };
    }
  }

  return null;
}

function detectControlChanges(mentionEntry, sentence, lexicon) {
  if (mentionEntry.entityType !== "faction") {
    return null;
  }

  const loweredSentence = sentence.toLowerCase();
  const addTargets = new Set();
  const removeTargets = new Set();

  lexicon.forEach((candidate) => {
    if (candidate.entityType !== "region") {
      return;
    }

    const candidateAliases = [candidate.canonicalName, ...(candidate.aliases || [])];
    candidateAliases.forEach((alias) => {
      const aliasRegex = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i");
      if (!aliasRegex.test(sentence)) {
        return;
      }

      const aliasLower = alias.toLowerCase();
      const gainKeyword = CONTROL_GAIN_KEYWORDS.find((keyword) =>
        loweredSentence.includes(keyword)
      );
      const lossKeyword = CONTROL_LOSS_KEYWORDS.find((keyword) =>
        loweredSentence.includes(keyword)
      );

      if (gainKeyword && !lossKeyword) {
        addTargets.add(candidate.entityId);
      } else if (lossKeyword && !gainKeyword) {
        removeTargets.add(candidate.entityId);
      }
    });
  });

  if (addTargets.size === 0 && removeTargets.size === 0) {
    return null;
  }

  return {
    control: {
      add: Array.from(addTargets),
      remove: Array.from(removeTargets)
    }
  };
}

function detectRegionStatus(mentionEntry, sentence) {
  if (mentionEntry.entityType !== "region") {
    return null;
  }

  for (const candidate of STATUS_KEYWORDS) {
    if (candidate.pattern.test(sentence)) {
      return {
        status: candidate.status
      };
    }
  }

  return null;
}

function detectCapabilityRefs(sentence, capabilityIndex) {
  const lowered = sentence.toLowerCase();
  const refs = [];

  capabilityIndex.forEach((entry) => {
    if (lowered.includes(entry.labelLower)) {
      refs.push({
        capabilityId: entry.capabilityId,
        severity: entry.severity
      });
    }
  });

  return refs;
}

function createCapabilityIndex() {
  return listCapabilities().map((capability) => ({
    capabilityId: capability.capabilityId,
    labelLower: capability.label.toLowerCase(),
    severity: capability.severity
  }));
}

function extractEntities(options) {
  if (!options || !Array.isArray(options.transcript)) {
    throw new Error("entity_extraction_requires_transcript");
  }

  const lexicon = options.lexicon || getDefaultLexicon();
  const aliasSets = buildAliasSets(lexicon);
  const capabilityIndex = createCapabilityIndex();
  const minConfidence = typeof options.minConfidence === "number" ? options.minConfidence : 0.4;

  const mentions = [];
  const aliasMap = aliasSets.map((descriptor) => ({
    entry: descriptor.entry,
    aliases: descriptor.aliases
  }));

  options.transcript.forEach((turn) => {
    if (!turn || typeof turn.text !== "string" || turn.text.trim().length === 0) {
      return;
    }

    const sentences = splitSentences(turn.text);
    sentences.forEach((sentence, index) => {
      aliasMap.forEach((descriptor) => {
        const match = findAliasMatch(sentence, descriptor.aliases);
        if (!match) {
          return;
        }

        // canonical matches take priority; alias matches should not duplicate.
        if (match.type === "fuzzy") {
          // Ensure we did not already produce a canonical/alias mention for this entry in the same sentence.
          const existing = mentions.find(
            (mention) =>
              mention.entityId === descriptor.entry.entityId &&
              mention.source?.sentenceIndex === index &&
              mention.source?.turnId === turn.turnId
          );
          if (existing && existing.match.type !== "fuzzy") {
            return;
          }
        }

        const matchQuality =
          match.type === "canonical" ? "canonical" : match.type === "alias" ? "alias" : "fuzzy";
        const finalConfidence = computeConfidence(matchQuality, sentence);
        if (finalConfidence < minConfidence) {
          return;
        }

        const proposedChanges =
          detectControlChanges(descriptor.entry, sentence, lexicon) ||
          detectRegionStatus(descriptor.entry, sentence) ||
          null;

        const capabilityRefs = detectCapabilityRefs(sentence, capabilityIndex);

        const mention = {
          mentionId: uuid(),
          entityId: descriptor.entry.entityId,
          entityType: descriptor.entry.entityType,
          canonicalName: descriptor.entry.canonicalName,
          match: {
            type: match.type === "canonical" ? "canonical" : match.type,
            value: match.value
          },
          confidence: finalConfidence,
          sentence,
          source: {
            sessionId: options.sessionId || null,
            sceneId: turn.sceneId || null,
            turnId: turn.turnId || null,
            speaker: turn.speaker || null,
            sentenceIndex: index
          },
          proposedChanges,
          capabilityRefs,
          context: {
            previous: sentences[index - 1] || null,
            next: sentences[index + 1] || null
          }
        };

        mentions.push(mention);
      });
    });
  });

  return {
    mentions: dedupeMentions(mentions),
    lexicon
  };
}

function dedupeMentions(mentions) {
  const seen = new Map();
  const results = [];

  mentions.forEach((mention) => {
    if (!mention.proposedChanges && mention.capabilityRefs.length === 0) {
      // drop plain mentions without actionable insight to keep queue lean.
      return;
    }

    const key = [
      mention.entityId,
      mention.source?.sessionId || "",
      mention.source?.sceneId || "",
      mention.source?.turnId || "",
      mention.source?.sentenceIndex ?? -1
    ].join(":");

    if (seen.has(key)) {
      const existing = seen.get(key);
      if (mention.confidence > existing.confidence) {
        seen.set(key, mention);
      }
      return;
    }

    seen.set(key, mention);
    results.push(mention);
  });

  return results;
}

module.exports = {
  extractEntities
};
