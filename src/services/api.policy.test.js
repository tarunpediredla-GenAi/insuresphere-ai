/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { normalizeDjangoPolicy, djangoCreatePolicy, djangoApiClient } from './api.js';

describe('normalizeDjangoPolicy', () => {
  it('normalizes serialized Decimal values into numeric policy fields', () => {
    const policy = normalizeDjangoPolicy({
      id: 'POL-COM-9400',
      policyNumber: 'POL-COM-9400',
      coverageLimit: '10000000.00',
      deductible: '50000.00',
      annualPremium: '240000.00',
    });

    expect(policy.coverageLimit).toBe(10000000);
    expect(policy.deductible).toBe(50000);
    expect(policy.annualPremium).toBe(240000);
  });

  it('preserves invalid required monetary fields as undefined for safe display', () => {
    const policy = normalizeDjangoPolicy({
      policyNumber: 'POL-COM-9401',
      coverageLimit: 'invalid',
      deductible: '',
      annualPremium: null,
    });

    expect(policy.coverageLimit).toBeUndefined();
    expect(policy.deductible).toBeUndefined();
    expect(policy.annualPremium).toBeUndefined();
  });
});

describe('djangoCreatePolicy', () => {
  it('sends customerId extracted from customer_code or customerId payload', async () => {
    const spy = vi.spyOn(djangoApiClient, 'post').mockResolvedValueOnce({
      data: {
        id: 'POL-COM-9500',
        policyNumber: 'POL-COM-9500',
        customerId: 'CUST-1001',
        coverageLimit: '10000000.00',
        deductible: '50000.00',
        annualPremium: '240000.00',
      },
    });

    const result = await djangoCreatePolicy({
      title: 'Commercial Property Policy',
      customer_code: 'CUST-1001',
      lineOfBusiness: 'Commercial Property',
      coverageLimit: 10000000,
      deductible: 50000,
      annualPremium: 240000,
      paymentFrequency: 'Annual',
      effectiveDate: '2026-11-01',
      expirationDate: '2027-10-31',
      coverageSummary: 'Sample scope',
    });

    expect(spy).toHaveBeenCalledWith('/policies/', expect.objectContaining({
      customerId: 'CUST-1001',
      reinsuranceTreatyId: '',
    }));
    expect(result.policyNumber).toBe('POL-COM-9500');
    expect(result.coverageLimit).toBe(10000000);
    spy.mockRestore();
  });

  it('maps customerCode correctly when provided', async () => {
    const spy = vi.spyOn(djangoApiClient, 'post').mockResolvedValueOnce({
      data: {
        id: 'POL-COM-9501',
        policyNumber: 'POL-COM-9501',
        customerId: 'CUST-1002',
        coverageLimit: '5000000.00',
        deductible: '25000.00',
        annualPremium: '120000.00',
      },
    });

    const result = await djangoCreatePolicy({
      title: 'Commercial Property Policy 2',
      customerCode: 'CUST-1002',
      lineOfBusiness: 'Commercial Property',
      coverageLimit: 5000000,
      deductible: 25000,
      annualPremium: 120000,
      paymentFrequency: 'Annual',
      effectiveDate: '2026-11-01',
      expirationDate: '2027-10-31',
      coverageSummary: 'Sample scope 2',
    });

    expect(spy).toHaveBeenCalledWith('/policies/', expect.objectContaining({
      customerId: 'CUST-1002',
    }));
    expect(result.annualPremium).toBe(120000);
    spy.mockRestore();
  });
});
