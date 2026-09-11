import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChangeLog } from './entities/change-log.entity';
import { ChangeLogService } from './change-log.service';

@Module({
  imports: [TypeOrmModule.forFeature([ChangeLog])],
  providers: [ChangeLogService],
  exports: [ChangeLogService, TypeOrmModule],
})
export class AuditModule {}
