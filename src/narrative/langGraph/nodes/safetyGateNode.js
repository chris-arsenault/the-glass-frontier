"use strict";

const SAFETY_KEYWORDS = [
  { pattern: /\b(time\s?travel|rewrite\s+history|undo\s+events)\b/i, flag: "prohibited-capability", severity: "critical" },
  { pattern: /\b(mind\s?control|enslave|dominate)\b/i, flag: "prohibited-capability", severity: "critical" },
  { pattern: /\b(mass\s+casualty|planetary\s+strike|extinction)\b/i, flag: "content-warning", severity: "high" },
  { pattern: /\b(blood|gore|torture)\b/i, flag: "content-warning", severity: "medium" },
  { pattern: /\b(overdose|self-harm)\b/i, flag: "consent-required", severity: "high" }
];

function detectSafetyFlags(text) {
  if (!text) {
    return [];
  }

  return SAFETY_KEYWORDS.filter((entry) => entry.pattern.test(text)).map((entry) => ({
    id: entry.flag,
    severity: entry.severity
  }));
}

const safetyGateNode = {
  id: "safety-gate",
  execute(context) {
    const intentText = context.intent?.text || "";
    const detected = detectSafetyFlags(intentText);
    const escalate = detected.some((entry) => entry.severity === "critical" || entry.severity === "high");

    const safety = {
      flags: detected.map((entry) => entry.id),
      severity: detected.reduce((max, entry) => {
        const order = { low: 1, medium: 2, high: 3, critical: 4 };
        return order[entry.severity] > order[max] ? entry.severity : max;
      }, "low"),
      escalate,
      reason: escalate ? "safety_gate_triggered" : null,
      auditRef: escalate
        ? context.tools.generateAuditRef({
            sessionId: context.sessionId,
            component: "safety-gate",
            turnSequence: context.turnSequence
          })
        : null
    };

    const promptPackets = [...(context.promptPackets || []), { type: "safety-gate", prompt: JSON.stringify(safety) }];

    return {
      ...context,
      safety,
      promptPackets
    };
  }
};

module.exports = {
  safetyGateNode
};
