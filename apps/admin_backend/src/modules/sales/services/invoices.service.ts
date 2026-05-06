import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Payment } from '../entities/payment.entity';
import { SyncInvoiceDto } from '../dto/sync-invoice.dto';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(InvoiceItem)
    private readonly itemRepository: Repository<InvoiceItem>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
  ) {}

  async syncInvoices(tenantId: string, dtos: SyncInvoiceDto[]): Promise<void> {
    for (const dto of dtos) {
      // 1. Upsert Invoice
      await this.invoiceRepository.upsert(
        {
          ...dto,
          tenant_id: tenantId,
          created_at: new Date(dto.createdAt),
        },
        ['id'],
      );

      // 2. Upsert Items
      if (dto.items?.length > 0) {
        await this.itemRepository.upsert(
          dto.items.map((item) => ({
            ...item,
            invoiceId: dto.id,
          })),
          ['id'],
        );
      }

      // 3. Upsert Payments
      if (dto.payments?.length > 0) {
        await this.paymentRepository.upsert(
          dto.payments.map((payment) => ({
            ...payment,
            invoiceId: dto.id,
          })),
          ['id'],
        );
      }
    }
  }

  async findAll(tenantId: string): Promise<Invoice[]> {
    return this.invoiceRepository.find({
      where: { tenant_id: tenantId },
      relations: ['items', 'items.modifiers', 'payments'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<Invoice | null> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id, tenant_id: tenantId },
      relations: ['items', 'items.modifiers', 'payments'],
    });
    return invoice;
  }
}
