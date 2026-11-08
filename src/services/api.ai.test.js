/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { analyzeInsuranceDocument, djangoApiClient } from './api.js';

describe('AI Policy Assistant & RAG Claims Triage Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('runs claim_analysis in synthetic demo mode with deterministic actuarial metrics', async () => {
    const claimContext = {
      claimNumber: 'CLM-2026-8841',
      amount: 240000,
      customerName: 'Apex Logistics',
      type: 'Commercial Property',
      deductible: 50000,
    };
    const policyContext = {
      policyNumber: 'POL-COM-9012',
      deductible: 50000,
    };

    const response = await analyzeInsuranceDocument({
      mode: 'claim_analysis',
      claimContext,
      policyContext,
      useLiveDjango: false,
    });

    expect(response.source).toBe('synthetic-demo-rag-engine');
    expect(response.analysis.summary).toContain('CLM-2026-8841');
    expect(response.analysis.coverageAssessment).toContain('$50,000');
    expect(response.analysis.reinsuranceImpact).toContain('$76,000');
    expect(response.analysis.humanReviewerChecklist.length).toBeGreaterThanOrEqual(3);
  });

  it('routes to POST /api/ai/analyze-document/ when useLiveDjango is true', async () => {
    const mockLiveResponse = {
      source: 'django-actuarial-engine',
      disclaimer: 'Human-in-the-Loop Advisory Only',
      analysis: {
        summary: 'Live Django RAG response',
        coverageAssessment: 'Live coverage verified',
        riskIndicators: ['Low risk'],
        reinsuranceImpact: '40% cession',
        humanReviewerChecklist: ['Verify logs'],
      },
    };

    const postSpy = vi.spyOn(djangoApiClient, 'post').mockResolvedValueOnce({
      data: mockLiveResponse,
    });

    const payload = {
      mode: 'rag_qa',
      question: 'What is the waiting period?',
      useLiveDjango: true,
    };

    const response = await analyzeInsuranceDocument(payload);

    expect(postSpy).toHaveBeenCalledWith('/ai/analyze-document/', {
      mode: 'rag_qa',
      documentText: undefined,
      question: 'What is the waiting period?',
      claimContext: undefined,
      policyContext: undefined,
    });
    expect(response).toEqual(mockLiveResponse);
  });

  it('generates explain_terms summary covering subrogation and co-insurance in demo mode', async () => {
    const response = await analyzeInsuranceDocument({
      mode: 'explain_terms',
      documentText: 'Subrogation clause wording.',
      useLiveDjango: false,
    });

    expect(response.analysis.summary).toContain('financial responsibility');
    expect(response.analysis.reinsuranceImpact).toContain('Subrogation recoveries');
  });
});

