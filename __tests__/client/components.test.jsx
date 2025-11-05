/** @jest-environment jsdom */

const React = require("react");
const { render, screen, fireEvent, waitFor, within } = require("@testing-library/react");
const { SessionProvider } = require("../../client/src/context/SessionContext.jsx");
const { AccountContext } = require("../../client/src/context/AccountContext.jsx");
const { ChatCanvas } = require("../../client/src/components/ChatCanvas.jsx");
const { ChatComposer } = require("../../client/src/components/ChatComposer.jsx");
const { SessionMarkerRibbon } = require("../../client/src/components/SessionMarkerRibbon.jsx");
const { OverlayDock } = require("../../client/src/components/OverlayDock.jsx");
const { CheckOverlay } = require("../../client/src/components/CheckOverlay.jsx");
const { ModerationCadenceStrip } = require("../../client/src/components/ModerationCadenceStrip.jsx");
const {
  SessionConnectionStates
} = require("../../client/src/hooks/useSessionConnection.js");

function renderWithSession(value, node, accountOverrides = {}) {
  const accountValue = {
    isAdmin: false,
    sessions: [],
    status: "authenticated",
    ...accountOverrides
  };

  return render(
    React.createElement(
      AccountContext.Provider,
      { value: accountValue },
      React.createElement(SessionProvider, { value }, node)
    )
  );
}

function buildSessionValue(overrides = {}) {
  const defaultOverlay = {
    revision: 1,
    character: {
      name: "Avery Glass",
      pronouns: "they/them",
      archetype: "Wayfarer",
      background: "Former archivist tracking lost frontier tech.",
      stats: {
        ingenuity: 1,
        resolve: 1,
        finesse: 2,
        presence: 1,
        weird: 0,
        grit: 1
      },
      tags: ["region.auric-steppe"]
    },
    inventory: [
      { id: "compass", name: "Glass Frontier Compass", tags: ["narrative-anchor"] }
    ],
    relationships: [
      { id: "ally-1", name: "Prismwell Kite Guild", status: "trusted", bond: 2 }
    ],
    capabilityReferences: [],
    momentum: {
      current: 0,
      baseline: 0,
      floor: -2,
      ceiling: 3,
      history: []
    },
    pendingOfflineReconcile: false,
    lastSyncedAt: new Date().toISOString()
  };

  return {
    sessionId: "test-session",
    connectionState: SessionConnectionStates.CONNECTING,
    messages: [],
    markers: [],
    transportError: null,
    sendPlayerMessage: jest.fn().mockResolvedValue(undefined),
    isSending: false,
    overlay: defaultOverlay,
    activeCheck: null,
    recentChecks: [],
    lastPlayerControl: null,
    sendPlayerControl: jest.fn().mockResolvedValue(undefined),
    isSendingControl: false,
    controlError: null,
    queuedIntents: [],
    isOffline: false,
    flushQueuedIntents: jest.fn().mockResolvedValue(undefined),
    hubCatalog: null,
    setHubCatalog: jest.fn(),
    isAdmin: false,
    adminHubId: "global",
    adminUser: "admin@test",
    pipelinePreferences: {
      filter: "all",
      timelineExpanded: false,
      acknowledged: []
    },
    setPipelineFilter: jest.fn(),
    togglePipelineTimeline: jest.fn(),
    acknowledgePipelineAlert: jest.fn(),
    hubState: {
      hubId: null,
      roomId: null,
      version: 0,
      state: {},
      contests: []
    },
    hubContests: [],
    ...overrides
  };
}

