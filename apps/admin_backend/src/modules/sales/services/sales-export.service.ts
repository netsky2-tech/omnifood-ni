import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import * as ExcelJS from 'exceljs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit');
import { Invoice } from '../entities/invoice.entity';
import { CashShiftSession } from '../entities/cash-shift.entity';
import {
  ExportFormat,
  ExportResult,
  ExportSalesBookQueryDto,
  ExportZReportsQueryDto,
  SalesBookExportDto,
  SalesBookRowDto,
  ZReportRowDto,
  ZReportsExportDto,
} from '../dto/sales-export.dto';

const round2 = (value: number): number =>
  Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));

const escapeCsv = (
  field: string | number | boolean | null | undefined,
): string => {
  if (field === null || field === undefined) return '""';
  const str = typeof field === 'string' ? field : String(field);
  return `"${str.replace(/"/g, '""')}"`;
};

const buildPdfBuffer = (doc: PDFKit.PDFDocument): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

@Injectable()
export class SalesExportService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(CashShiftSession)
    private readonly shiftRepo: Repository<CashShiftSession>,
  ) {}

  async exportSalesBook(
    tenantId: string,
    query?: ExportSalesBookQueryDto,
  ): Promise<ExportResult<SalesBookExportDto>> {
    const format: ExportFormat = query?.format ?? 'json';
    const { start, end } = this.parseDateBounds(
      query?.startDate,
      query?.endDate,
    );

    const whereClause: FindOptionsWhere<Invoice> = {
      tenant_id: tenantId,
    };

    if (start && end) {
      whereClause.created_at = Between(start, end);
    } else if (start) {
      whereClause.created_at = MoreThanOrEqual(start);
    } else if (end) {
      whereClause.created_at = LessThanOrEqual(end);
    }

    const invoices = await this.invoiceRepo.find({
      where: whereClause,
      relations: ['items'],
      order: { created_at: 'ASC' },
    });

    let totalGrossNio = 0;
    let totalTaxNio = 0;
    let totalExemptNio = 0;

    const records: SalesBookRowDto[] = invoices.map((inv) => {
      const isCanceled = inv.isCanceled ?? false;
      const isCreditNote = inv.type === 'creditNote';
      const docType = isCanceled
        ? 'ANULADA'
        : isCreditNote
          ? 'NOTA_CREDITO'
          : 'FACTURA';
      const status = isCanceled ? 'ANULADA' : 'VALIDA';

      let discountNio = 0;
      let taxableSubtotalNio = 0;
      let exemptSubtotalNio = 0;

      if (inv.items && inv.items.length > 0) {
        for (const item of inv.items) {
          discountNio = round2(discountNio + Number(item.discount ?? 0));
          const taxRate = Number(
            item.appliedTaxRate ?? item.originalTaxRate ?? 0,
          );
          const taxAmount = Number(item.taxAmount ?? 0);
          const itemBase = round2(
            Number(item.quantity ?? 1) * Number(item.unitPrice ?? 0) -
              Number(item.discount ?? 0),
          );

          if (taxRate > 0 || taxAmount > 0) {
            taxableSubtotalNio = round2(taxableSubtotalNio + itemBase);
          } else {
            exemptSubtotalNio = round2(exemptSubtotalNio + itemBase);
          }
        }
      } else {
        const invTax = Number(inv.totalTax ?? 0);
        const invSubtotal = Number(inv.subtotal ?? 0);
        if (invTax > 0) {
          taxableSubtotalNio = invSubtotal;
        } else {
          exemptSubtotalNio = invSubtotal;
        }
      }

      const totalNio = Number(inv.total ?? 0);
      const totalTax = Number(inv.totalTax ?? 0);
      const totalUsd = Number(inv.totalUsd ?? 0);

      if (!isCanceled) {
        totalGrossNio = round2(totalGrossNio + totalNio);
        totalTaxNio = round2(totalTaxNio + totalTax);
        totalExemptNio = round2(totalExemptNio + exemptSubtotalNio);
      }

      const dateStr = inv.created_at
        ? new Date(inv.created_at).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      return {
        date: dateStr,
        invoiceNumber: inv.number || 'N/A',
        documentType: docType,
        customerName: inv.customerId || 'CONSUMIDOR FINAL',
        exemptSubtotalNio: round2(exemptSubtotalNio),
        taxableSubtotalNio: round2(taxableSubtotalNio),
        taxAmountNio: round2(totalTax),
        discountNio: round2(discountNio),
        totalNio: round2(totalNio),
        totalUsd: round2(totalUsd),
        status,
        isCanceled,
      };
    });

    const exportData: SalesBookExportDto = {
      startDate: query?.startDate,
      endDate: query?.endDate,
      generatedAt: new Date().toISOString(),
      totalRecords: records.length,
      totalGrossNio: round2(totalGrossNio),
      totalTaxNio: round2(totalTaxNio),
      totalExemptNio: round2(totalExemptNio),
      records,
    };

    const datePrefix =
      query?.startDate || new Date().toISOString().split('T')[0];

    if (format === 'csv') {
      return {
        format: 'csv',
        filename: `libro-ventas-dgi-${datePrefix}.csv`,
        contentType: 'text/csv; charset=utf-8',
        content: this.generateSalesBookCsv(records),
        data: exportData,
      };
    }

    if (format === 'xlsx') {
      const buffer = await this.generateSalesBookXlsx(exportData);
      return {
        format: 'xlsx',
        filename: `libro-ventas-dgi-${datePrefix}.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer,
        data: exportData,
      };
    }

    if (format === 'pdf') {
      const buffer = await this.generateSalesBookPdf(exportData);
      return {
        format: 'pdf',
        filename: `libro-ventas-dgi-${datePrefix}.pdf`,
        contentType: 'application/pdf',
        buffer,
        data: exportData,
      };
    }

    return {
      format: 'json',
      filename: `libro-ventas-dgi-${datePrefix}.json`,
      contentType: 'application/json',
      data: exportData,
    };
  }

  async exportZReports(
    tenantId: string,
    query?: ExportZReportsQueryDto,
  ): Promise<ExportResult<ZReportsExportDto>> {
    const format: ExportFormat = query?.format ?? 'json';
    const { start, end } = this.parseDateBounds(
      query?.startDate,
      query?.endDate,
    );

    const whereClause: FindOptionsWhere<CashShiftSession> = {
      tenant_id: tenantId,
    };

    if (start && end) {
      whereClause.opened_at = Between(start, end);
    } else if (start) {
      whereClause.opened_at = MoreThanOrEqual(start);
    } else if (end) {
      whereClause.opened_at = LessThanOrEqual(end);
    }

    const shifts = await this.shiftRepo.find({
      where: whereClause,
      order: { opened_at: 'ASC' },
    });

    const records: ZReportRowDto[] = shifts.map((s) => ({
      shiftId: s.id,
      closedAt: s.closed_at ? new Date(s.closed_at).toISOString() : 'ABIERTO',
      openedAt: new Date(s.opened_at).toISOString(),
      terminalId: s.terminal_id,
      zSequence: s.z_report_sequence ?? null,
      cashierName: s.cashier_name,
      initialFloatNio: round2(Number(s.initial_float_nio ?? 0)),
      initialFloatUsd: round2(Number(s.initial_float_usd ?? 0)),
      expectedCashNio: round2(Number(s.expected_cash_nio ?? 0)),
      expectedCashUsd: round2(Number(s.expected_cash_usd ?? 0)),
      finalCountedNio:
        s.final_counted_nio != null
          ? round2(Number(s.final_counted_nio))
          : null,
      finalCountedUsd:
        s.final_counted_usd != null
          ? round2(Number(s.final_counted_usd))
          : null,
      differenceNio:
        s.difference_nio != null ? round2(Number(s.difference_nio)) : null,
      differenceUsd:
        s.difference_usd != null ? round2(Number(s.difference_usd)) : null,
      status: s.status,
      notes: s.notes ?? null,
    }));

    const exportData: ZReportsExportDto = {
      startDate: query?.startDate,
      endDate: query?.endDate,
      generatedAt: new Date().toISOString(),
      totalRecords: records.length,
      records,
    };

    const datePrefix =
      query?.startDate || new Date().toISOString().split('T')[0];

    if (format === 'csv') {
      return {
        format: 'csv',
        filename: `resumen-cortes-z-${datePrefix}.csv`,
        contentType: 'text/csv; charset=utf-8',
        content: this.generateZReportsCsv(records),
        data: exportData,
      };
    }

    if (format === 'xlsx') {
      const buffer = await this.generateZReportsXlsx(exportData);
      return {
        format: 'xlsx',
        filename: `resumen-cortes-z-${datePrefix}.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer,
        data: exportData,
      };
    }

    if (format === 'pdf') {
      const buffer = await this.generateZReportsPdf(exportData);
      return {
        format: 'pdf',
        filename: `resumen-cortes-z-${datePrefix}.pdf`,
        contentType: 'application/pdf',
        buffer,
        data: exportData,
      };
    }

    return {
      format: 'json',
      filename: `resumen-cortes-z-${datePrefix}.json`,
      contentType: 'application/json',
      data: exportData,
    };
  }

  private generateSalesBookCsv(records: SalesBookRowDto[]): string {
    const headers = [
      'Fecha',
      'Numero Factura',
      'Tipo Documento',
      'Cliente',
      'Subtotal Exento (NIO)',
      'Subtotal Gravado (NIO)',
      'IVA 15% (NIO)',
      'Descuento (NIO)',
      'Total (NIO)',
      'Total (USD)',
      'Estado',
    ];

    const lines = [headers.map(escapeCsv).join(',')];

    for (const r of records) {
      lines.push(
        [
          escapeCsv(r.date),
          escapeCsv(r.invoiceNumber),
          escapeCsv(r.documentType),
          escapeCsv(r.customerName),
          r.exemptSubtotalNio.toFixed(2),
          r.taxableSubtotalNio.toFixed(2),
          r.taxAmountNio.toFixed(2),
          r.discountNio.toFixed(2),
          r.totalNio.toFixed(2),
          r.totalUsd.toFixed(2),
          escapeCsv(r.status),
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  private generateZReportsCsv(records: ZReportRowDto[]): string {
    const headers = [
      'ID Turno',
      'Fecha Apertura',
      'Fecha Cierre',
      'Terminal',
      'Secuencia Z',
      'Cajero',
      'Fondo Inicial (NIO)',
      'Fondo Inicial (USD)',
      'Esperado (NIO)',
      'Esperado (USD)',
      'Contado (NIO)',
      'Contado (USD)',
      'Diferencia (NIO)',
      'Diferencia (USD)',
      'Estado',
    ];

    const lines = [headers.map(escapeCsv).join(',')];

    for (const r of records) {
      lines.push(
        [
          escapeCsv(r.shiftId),
          escapeCsv(r.openedAt),
          escapeCsv(r.closedAt),
          escapeCsv(r.terminalId),
          r.zSequence != null ? String(r.zSequence) : '""',
          escapeCsv(r.cashierName),
          r.initialFloatNio.toFixed(2),
          r.initialFloatUsd.toFixed(2),
          r.expectedCashNio.toFixed(2),
          r.expectedCashUsd.toFixed(2),
          r.finalCountedNio != null ? r.finalCountedNio.toFixed(2) : '""',
          r.finalCountedUsd != null ? r.finalCountedUsd.toFixed(2) : '""',
          r.differenceNio != null ? r.differenceNio.toFixed(2) : '""',
          r.differenceUsd != null ? r.differenceUsd.toFixed(2) : '""',
          escapeCsv(r.status),
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  private async generateSalesBookXlsx(
    data: SalesBookExportDto,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'OmniFood NI';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Libro de Ventas DGI');

    sheet.columns = [
      { header: 'Fecha', key: 'date', width: 14 },
      { header: 'Número Factura', key: 'invoiceNumber', width: 24 },
      { header: 'Tipo Documento', key: 'documentType', width: 16 },
      { header: 'Cliente / RUC', key: 'customerName', width: 22 },
      { header: 'Exento (NIO)', key: 'exemptSubtotalNio', width: 16 },
      { header: 'Gravado 15% (NIO)', key: 'taxableSubtotalNio', width: 18 },
      { header: 'IVA 15% (NIO)', key: 'taxAmountNio', width: 16 },
      { header: 'Descuento (NIO)', key: 'discountNio', width: 16 },
      { header: 'Total (NIO)', key: 'totalNio', width: 16 },
      { header: 'Total (USD)', key: 'totalUsd', width: 16 },
      { header: 'Estado', key: 'status', width: 14 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' },
    };

    for (const r of data.records) {
      sheet.addRow({
        date: r.date,
        invoiceNumber: r.invoiceNumber,
        documentType: r.documentType,
        customerName: r.customerName,
        exemptSubtotalNio: r.exemptSubtotalNio,
        taxableSubtotalNio: r.taxableSubtotalNio,
        taxAmountNio: r.taxAmountNio,
        discountNio: r.discountNio,
        totalNio: r.totalNio,
        totalUsd: r.totalUsd,
        status: r.status,
      });
    }

    const uint8Array = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8Array);
  }

  private async generateZReportsXlsx(data: ZReportsExportDto): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'OmniFood NI';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Resumen Cortes Z');

    sheet.columns = [
      { header: 'ID Turno', key: 'shiftId', width: 38 },
      { header: 'Apertura', key: 'openedAt', width: 22 },
      { header: 'Cierre', key: 'closedAt', width: 22 },
      { header: 'Terminal', key: 'terminalId', width: 16 },
      { header: 'Secuencia Z', key: 'zSequence', width: 14 },
      { header: 'Cajero', key: 'cashierName', width: 22 },
      { header: 'Fondo Inicial (NIO)', key: 'initialFloatNio', width: 18 },
      { header: 'Fondo Inicial (USD)', key: 'initialFloatUsd', width: 18 },
      { header: 'Esperado (NIO)', key: 'expectedCashNio', width: 18 },
      { header: 'Esperado (USD)', key: 'expectedCashUsd', width: 18 },
      { header: 'Contado (NIO)', key: 'finalCountedNio', width: 18 },
      { header: 'Contado (USD)', key: 'finalCountedUsd', width: 18 },
      { header: 'Diferencia (NIO)', key: 'differenceNio', width: 18 },
      { header: 'Diferencia (USD)', key: 'differenceUsd', width: 18 },
      { header: 'Estado', key: 'status', width: 14 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' },
    };

    for (const r of data.records) {
      sheet.addRow({
        shiftId: r.shiftId,
        openedAt: r.openedAt,
        closedAt: r.closedAt,
        terminalId: r.terminalId,
        zSequence: r.zSequence ?? 'N/A',
        cashierName: r.cashierName,
        initialFloatNio: r.initialFloatNio,
        initialFloatUsd: r.initialFloatUsd,
        expectedCashNio: r.expectedCashNio,
        expectedCashUsd: r.expectedCashUsd,
        finalCountedNio: r.finalCountedNio ?? 0,
        finalCountedUsd: r.finalCountedUsd ?? 0,
        differenceNio: r.differenceNio ?? 0,
        differenceUsd: r.differenceUsd ?? 0,
        status: r.status,
      });
    }

    const uint8Array = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8Array);
  }

  private async generateSalesBookPdf(
    data: SalesBookExportDto,
  ): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'landscape',
      margin: 30,
    });

    doc
      .fontSize(16)
      .fillColor('#1E3A8A')
      .text('OMNIFOOD NI — LIBRO DE VENTAS DGI (DT 09-2007)', {
        align: 'center',
      });
    doc.moveDown(0.5);

    doc
      .fontSize(10)
      .fillColor('#333333')
      .text(
        `Período: ${data.startDate || 'Inicio'} a ${
          data.endDate || 'Actualidad'
        } | Generado: ${new Date(data.generatedAt).toLocaleString()}`,
        { align: 'center' },
      );
    doc.moveDown(0.5);

    doc
      .fontSize(10)
      .fillColor('#000000')
      .text(
        `Total Registros: ${data.totalRecords} | Ventas Brutas: C$ ${data.totalGrossNio.toFixed(
          2,
        )} | IVA 15%: C$ ${data.totalTaxNio.toFixed(
          2,
        )} | Exento: C$ ${data.totalExemptNio.toFixed(2)}`,
        { align: 'center' },
      );
    doc.moveDown(1);

    // Table Header
    doc
      .fontSize(9)
      .fillColor('#1E3A8A')
      .text(
        'Fecha        Número Factura          Tipo            Cliente               Gravado (NIO)    IVA (NIO)     Total (NIO)     Estado',
      );
    doc.moveTo(30, doc.y).lineTo(760, doc.y).stroke();
    doc.moveDown(0.5);

    doc.fontSize(8).fillColor('#222222');
    for (const r of data.records.slice(0, 45)) {
      const line = `${r.date.padEnd(12)} ${r.invoiceNumber.padEnd(22)} ${r.documentType.padEnd(14)} ${r.customerName.slice(0, 18).padEnd(20)} ${r.taxableSubtotalNio.toFixed(2).padStart(12)} ${r.taxAmountNio.toFixed(2).padStart(12)} ${r.totalNio.toFixed(2).padStart(14)} ${r.status.padStart(10)}`;
      doc.text(line);
    }

    if (data.records.length > 45) {
      doc.moveDown(0.5);
      doc
        .fontSize(8)
        .fillColor('#666666')
        .text(`... y ${data.records.length - 45} registros adicionales.`);
    }

    doc.end();
    return buildPdfBuffer(doc);
  }

  private async generateZReportsPdf(data: ZReportsExportDto): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'landscape',
      margin: 30,
    });

    doc
      .fontSize(16)
      .fillColor('#1E3A8A')
      .text('OMNIFOOD NI — RESUMEN DE CORTES DE CAJA (CORTE Z)', {
        align: 'center',
      });
    doc.moveDown(0.5);

    doc
      .fontSize(10)
      .fillColor('#333333')
      .text(
        `Período: ${data.startDate || 'Inicio'} a ${
          data.endDate || 'Actualidad'
        } | Total Cortes: ${data.totalRecords} | Generado: ${new Date(
          data.generatedAt,
        ).toLocaleString()}`,
        { align: 'center' },
      );
    doc.moveDown(1);

    doc
      .fontSize(9)
      .fillColor('#1E3A8A')
      .text(
        'Terminal     Secuencia Z    Cajero              Apertura             Cierre               Esperado (NIO)  Contado (NIO)   Diferencia (NIO)  Estado',
      );
    doc.moveTo(30, doc.y).lineTo(760, doc.y).stroke();
    doc.moveDown(0.5);

    doc.fontSize(8).fillColor('#222222');
    for (const r of data.records.slice(0, 45)) {
      const zSeqStr = r.zSequence != null ? String(r.zSequence) : 'N/A';
      const line = `${r.terminalId.padEnd(12)} ${zSeqStr.padEnd(14)} ${r.cashierName.slice(0, 16).padEnd(18)} ${r.openedAt.slice(0, 16).padEnd(20)} ${r.closedAt.slice(0, 16).padEnd(20)} ${r.expectedCashNio.toFixed(2).padStart(12)} ${(r.finalCountedNio ?? 0).toFixed(2).padStart(14)} ${(r.differenceNio ?? 0).toFixed(2).padStart(16)} ${r.status.padStart(10)}`;
      doc.text(line);
    }

    if (data.records.length > 45) {
      doc.moveDown(0.5);
      doc
        .fontSize(8)
        .fillColor('#666666')
        .text(`... y ${data.records.length - 45} cortes adicionales.`);
    }

    doc.end();
    return buildPdfBuffer(doc);
  }

  private parseDateBounds(
    startDateStr?: string,
    endDateStr?: string,
  ): { start?: Date; end?: Date } {
    let start: Date | undefined;
    let end: Date | undefined;

    if (startDateStr) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(startDateStr)) {
        start = new Date(`${startDateStr}T00:00:00.000Z`);
      } else {
        start = new Date(startDateStr);
      }
    }

    if (endDateStr) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(endDateStr)) {
        end = new Date(`${endDateStr}T23:59:59.999Z`);
      } else {
        end = new Date(endDateStr);
      }
    }

    return { start, end };
  }
}
