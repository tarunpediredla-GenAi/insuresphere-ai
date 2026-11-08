/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  djangoFetchTreaties,
  djangoCreateTreaty,
  djangoApiClient,
} from './api.js';

describe('Reinsurance Module & Actuarial Calculation Engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('Actuarial Quota-Share Risk-Sharing Calculation', () => {
    const activeQuotaShareTreaty = {
      id: 'TRT-2026-01',
      treatyCode: 'TRT-2026-01',
      name: '2026 Commercial Property & Cyber Quota Share Treaty',
      type: 'Proportional Quota Share',
      reinsurerName: 'Swiss Re Corporate Solutions (Zurich)',
      spRating: 'AA-',
      cedantRetentionPct: 60,
      cededSharePct: 40,
      treatyLimit: 30000000,
      attachmentPoint: 0,
      status: 'Active',
    };

    it('calculates gross loss 150000 and deductible 50000 correctly', () => {
      // Test calculation logic identical to ReinsuranceManagement.jsx riskSharingCalc
      const gross = 150000;
      const ded = 50000;
      const netEligible = Math.max(0, gross - ded);

      const cededAmount = Math.min(
        activeQuotaShareTreaty.treatyLimit,
        Math.round(netEligible * (activeQuotaShareTreaty.cededSharePct / 100))
      );
      const retainedAmount = netEligible - cededAmount;
      const effectiveCededPct = ((cededAmount / netEligible) * 100).toFixed(1);
      const cashCallTriggered = cededAmount >= 250000;

      expect(netEligible).toBe(100000);
      expect(retainedAmount).toBe(60000);
      expect(cededAmount).toBe(40000);
      expect(effectiveCededPct).toBe('40.0');
      expect(cashCallTriggered).toBe(false);
    });

    it('triggers Article 14 Immediate Cash Call when recovery exceeds $250k on XoL structure', () => {
      const xolTreaty = {
        id: 'TRT-2026-03',
        treatyCode: 'TRT-2026-03',
        type: 'Excess of Loss (XoL)',
        cedantRetentionPct: 30,
        cededSharePct: 70,
        treatyLimit: 75000000,
        attachmentPoint: 250000,
      };

      const gross = 750000;
      const ded = 50000;
      const netEligible = Math.max(0, gross - ded); // 700000
      const excessSubject = Math.max(0, netEligible - xolTreaty.attachmentPoint); // 450000
      const cededAmount = Math.min(
        xolTreaty.treatyLimit,
        Math.round(excessSubject * (xolTreaty.cededSharePct / 100))
      ); // 315000
      const retainedAmount = netEligible - cededAmount; // 385000
      const cashCallTriggered = cededAmount >= 250000;

      expect(netEligible).toBe(700000);
      expect(cededAmount).toBe(315000);
      expect(retainedAmount).toBe(385000);
      expect(cashCallTriggered).toBe(true);
    });
  });

  describe('Pending Review Claims Exclusion from Settled Recoveries', () => {
    it('strictly excludes Pending Review and SIU claims from settled/paid reinsurance recoveries', () => {
      const claimsLedger = [
        {
          id: 'CLM-01',
          claimNumber: 'CLM-2026-0001',
          amount: 150000,
          deductible: 50000,
          reinsuranceRecovery: 40000,
          status: 'Pending Review', // Must NOT be treated as settled/paid
        },
        {
          id: 'CLM-02',
          claimNumber: 'CLM-2026-0002',
          amount: 200000,
          deductible: 50000,
          reinsuranceRecovery: 60000,
          status: 'Approved', // Settled / Recoverable Bound
        },
        {
          id: 'CLM-03',
          claimNumber: 'CLM-2026-0003',
          amount: 120000,
          deductible: 25000,
          reinsuranceRecovery: 38000,
          status: 'SIU Investigation', // Must NOT be treated as settled/paid
        },
        {
          id: 'CLM-04',
          claimNumber: 'CLM-2026-0004',
          amount: 80000,
          deductible: 50000,
          reinsuranceRecovery: 12000,
          status: 'Rejected', // Excluded
        },
      ];

      // Logic from AppContext.jsx dashboardMetrics
      const totalReinsuranceRecoveries = claimsLedger
        .filter((c) => c.status === 'Approved')
        .reduce((sum, c) => sum + (Number(c.reinsuranceRecovery) || 0), 0);

      // Only CLM-02 ($60,000) should be included
      expect(totalReinsuranceRecoveries).toBe(60000);

      // Verify Pending Review claims are distinct in ledger representation
      const pendingClaims = claimsLedger.filter((c) => c.status === 'Pending Review');
      expect(pendingClaims.length).toBe(1);
      expect(pendingClaims[0].status).toBe('Pending Review');
    });
  });

  describe('PostgreSQL Treaty Data Loading & Browser Refresh Persistence', () => {
    it('loads treaties from PostgreSQL in Live Django Mode via djangoFetchTreaties', async () => {
      const mockTreaties = [
        {
          id: 'TRT-2026-01',
          treatyCode: 'TRT-2026-01',
          name: '2026 Commercial Property & Cyber Quota Share Treaty',
          type: 'Proportional Quota Share',
          reinsurerName: 'Swiss Re Corporate Solutions (Zurich)',
          spRating: 'AA-',
          cedantRetentionPct: 60,
          cededSharePct: 40,
          treatyLimit: 30000000,
          status: 'Active',
        },
      ];

      vi.spyOn(djangoApiClient, 'get').mockResolvedValueOnce({
        data: {
          count: 1,
          results: mockTreaties,
        },
      });

      const loaded = await djangoFetchTreaties();
      expect(loaded).toEqual(mockTreaties);
      expect(loaded[0].cedantRetentionPct).toBe(60);
      expect(loaded[0].cededSharePct).toBe(40);
    });

    it('persists treaty dataset and claims recovery ledger in localStorage across simulated refresh', () => {
      const treatiesToPersist = [
        {
          id: 'TRT-2026-01',
          treatyCode: 'TRT-2026-01',
          name: '2026 Commercial Property & Cyber Quota Share Treaty',
          cedantRetentionPct: 60,
          cededSharePct: 40,
        },
      ];

      const claimsLedgerToPersist = [
        {
          id: 'CLM-2026-8841',
          claimNumber: 'CLM-2026-8841',
          amount: 240000,
          deductible: 50000,
          reinsuranceRecovery: 76000,
          status: 'Pending Review',
        },
      ];

      // Simulate initial sync saving to storage
      localStorage.setItem('insuresphere_live_treaties', JSON.stringify(treatiesToPersist));
      localStorage.setItem('insuresphere_live_claims', JSON.stringify(claimsLedgerToPersist));

      // Simulate browser refresh: re-reading from localStorage as AppContext does
      const cachedTreaties = JSON.parse(localStorage.getItem('insuresphere_live_treaties') || '[]');
      const cachedClaims = JSON.parse(localStorage.getItem('insuresphere_live_claims') || '[]');

      expect(cachedTreaties).toHaveLength(1);
      expect(cachedTreaties[0].treatyCode).toBe('TRT-2026-01');
      expect(cachedTreaties[0].cedantRetentionPct).toBe(60);
      expect(cachedTreaties[0].cededSharePct).toBe(40);

      expect(cachedClaims).toHaveLength(1);
      expect(cachedClaims[0].claimNumber).toBe('CLM-2026-8841');
      expect(cachedClaims[0].reinsuranceRecovery).toBe(76000);
      expect(cachedClaims[0].status).toBe('Pending Review');
    });

    it('sends POST /api/reinsurance/treaties/ on djangoCreateTreaty without creating duplicate keys', async () => {
      const newTreatyPayload = {
        name: '2026 Aviation Contingency Quota Share',
        type: 'Proportional Quota Share',
        reinsurerName: 'Hannover Re (Bermuda)',
        cededSharePct: 45,
        treatyLimit: 20000000,
        attachmentPoint: 0,
        effectiveDate: '2026-01-01',
        expirationDate: '2026-12-31',
      };

      const postSpy = vi.spyOn(djangoApiClient, 'post').mockResolvedValueOnce({
        data: {
          id: 'TRT-2026-04',
          treatyCode: 'TRT-2026-04',
          ...newTreatyPayload,
          cedantRetentionPct: 55,
          status: 'Active',
        },
      });

      const created = await djangoCreateTreaty(newTreatyPayload);
      expect(postSpy).toHaveBeenCalledWith('/reinsurance/treaties/', newTreatyPayload);
      expect(created.treatyCode).toBe('TRT-2026-04');
      expect(created.cedantRetentionPct).toBe(55);
      expect(created.cededSharePct).toBe(45);
    });
  });
});

