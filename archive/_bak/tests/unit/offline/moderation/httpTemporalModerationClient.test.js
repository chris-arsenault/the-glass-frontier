"use strict";

import { HttpTemporalModerationClient
 } from "../../../../_src_bak/offline/moderation/httpTemporalModerationClient.js";

describe("offline/moderation/httpTemporalModerationClient", () => {
  it("posts cadence snapshots with expected headers", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => ""
    });

    const client = new HttpTemporalModerationClient({
      endpoint: "https://temporal.example.com/moderation",
      token: "transport-token",
      sharedTransportKey: "shared-key",
      channel: "temporal:moderation",
      fetchImpl: fetchMock
    });

    await client.syncCadenceSnapshot({
      sessionId: "session-1234",
      queue: { pendingCount: 2 },
      timestamp: "2025-11-04T17:10:00.000Z"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://temporal.example.com/moderation",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer transport-token",
          "x-shared-transport-key": "shared-key",
          "x-shared-transport-channel": "temporal:moderation",
          "x-session-id": "session-1234",
          "content-type": "application/json"
        })
      })
    );

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload).toEqual({
      sessionId: "session-1234",
      timestamp: "2025-11-04T17:10:00.000Z",
      queue: { pendingCount: 2 }
    });
  });

  it("throws when Temporal endpoint responds with error", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
      text: async () => "failure"
    });

    const client = new HttpTemporalModerationClient({
      endpoint: "https://temporal.example.com/moderation",
      fetchImpl: fetchMock
    });

    await expect(
      client.syncCadenceSnapshot({
        sessionId: "session-error",
        queue: { pendingCount: 0 }
      })
    ).rejects.toMatchObject({
      code: "temporal_moderation_sync_failed",
      status: 500
    });
  });
});
