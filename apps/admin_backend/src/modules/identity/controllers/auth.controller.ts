import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { AuthGuard } from '../guards/auth.guard';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { LoginDto, RefreshTokenDto } from '../dto/identity.dto';

@Controller('identity')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() body: LoginDto) {
    return this.authService.login(body.email, body.pass);
  }

  @Post('refresh')
  async refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refreshTokens(body.userId, body.refreshToken);
  }

  @UseGuards(AuthGuard)
  @UseInterceptors(TenantInterceptor)
  @Get('staff')
  async getStaff(@GetTenantId() tenantId: string) {
    return this.authService.getStaffForSync(tenantId || '');
  }
}
