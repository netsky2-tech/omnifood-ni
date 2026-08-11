import type {
  NormalizationContainerError,
  NormalizationEntryError,
  NormalizationResult,
} from './types';

describe('security evidence normalization types', () => {
  it('separates root diagnostics from indexed entry diagnostics in the final readonly result', () => {
    const rootError: NormalizationContainerError = {
      code: 'E_CONTAINER',
      reason: 'R_NOT_OBJECT',
    };
    const entryError: NormalizationEntryError = {
      code: 'E_NAME',
      reason: 'R_UNKNOWN_NAME',
      entryIndex: 2,
      name: 'unknown',
    };
    const result: NormalizationResult = {
      facts: [],
      errors: [rootError, entryError],
      notices: [],
      conflicts: [],
    };

    expect(result.errors).toEqual([rootError, entryError]);
    expect(result.notices).toEqual([]);
    expect(result.conflicts).toEqual([]);

    // @ts-expect-error entry diagnostics require their source index
    const missingIndex: NormalizationEntryError = {
      code: 'E_STATUS',
      reason: 'R_INVALID_STATUS',
      name: 'category',
    };
    // @ts-expect-error root diagnostics do not fabricate an entry index
    rootError.entryIndex = 0;
    void missingIndex;
  });
});
