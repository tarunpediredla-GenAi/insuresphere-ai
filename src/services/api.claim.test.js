/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { djangoUpdateClaim, djangoApiClient } from './api.js';

describe('Claims Review Adjudication Service Layer', () => {
  const fictionalClaimId = 'CLM-TEST-FICT-2026-HOLD01';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('Hold for Adjuster Inquiry sends Hold action with Pending Review status and never Approved', async () => {
    const patchSpy = vi.spyOn(djangoApiClient, 'patch').mockResolvedValueOnce({
      data: {
        id: fictionalClaimId,
        claimNumber: fictionalClaimId,
        status: 'Pending Review',
        activityHistory: [
          {
            id: 2,
            actor: 'Marcus Adjuster (Agent)',
            action: 'Held claim for adjuster inquiry. Note: Requesting forensic telemetry.',
            timestamp: '2026-11-08 09:30 UTC',
          },
          {
            id: 1,
            actor: 'Alex Policyholder (Customer)',
            action: 'First Notice of Loss (FNOL) submitted.',
            timestamp: '2026-11-01 10:00 UTC',
          },
        ],
      },
    });

    const payload = {
      action: 'Hold',
      status: 'Pending Review',
      reviewerNote: 'Requesting forensic telemetry.',
    };

    const result = await djangoUpdateClaim(fictionalClaimId, payload);

    expect(patchSpy).toHaveBeenCalledWith(`/claims/${fictionalClaimId}/`, {
      action: 'Hold',
      status: 'Pending Review',
      reviewerNote: 'Requesting forensic telemetry.',
    });

    expect(result.status).toBe('Pending Review');
    expect(result.status).not.toBe('Approved');
    expect(result.activityHistory.length).toBe(2);
    expect(result.activityHistory[0].action).toContain('Held claim for adjuster inquiry.');
  });

  it('Approve Claim Settlement sends Approve action with Approved status', async () => {
    const patchSpy = vi.spyOn(djangoApiClient, 'patch').mockResolvedValueOnce({
      data: {
        id: fictionalClaimId,
        claimNumber: fictionalClaimId,
        status: 'Approved',
        activityHistory: [
          {
            id: 3,
            actor: 'Elena Vance (Admin)',
            action: 'Approved claim settlement. Note: Approved following surveyor report.',
            timestamp: '2026-11-08 09:35 UTC',
          },
        ],
      },
    });

    const payload = {
      action: 'Approve',
      status: 'Approved',
      reviewerNote: 'Approved following surveyor report.',
    };

    const result = await djangoUpdateClaim(fictionalClaimId, payload);

    expect(patchSpy).toHaveBeenCalledWith(`/claims/${fictionalClaimId}/`, payload);
    expect(result.status).toBe('Approved');
    expect(result.activityHistory[0].action).toContain('Approved claim settlement.');
  });

  it('Reject Claim sends Reject action with Rejected status', async () => {
    const patchSpy = vi.spyOn(djangoApiClient, 'patch').mockResolvedValueOnce({
      data: {
        id: fictionalClaimId,
        claimNumber: fictionalClaimId,
        status: 'Rejected',
        activityHistory: [
          {
            id: 4,
            actor: 'Marcus Adjuster (Agent)',
            action: 'Rejected claim. Note: Loss excluded under section 4.',
            timestamp: '2026-11-08 09:40 UTC',
          },
        ],
      },
    });

    const payload = {
      action: 'Reject',
      status: 'Rejected',
      reviewerNote: 'Loss excluded under section 4.',
    };

    const result = await djangoUpdateClaim(fictionalClaimId, payload);

    expect(patchSpy).toHaveBeenCalledWith(`/claims/${fictionalClaimId}/`, payload);
    expect(result.status).toBe('Rejected');
    expect(result.activityHistory[0].action).toContain('Rejected claim.');
  });

  it('propagates 403 Forbidden when unauthorized user attempts adjudication', async () => {
    const errorResponse = {
      response: {
        status: 403,
        data: { detail: 'Only Admin or Licensed Insurance Adjusters can approve, hold, or reject claims.' },
      },
    };
    vi.spyOn(djangoApiClient, 'patch').mockRejectedValueOnce(errorResponse);

    await expect(
      djangoUpdateClaim(fictionalClaimId, { action: 'Approve', status: 'Approved' })
    ).rejects.toEqual(errorResponse);
  });
});

