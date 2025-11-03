/** @jest-environment jsdom */

const React = require("react");
const { render, screen, fireEvent, act } = require("@testing-library/react");
const { AccountContext } = require("../../client/src/context/AccountContext.jsx");
const { AccountGate } = require("../../client/src/components/AccountGate.jsx");
const { SessionDashboard } = require("../../client/src/components/SessionDashboard.jsx");
const { SessionWorkspace } = require("../../client/src/App.jsx");

jest.mock("../../client/src/hooks/useSessionConnection.js", () => {
  const actual = jest.requireActual("../../client/src/hooks/useSessionConnection.js");
  return {
    ...actual,
    useSessionConnection: jest.fn(() => ({
      sessionId: "demo-session",
      connectionState: actual.SessionConnectionStates.READY,
      messages: [],
      markers: [],
      transportError: null,
      sendPlayerMessage: jest.fn(),
      isSending: false,
      overlay: {
        revision: 1,
        character: { name: "Avery Glass", stats: {} },
        inventory: [],
        momentum: { current: 0 }
      },
      activeCheck: null,
      recentChecks: [],
      lastPlayerControl: null,
      sendPlayerControl: jest.fn(),
      isSendingControl: false,
      controlError: null,
      queuedIntents: [],
      isOffline: false,
      flushQueuedIntents: jest.fn(),
      hubCatalog: null,
      setHubCatalog: jest.fn(),
      isAdmin: false,
      adminHubId: "global",
      adminUser: "admin@example.com"
    }))
  };
});

function renderWithAccountContext(value, node) {
  return render(React.createElement(AccountContext.Provider, { value }, node));
}

describe("Account and session flows", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("AccountGate submits login credentials", () => {
    const login = jest.fn().mockResolvedValue({ ok: true });
    const requestMagicLink = jest.fn();
    renderWithAccountContext(
      {
        login,
        register: jest.fn(),
        requestMagicLink,
        authError: null,
        authLoading: false,
        flashMessage: null,
        clearFlashMessage: jest.fn()
      },
      React.createElement(AccountGate)
    );

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "pilot@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "frontier-pass" } });
    fireEvent.click(screen.getByTestId("account-submit"));

    expect(login).toHaveBeenCalledWith({
      email: "pilot@example.com",
      password: "frontier-pass"
    });
  });

  test("SessionDashboard supports resume and approval for admins", async () => {
    const resumeSession = jest.fn().mockResolvedValue({ ok: true });
    const approveSession = jest.fn().mockResolvedValue({ ok: true });
    const createSession = jest.fn().mockResolvedValue({ ok: true });
    renderWithAccountContext(
      {
        sessions: [
          {
            sessionId: "demo-session",
            title: "Glass Frontier Chronicle",
            status: "paused",
            lastActiveAt: "2025-11-05T12:00:00Z",
            momentum: { current: 1 },
            cadence: { nextDigestAt: "2025-11-06T02:00:00Z", nextBatchAt: null },
            offlinePending: false,
            requiresApproval: true
          }
        ],
        status: "authenticated",
        resumeSession,
        approveSession,
        createSession,
        refreshSessions: jest.fn(),
        isAdmin: true,
        selectedSessionId: null,
        setActiveView: jest.fn()
      },
      React.createElement(SessionDashboard)
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("resume-demo-session"));
    });
    expect(resumeSession).toHaveBeenCalledWith("demo-session");

    await act(async () => {
      fireEvent.click(screen.getByTestId("approve-demo-session"));
    });
    expect(approveSession).toHaveBeenCalledWith("demo-session");
  });

  test("SessionWorkspace hides admin navigation for non-admin accounts", () => {
    const logout = jest.fn();
    const clearFlashMessage = jest.fn();

    renderWithAccountContext(
      {
        selectedSessionId: "demo-session",
        account: { displayName: "Runner", roles: ["player"] },
        token: "test-token",
        activeView: "session",
        setActiveView: jest.fn(),
        isAdmin: false,
        logout,
        flashMessage: null,
        clearFlashMessage
      },
      React.createElement(SessionWorkspace)
    );

    expect(screen.queryByText(/Admin Tools/i)).toBeNull();
  });
});
