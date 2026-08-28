import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAccessPayload } from '../security/jwt-token.types';
import { User } from '../entities/user.entity';

export interface AuthoritativeCurrentUser {
  email: string;
  tenant_id: string;
  role: User['role'];
  is_active: boolean;
  security_version: number;
}

@Injectable()
export class CurrentUserAuthorizationService {
  constructor(
    @InjectRepository(User)
    private readonly users: Pick<Repository<User>, 'findOne'>,
  ) {}

  async authorize(token: JwtAccessPayload): Promise<AuthoritativeCurrentUser> {
    try {
      const user = await this.users.findOne({
        where: { id: token.sub, tenant_id: token.tenant_id },
        select: [
          'id',
          'email',
          'tenant_id',
          'role',
          'is_active',
          'security_version',
        ],
      });
      if (
        !user ||
        !user.is_active ||
        user.tenant_id !== token.tenant_id ||
        String(user.role) !== token.role ||
        user.security_version !== token.security_version
      ) {
        throw new UnauthorizedException();
      }

      return {
        email: user.email,
        tenant_id: user.tenant_id,
        role: user.role,
        is_active: user.is_active,
        security_version: user.security_version,
      };
    } catch {
      throw new UnauthorizedException();
    }
  }
}
