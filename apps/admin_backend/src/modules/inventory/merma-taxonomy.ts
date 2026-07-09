import { BadRequestException } from '@nestjs/common';

export const MERMA_REASONS = {
  VENCIDO: 'VENCIDO',
  DESECHO_COCINA: 'DESECHO_COCINA',
  DETERIORO_BODEGA: 'DETERIORO_BODEGA',
  CORTESIA_DEGUSTACION: 'CORTESIA_DEGUSTACION',
} as const;

export type MermaReason = (typeof MERMA_REASONS)[keyof typeof MERMA_REASONS];

const MERMA_REASON_ALIASES = {
  VENCIMIENTO: MERMA_REASONS.VENCIDO,
  MALA_PREPARACION: MERMA_REASONS.DESECHO_COCINA,
  ROTO: MERMA_REASONS.DETERIORO_BODEGA,
  DETERIORADO: MERMA_REASONS.DETERIORO_BODEGA,
  CORTESIA: MERMA_REASONS.CORTESIA_DEGUSTACION,
} as const satisfies Record<string, MermaReason>;

export function normalizeMermaReason(value: string): MermaReason | null {
  const normalized = value.trim().toUpperCase();
  const canonicalReasons = Object.values(MERMA_REASONS);
  if (canonicalReasons.includes(normalized as MermaReason)) {
    return normalized as MermaReason;
  }

  return (
    MERMA_REASON_ALIASES[normalized as keyof typeof MERMA_REASON_ALIASES] ??
    null
  );
}

export function requireMermaObservation(value: string): string {
  const observation = value.trim();
  if (observation.length === 0) {
    throw new BadRequestException('Merma observation is required');
  }

  return observation;
}
