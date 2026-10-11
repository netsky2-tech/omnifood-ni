# Replacement Terminal Fiscal Sequence — Decision and Recovery Flow

**Decision (owner, 2026-10-12, item F-10g):** a replacement (or reinstalled) terminal **inherits the tenant's fiscal counter**. The verification sale is a real fiscal document — persisted PAID, synced, DGI-numbered — so it consumes the tenant's real consecutive. A dedicated series for the verification sale was rejected: it would split the consecutive of a single emission point for a sale that genuinely happened, which is disputable under the numbering discipline of Disposición Técnica 09-2007.

## How the chain works (already implemented)

1. **Priming records the tenant-wide watermark.** The backend priming payload carries `highestSequenceNumber` = `MAX` over ALL of the tenant's invoices (not just the replaced terminal's — `terminal-priming.service.ts`). The POS priming service stores it as the local key `dgi_cloud_highest_sequence`.
2. **A fresh terminal seeds above the watermark.** The controlled sale runner provisions the fiscal series at `cloudHighest + 1` when the terminal has no series, so the verification sale can never collide with an already-issued folio (D-6).
3. **A lagging cursor is never auto-healed.** If the terminal already has a series but its cursor is behind the watermark, the runner refuses with `FISCAL_SEQUENCE_RECOVERY_REQUIRED` ("…el consecutivo local está por detrás del último folio emitido en la nube. No venda: llame a soporte…"). The backend replay tripwire is the only authority that may refuse a sequence; the terminal stops honestly instead of fabricating the missing numbers.

Test coverage: `activation_priming_service_test.dart` (the D-6 key write) and `activation_controlled_sale_runner_test.dart` (seed above watermark, lag refusal with untouched cursor, pass-through advancing only by issuance).

## Support flow when `FISCAL_SEQUENCE_RECOVERY_REQUIRED` appears

This state means the terminal's local cursor is behind folios the cloud already issued. Reinstalling, re-activating, or retrying will NOT fix it — do not advise retries.

1. Read the terminal's local cursor (`dgi_current_number`) and the cloud watermark (`dgi_cloud_highest_sequence`).
2. Reconcile the sequence manually against the cloud invoice ledger: the next local folio must be `MAX(issued) + 1`. See `pilot-terminal-incident-procedure.md` — duplicate folios already exist in the pilot data, and Art. 129 "causa justa" evidence requirements apply before any corrective renumbering.
3. Never renumber to a value at or below the watermark, and never fabricate the gap numbers.

## Related incidents

- `CRITICAL_SEQUENCE_PAYLOAD_MISMATCH` on re-linking a terminal with fiscal history (the F-10f field case): the backend replay tripwire deterministically refuses a re-proposed sequence with different content. From POS build 1.1.0+19030 the operator sees an honest message telling them NOT to retry; the reconciliation is a support action, per the flow above.
