import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, ProductType } from '../../inventory/entities/product.entity';
import {
  OnboardingSessionService,
  OnboardingStartSource,
} from './onboarding-session.service';
import { OnboardingReadinessEvaluator } from './onboarding-readiness.evaluator';
import { OnboardingStateReconciler } from './onboarding-state.reconciler';
import {
  CreateManualProductDto,
  OnboardingCatalogSummaryResponse,
  OnboardingManualProductResponse,
} from '../dto/onboarding-catalog.dto';

@Injectable()
export class OnboardingCatalogService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly sessionService: OnboardingSessionService,
    private readonly readinessEvaluator: OnboardingReadinessEvaluator,
    private readonly stateReconciler: OnboardingStateReconciler,
  ) {}

  async createManualProduct(
    tenantId: string,
    dto: CreateManualProductDto,
    actorUserId?: string,
  ): Promise<OnboardingManualProductResponse> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) {
      throw new BadRequestException('Tenant context is required');
    }

    const trimmedName = dto.name?.trim();
    if (!trimmedName) {
      throw new BadRequestException('Product name must not be empty');
    }

    if (dto.sellPrice === undefined || dto.sellPrice === null || dto.sellPrice <= 0) {
      throw new BadRequestException('sellPrice must be greater than 0');
    }

    // Create sellable product (AC-06).
    // stock=0, averageCost=0: initial stock and cost enter via Kardex only (AC-07, AC-24, AC-52).
    const product = this.productRepository.create({
      tenant_id: trimmedTenant,
      name: trimmedName,
      sellPrice: dto.sellPrice,
      uom: dto.uom?.trim() || 'UN',
      category_code: dto.category_code?.trim() || undefined,
      product_type: ProductType.SIMPLE,
      is_active: true,
      stock: 0,
      averageCost: 0,
    });

    const savedProduct = await this.productRepository.save(product);

    // Integrate with session start & reconcile (AC-27, AC-50)
    await this.sessionService.ensureOnboardingStarted({
      tenantId: trimmedTenant,
      actorUserId,
      source: OnboardingStartSource.SETUP_CENTER,
    });

    const readiness = await this.readinessEvaluator.evaluate(trimmedTenant);
    const session = await this.stateReconciler.reconcile(trimmedTenant, readiness);

    return {
      product: {
        id: savedProduct.id,
        name: savedProduct.name,
        sellPrice: Number(savedProduct.sellPrice),
        uom: savedProduct.uom,
        category_code: savedProduct.category_code || null,
        costStatus: savedProduct.averageCost > 0 ? 'CONFIGURED' : 'COST_PENDING',
        is_active: savedProduct.is_active,
      },
      session,
      readiness,
    };
  }

  async getCatalogSummary(
    tenantId: string,
  ): Promise<OnboardingCatalogSummaryResponse> {
    const trimmedTenant = tenantId?.trim();
    if (!trimmedTenant) {
      throw new BadRequestException('Tenant context is required');
    }

    const sellableCount = await this.productRepository
      .createQueryBuilder('product')
      .where('product.tenant_id = :tenantId', { tenantId: trimmedTenant })
      .andWhere('product.is_active = true')
      .andWhere('product.sellPrice > 0')
      .andWhere('product.name IS NOT NULL AND TRIM(product.name) != \'\'')
      .getCount();

    const sampleProducts = await this.productRepository.find({
      where: {
        tenant_id: trimmedTenant,
        is_active: true,
      },
      order: { created_at: 'DESC' },
      take: 5,
    });

    return {
      sellableProductCount: sellableCount,
      hasSellableProduct: sellableCount >= 1,
      sampleProducts: sampleProducts.map((p) => ({
        id: p.id,
        name: p.name,
        sellPrice: Number(p.sellPrice),
        uom: p.uom,
        category_code: p.category_code || null,
        costStatus: p.averageCost > 0 ? 'CONFIGURED' : 'COST_PENDING',
        is_active: p.is_active,
      })),
    };
  }
}
