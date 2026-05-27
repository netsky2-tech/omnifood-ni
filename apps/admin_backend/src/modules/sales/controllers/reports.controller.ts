import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { UserRole } from '../../identity/entities/user.entity';

@Controller('sales/reports')
@UseGuards(AuthGuard, RolesGuard)
export class ReportsController {
  @Get('x')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  getXReport() {
    return { status: 'ok', report: 'X' };
  }

  @Get('z')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  getZReport() {
    return { status: 'ok', report: 'Z' };
  }
}
