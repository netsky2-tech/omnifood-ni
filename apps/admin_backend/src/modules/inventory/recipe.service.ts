import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecipeVersion } from './entities/recipe-version.entity';
import { RecipeDetail } from './entities/recipe-detail.entity';

const SCALE_4 = 4;
const round4 = (value: number): number => Number(value.toFixed(SCALE_4));

export interface RecipeComponentInput {
  insumoId: string;
  grossQuantity: number;
  technicalShrinkPct: number;
}

@Injectable()
export class RecipeService {
  constructor(
    @InjectRepository(RecipeVersion)
    private readonly recipeVersionRepo: Repository<RecipeVersion>,
    @InjectRepository(RecipeDetail)
    private readonly recipeDetailRepo: Repository<RecipeDetail>,
  ) {}

  async createNewVersion(input: {
    tenantId: string;
    productId: string;
    components: RecipeComponentInput[];
    effectiveAt?: Date;
  }): Promise<RecipeVersion> {
    const activeVersion = await this.recipeVersionRepo.findOne({
      where: {
        tenant_id: input.tenantId,
        product_id: input.productId,
        is_active: true,
      },
      order: { version_number: 'DESC' },
    });

    if (activeVersion) {
      activeVersion.is_active = false;
      activeVersion.fecha_fin_vigencia = input.effectiveAt ?? new Date();
      await this.recipeVersionRepo.save(activeVersion);
    }

    const nextVersionNumber = activeVersion
      ? activeVersion.version_number + 1
      : 1;

    const version = this.recipeVersionRepo.create({
      tenant_id: input.tenantId,
      product_id: input.productId,
      version_number: nextVersionNumber,
      is_active: true,
      fecha_inicio_vigencia: input.effectiveAt ?? new Date(),
    });

    const savedVersion = await this.recipeVersionRepo.save(version);

    const details = input.components.map((component) => {
      const netUsableQuantity = round4(
        component.grossQuantity * (1 - component.technicalShrinkPct / 100),
      );

      return this.recipeDetailRepo.create({
        tenant_id: input.tenantId,
        recipe_version_id: savedVersion.id,
        insumo_id: component.insumoId,
        gross_quantity: round4(component.grossQuantity),
        technical_shrink_pct: round4(component.technicalShrinkPct),
        quantity: netUsableQuantity,
      });
    });

    await this.recipeDetailRepo.save(details);

    return savedVersion;
  }

  async findActiveVersion(
    tenantId: string,
    productId: string,
  ): Promise<RecipeVersion | null> {
    return this.recipeVersionRepo.findOne({
      where: {
        tenant_id: tenantId,
        product_id: productId,
        is_active: true,
      },
      order: { version_number: 'DESC' },
    });
  }

  async getSnapshot(
    recipeVersionId: string,
    tenantId: string,
    productId?: string,
  ): Promise<{
    recipeVersion: RecipeVersion;
    components: RecipeDetail[];
  }> {
    const recipeVersion = await this.recipeVersionRepo.findOne({
      where: { id: recipeVersionId, tenant_id: tenantId },
    });

    if (!recipeVersion) {
      throw new NotFoundException(
        `Recipe version ${recipeVersionId} not found`,
      );
    }

    if (productId && recipeVersion.product_id !== productId) {
      throw new BadRequestException(
        `Recipe version ${recipeVersionId} does not belong to product ${productId}`,
      );
    }

    const components = await this.recipeDetailRepo.find({
      where: {
        recipe_version_id: recipeVersion.id,
        tenant_id: tenantId,
      },
      order: { insumo_id: 'ASC' },
    });

    return { recipeVersion, components };
  }
}
