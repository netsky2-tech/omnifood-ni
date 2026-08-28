import { AuditHashVersionInvalidException } from './audit-hash-version-invalid.exception';

describe('AuditHashVersionInvalidException', () => {
  it('exposes the stable invalid-version error contract', () => {
    const exception = new AuditHashVersionInvalidException(
      'unsupported-version',
    );

    expect(exception.getResponse()).toEqual({
      code: 'AUDIT_HASH_VERSION_INVALID',
      version: 'unsupported-version',
    });
  });
});
