/** @jest-environment jsdom */

const React = require("react");
const { render, screen, fireEvent, waitFor } = require("@testing-library/react");
const { SessionProvider } = require("../../client/src/context/SessionContext.jsx");
const { ChatCanvas } = require("../../client/src/components/ChatCanvas.jsx");
const { ChatComposer } = require("../../client/src/components/ChatComposer.jsx");
const { SessionMarkerRibbon } = require("../../client/src/components/SessionMarkerRibbon.jsx");
const { OverlayDock } = require("../../client/src/components/OverlayDock.jsx");
const {
  SessionConnectionStates
} = require("../../client/src/hooks/useSessionConnection.js");

function renderWithSession(value, node) {
  return render(React.createElement(SessionProvider, { value }, node));
}

function buildSessionValue(overrides = {}) {
  return {
    sessionId: "test-session",
    connectionState: SessionConnectionStates.CONNECTING,
    messages: [],
    markers: [],
    transportError: null,
    sendPlayerMessage: jest.fn().mockResolvedValue(undefined),
    isSending: false,
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
      markers: [{ id: "m2", marker: "momentum-state", value: 1 }]
    });

    renderWithSession(session, React.createElement(OverlayDock));

    expect(screen.getByTestId("overlay-dock")).toBeInTheDocument();
    expect(screen.getByText("Character Sheet")).toBeInTheDocument();
    expect(screen.getByTestId("overlay-momentum")).toHaveTextContent("1");
  });
});

