import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModifierGroup } from './entities/modifier-group.entity';
import { ModifierOption } from './entities/modifier-option.entity';
import { CategoryModifierGroup } from './entities/category-modifier-group.entity';
import { ProductModifierGroup } from './entities/product-modifier-group.entity';

/**
 * Reusable modifier groups (extras). T1.1 registers the schema entities
 * only; the REST CRUD surface lands with T1.2, so the module currently
 * carries no controllers or providers and exports the TypeORM feature
 * registration for the modules that will consume it.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ModifierGroup,
      ModifierOption,
      CategoryModifierGroup,
      ProductModifierGroup,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class ModifiersModule {}
