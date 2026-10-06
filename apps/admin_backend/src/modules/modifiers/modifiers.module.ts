import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModifierGroup } from './entities/modifier-group.entity';
import { ModifierOption } from './entities/modifier-option.entity';
import { CategoryModifierGroup } from './entities/category-modifier-group.entity';
import { ProductModifierGroup } from './entities/product-modifier-group.entity';
import { ModifiersService } from './services/modifiers.service';
import { ModifiersController } from './controllers/modifiers.controller';
import { IdentityModule } from '../identity/identity.module';

/**
 * Reusable modifier groups (extras/modifiers, ODD tasks T1.1 + T1.2).
 *
 * T1.1 registered the schema entities; T1.2 adds the REST CRUD surface
 * (groups, their options and their attachments to categories/products).
 * Every service operation runs inside a tenant-bound transaction, mirroring
 * the promotions module. Exports the TypeORM feature registration for the
 * modules that consume it (T1.3 resolution, POS sync).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ModifierGroup,
      ModifierOption,
      CategoryModifierGroup,
      ProductModifierGroup,
    ]),
    IdentityModule,
  ],
  controllers: [ModifiersController],
  providers: [ModifiersService],
  exports: [ModifiersService, TypeOrmModule],
})
export class ModifiersModule {}
