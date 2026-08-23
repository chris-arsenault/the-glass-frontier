import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';

import { authenticatedFetch } from '../src/lib/authenticatedFetch';
import { useAuthStore } from '../src/stores/authStore';

const initialAuthState = useAuthStore.getState();
const API_URL = 'https://api.example.test/chronicle';
const REFRESH_TOKEN = 'refresh-token';
const REFRESHED_ACCESS_TOKEN = 'refreshed-access-token';

const encodeJwt = (payload: Record<string, unknown>): string => {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.`;
};

const readAuthorizationHeader = (fetchMock: Mock<typeof fetch>, call: number): string | null => {
  const request = fetchMock.mock.calls[call]?.[0];
  if (!(request instanceof Request)) {
    throw new Error('Expected authenticatedFetch to send a Request.');
  }
  return request.headers.get('Authorization');
};

afterEach(() => {
  useAuthStore.setState(initialAuthState, true);
  vi.unstubAllGlobals();
});

describe('authenticatedFetch', () => {
  it('refreshes an expired access token before sending the request', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const logout = vi.fn();
    const refreshTokens = vi.fn().mockResolvedValue({
      accessToken: REFRESHED_ACCESS_TOKEN,
      idToken: 'refreshed-id-token',
      refreshToken: REFRESH_TOKEN,
    });
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.setState({
      isAuthenticated: true,
      logout,
      refreshTokens,
      tokens: {
        accessToken: encodeJwt({ exp: 1 }),
        idToken: 'id-token',
        refreshToken: REFRESH_TOKEN,
      },
    });

    const response = await authenticatedFetch(API_URL, {
      headers: { Authorization: 'Bearer expired-access-token' },
    });

    expect(response.status).toBe(200);
    expect(refreshTokens).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(readAuthorizationHeader(fetchMock, 0)).toBe(`Bearer ${REFRESHED_ACCESS_TOKEN}`);
    expect(logout).not.toHaveBeenCalled();
  });

  it('retains the reactive refresh retry for a readable 401 response', async () => {
    const accessToken = encodeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const refreshTokens = vi.fn().mockResolvedValue({
      accessToken: REFRESHED_ACCESS_TOKEN,
      idToken: 'refreshed-id-token',
      refreshToken: REFRESH_TOKEN,
    });
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.setState({
      isAuthenticated: true,
      refreshTokens,
      tokens: {
        accessToken,
        idToken: 'id-token',
        refreshToken: REFRESH_TOKEN,
      },
    });

    const response = await authenticatedFetch(API_URL);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(readAuthorizationHeader(fetchMock, 0)).toBe(`Bearer ${accessToken}`);
    expect(readAuthorizationHeader(fetchMock, 1)).toBe(`Bearer ${REFRESHED_ACCESS_TOKEN}`);
  });

  it('logs out without sending an expired token when refresh fails', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const logout = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.setState({
      isAuthenticated: true,
      logout,
      refreshTokens: vi.fn().mockResolvedValue(null),
      tokens: {
        accessToken: encodeJwt({ exp: 1 }),
        idToken: 'id-token',
        refreshToken: REFRESH_TOKEN,
      },
    });

    await expect(authenticatedFetch(API_URL)).rejects.toThrow(
      'Session expired. Please sign in again.'
    );
    expect(logout).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
