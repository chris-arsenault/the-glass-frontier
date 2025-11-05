"use strict";

const POSITIVE_PATTERNS = [
  /\b(gg|nice|great|good|cool|rad|hype|excited|pumped|ready|fun|awesome|let's go)\b/i,
  /\b(thrilled|stoked|enjoy|love)\b/i
];

const NEGATIVE_PATTERNS = [
  /\b(frustrated|frustrating|annoyed|annoying|angry|mad|irritating|ugh|sucks|lame|bored|boring|rough)\b/i,
  /\b(drag|dragging|spammy|spam|tired|fatigued|upset|disappointing)\b/i,
  /\b(meh|bleh)\b/i
];

function countMatches(patterns, text) {
  return patterns.reduce((total, pattern) => {
    if (!pattern) {
      return total;
    }
    return pattern.test(text) ? total + 1 : total;
  }, 0);
}

function classifySentiment(text) {
  if (!text || typeof text !== "string") {
    return "neutral";
  }
  const normalized = text.toLowerCase();
  const positive = countMatches(POSITIVE_PATTERNS, normalized);
  const negative = countMatches(NEGATIVE_PATTERNS, normalized);

  if (positive === 0 && negative === 0) {
    return "neutral";
  }

  if (positive > negative) {
    return "positive";
  }

  if (negative > positive) {
    return "negative";
  }

  return "neutral";
}

function inferTone(text) {
  if (!text || typeof text !== "string") {
    return "neutral";
  }

  const normalized = text.toLowerCase();

  if (/\b(attack|strike|charge|brawl|smash|fight)\b/.test(normalized)) {
    return "aggressive";
  }
  if (/\b(sneak|slip|quietly|hide|shadow|stealth)\b/.test(normalized)) {
    return "stealth";
  }
  if (/\b(parley|negotiate|talk|appeal|diplomacy|peace)\b/.test(normalized)) {
    return "diplomatic";
  }
  if (/\b(joke|joking|laugh|banter|tease|wink|play|playful|funny|hilarious)\b/.test(normalized)) {
    return "playful";
  }

  return "narrative";
}

module.exports = {
  classifySentiment,
  inferTone
};
