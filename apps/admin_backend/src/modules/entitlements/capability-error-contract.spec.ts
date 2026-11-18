/**
 * ENT-04a — the machine-readable refusal contract the offline POS reads.
 *
 * The POS runs without a connection and keeps captured operations in a queue.
 * When the cloud refuses one of those operations it must distinguish two
 * situations that are BOTH HTTP 403 today: "your session or device is
 * invalid" (re-authenticate) and "your plan does not include this"
 * (keep the operation, show an upgrade). Keying that off the Spanish copy
 * would break the first time someone rewrites the message, so the body
 * carries a stable `code` and the keys that are missing.
 */
import { ForbiddenException } from '@nestjs/common';
import {
  CAPABILITY_REQUIRED_CODE,
  assertCapabilitiesGranted,
  capabilityDeniedBody,
} from './capability-enforcement';
import {
  LIMIT_TERMINALS_KEY,
  QUOTA_EXCEEDED_CODE,
  quotaExceededBody,
  terminalQuotaExceededMessage,
} from './tenant-quota.service';

const catchResponse = (action: () => void): unknown => {
  try {
    action();
  } catch (error) {
    if (error instanceof ForbiddenException) {
      return error.getResponse();
    }
    throw error;
  }
  throw new Error('expected the action to be denied');
};

describe('capability refusal contract (ENT-04a)', () => {
  it('denies with a stable code, the copy, and the missing keys', () => {
    const response = catchResponse(() =>
      assertCapabilitiesGranted(
        ['core.sales', 'promotions'],
        ['promotions', 'reports.margins'],
      ),
    );

    expect(response).toEqual({
      statusCode: 403,
      code: CAPABILITY_REQUIRED_CODE,
      message:
        'La función requiere el plan o el complemento que incluye "reports.margins". Actualice su plan para usarla.',
      missingCapabilities: ['reports.margins'],
    });
  });

  it('names every missing key when several are required', () => {
    const body = capabilityDeniedBody(['inventory.retail', 'loyalty']);

    expect(body.code).toBe('CAPABILITY_REQUIRED');
    expect(body.missingCapabilities).toEqual(['inventory.retail', 'loyalty']);
    expect(body.message).toContain('"inventory.retail"');
    expect(body.message).toContain('"loyalty"');
  });

  it('keeps the quota refusal machine-readable too', () => {
    const body = quotaExceededBody({
      message: terminalQuotaExceededMessage(1),
      limitKey: LIMIT_TERMINALS_KEY,
      limit: 1,
      occupied: 1,
    });

    expect(body).toMatchObject({
      statusCode: 409,
      code: QUOTA_EXCEEDED_CODE,
      limitKey: 'limits.terminals',
      limit: 1,
      occupied: 1,
    });
  });
});
