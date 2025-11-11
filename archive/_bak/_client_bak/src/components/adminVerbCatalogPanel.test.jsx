/** @jest-environment jsdom */

import React from "react";
import { render, screen, fireEvent, waitFor  } from "@testing-library/react.js";
import { SessionProvider  } from "../../client/src/context/SessionContext.jsx.js";
import { AdminVerbCatalogPanel  } from "../../client/src/components/AdminVerbCatalogPanel.jsx.js";
import { SessionConnectionStates
 } from "../../client/src/hooks/useSessionConnection.js.js";

function renderPanel({ isAdmin = true, initialCatalog = null } = {}) {
  const Wrapper = ({ children }) => {
    const [catalog, setCatalog] = React.useState(initialCatalog);
    const value = {
      sessionId: "test-session",
      connectionState: SessionConnectionStates.READY,
      messages: [],
      markers: [],
      transportError: null,
      sendPlayerMessage: jest.fn(),
      isSending: false,
      overlay: {},
      activeCheck: null,
      recentChecks: [],
      lastPlayerControl: null,
      sendPlayerControl: jest.fn(),
      isSendingControl: false,
      controlError: null,
      queuedIntents: [],
      isOffline: false,
      flushQueuedIntents: jest.fn(),
      hubCatalog: catalog,
      setHubCatalog: setCatalog,
      isAdmin,
      adminHubId: "global",
      adminUser: "admin@example.com"
    };

    return React.createElement(SessionProvider, { value }, children);
  };

  return render(
    React.createElement(Wrapper, null, React.createElement(AdminVerbCatalogPanel))
  );
}

function createCatalog(overrides = {}) {
  return {
    versionStamp: "1:1730727600",
    verbs: [
      {
        hubId: null,
        verbId: "verb.signal",
        version: 1,
        status: "draft",
        updatedAt: "2025-11-04T12:00:00Z",
        auditRef: "draft",
        definition: {
          verbId: "verb.signal",
          label: "Signal",
          narrative: { escalation: "auto" },
          rateLimit: { burst: 1, perSeconds: 10, scope: "actor" }
        }
      }
    ],
    ...overrides
  };
}

describe("AdminVerbCatalogPanel", () => {
  let originalFetch;
  let originalEventSource;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalEventSource = global.EventSource;

    const mockEventSource = function () {
      this.addEventListener = jest.fn();
      this.removeEventListener = jest.fn();
      this.close = jest.fn();
    };

    global.fetch = jest.fn();
    global.EventSource = mockEventSource;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.EventSource = originalEventSource;
    jest.resetAllMocks();
  });

  test("loads catalog on mount and renders verbs", async () => {
    const responseCatalog = createCatalog();
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => responseCatalog
    });

    renderPanel();

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("verb.signal")).toBeInTheDocument());

    expect(screen.getByText("Hub Verb Catalog")).toBeInTheDocument();
    expect(screen.getByText("Version 1:1730727600")).toBeInTheDocument();
    expect(screen.getByText("draft")).toBeInTheDocument();
  });

  test("publishes a verb and refreshes the table", async () => {
    const initialCatalog = createCatalog();
    const publishedCatalog = createCatalog({
      versionStamp: "2:1730728600",
      verbs: [
        {
          ...initialCatalog.verbs[0],
          status: "active",
          version: 2
        }
      ]
    });

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => initialCatalog
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => publishedCatalog
      });

    renderPanel();

    await waitFor(() => expect(screen.getByText("verb.signal")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Publish"));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));

    const [, publishCall] = global.fetch.mock.calls;
    expect(publishCall[0]).toContain("/admin/hubs/global/verbs/verb.signal/publish");
    expect(publishCall[1].method).toBe("POST");

    await waitFor(() => expect(screen.getByText("active")).toBeInTheDocument());
    expect(screen.getByText("Version 2:1730728600")).toBeInTheDocument();
  });
});
