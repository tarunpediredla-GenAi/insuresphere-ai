/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  getAccessToken,
  setAccessToken,
  clearAuthTokens,
  djangoRestoreSession,
  djangoLogout,
  djangoApiClient,
} from './api.js';
import axios from 'axios';

describe('Authentication & Session Restoration Services', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('stores access token in sessionStorage and removes any refresh token from localStorage', () => {
    localStorage.setItem('insuresphere_live_jwt_refresh', 'stale_refresh_token');
    setAccessToken('mock_access_token_123');

    expect(getAccessToken()).toBe('mock_access_token_123');
    expect(sessionStorage.getItem('insuresphere_live_jwt_access')).toBe('mock_access_token_123');
    // Ensure long-lived refresh tokens are NEVER stored or left in localStorage
    expect(localStorage.getItem('insuresphere_live_jwt_refresh')).toBeNull();
  });

  it('clears all session and local storage on clearAuthTokens', () => {
    setAccessToken('mock_token');
    clearAuthTokens();

    expect(getAccessToken()).toBe('');
    expect(sessionStorage.getItem('insuresphere_live_jwt_access')).toBeNull();
    expect(localStorage.getItem('insuresphere_live_jwt_refresh')).toBeNull();
  });

  it('restores session from valid access token', async () => {
    setAccessToken('valid_jwt_access');
    vi.spyOn(djangoApiClient, 'get').mockResolvedValueOnce({
      data: {
        id: 'user-uuid-1',
        name: 'tarun',
        email: 'tarunpediredla9966@gmail.com',
        role: 'Admin',
      },
    });

    const result = await djangoRestoreSession();
    expect(result.success).toBe(true);
    expect(result.user.name).toBe('tarun');
    expect(result.source).toBe('cached_token');
  });

  it('renews access token via HttpOnly refresh cookie if access token is missing or expired', async () => {
    // 1. First call to /auth/me/ fails with 401
    setAccessToken('expired_access_token');
    vi.spyOn(djangoApiClient, 'get')
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockResolvedValueOnce({
        data: {
          id: 'user-uuid-1',
          name: 'tarun',
          email: 'tarunpediredla9966@gmail.com',
          role: 'Admin',
        },
      });

    // 2. Token refresh post succeeds
    vi.spyOn(axios, 'post').mockResolvedValueOnce({
      data: { access: 'new_fresh_access_token' },
    });

    const result = await djangoRestoreSession();
    expect(result.success).toBe(true);
    expect(result.user.name).toBe('tarun');
    expect(result.source).toBe('cookie_refresh');
    expect(getAccessToken()).toBe('new_fresh_access_token');
  });

  it('returns success: false when both access token and refresh cookie fail', async () => {
    vi.spyOn(djangoApiClient, 'get').mockRejectedValueOnce({ response: { status: 401 } });
    vi.spyOn(axios, 'post').mockRejectedValueOnce({ response: { status: 401 } });

    const result = await djangoRestoreSession();
    expect(result.success).toBe(false);
    expect(getAccessToken()).toBe('');
  });

  it('clears credentials when logging out', async () => {
    setAccessToken('active_token');
    vi.spyOn(djangoApiClient, 'post').mockResolvedValueOnce({ data: { detail: 'Logged out' } });

    await djangoLogout();
    expect(getAccessToken()).toBe('');
    expect(sessionStorage.getItem('insuresphere_live_jwt_access')).toBeNull();
    expect(localStorage.getItem('insuresphere_live_jwt_access')).toBeNull();
  });

  it('normalizes localhost/127.0.0.1 URLs to /api for same-origin proxying', async () => {
    const { getStoredDjangoUrl, setStoredDjangoUrl } = await import('./api.js');
    localStorage.setItem('insuresphere_django_api_url', 'http://127.0.0.1:8000/api');
    expect(getStoredDjangoUrl()).toBe('/api');

    localStorage.setItem('insuresphere_django_api_url', 'http://localhost:8000/api');
    expect(getStoredDjangoUrl()).toBe('/api');

    setStoredDjangoUrl('http://127.0.0.1:8000/api');
    expect(localStorage.getItem('insuresphere_django_api_url')).toBe('http://127.0.0.1:8000/api');
    expect(getStoredDjangoUrl()).toBe('/api');
  });
});
