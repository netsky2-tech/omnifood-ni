export const ERROR_REASONS = {
  INVALID_DATE: {
    MALFORMED_SHAPE: 'MALFORMED_SHAPE',
    INVALID_VALUE: 'INVALID_VALUE',
    OUT_OF_RANGE: 'OUT_OF_RANGE',
  },
  INVALID_DURATION: {
    MALFORMED_SHAPE: 'MALFORMED_SHAPE',
    NON_FINITE: 'NON_FINITE',
    NON_INTEGER: 'NON_INTEGER',
    NEGATIVE: 'NEGATIVE',
    ALL_ZERO: 'ALL_ZERO',
  },
  ARITHMETIC_OVERFLOW: { OVERFLOW: 'OVERFLOW' },
  INVALID_EVIDENCE: {
    MALFORMED_SHAPE: 'MALFORMED_SHAPE',
    UNKNOWN_CATEGORY: 'UNKNOWN_CATEGORY',
  },
  INVALID_POLICY: {
    MALFORMED_SHAPE: 'MALFORMED_SHAPE',
    DURATION_OUT_OF_RANGE: 'DURATION_OUT_OF_RANGE',
    INVALID_EFFECTIVE_DATE: 'INVALID_EFFECTIVE_DATE',
  },
  NO_APPLICABLE_POLICY: {
    NO_MATCH: 'NO_MATCH',
    TIE: 'TIE',
  },
} as const;

type ErrorCode = keyof typeof ERROR_REASONS;

type ErrorReasonByCode<Code extends ErrorCode> =
  (typeof ERROR_REASONS)[Code][keyof (typeof ERROR_REASONS)[Code]];

export type CalendarError = {
  readonly [Code in ErrorCode]: {
    readonly code: Code;
    readonly reason: ErrorReasonByCode<Code>;
  };
}[ErrorCode];

export const calendarError = <Code extends ErrorCode>(
  code: Code,
  reason: ErrorReasonByCode<Code>,
): CalendarError => ({ code, reason }) as CalendarError;
