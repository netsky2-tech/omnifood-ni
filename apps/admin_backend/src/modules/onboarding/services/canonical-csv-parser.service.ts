import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  CANONICAL_IMPORT_CONTRACT_V1,
  isUnknownColumn,
  isUnsupportedColumn,
  normalizeHeaderName,
  UNSUPPORTED_COLUMNS_REASONS,
} from './import-contract-version';

export interface NormalizedProductRow {
  nombre: string;
  precioVenta: number;
  uom: string;
  sku: string | null;
  categoria: string;
  porcentajeIva: number;
}

export interface ParsedCsvRow {
  rowOrdinal: number;
  rawValues: Record<string, string>;
  normalizedValues: NormalizedProductRow;
  unsupportedFieldsDetected: string[];
  unknownColumns: string[];
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ParsedCsvResult {
  contractVersion: string;
  sourceHash: string;
  delimiter: string;
  headers: string[];
  normalizedHeaders: Record<string, string | null>;
  unsupportedHeaders: string[];
  unknownHeaders: string[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  rows: ParsedCsvRow[];
}

@Injectable()
export class CanonicalCsvParserService {
  /**
   * Split a single CSV line into tokens respecting quotation marks.
   */
  private parseCsvLine(line: string, delimiter: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote: "" -> "
          current += '"';
          i++; // skip escaped quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        tokens.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    tokens.push(current.trim());
    return tokens.map((t) => (t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).trim() : t));
  }

  /**
   * Cleans currency, percentages, and locale number formats.
   */
  private cleanAndParseNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    if (typeof value === 'number') {
      return isNaN(value) ? null : value;
    }
    if (typeof value !== 'string') {
      return null;
    }

    const cleaned = value
      .replace(/C\$/gi, '')
      .replace(/\$/g, '')
      .replace(/NIO/gi, '')
      .replace(/%/g, '')
      .replace(/,/g, '')
      .trim();

    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * Detects delimiter by inspecting the header line.
   */
  private detectDelimiter(headerLine: string): string {
    const commaCount = (headerLine.match(/,/g) || []).length;
    const semicolonCount = (headerLine.match(/;/g) || []).length;
    return semicolonCount > commaCount ? ';' : ',';
  }

  public parseRawCsv(rawCsv: string): ParsedCsvResult {
    const trimmed = (rawCsv || '').trim();
    const sourceHash = crypto.createHash('sha256').update(trimmed).digest('hex');

    if (!trimmed) {
      return {
        contractVersion: CANONICAL_IMPORT_CONTRACT_V1.version,
        sourceHash,
        delimiter: ',',
        headers: [],
        normalizedHeaders: {},
        unsupportedHeaders: [],
        unknownHeaders: [],
        totalRows: 0,
        validRows: 0,
        errorRows: 0,
        rows: [],
      };
    }

    const lines = trimmed
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      return {
        contractVersion: CANONICAL_IMPORT_CONTRACT_V1.version,
        sourceHash,
        delimiter: ',',
        headers: [],
        normalizedHeaders: {},
        unsupportedHeaders: [],
        unknownHeaders: [],
        totalRows: 0,
        validRows: 0,
        errorRows: 0,
        rows: [],
      };
    }

    const headerLine = lines[0];
    const delimiter = this.detectDelimiter(headerLine);
    const rawHeaders = this.parseCsvLine(headerLine, delimiter);

    const normalizedHeaders: Record<string, string | null> = {};
    const unsupportedHeaders: string[] = [];
    const unknownHeaders: string[] = [];

    rawHeaders.forEach((h) => {
      const norm = normalizeHeaderName(h);
      normalizedHeaders[h] = norm;

      if (isUnsupportedColumn(h)) {
        unsupportedHeaders.push(h);
      } else if (isUnknownColumn(h)) {
        unknownHeaders.push(h);
      }
    });

    const rows: ParsedCsvRow[] = [];
    let validCount = 0;
    let errorCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const tokens = this.parseCsvLine(line, delimiter);
      const rawValues: Record<string, string> = {};

      rawHeaders.forEach((h, idx) => {
        rawValues[h] = tokens[idx] !== undefined ? tokens[idx] : '';
      });

      const errors: string[] = [];
      const warnings: string[] = [];
      const unsupportedFieldsDetected: string[] = [];
      const rowUnknownCols: string[] = [];

      let rawNombre = '';
      let rawPrecioVenta = '';
      let rawUom = '';
      let rawSku = '';
      let rawCategoria = '';
      let rawPorcentajeIva = '';

      rawHeaders.forEach((h) => {
        const val = rawValues[h] || '';
        const norm = normalizedHeaders[h];

        if (isUnsupportedColumn(h) && val) {
          unsupportedFieldsDetected.push(h);
          const reason =
            UNSUPPORTED_COLUMNS_REASONS[
              h.toLowerCase().trim().replace(/[\s\u0300-\u036f]/g, '')
            ] ||
            UNSUPPORTED_COLUMNS_REASONS[h.toLowerCase().trim()] ||
            `Columna no soportada en V1: ${h}`;
          warnings.push(reason);
        } else if (isUnknownColumn(h)) {
          rowUnknownCols.push(h);
        }

        if (norm === 'nombre' && !rawNombre) rawNombre = val;
        if (norm === 'precio_venta' && !rawPrecioVenta) rawPrecioVenta = val;
        if (norm === 'uom' && !rawUom) rawUom = val;
        if (norm === 'sku' && !rawSku) rawSku = val;
        if (norm === 'categoria' && !rawCategoria) rawCategoria = val;
        if (norm === 'porcentaje_iva' && !rawPorcentajeIva) rawPorcentajeIva = val;
      });

      // Validate required nombre
      if (!rawNombre.trim()) {
        errors.push('El nombre del producto es obligatorio');
      }

      // Validate required precio_venta
      const parsedPrecio = this.cleanAndParseNumber(rawPrecioVenta);
      if (parsedPrecio === null) {
        errors.push(`El precio de venta '${rawPrecioVenta}' no es numérico`);
      } else if (parsedPrecio < 0) {
        errors.push('El precio de venta no puede ser negativo');
      }

      // Validate optional porcentaje_iva
      let parsedIva = 0;
      if (rawPorcentajeIva) {
        const parsed = this.cleanAndParseNumber(rawPorcentajeIva);
        if (parsed !== null && parsed >= 0 && parsed <= 100) {
          parsedIva = parsed;
        }
      }

      const isValid = errors.length === 0;
      if (isValid) {
        validCount++;
      } else {
        errorCount++;
      }

      rows.push({
        rowOrdinal: i,
        rawValues,
        normalizedValues: {
          nombre: rawNombre.trim(),
          precioVenta: parsedPrecio !== null && parsedPrecio >= 0 ? parsedPrecio : 0,
          uom: rawUom.trim() || 'UN',
          sku: rawSku.trim() || null,
          categoria: rawCategoria.trim() || 'General',
          porcentajeIva: parsedIva,
        },
        unsupportedFieldsDetected,
        unknownColumns: rowUnknownCols,
        isValid,
        errors,
        warnings,
      });
    }

    return {
      contractVersion: CANONICAL_IMPORT_CONTRACT_V1.version,
      sourceHash,
      delimiter,
      headers: rawHeaders,
      normalizedHeaders,
      unsupportedHeaders,
      unknownHeaders,
      totalRows: rows.length,
      validRows: validCount,
      errorRows: errorCount,
      rows,
    };
  }
}
