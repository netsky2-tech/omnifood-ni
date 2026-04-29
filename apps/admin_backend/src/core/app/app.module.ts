import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IdentityModule } from '../../modules/identity/identity.module';
import { Tenant } from '../../modules/tenant/entities/tenant.entity';
import { User } from '../../modules/identity/entities/user.entity';
import { AuditLog } from '../../modules/identity/entities/audit-log.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', '127.0.0.1'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'admin'),
        database: configService.get<string>('DB_DATABASE', 'omnifood'),
        entities: [Tenant, User, AuditLog],
        synchronize: true, // Only for development
      }),
    }),
    IdentityModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
