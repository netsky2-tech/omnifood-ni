import { BadRequestException } from '@nestjs/common';

export class AuditHashVersionInvalidException extends BadRequestException {
  constructor(version: string) {
    super({ code: 'AUDIT_HASH_VERSION_INVALID', version });
  }
}
