import {
  ERROR_CODES,
  ERROR_REASONS,
  type CanonicalFact,
  type Conflict,
  type ErrorData,
  type ErrorReasonPair,
  type Notice,
} from './index';

describe('security evidence facts', () => {
  it('accepts valid name-correlated facts and readonly evidence primitives', () => {
    const category: CanonicalFact = {
      name: 'category',
      value: 'security/forensic',
      status: 'verified',
    };
    const hold: CanonicalFact = {
      name: 'hold',
      value: 'active',
      status: 'failed',
    };
    const prerequisite: CanonicalFact = {
      name: 'segmentClosed',
      value: true,
      status: 'unavailable',
    };
    const notice: Notice = {
      name: 'category',
      reason: ERROR_REASONS.R_IDENTICAL_DUPLICATE,
    };
    const conflict: Conflict = {
      name: 'hold',
      reason: ERROR_REASONS.R_CONFLICTING_DUPLICATE,
    };

    expect([category, hold, prerequisite]).toEqual([
      { name: 'category', value: 'security/forensic', status: 'verified' },
      { name: 'hold', value: 'active', status: 'failed' },
      { name: 'segmentClosed', value: true, status: 'unavailable' },
    ]);
    expect(notice.reason).toBe('R_IDENTICAL_DUPLICATE');
    expect(conflict.reason).toBe('R_CONFLICTING_DUPLICATE');

    /* eslint-disable @typescript-eslint/no-unused-vars */
    // @ts-expect-error category facts cannot carry boolean values
    const invalidCategory: CanonicalFact = {
      name: 'category',
      value: true,
      status: 'verified',
    };
    // @ts-expect-error hold facts cannot carry categories
    const invalidHold: CanonicalFact = {
      name: 'hold',
      value: 'fiscal/DGI',
      status: 'verified',
    };
    // @ts-expect-error facts expose readonly fields
    category.status = 'failed';
    // @ts-expect-error notices expose readonly fields
    notice.name = 'hold';
  });

  it('allows only exact error and reason pairs, including ErrorData', () => {
    const pair: ErrorReasonPair = {
      code: ERROR_CODES.E_NAME,
      reason: ERROR_REASONS.R_UNKNOWN_NAME,
    };
    const error: ErrorData = { ...pair, name: 'category' };

    expect(pair).toEqual({ code: 'E_NAME', reason: 'R_UNKNOWN_NAME' });
    expect(error).toEqual({
      code: 'E_NAME',
      reason: 'R_UNKNOWN_NAME',
      name: 'category',
    });

    // @ts-expect-error E_NAME cannot be paired with R_INVALID_STATUS
    const invalidPair: ErrorReasonPair = {
      code: ERROR_CODES.E_NAME,
      reason: ERROR_REASONS.R_INVALID_STATUS,
    };
    // @ts-expect-error ErrorData preserves ErrorReasonPair correlation
    const invalidError: ErrorData = {
      code: ERROR_CODES.E_VALUE,
      reason: ERROR_REASONS.R_MISSING_FIELD,
    };
    /* eslint-enable @typescript-eslint/no-unused-vars */
  });
});
