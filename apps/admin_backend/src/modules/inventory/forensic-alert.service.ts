import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

export const FORENSIC_ALERT_DISPATCHER = 'FORENSIC_ALERT_DISPATCHER';

export interface ForensicAlertDispatcher {
  dispatchToAdmins(input: ForensicAlertInput): Promise<void>;
}

export interface ForensicAlertInput {
  tenantId: string;
  alertType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  actorRole?: string;
  message: string;
  metadata: Record<string, unknown>;
}

const HIGH_VALUE_INVENTORY_ALERT_THRESHOLD_NIO = 1500;

const QUALIFYING_HIGH_VALUE_DOCUMENT_TYPES = new Set([
  'AJUSTE_CONTEO',
  'AJUSTE_MANUAL',
  'SHRINKAGE',
  'SALIDA_MERMA',
]);

const EXCLUDED_HIGH_VALUE_DOCUMENT_TYPES = new Set([
  'SALE',
  'SALE_CANCEL',
  'SALIDA_VENTA',
  'PRODUCTION',
  'ENTRADA_PRODUCCION',
  'SALIDA_BOM_PRODUCCION',
]);

export interface HighValueInventoryAlertCandidate {
  valuationNio: number;
  movementType: string;
  sourceDocumentType: string;
}

export function shouldCreateHighValueInventoryAlert(
  candidate: HighValueInventoryAlertCandidate,
): boolean {
  if (
    Math.abs(candidate.valuationNio) < HIGH_VALUE_INVENTORY_ALERT_THRESHOLD_NIO
  ) {
    return false;
  }

  if (EXCLUDED_HIGH_VALUE_DOCUMENT_TYPES.has(candidate.sourceDocumentType)) {
    return false;
  }

  return QUALIFYING_HIGH_VALUE_DOCUMENT_TYPES.has(candidate.sourceDocumentType);
}

@Injectable()
export class ForensicAlertService {
  private readonly logger = new Logger(ForensicAlertService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Optional()
    @Inject(FORENSIC_ALERT_DISPATCHER)
    private readonly dispatcher?: ForensicAlertDispatcher,
  ) {}

  async create(
    input: ForensicAlertInput,
    manager?: EntityManager,
  ): Promise<void> {
    const executor = manager ?? this.dataSource.manager;
    await executor.query(
      `INSERT INTO forensic_alerts (tenant_id, alert_type, severity, actor_role, message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        input.tenantId,
        input.alertType,
        input.severity,
        input.actorRole ?? 'ADMIN',
        input.message,
        JSON.stringify(input.metadata),
      ],
    );

    if (this.dispatcher) {
      // Fire and forget to decouple external dispatch from transaction commit path
      Promise.resolve()
        .then(() => this.dispatcher.dispatchToAdmins(input))
        .catch((err) => {
          this.logger.error(
            `Failed to dispatch forensic alert: ${err instanceof Error ? err.message : String(err)}`,
            err instanceof Error ? err.stack : undefined,
          );
        });
    }
  }
}
