"use strict";

import { SessionMemoryFacade  } from "../../memory/sessionMemory.js";
import { CheckBus  } from "../../events/checkBus.js";
import { NarrativeEngine  } from "../narrativeEngine.js";
import { CheckRunner  } from "../../checkRunner/checkRunner.js";
import { SessionClosureCoordinator  } from "../../offline/sessionClosureCoordinator.js";
import { ClosureWorkflowOrchestrator  } from "../../offline/closureWorkflowOrchestrator.js";
import { SessionTelemetry  } from "../langGraph/telemetry.js";

const DEFAULT_VERTICAL_SLICE_SCRIPT = [
  {
    content: "I sneak across the relay scaffolds and risk a roll to outflank the sentries.",
    metadata: { turnHint: "stealth-advance" }
  },
  {
    content: "I broadcast our momentum to rally the Prismwell guild before the next move.",
    metadata: { turnHint: "rally-call" }
  },
  {
    content: "I hack the signal lattice to expose a hidden countermeasure and attempt a roll.",
    metadata: { turnHint: "signal-hack" }
  },
  {
    content:
      "I rewrite history so the collapse never happened, bending time despite the prohibitions.",
    metadata: { turnHint: "prohibited-action" }
  }
];

function createSequentialRandomizer(sequences) {
  const queue = Array.isArray(sequences) && sequences.length > 0 ? sequences.map((seq) => [...seq]) : [];
  return (_seed, count) => {
    if (queue.length === 0) {
      return Array.from({ length: count }, () => 3);
    }
    const next = queue.shift();
    if (next.length >= count) {
      return next.slice(0, count);
    }
    const padded = next.slice();
    while (padded.length < count) {
      padded.push(padded[padded.length - 1] || 3);
    }
    return padded;
  };
}

function delay(ms) {
  return new Promise((resolve) => {
    if (ms <= 0) {
      setImmediate(resolve);
      return;
    }
    setTimeout(resolve, ms);
  });
}

async function waitFor(predicate, options = {}) {
  const attempts = options.attempts || 50;
  const interval = options.delayMs || 5;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await predicate(); // eslint-disable-line no-await-in-loop
    if (result) {
      return result;
    }
    // eslint-disable-next-line no-await-in-loop
    await delay(interval);
  }

  throw new Error("Predicate did not resolve within allotted attempts");
}

