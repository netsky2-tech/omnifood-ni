import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { UserRole } from '../../identity/entities/user.entity';
import { CashShiftService } from '../services/cash-shift.service';
import {
  OpenCashShiftDto,
  RecordCashMovementRequestDto,
  CloseCashShiftDto,
  ListCashShiftsQueryDto,
} from '../dto/cash-shift.dto';

interface RequestWithUser {
  user: {
    tenant_id: string;
    id: string;
    role: string;
  };
}

@Controller('sales/shifts')
@UseGuards(AuthGuard, RolesGuard)
export class CashShiftController {
  constructor(private readonly shiftService: CashShiftService) {}

  /**
   * Owner-dashboard oversight listing. Unlike the POS-operated routes below
   * (driven by cashiers), this read is gated to OWNER/MANAGER, mirroring the
   * other backoffice oversight read routes (reports, admin invoices).
   */
  @Get()
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async listShifts(
    @Req() req: RequestWithUser,
    @Query() query: ListCashShiftsQueryDto,
  ) {
    return this.shiftService.listShifts(req.user.tenant_id, {
      status: query.status,
      limit: query.limit,
    });
  }

  @Post('open')
  async openShift(@Req() req: RequestWithUser, @Body() dto: OpenCashShiftDto) {
    return this.shiftService.openShift(req.user.tenant_id, dto);
  }

  @Get('active')
  async getActiveShift(
    @Req() req: RequestWithUser,
    @Query('terminalId') terminalId: string,
  ) {
    return this.shiftService.getActiveShiftByTerminal(
      req.user.tenant_id,
      terminalId,
    );
  }

  @Get(':shiftId')
  async getShiftById(
    @Req() req: RequestWithUser,
    @Param('shiftId') shiftId: string,
  ) {
    return this.shiftService.getCashShiftById(req.user.tenant_id, shiftId);
  }

  @Post(':shiftId/movements')
  async recordMovement(
    @Req() req: RequestWithUser,
    @Param('shiftId') shiftId: string,
    @Body() dto: RecordCashMovementRequestDto,
  ) {
    return this.shiftService.recordCashMovement(
      req.user.tenant_id,
      shiftId,
      dto,
    );
  }

  @Post(':shiftId/close')
  async closeShift(
    @Req() req: RequestWithUser,
    @Param('shiftId') shiftId: string,
    @Body() dto: CloseCashShiftDto,
  ) {
    return this.shiftService.closeShiftWithZReport(
      req.user.tenant_id,
      shiftId,
      dto,
    );
  }
}
