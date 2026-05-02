import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { SyncInvoiceDto } from '../dto/sync-invoice.dto';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
  ) {}

  async syncInvoices(tenantId: string, dtos: SyncInvoiceDto[]): Promise<void> {
    for (const dto of dtos) {
      const existing = await this.invoiceRepository.findOne({
        where: { id: dto.id, tenant_id: tenantId },
      });

      if (existing) {
        await this.invoiceRepository.save({
          ...existing,
          isCanceled: dto.isCanceled ?? existing.isCanceled,
          voidReason: dto.voidReason ?? existing.voidReason,
          paymentStatus: dto.paymentStatus,
        });
        continue;
      }

      const invoice = this.invoiceRepository.create({
        ...dto,
        tenant_id: tenantId,
        created_at: new Date(dto.createdAt),
        items: dto.items.map((item) => ({
          ...item,
          invoiceId: dto.id,
        })),
        payments: dto.payments.map((payment) => ({
          ...payment,
          invoiceId: dto.id,
        })),
      });

      await this.invoiceRepository.save(invoice);
    }
  }

  async findAll(tenantId: string): Promise<Invoice[]> {
    return this.invoiceRepository.find({
      where: { tenant_id: tenantId },
      relations: ['items', 'payments'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<Invoice | null> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id, tenant_id: tenantId },
      relations: ['items', 'payments'],
    });
    return invoice;
  }
}