describe("Client shell components", () => {
  test("ChatCanvas shows placeholder when no messages are available", () => {
    const session = buildSessionValue();
    renderWithSession(session, React.createElement(ChatCanvas));

    expect(screen.getByTestId("chat-empty")).toBeInTheDocument();
    expect(screen.getByTestId("chat-status")).toHaveTextContent("Connecting to session");
  });

  test("ChatCanvas renders incoming narrative messages with metadata", () => {
    const session = buildSessionValue({
      connectionState: SessionConnectionStates.READY,
      messages: [
        {
          id: "turn-1",
          role: "gm",
          content: "The relay hall hums with latent power.",
          metadata: { timestamp: "2025-11-02T12:00:00.000Z" }
        }
      ]
    });

    renderWithSession(session, React.createElement(ChatCanvas));

    expect(screen.getByText("The relay hall hums with latent power.")).toBeInTheDocument();
    expect(screen.getByTestId("chat-status")).toHaveTextContent("Live session connection established");
  });

  test("ChatComposer dispatches player intents through the session provider", async () => {
    const sendPlayerMessage = jest.fn().mockResolvedValue(undefined);
    const session = buildSessionValue({
      sendPlayerMessage
    });

    renderWithSession(session, React.createElement(ChatComposer));

    const textarea = screen.getByTestId("chat-input");
    fireEvent.change(textarea, { target: { value: "Push deeper into the relay hall." } });
    fireEvent.click(screen.getByTestId("chat-submit"));

    await waitFor(() => expect(sendPlayerMessage).toHaveBeenCalledTimes(1));
    expect(sendPlayerMessage).toHaveBeenCalledWith({
      content: "Push deeper into the relay hall."
    });
    expect(textarea).toHaveValue("");
  });

  test("ChatComposer surfaces offline queue indicators", () => {
    const session = buildSessionValue({
      isOffline: true,
      queuedIntents: [{ id: 1, payload: { content: "Scout ahead" }, createdAt: Date.now() }]
    });

    renderWithSession(session, React.createElement(ChatComposer));

    expect(screen.getByTestId("chat-offline-banner")).toHaveTextContent("Connection degraded");
    expect(screen.getByTestId("chat-submit")).toHaveTextContent(/Queue Intent/i);
  });

  test("SessionMarkerRibbon lists recent markers for pacing transparency", () => {
    const session = buildSessionValue({
      markers: [
        { id: "m1", marker: "narrative-beat" },
        { id: "m2", marker: "momentum-state", value: 2 }
      ]
    });

    renderWithSession(session, React.createElement(SessionMarkerRibbon));

    expect(screen.getByTestId("session-marker-ribbon")).toBeInTheDocument();
    expect(screen.getByText("Pacing Ribbon")).toBeInTheDocument();
    expect(screen.getByText("Narrative beat")).toBeInTheDocument();
    expect(screen.getByText("Momentum state: 2")).toBeInTheDocument();
  });

  test("OverlayDock reflects fallback status and momentum markers", () => {
    const session = buildSessionValue({
      connectionState: SessionConnectionStates.FALLBACK,
      overlay: {
        revision: 2,
        character: {
          name: "Avery Glass",
          pronouns: "they/them",
          archetype: "Wayfarer",
          background: "Former archivist tracking lost frontier tech.",
          stats: { grit: 2 }
        },
        inventory: [{ id: "relay-kit", name: "Relay Stabilisation Kit", tags: ["utility"] }],
        momentum: {
          current: 1,
          baseline: 0,
          floor: -2,
          ceiling: 3,
          history: []
        },
        pendingOfflineReconcile: true,
        lastSyncedAt: new Date().toISOString()
      }
    });

    renderWithSession(session, React.createElement(OverlayDock));

    expect(screen.getByTestId("overlay-dock")).toBeInTheDocument();
    expect(screen.getByText("Character Sheet")).toBeInTheDocument();
    expect(screen.getByTestId("overlay-momentum")).toHaveTextContent("1");
    expect(screen.getByText("Offline mode")).toBeInTheDocument();
    expect(screen.getByText("Offline changes pending sync.")).toBeInTheDocument();
  });

  test("OverlayDock indicates queued intents during offline mode", () => {
    const session = buildSessionValue({
      connectionState: SessionConnectionStates.READY,
      queuedIntents: [
        { id: 1, payload: { content: "Hold position" }, createdAt: Date.now() }
      ],
      isOffline: false,
      overlay: {
        revision: 3,
        character: {
          name: "Avery Glass",
          pronouns: "they/them",
          archetype: "Wayfarer",
          background: "Former archivist tracking lost frontier tech.",
          stats: { grit: 2 }
        },
        inventory: [{ id: "relay-kit", name: "Relay Stabilisation Kit", tags: ["utility"] }],
        momentum: {
          current: 1,
          baseline: 0,
          floor: -2,
          ceiling: 3,
          history: []
        },
        pendingOfflineReconcile: true,
        lastSyncedAt: new Date().toISOString()
      }
    });

    renderWithSession(session, React.createElement(OverlayDock));

    expect(screen.getByText(/Offline queue \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Offline changes pending sync \(1 intent queued\)/i)).toBeInTheDocument();
  });

  test("OverlayDock renders character traits and relationships", () => {
    const session = buildSessionValue({
      overlay: {
        revision: 4,
        character: {
          name: "Avery Glass",
          pronouns: "they/them",
          archetype: "Wayfarer Archivist",
          background: "Custodian scout cataloguing resonance anomalies.",
          stats: { ingenuity: 2 },
          tags: ["region.auric-steppe", "faction.prismwell-kite-guild"]
        },
        inventory: [],
        relationships: [
          { id: "ally", name: "Prismwell Kite Guild", status: "trusted", bond: 3 }
        ],
        momentum: {
          current: 1,
          baseline: 0,
          floor: -2,
          ceiling: 3,
          history: []
        },
        pendingOfflineReconcile: false,
        lastSyncedAt: new Date().toISOString()
      }
    });

    renderWithSession(session, React.createElement(OverlayDock));

    expect(screen.getByText("region.auric-steppe")).toBeInTheDocument();
    expect(screen.getByText("Prismwell Kite Guild")).toBeInTheDocument();
    expect(screen.getByText(/Bond 3/)).toBeInTheDocument();
  });

  test("OverlayDock surfaces admin pipeline status overview", () => {
    const setPipelineFilter = jest.fn();
    const togglePipelineTimeline = jest.fn();
    const acknowledgePipelineAlert = jest.fn();
    const session = buildSessionValue({
      isAdmin: true,
      sessionPendingOffline: true,
      sessionOfflineJob: {
        jobId: "job-123",
        status: "processing",
        enqueuedAt: "2025-11-04T10:00:00.000Z",
        startedAt: "2025-11-04T10:01:00.000Z",
        durationMs: null,
        attempts: 1,
        error: null
      },
      sessionOfflineHistory: [
        {
          jobId: "job-119",
          status: "failed",
          at: "2025-11-03T21:45:00.000Z",
          durationMs: 36000,
          message: "Upstream outage"
        },
        {
          jobId: "job-120",
          status: "completed",
          at: "2025-11-03T22:00:00.000Z",
          durationMs: 42000
        }
      ],
      sessionOfflineLastRun: {
        status: "completed",
        jobId: "job-120",
        completedAt: "2025-11-03T22:00:00.000Z",
        durationMs: 42000,
        summaryVersion: 3,
        deltaCount: 5,
        mentionCount: 12
      },
      sessionAdminAlerts: [
        {
          severity: "high",
          reason: "offline.workflow_sla_exceeded",
          message: "Workflow exceeded SLA",
          at: "2025-11-03T22:05:00.000Z"
        },
        {
          severity: "medium",
          reason: "debug.seed.admin_alert",
          message: "Seeded admin alert (debug)",
          at: "2025-11-03T22:06:00.000Z",
          isSeeded: true,
          isDebug: true,
          data: {
            fallback: true,
            seedSource: "langgraph-smoke"
          }
        }
      ],
      pipelinePreferences: {
        filter: "all",
        timelineExpanded: false,
        acknowledged: []
      },
      setPipelineFilter,
      togglePipelineTimeline,
      acknowledgePipelineAlert
    });

    const accountSessions = [
      { sessionId: "demo", requiresApproval: true },
      { sessionId: "runner", requiresApproval: true }
    ];

    renderWithSession(
      session,
      React.createElement(OverlayDock),
      {
        isAdmin: true,
        sessions: accountSessions
      }
    );

    expect(screen.getByTestId("overlay-pipeline")).toBeInTheDocument();
    expect(screen.getByText(/Moderation queue: 2/)).toBeInTheDocument();
    expect(screen.getByText(/Processing • Job job-123/i)).toBeInTheDocument();
    expect(screen.getByText(/Workflow exceeded SLA/)).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-alert-seeded")).toHaveTextContent(/Seeded fallback/i);
    expect(
      screen.getByText((content) => typeof content === "string" && content.includes("Source: langgraph-smoke"))
    ).toBeInTheDocument();
    expect(screen.queryByTestId("overlay-contest-timeline")).not.toBeInTheDocument();

    const storyStage = screen.getByTestId("pipeline-stage-story");
    expect(within(storyStage).getByText(/Story Consolidation/i)).toBeInTheDocument();
    expect(within(storyStage).getByText(/Processing current transcript/i)).toBeInTheDocument();
    const deltaStage = screen.getByTestId("pipeline-stage-delta");
    expect(within(deltaStage).getByText(/Generating contest deltas/i)).toBeInTheDocument();
    const publishStage = screen.getByTestId("pipeline-stage-publish");
    expect(within(publishStage).getByText(/Scheduling publishing batch/i)).toBeInTheDocument();

    const detailsToggle = screen.getByTestId("pipeline-details-toggle");
    fireEvent.click(detailsToggle);
    expect(screen.getByText(/Latest run/)).toBeInTheDocument();

    const alertsFilter = screen.getByTestId("pipeline-filter-alerts");
    fireEvent.click(alertsFilter);
    expect(setPipelineFilter).toHaveBeenCalledWith("alerts");

    const timelineToggle = screen.getByTestId("pipeline-timeline-toggle");
    fireEvent.click(timelineToggle);
    expect(togglePipelineTimeline).toHaveBeenCalledTimes(1);

    const acknowledgeButton = screen.getByTestId("pipeline-ack-0");
    fireEvent.click(acknowledgeButton);
    expect(acknowledgePipelineAlert).toHaveBeenCalledTimes(1);
  });

  test("OverlayDock renders contest timeline with sentiment controls", async () => {
    const fetchWithAuth = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        cooldown: {
          frustrationLevel: "elevated",
          frustrationRatio: 0.4,
          activeSamples: 5,
          negativeDuringCooldown: 2,
          maxRemainingCooldownMs: 9000
        }
      })
    });
    const setActiveView = jest.fn();
    const setFlashMessage = jest.fn();
    const session = buildSessionValue({
      isAdmin: true,
      hubContests: [
        {
          contestId: "contest-001",
          label: "Challenge Duel",
          status: "resolved",
          resolvedAt: "2025-11-05T09:00:00.000Z",
          outcome: { tier: "success", summary: "Alpha edges out Beta." },
          rematch: { status: "cooldown", remainingMs: 6000, cooldownMs: 6000 },
          participants: [
            {
              actorId: "actor-alpha",
              role: "challenger",
              result: { summary: "Claims the initiative.", momentumDelta: 1 }
            },
            {
              actorId: "actor-beta",
              role: "defender",
              result: { summary: "Falls back cautiously.", momentumDelta: -1 }
            }
          ],
          sharedComplications: [
            { tag: "crowd", summary: "Spectators chant for a rematch." }
          ]
        }
      ],
      sessionOfflineHistory: [],
      sessionAdminAlerts: [],
      pipelinePreferences: {
        filter: "all",
        timelineExpanded: false,
        acknowledged: []
      }
    });

    renderWithSession(
      session,
      React.createElement(OverlayDock),
      {
        isAdmin: true,
        fetchWithAuth,
        setActiveView,
        setFlashMessage
      }
    );

    await waitFor(() => expect(fetchWithAuth).toHaveBeenCalled());

    const timelineSection = screen.getByTestId("overlay-contest-timeline");
    const timelineItem = screen.getAllByTestId("contest-timeline-item")[0];
    expect(timelineSection).toBeInTheDocument();
    expect(timelineItem).toHaveTextContent(/Challenge Duel/);
    expect(timelineItem).toHaveTextContent(/Alpha edges out Beta/i);
    expect(timelineItem).toHaveTextContent(/challenger: actor-alpha/i);
    expect(timelineItem).toHaveTextContent(/Momentum shift:\s\+1/);
    expect(timelineItem).toHaveTextContent(/#crowd/i);
    expect(timelineItem).toHaveTextContent(/Rematch cooling/i);

    const sentimentSummary = await screen.findByTestId("contest-sentiment-summary");
    expect(sentimentSummary).toHaveTextContent(/Cooldown sentiment — Elevated/i);
    expect(sentimentSummary).toHaveTextContent(/40% negative \(2\/5\)/i);
    expect(sentimentSummary).toHaveTextContent(/Longest cooldown 9s/i);

    const moderationButton = screen.getByTestId("contest-moderation-open");
    fireEvent.click(moderationButton);
    expect(setActiveView).toHaveBeenCalledWith("admin");
    expect(setFlashMessage).toHaveBeenCalledWith(expect.stringContaining("Opening moderation capability review"));
  });

  test("OverlayDock renders sentiment fallback when no samples are available", async () => {
    const fetchWithAuth = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        generatedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
        cooldown: {
          activeSamples: 0,
          negativeDuringCooldown: 0,
          maxRemainingCooldownMs: null,
          frustrationRatio: 0,
          frustrationLevel: "steady"
        }
      })
    });
    const session = buildSessionValue({
      isAdmin: true,
      hubContests: [],
      sessionOfflineHistory: [],
      sessionAdminAlerts: [],
      pipelinePreferences: {
        filter: "all",
        timelineExpanded: false,
        acknowledged: []
      }
    });

    renderWithSession(
      session,
      React.createElement(OverlayDock),
      {
        isAdmin: true,
        fetchWithAuth
      }
    );

    await waitFor(() => expect(fetchWithAuth).toHaveBeenCalled());

    const emptyState = await screen.findByTestId("contest-sentiment-empty");
    expect(emptyState).toHaveTextContent(/Cooldown sentiment data pending new contest completions/i);
    expect(emptyState).toHaveTextContent(/Last update/i);
    expect(screen.queryByTestId("contest-moderation-open")).not.toBeInTheDocument();
  });

  test("CheckOverlay surfaces pending and resolved check details", () => {
    const session = buildSessionValue({
      activeCheck: {
        id: "check-123",
        auditRef: "audit-1",
        data: {
          move: "analysis",
          ability: "ingenuity",
          difficulty: "controlled",
          difficultyValue: 7,
          rationale: "Player studies the data",
          flags: ["disclosure:analysis"],
          safetyFlags: [],
          momentum: 2
        }
      },
      recentChecks: [
        {
          id: "check-123",
          tier: "strong-hit",
          move: "analysis",
          difficulty: { label: "controlled", target: 7 },
          dice: {
            kept: [5, 6],
            discarded: [1],
            total: 14,
            statValue: 2,
            advantageApplied: true,
            bonusDice: 1
          },
          complication: "New insight discovered",
          auditRef: "audit-1",
          rationale: "Roll succeeds with style.",
          momentumDelta: 1,
          momentum: {
            before: 1,
            after: 2,
            delta: 1
          }
        }
      ],
      hubContests: [
        {
          contestId: "contest-42",
          contestKey: "verb.challengeDuel:actor-alpha::actor-beta",
          status: "resolving",
          label: "Challenge Duel",
          participants: [
            { actorId: "actor-alpha", role: "challenger" },
            { actorId: "actor-beta", role: "defender" }
          ]
        },
        {
          contestId: "contest-43",
          contestKey: "verb.sparringMatch:actor-alpha::actor-beta",
          status: "resolved",
          label: "Sparring Match",
          outcome: { tier: "success", summary: "Alpha edges out Beta." },
          sharedComplications: [
            { tag: "crowd-panics", summary: "Spectators gasp and shuffle back." }
          ],
          participants: [
            {
              actorId: "actor-alpha",
              role: "challenger",
              result: {
                tier: "success",
                summary: "Claims the initiative.",
                momentumDelta: 1
              }
            },
            {
              actorId: "actor-beta",
              role: "defender",
              result: {
                tier: "miss",
                summary: "Stumbles and yields ground.",
                momentumDelta: -1,
                complications: [{ tag: "bruised", summary: "Bruised pride." }]
              }
            }
          ]
        }
      ]
    });

    renderWithSession(session, React.createElement(CheckOverlay));

    expect(screen.getByTestId("overlay-check")).toBeInTheDocument();
    expect(screen.getByTestId("overlay-check-pending")).toHaveTextContent("analysis");
    expect(screen.getByTestId("overlay-check-result")).toHaveTextContent(/strong hit/i);
    expect(screen.getAllByText(/Momentum shift/).length).toBeGreaterThan(0);
    const modifierField = screen.getByText(/Modifier/i).closest("div").querySelector("dd");
    expect(modifierField).toHaveTextContent("+2");
    const advantageLabel = screen.getAllByText(/Advantage/i, { selector: "dt" })[0];
    const advantageField = advantageLabel.closest("div").querySelector("dd");
    expect(advantageField).toHaveTextContent(/Advantage/);
    const momentumInputField = screen
      .getByText(/Momentum Input/i)
      .closest("div")
      .querySelector("dd");
    expect(momentumInputField).toHaveTextContent("2");
    expect(screen.getByTestId("overlay-contest-list")).toBeInTheDocument();
    expect(
      screen.getByText((content) => content.includes("Challenge Duel"))
    ).toBeInTheDocument();
    const participantDisplays = screen.getAllByText((content) =>
      content.includes("actor-alpha") && content.includes("actor-beta")
    );
    expect(participantDisplays.length).toBeGreaterThan(0);
    expect(screen.getByText(/Outcome: Success — Alpha edges out Beta\./i)).toBeInTheDocument();
    expect(screen.getByText(/Success — Claims the initiative\./i)).toBeInTheDocument();
    expect(screen.getByText(/Miss — Stumbles and yields ground\./i)).toBeInTheDocument();
    expect(screen.getAllByText(/Momentum shift: \+1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Momentum shift: -1/).length).toBeGreaterThan(0);
    expect(screen.getByText(/#crowd-panics Spectators gasp and shuffle back\./i)).toBeInTheDocument();
    expect(screen.getByText(/#bruised Bruised pride\./i)).toBeInTheDocument();
  });

  test("CheckOverlay narrates expired contests with prompts", () => {
    const session = buildSessionValue({
      hubContests: [
        {
          contestId: null,
          contestKey: "verb.sparringMatch:actor-alpha::actor-beta",
          status: "expired",
          label: "Sparring Match",
          windowMs: 7000,
          reason: "arming_timeout",
          participants: [
            { actorId: "actor-alpha", role: "challenger" },
            { actorId: "actor-beta", role: "defender" }
          ],
          rematch: {
            status: "cooldown",
            cooldownMs: 10000,
            remainingMs: 10000,
            availableAt: 1670000000000,
            recommendedVerb: "verb.sparringMatch"
          }
        }
      ]
    });

    renderWithSession(session, React.createElement(CheckOverlay));

    const expiredPanel = screen.getByTestId("overlay-contest-expired");
    expect(expiredPanel).toHaveTextContent(/Contest expired/i);
    expect(expiredPanel).toHaveTextContent(/actor-alpha/i);
    expect(expiredPanel).toHaveTextContent(/actor-beta/i);
    expect(expiredPanel).toHaveTextContent(/unfinished business/i);
    const rematchPanel = screen.getByTestId("overlay-contest-rematch");
    expect(rematchPanel).toHaveTextContent(/Rematch cooling/i);
    expect(rematchPanel).toHaveTextContent(/Sparring Match/i);
  });

  test("SessionMarkerRibbon wrap controls dispatch player control intents", async () => {
    const sendPlayerControl = jest.fn().mockResolvedValue({
      id: "control-1",
      type: "wrap",
      turns: 2
    });

    const session = buildSessionValue({
      markers: [
        { id: "m1", marker: "wrap-soon", reason: "GM suggests wrap" },
        { id: "m2", marker: "momentum-state", value: 1 }
      ],
      sendPlayerControl
    });

    renderWithSession(session, React.createElement(SessionMarkerRibbon));

    fireEvent.click(screen.getByTestId("wrap-control-2"));

    await waitFor(() => expect(sendPlayerControl).toHaveBeenCalledWith({ type: "wrap", turns: 2 }));
  });

  test("SessionMarkerRibbon disables wrap controls when offline", () => {
    const session = buildSessionValue({
      markers: [
        { id: "m1", marker: "wrap-soon", reason: "GM suggests wrap" },
        { id: "m2", marker: "momentum-state", value: 1 }
      ],
      isOffline: true
    });

    renderWithSession(session, React.createElement(SessionMarkerRibbon));

    expect(screen.getByTestId("wrap-control-1")).toBeDisabled();
    expect(screen.getByTestId("wrap-feedback")).toHaveTextContent(/Offline mode/i);
  });

  describe("ModerationCadenceStrip", () => {
    const baseSession = {
      sessionId: "session-test",
      player: { name: "Archivist Liora" },
      queue: {
        items: [
          {
            deltaId: "delta-1",
            status: "needs-review",
            blocking: true,
            reasons: ["capability_violation"],
            deadlineAt: "2025-11-05T00:45:00.000Z"
          }
        ],
        window: {
          status: "awaiting_review",
          startAt: "2025-11-05T00:15:00.000Z",
          endAt: "2025-11-05T00:45:00.000Z",
          escalations: []
        },
        cadence: {
          nextBatchAt: "2025-11-05T01:00:00.000Z",
          nextDigestAt: "2025-11-06T02:00:00.000Z",
          batches: [
            {
              batchId: "session-test-batch-0",
              runAt: "2025-11-05T01:00:00.000Z",
              status: "scheduled"
            }
          ],
          digest: null
        }
      },
      stats: { totalAlerts: 1 },
      aggregates: { blockingGroups: [], reasonCounts: [], capabilityCounts: [] }
    };

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date("2025-11-05T00:00:00.000Z"));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test("invokes override callback with defer minutes and reason", async () => {
      const applyOverride = jest.fn().mockResolvedValue(true);
      render(
        React.createElement(ModerationCadenceStrip, {
          sessions: [baseSession],
          onApplyOverride: applyOverride
        })
      );

      const minutesInput = screen.getByTestId("moderation-cadence-override-minutes");
      const reasonInput = screen.getByTestId("moderation-cadence-override-reason");
      fireEvent.change(minutesInput, { target: { value: "90" } });
      fireEvent.change(reasonInput, { target: { value: "awaiting admin rewrite" } });
      fireEvent.click(screen.getByTestId("moderation-cadence-override-submit"));

      await waitFor(() => expect(applyOverride).toHaveBeenCalledTimes(1));
      expect(applyOverride).toHaveBeenCalledWith("session-test", {
        deferByMinutes: 90,
        reason: "awaiting admin rewrite"
      });
    });

    test("shows validation message when override fails", async () => {
      const applyOverride = jest.fn().mockRejectedValue(new Error("publishing_override_failed"));
      render(
        React.createElement(ModerationCadenceStrip, {
          sessions: [baseSession],
          onApplyOverride: applyOverride
        })
      );

      fireEvent.change(screen.getByTestId("moderation-cadence-override-minutes"), {
        target: { value: "45" }
      });
      fireEvent.click(screen.getByTestId("moderation-cadence-override-submit"));

      await waitFor(() =>
        expect(screen.getByText(/Failed to apply cadence override/i)).toBeInTheDocument()
      );
      expect(applyOverride).toHaveBeenCalledTimes(1);
    });
  });
});
