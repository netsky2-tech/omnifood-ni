import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async login(email: string, pass: string) {
    const user = await this.userRepository.findOne({
      where: { email },
      select: ['id', 'name', 'email', 'password_hash', 'role', 'tenant_id'],
    });

    if (!user || !(await bcrypt.compare(pass, user.password_hash))) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const tokens = await this.getTokens(
      user.id,
      user.email,
      user.tenant_id,
      user.role,
    );
    await this.updateRefreshToken(user.id, tokens.refresh_token);

    return {
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        tenant_id: user.tenant_id,
      },
    };
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'tenant_id', 'role', 'hashed_refresh_token'],
    });

    if (!user || !user.hashed_refresh_token) {
      throw new UnauthorizedException('Acceso denegado');
    }

    const refreshTokenMatches = await bcrypt.compare(
      refreshToken,
      user.hashed_refresh_token,
    );
    if (!refreshTokenMatches) {
      throw new UnauthorizedException('Token inválido');
    }

    const tokens = await this.getTokens(
      user.id,
      user.email,
      user.tenant_id,
      user.role,
    );
    await this.updateRefreshToken(user.id, tokens.refresh_token);
    return tokens;
  }

  async updateRefreshToken(userId: string, refreshToken: string) {
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.userRepository.update(userId, {
      hashed_refresh_token: hashedRefreshToken,
    });
  }

  async getTokens(
    userId: string,
    email: string,
    tenantId: string,
    role: string,
  ) {
    const payload = { sub: userId, email, tenant_id: tenantId, role };
    const [at, rt] = await Promise.all([
      this.jwtService.signAsync(payload, { expiresIn: '1h' }),
      this.jwtService.signAsync(payload, { expiresIn: '7d' }),
    ]);

    return {
      access_token: at,
      refresh_token: rt,
    };
  }

  async getStaffForSync(tenantId: string) {
    return this.userRepository.find({
      where: { tenant_id: tenantId, is_active: true },
      select: ['id', 'name', 'role', 'pin_hash'],
    });
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async hashPin(pin: string): Promise<string> {
    return bcrypt.hash(pin, 10);
  }
}