async function runVerticalSliceScenario(options = {}) {
  const sessionId = options.sessionId || `session-vertical-${Date.now()}`;
  const playerId = options.playerId || "player-vertical";
  const script = Array.isArray(options.script) && options.script.length > 0 ? options.script : DEFAULT_VERTICAL_SLICE_SCRIPT;
  const telemetry = options.telemetry || new SessionTelemetry();

  const sessionMemory = options.sessionMemory || new SessionMemoryFacade();
  const checkBus = options.checkBus || new CheckBus();
  const narrativeEngine = new NarrativeEngine({ sessionMemory, checkBus, telemetry });

  const randomizer =
    typeof options.randomizer === "function"
      ? options.randomizer
      : createSequentialRandomizer([
          [6, 5, 4],
          [2, 1, 1]
        ]);

  const checkRunner = new CheckRunner({
    checkBus,
    sessionMemory,
    telemetry: options.checkMetrics,
    randomizer
  });
  checkRunner.start();

  const coordinator =
    options.coordinator ||
    new SessionClosureCoordinator({
      publisher: options.publisher || {
        publish() {}
      }
    });

  const orchestrator =
    options.orchestrator ||
    new ClosureWorkflowOrchestrator({
      coordinator,
      sessionMemory,
      checkBus
    });

  const orchestratorManaged = !options.orchestrator;
  if (orchestratorManaged) {
    orchestrator.start();
  }

  const checkResolutions = [];
  const vetoEvents = [];
  const adminAlerts = [];

  checkBus.onCheckResolved((envelope) => checkResolutions.push(envelope));
  checkBus.onCheckVetoed((envelope) => vetoEvents.push(envelope));
  checkBus.onAdminAlert((envelope) => adminAlerts.push(envelope));

  for (let turnIndex = 0; turnIndex < script.length; turnIndex += 1) {
    const step = script[turnIndex];
    const playerMessage = typeof step === "string" ? step : step.content;
    const metadata = typeof step === "object" && step !== null ? step.metadata || {} : {};

    // eslint-disable-next-line no-await-in-loop
    const resolution = await narrativeEngine.handlePlayerMessage({
      sessionId,
      playerId: step.playerId || playerId,
      content: playerMessage,
      metadata
    });

    // ensure any check requests issued by the turn are processed
    // eslint-disable-next-line no-await-in-loop
    await waitFor(
      async () => sessionMemory.listPendingChecks(sessionId).length === 0,
      { attempts: 40, delayMs: 10 }
    ).catch(() => true);

    if (resolution.safety?.escalate) {
      const safetyFlags = resolution.safety.flags || [];
      const auditRef =
        resolution.safety.auditRef ||
        narrativeEngine.tools.generateAuditRef({
          sessionId,
          component: "safety-veto",
          turnSequence: turnIndex + 1
        });
      const momentumState = sessionMemory.getMomentumState(sessionId);
      const syntheticRequest = {
        id: `safety-${sessionId}-${turnIndex + 1}`,
        auditRef,
        trigger: {
          detectedMove: "safety-intercept",
          detectedMoveTags: ["safety-escalation"],
          playerUtterance: playerMessage,
          momentum: momentumState.current,
          narrativeTags: ["safety-escalation"],
          safetyFlags
        },
        mechanics: {
          checkType: "2d6+stat",
          stat: "grit",
          difficulty: "desperate",
          difficultyValue: 11,
          advantage: false,
          bonusDice: 0,
          complicationSeeds: []
        },
        recommendedNarration: "Moderation intercept prevents prohibited capability.",
        metadata: {
          synthetic: true,
          safetyFlags
        },
        data: {
          move: "safety-intercept",
          tags: ["safety-escalation"],
          difficulty: "desperate",
          difficultyValue: 11,
          ability: "grit",
          momentum: momentumState.current,
          flags: [`safety:${safetyFlags.join("|")}`],
          safetyFlags,
          playerId: step.playerId || playerId,
          mechanics: {
            stat: "grit",
            statValue: 1,
            bonusDice: 0,
            difficulty: "desperate",
            difficultyValue: 11,
            momentum: momentumState.current,
            advantage: false
          }
        }
      };

      sessionMemory.recordCheckRequest(sessionId, syntheticRequest);
      const envelope = checkBus.emitCheckRequest(sessionId, syntheticRequest);

      // eslint-disable-next-line no-await-in-loop
      await waitFor(
        () => vetoEvents.some((event) => event.id === envelope.id),
        { attempts: 40, delayMs: 10 }
      );
    }
  }

  await waitFor(
    async () => sessionMemory.listPendingChecks(sessionId).length === 0,
    { attempts: 60, delayMs: 10 }
  ).catch(() => true);

  const closureAuditRef = `vertical-slice:${sessionId}`;
  const snapshot = sessionMemory.getSessionState(sessionId);

  sessionMemory.markSessionClosed(sessionId, {
    closedAt: new Date().toISOString(),
    closedBy: "system.vertical-slice",
    reason: "vertical_slice.completed",
    auditRef: closureAuditRef
  });

  const job = coordinator.enqueueClosure({
    sessionId,
    auditRef: closureAuditRef,
    reason: "vertical_slice.completed",
    closedAt: new Date().toISOString(),
    momentum: snapshot.momentum,
    changeCursor: snapshot.changeCursor,
    lastAckCursor: snapshot.lastAckCursor,
    pendingChecks: []
  });

  await waitFor(() => {
    const current = coordinator.getJob(job.jobId);
    return current && (current.status === "completed" || current.status === "failed") ? current : null;
  }, { attempts: 120, delayMs: 25 });

  const finalJob = coordinator.getJob(job.jobId);
  const sessionState = sessionMemory.getSessionState(sessionId);

  if (orchestratorManaged) {
    orchestrator.stop();
  }

  return {
    sessionId,
    sessionMemory,
    checkBus,
    coordinator,
    orchestrator,
    closureJob: finalJob,
    resolvedChecks: checkResolutions,
    vetoedChecks: vetoEvents,
    adminAlerts,
    transcript: sessionState.transcript,
    changeFeed: sessionState.changeFeed.slice(),
    sessionState
  };
}

export {
  runVerticalSliceScenario,
  createSequentialRandomizer,
  DEFAULT_VERTICAL_SLICE_SCRIPT
};

