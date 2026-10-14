import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { CompanyIdentityService } from './services/company-identity.service';

/**
 * R19 T3: the tenant module now owns the server-side company identity —
 * the data lives in the tenant row, so the resolver that declares which
 * identity fields are present or absent (S4/S15) lives here and is
 * exported for formal documents (the printable count list) to consume.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  providers: [CompanyIdentityService],
  exports: [CompanyIdentityService],
})
export class TenantModule {}
