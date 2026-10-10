/**
 * Round-2 F-4a: the owner's audit ledger renders an "entidad" column, but the
 * POS never sends `target_type`/`target_id`, so every POS row rendered "—"
 * and the owner could not see WHAT was voided or credited.
 *
 * The entity is derivable from the action + the metadata the POS already
 * sends (the same metadata the ledger response deliberately does not
 * expose). Derivation happens at INGESTION, typing the columns; existing
 * rows are NOT backfilled — the ledger is hash-chained and rewriting stored
 * rows would break the chain.
 *
 * Known POS actions only; anything else derives nothing and stays "—"
 * rather than guessing.
 */

interface AuditTargetMapping {
  type: string;
  metadataKey: string;
}

const AUDIT_TARGET_BY_ACTION: Record<string, AuditTargetMapping> = {
  SALE_CREATED: { type: 'INVOICE', metadataKey: 'invoice_id' },
  SALE_VOIDED: { type: 'INVOICE', metadataKey: 'invoice_id' },
  REPRINT_REQUESTED: { type: 'INVOICE', metadataKey: 'invoice_id' },
  // The note is its own fiscal document; its `new_id` names the entity, and
  // the affected invoice stays in the metadata.
  CREDIT_NOTE_CREATED: { type: 'INVOICE', metadataKey: 'new_id' },
};

export interface DerivedAuditTarget {
  target_type: string | null;
  target_id: string | null;
}

export function deriveAuditTarget(
  action: string,
  metadata: unknown,
): DerivedAuditTarget {
  const mapping = AUDIT_TARGET_BY_ACTION[action];
  if (!mapping) {
    return { target_type: null, target_id: null };
  }
  const meta =
    metadata && typeof metadata === 'object'
      ? (metadata as Record<string, unknown>)
      : null;
  const id = meta?.[mapping.metadataKey];
  if (typeof id !== 'string' || !id.trim()) {
    return { target_type: mapping.type, target_id: null };
  }
  return { target_type: mapping.type, target_id: id };
}
