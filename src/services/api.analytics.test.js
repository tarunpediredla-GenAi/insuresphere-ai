/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { djangoFetchAnalytics, djangoApiClient } from './api.js';

describe('Executive Dashboard & Actuarial Analytics Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches portfolio analytics from Django DRF GET /dashboard/analytics/', async () => {
    const mockAnalytics = {
      totalCustomers: 14,
      activeCustomers: 12,
      activePolicies: 28,
      totalClaims: 18,
      pendingClaims: 3,
      approvedClaims: 12,
      rejectedClaims: 3,
      totalPremiumRevenue: 4850000.0,
      totalClaimsVolume: 1940000.0,
      totalReinsuranceRecoveries: 620000.0,
      lossRatio: 40.0,
      activeTreatiesCount: 3,
      portfolioByLob: [
        { line_of_business: 'Commercial Property', policies: 14, premium: 2500000.0 },
      ],
    };

    const getSpy = vi.spyOn(djangoApiClient, 'get').mockResolvedValueOnce({
      data: mockAnalytics,
    });

    const data = await djangoFetchAnalytics();
    expect(getSpy).toHaveBeenCalledWith('/dashboard/analytics/', undefined);
    expect(data.totalPremiumRevenue).toBe(4850000.0);
    expect(data.totalClaimsVolume).toBe(1940000.0);
    expect(data.lossRatio).toBe(40.0);
    expect(data.totalReinsuranceRecoveries).toBe(620000.0);
  });

  it('supports date range query filtering in GET /dashboard/analytics/', async () => {
    const mockAnalytics = {
      totalCustomers: 5,
      activeCustomers: 5,
      activePolicies: 8,
      totalClaims: 4,
      pendingClaims: 1,
      approvedClaims: 3,
      rejectedClaims: 0,
      totalPremiumRevenue: 1200000.0,
      totalClaimsVolume: 300000.0,
      totalReinsuranceRecoveries: 120000.0,
      lossRatio: 25.0,
      activeTreatiesCount: 2,
      portfolioByLob: [],
    };

    const getSpy = vi.spyOn(djangoApiClient, 'get').mockResolvedValueOnce({
      data: mockAnalytics,
    });

    const data = await djangoFetchAnalytics({ startDate: '2026-01-01', endDate: '2026-06-30' });
    expect(getSpy).toHaveBeenCalledWith('/dashboard/analytics/', {
      params: { start_date: '2026-01-01', end_date: '2026-06-30' },
    });
    expect(data.lossRatio).toBe(25.0);
    expect(data.totalClaims).toBe(4);
  });

  it('handles zero-division safely when total premium revenue is 0', async () => {
    const mockZero = {
      totalCustomers: 1,
      activeCustomers: 1,
      activePolicies: 0,
      totalClaims: 1,
      pendingClaims: 1,
      approvedClaims: 0,
      rejectedClaims: 0,
      totalPremiumRevenue: 0.0,
      totalClaimsVolume: 50000.0,
      totalReinsuranceRecoveries: 0.0,
      lossRatio: 0.0,
      activeTreatiesCount: 0,
      portfolioByLob: [],
    };

    vi.spyOn(djangoApiClient, 'get').mockResolvedValueOnce({ data: mockZero });
    const data = await djangoFetchAnalytics();
    expect(data.totalPremiumRevenue).toBe(0.0);
    expect(data.lossRatio).toBe(0.0);
  });

  it('rejects with HTTP 403 Forbidden when customer role is unauthorized', async () => {
    vi.spyOn(djangoApiClient, 'get').mockRejectedValueOnce({
      response: {
        status: 403,
        data: { detail: 'Access denied: Executive portfolio analytics is restricted to licensed agents and administrators.' },
      },
    });

    await expect(djangoFetchAnalytics()).rejects.toMatchObject({
      response: { status: 403 },
    });
  });
});

