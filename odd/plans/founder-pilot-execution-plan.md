# Founder Pilot — Execution Plan

**Answers:** *"do we have what we need to implement?"* → now yes. **Scope:** issues #517–#532 plus the gate #531. **Rule:** no batch is entered until the previous batch's **exit checks** are observed, not asserted.

Every unit below maps to acceptance criteria (`AC-n`) in its issue body. An item without a `DONE` is not done, and `DONE` means the criterion was executed and observed.

## Reading this plan

- **Batch 0 is not optional and is not "prep".** It decides the size of Batch 3 and whether Batch 4 exists at all.
- **PR shape:** one reviewable work unit per PR, target under ~400 changed lines. Split before opening, not during review.
- **TDD per `AGENTS.md`:** failing test first for every logic change. Two units (R2, L1) exist specifically because a unit-tested method with no production caller shipped broken repeatedly — assert the *call*, not just the internals.
- Commits land on the feature branch as work units. Push/PR/merge remain the user's decisions.

---

## Owner directives — 2026-09-24 (binding; they re-shape this plan)

Eight decisions issued in reply to the #535 questions. **These are the accountant's answers, relayed by the owner** — not owner-only engineering posture, which is what an earlier draft of this section claimed. That distinction matters for what stays open: they close every question of *interpretation*, so no batch is blocked on a legal reading anymore. Three questions of *fact* remain, and no amount of code reading answers them — the range DGI actually authorized for SOHO, the authorization letter's number and date, and the filing procedure for a dead terminal. D-8 names the first of those as a blocker on purpose.

Directive 7 paid for itself immediately — it refuted two claims published in this plan's own evidence base (see *Retractions* below).

| Question | Answered by | Still open |
|---|---|---|
| Q1 authorized range + exhaustion procedure | D-1 (range is tenant configuration, never a default) + D-8 (no auto-renewal) | **the actual authorized numbers** — document request, not a judgment call |
| Q2 one series per terminal? | D-2 — differentiated series is required for **sucursales/agencias**, not per device | whether a second register in the *same* premises is a sucursal |
| Q3 document type + IVA break-out | D-3 — separate `CUOTA_FIJA` / `REGIMEN_GENERAL` profiles, Cuota Fija transfers no IVA, never hardcode 15% | which specific document SOHO issues (Simplificada vs Consumidor Final vs Ticket) |
| Q4 is DT 09-2007 current / does it bind Cuota Fija | — | **unanswered.** #539's three gaps are conditional on it |
| Q5 filing when a terminal dies | D-6 — replacement never restarts a series; undetermined last folio → `FISCAL_SEQUENCE_RECOVERY_REQUIRED` | **what is filed, where, and by when** — the incident procedure's uncited deadline |
| Q6 inventory-shortfall proof | D-7 — verify the code first (it refuted me), plus a 6-field operational minimum per merma | the *prueba en contrario* standard an inspector accepts; scope of the 10-day destruction notice |
| Q7 authorization number + manuals | D-4 — add `fiscalAuthorizationNumber`, no go-live without it where required. D-5 — Spanish manuals are pending compliance deliverables | **the letter's number and date** |

Practical consequence for B0.3: the seven-question message is no longer needed as a *criterio* request. What remains is a **two-line document request** (range resolution + authorization letter) and Q4, which is still a real question. Don't send the long version to collect what D-1…D-8 already settled.

| # | Directive | Effect on this plan |
|---|---|---|
| **D-1** | Delete 1–1000 as a default fiscal range; forbid bootstrap/reinstall from overwriting a persisted fiscal sequence. Range/series become configuration sourced from the tenant's DGI documentation. | Absorbs #520 D1/D2 into **B2a** as one unit. Kills three competing hardcoded defaults (below). The *values* still come from Q1 — D-1 fixes who owns them, not what they are. |
| **D-2** | Do **not** model "one mandatory series per device" as a legal requirement. Differentiated series is expressly required for **sucursales/agencias**. Multiple offline emitters in one premises → sequence strategy is fiscal **configuration gated on approval** before enabling a terminal. | Reframes **B5a** and **#532 T4**: the gate is an approval workflow, not a legal constant. This is the answer to #535 Q2 as written — and it answers it by *narrowing* the claim: we asked whether a second register needs its own informed series, and the requirement attaches to sucursales. |
| **D-3** | Support at least `CUOTA_FIJA` and `REGIMEN_GENERAL` as distinct fiscal profiles. Cuota Fija does not transfer IVA; **never hardcode 15%**. | **Larger than it sounds, smaller than it looks.** Dual-regime already exists and already drives `effectiveTaxRate = 0.0` (`apps/pos_app/lib/domain/models/printer/receipt_document.dart:77-78`), so this is not new architecture. But 15% **is** hardcoded in ~8 places, and the Business Profile default regime is `REGIMEN_GENERAL` for a Cuota Fija client. See *Litigation against D-3* below. |
| **D-4** | Add `fiscalAuthorizationNumber` to the fiscal profile and the computerized-invoice renderer. No fiscal go-live if the client requires computerized authorization and the datum/document is unavailable. | **B1d changes from "add a field" to "wire an existing orphan"** — see Retractions. The go-live gate is new: it is the first *blocking* condition in this plan that is not a code check. |
| **D-5** | Technical manual and user manual in Spanish are **pending compliance deliverables** (DT 09-2007 ordinal SEGUNDO 1.5). | New. **No issue exists for either deliverable and no batch carries them.** They are not code, so no exit check currently catches their absence. Tracked as B6 below. |
| **D-6** | Terminal replacement never auto-restarts an existing series. If the last issued folio cannot be determined, enter **`FISCAL_SEQUENCE_RECOVERY_REQUIRED`**. | Names a state that does not exist in code today. Verified current behavior: a fresh install with no persisted invoice yields sequence **1** silently (`dgi_numbering_service_impl.dart:70-73` self-heal, and `_resolveNextSequence` returns the configured cursor when `getLastInvoice()` is null). Lands in **B2a**. |
| **D-7** | Verify the codebase before declaring a merma gap — documentation says Mermas/Kardex are implemented. Operational minimum per merma: article, quantity, reason, date, **user**, kardex movement. | **Executed; it refuted me.** Merma recording exists end to end. Real gap against your own minimum is **one field**: `userId` is never set (`movement_engine_impl.dart:123-136` — the parameter does not appear; the model field exists at `inventory_movement.dart:28`). So 5 of your 6, plus no `DESTRUCCION` reason. Does **not** justify a new epic; recorded in #540. |
| **D-8** | Do **not** implement automatic range renewal/amplification or any DGI SLA logic. Blocked until the client's authorization letter/range resolution is reviewed or written criteria arrive. | Explicit **stop** on work nobody had scheduled — this plan never proposed auto-renewal, so D-8 costs nothing and protects against a plausible future "helpful" feature. |

### Hardcoded fiscal defaults D-1 kills

| Value | Where | What it pretends to be |
|---|---|---|
| `prefix '001-001-01-'`, `start 1`, `end 1000` | `apps/pos_app/lib/main.dart:259-263` | the authorized range — **overwrites the client's own setting on every boot** |
| `prefix '001-001-01-'`, `start 1`, `end 1000000` | `apps/pos_app/lib/data/services/sales/dgi_numbering_service_impl.dart:68`, `:104` | the authorized range, self-healed — **and a different value from the boot one** |
| `'dgi_range_end': '10000'` | `apps/pos_app/lib/ui/features/config/business_profile/business_profile_view_model.dart:48` | the form's initial range — **a third value** |
| `'tax_regime': 'REGIMEN_GENERAL'` | `business_profile_view_model.dart:51` | the client's regime — wrong default for a Cuota Fija café |
| `0.15` | `data/models/inventory/product_entity.dart:59`, `migrations.dart:2268` (column default), `activation_priming_service.dart:114`, `sync_service.dart:1721` | IVA rate — **D-3 forbids this** |
| `'IVA (15%)'` | `ui/features/sales/sale_view.dart:1371`, `sales_history_view.dart:324`, `reports/dgi_report_view_model.dart:98`, `reports/dgi_report_view.dart:254`, `:282`, `widgets/split_bill_dialog.dart:218` | an IVA line that a Cuota Fija tenant must not print |

Three different range defaults in one subsystem is the tell: nobody owns this value. #540 lists them independently.

### Retractions (2026-09-24) — two claims in this plan's evidence base were false

Both were published in issues, both corrected in place, both found because D-7 ordered a verification instead of trusting a grep. `path:line` re-read by the parent, not inherited from a subagent.

1. **"Café mermas are nowhere in the system; no waste type in the POS's 5-value enum; backend types internal-only and out of sync scope" (#535 Q6, #533 F1) — FALSE.** `MovementType` has **6** values including `shrinkage` (`domain/models/inventory/inventory_movement.dart:7-13`); a BOH "Mermas" screen records them (`ui/features/inventory/shrinkage/shrinkage_view.dart:48` → `movement_engine_impl.dart:109-136`, which writes stock **and** a kardex row); the reason taxonomy is mirrored on both sides (`merma_taxonomy.dart:1-16` / `admin_backend/src/modules/inventory/merma-taxonomy.ts:3-8`); the cloud handles `SHRINKAGE` explicitly (`inventory.service.ts:196-199`). The pilot tenant's 0 kardex rows are **operator non-use**, not capability. What is actually missing is narrower and is now the honest claim: no author on the record, no `DESTRUCCION` reason, nothing automatic.
2. **"No authorization number field exists anywhere; it is a schema gap" (#539 S1) — FALSE, and the truth is worse.** `dgi_authorization_code` exists, is client-editable in Business Profile labelled *"Código / Resolución de Autorización DGI (CAFD)"* (`business_profile_view.dart:370`), and persists to `local_configs` — and has **zero consumers**. Nothing outside the form reads it, so it is never printed and never synced. **An orphan field is a worse defect shape than a missing one**: the client configures it, it saves with no error and no warning, and the system silently ignores it. Missing prompts a question; orphan manufactures confidence.

**Method lesson, applies to every future sweep in this repo:** absence of the identifier I grepped for is not absence of the feature. Both errors came from English search terms against a Spanish-named codebase. The four-test inventory (#540: EXISTS → EDITABLE → SURVIVES → PRINTED) is now the required instrument for any "field X is missing" claim, because it separates wiring work from schema work from non-work.

### Litigation against D-3 (do not implement this directive naively)

D-3 says "never hardcode 15%" and "support both profiles". Read literally against this codebase it is partly already satisfied and partly impossible to satisfy by deleting literals:

- **Already true:** the receipt's IVA treatment is *derived*, not hardcoded — `receipt_document.dart:77-78` forces `effectiveTaxRate = 0.0` when `isCuotaFija`, and `tax_regime.dart:31` supplies the "NO RECAUDA IVA" notice. So the printed ticket already respects the regime.
- **Genuinely broken:** the *per-product* `tax_rate` column defaults to `0.15` (`migrations.dart:2268`) and inbound sync falls back to `0.15` when the cloud omits it (`sync_service.dart:1721`, `activation_priming_service.dart:114`). A Cuota Fija tenant therefore stores a 15% rate on every product that is only rescued at print time.
- **Report layer lies independently of the ticket:** four screens print `IVA (15%)` unconditionally, and `dgi_report_view_model.dart:98` writes it into the **Reporte X/Z export** — a document the client hands to DGI. Under Cuota Fija that report currently asserts an IVA line that does not exist on her tickets.

Recommendation: implement D-3 as "regime is the single source of IVA treatment, no literal survives a regime check" rather than "delete the 15% constants". Needs its own unit in Batch 2 — see **B2e**.

---

## Batch 0 — Decide and measure (no behaviour change)

| ID | Unit | Issue | Why here |
|---|---|---|---|
| B0.1 | Single-terminal decision **DONE** (2026-09-24, #531 G0.1) | #531 | collapses #520 D2/D5, #527 M5 |
| B0.2 | Run the field queries (device + cloud) | #534 | decides whether #519 is urgent or partly masked |
| B0.3 | Send the **7** questions to the accountant | #535 | Q1/Q2 gate B2a and B5a. *Stale in the first draft of this plan as "6"; Q7 arrived with #539 S1.* Message drafted in Spanish, corrected twice after D-7; **not yet sent** |
| B0.4 | `invoices` unique constraint on `(tenant_id, invoice_number)` + dedupe pass | #526 AC-7 | duplicates **already exist**; the constraint is the missing tripwire. **Reworded on delivery (2026-09-24): there is no dedupe pass, and there cannot be one — #526 AC-11 forbids satisfying AC-7 by deleting or editing an issued invoice, and the append-only trigger forbids the delete anyway. The migration fails closed; cleanup is a separate human-run script.** Shipped in `1809270000000` |
| B0.5 | Report indexes + `EXPLAIN ANALYZE` proof | #529 P1 AC-13 | no behaviour change, biggest cheap win |
| B0.6 | Capacity + latency instrumentation | #528 R1 AC-1…AC-3, #529 P5 | every remaining estimate is unmeasured until this lands |

**Exit checks**
- [ ] Query results recorded in #534; they confirm or refute #519's severity for the pilot tenant
- [x] Duplicate-number blast radius known (real vs synthetic tenants) — **measured 2026-09-24 against the dev DB**: 36 invoices, all `type='regular'`, exactly **3 duplicate groups** across 2 tenants — `001-001-01-00000001` and `…00000002` (tenant `497d0f48`, 2 rows each) and `…00000003` (tenant `e05bf002`, 2 rows). Every one is `regular`, none canceled, each with 1 item and 1–2 payments. The numbers are the literal `1..N` fingerprint of the hardcoded boot range (`apps/pos_app/lib/main.dart:259-263`), so **synthetic, not real fiscal collisions**. Child FKs are `ON DELETE NO ACTION`, which is one more reason deletion was never the answer.
- [x] `invoices` unique constraint shipped **fail-closed** — migration `1809270000000-AddInvoiceNumberUniqueness` adds `uq_invoices_tenant_invoice_number` on `(tenant_id, invoice_number)` and **never deletes or updates an invoice row**. Issue #526 AC-11 forbids satisfying AC-7 by editing an issued invoice, and `invoices` is already append-only by trigger (`1782000000000-AddCreditNoteProvenance.ts:451-453` raises `invoices are append-only: DELETE is forbidden`), so a dedupe-by-delete migration was not a business choice available to make — it is a raised exception. Observed in `1809270000000-…db.spec.ts`: duplicate in one tenant → `23505`; same number across two tenants → legal (multi-tenant numbering is per-establishment); duplicates present → throws naming the offenders **and both rows are still there afterwards**. The dev cleanup lives outside the migration ledger in `scripts/dev-cleanup-duplicate-invoice-numbers.sql`, dry-run by default, because reassigning numbers *is* editing issued invoices and must be a human decision in a disposable environment. **Consequence: the dev DB still fails this migration until that script is run by a person.**
- [ ] `EXPLAIN` shows index scans for the two report paths
- [ ] One day of capacity + checkout-latency data from the real device
- [ ] Accountant answered Q1 and Q2, or their absence is a written risk acceptance

**Stop condition:** if the unique constraint reveals duplicates on a live tenant, stop and route through Scenario D of `docs/operations/pilot-terminal-incident-procedure.md` before continuing.

## Reprint: it exists twice, and neither one works

The owner asked for reprint support "que no existe actualmente". Verified 2026-09-24: it is not absent, it is **built twice and reachable zero times** — the same defect class as `dgi_authorization_code` and `canVoidInvoice`. The correction matters because the fix differs: not "write reprint" but "pick the correct existing engine and give it a call site".

| Mechanism | Location | What it does | Production callers |
|---|---|---|---|
| `reprintLastInvoice()` | `sale_view_model.dart:1478` | Rebuilds items + payments from the DAOs and prints, but only for the in-memory `_lastProcessedInvoice` | **0** |
| `DurablePrintService.requestReprint()` | `durable_print_service.dart:295` | Creates a *marked copy* print job, requires `MANAGER`/`ADMIN`, mandatory trimmed reason, writes `REPRINT_REQUESTED` audit, and per its own doc comment "strictly NEVER duplicates DGI invoice or Kardex" | **0** (tests only) |

`requestReprint` is the correct engine and already encodes the fiscal invariants this project needs — no new folio consumed, no duplicate invoice row, no duplicate Kardex movement, reason captured, actor logged. It is also built for **fulfillment print jobs**, not for the canonical invoice print path, which is why wiring it to Sales History is not a one-liner.

**Open compliance question for the accountant (n.9), not an engineering choice:** `InvoiceEntity` carries **no fiscal header snapshot** (grep `businessName|ruc|legalName` in `invoice_entity.dart` → 0 hits). Business name, RUC, address and phone are read from live `local_configs` at print time, and `reprintLastInvoice` calls `getPrinterConfig()` per reprint. So reprinting a ticket issued before a fiscal-data change reproduces it under **today's** header, not the header it was issued with. Whether a reprint must reproduce the original header, or must be visibly marked as a later copy, is a DGI question — and if it must reproduce the original, that is a schema change (snapshot the header at issuance), not a print-path change. Do not guess it.

**Planned as unit B1r**, deliberately after B1a-3: the ANULADO banner and the REIMPRESIÓN banner are the same rendering slot, and pre-building a reprint banner with no call site would manufacture a fourth member of the wired-but-invisible class.

**Status update: tracked as issue #547.** B1a-3 shipped in `ff9b59fa` with the banner as a shared rendering slot, so the reprint artwork now has somewhere to live once B1r has a call site. #547 records the required behaviour (reprint any specific invoice, marked REIMPRESIÓN, never create an invoice row / consume a folio / write a Kardex movement, actor + mandatory reason audited) and the two open items: question n.9 above, and the rule that a reprint of a cancelled invoice must carry ANULADO **and** REIMPRESIÓN together.

**One correction to the delegation report, recorded because it was believed briefly.** The B1a-3 writer reported that whoever voids an invoice "is not recorded" and that AC-9's identity requirement "needs a schema/data widening". That is wrong: `prepareLog()` resolves the acting user and `_buildAuditEntity(user, …)` stamps both the user id and an ISO-8601 timestamp into the hash-chained audit row (`audit_repository_impl.dart:78-100`), and `6dcadf13` already made that row's metadata valid JSON. What is missing is that the *printed document* does not receive that identity — a print-model wiring gap in B1a-2, not a migration. Left uncorrected, this would have put an unnecessary schema change into the critical path for day 1.



## Batch 1 — Day-1 operability (what the cashier sees)

| ID | Unit | Issue |
|---|---|---|
| B1a | Void reachable + mandatory reason + **"ANULADO" print** + **loyalty reversal in the same transaction** | #525 V1,V2,V3 · #530 L2,L3 |

**D-11 — the accountant's void rule, relayed by the owner (2026-09-24). This is the specification for B1a-2; it supersedes every option el Gentleman proposed.** Quotted verbatim because it is compliance-relevant wording:

> El cajero puede anular directamente una factura emitida por él durante su turno actual y en la misma fecha fiscal. Debe proporcionar un motivo obligatorio. La factura original permanece inmutable y marcada ANULADA; su numeración nunca se reutiliza. La operación revierte de forma atómica los efectos asociados de inventario, Loyalty y venta/caja, y genera Audit Trail completo con voidedByUserId, timestamp y reason.
> No permitir edición de la factura original.
> No permitir self-void de facturas de días anteriores. Esas operaciones pasan a un flujo administrativo separado.
> Supervisor/OWNER no es requisito DGI para el void ordinario del mismo día; puede incorporarse posteriormente como política configurable de control interno.
> Y haría una mejora adicional: no limitaría esto permanentemente a role == CASHIER. Lo modelaría como permiso `VOID_OWN_CURRENT_SHIFT_SALE`. Así mañana SOHO puede decidir quitarle ese permiso a un cajero concreto o exigir supervisor sin tener que cambiar código.

What that resolves at once: the D-10 single-operator case (no supervisor required for same-shift self-void, so the cashier is never stranded), the permission-vs-role question (a named permission, not a role check), the cross-day case (a separate administrative flow, which is the credit note), and atomicity (inventory **+** loyalty **+** cash, which is exactly what `voidInvoice` is missing today).

**Implementation mapping — every clause lands on something that already exists:**

| Her clause | Maps to | Status |
|---|---|---|
| emitted by him | `invoice.userId == currentUser.id` | column exists, populated |
| during his current shift | `invoice.shiftId == openSession.id` | **needs the D-9 migration** — `InvoiceEntity` has no shift FK |
| same fiscal date | — | **OPEN QUESTION, see below** |
| mandatory reason | non-empty trimmed `voidReason` at the repository boundary | exists as a column, unvalidated |
| original immutable | append-only trigger + never UPDATE | already enforced at DB level |
| number never reused | void is a flag flip, sequence never rewinds | already true; B0.4's unique index now protects it |
| atomic inventory+loyalty+cash | one Floor `@transaction` | **inventory yes, loyalty no** — the L2 gap |
| audit with voidedByUserId, timestamp, reason | `SALE_VOIDED` hash-chained entry | exists; `authorizedByUserId`/`authorizedByRole` columns exist and are unused |
| permission not role | `BohPermission`-style string constant + resolver | pattern exists at `boh_permissions.dart:3-39`, sales-level equivalent must be created |

**One phrase I will not invent an implementation for: "misma fecha fiscal".** `grep fiscalDate\|fiscal_date apps/pos_app/lib` returns **zero** hits — there is no fiscal-date concept in the POS data model. What exists is `CashierSession.openedAt/closedAt` and `InvoiceEntity.createdAt`. "Same shift" already implies "same day" except for a shift that crosses midnight, so B1a-2 will gate on **shift identity as the hard predicate** and treat fiscal date as an open question for the accountant: *does a shift that crosses midnight belong to one fiscal day or two, and who closes the day?* That is a DGI day-boundary question, not an engineering choice, and guessing it wrong writes the wrong legal date onto tickets.

**Rounds 2 sent as `docs/operations/preguntas-contadora-round-2.md` (2026-09-24).** Numbering continues #535's Q1–Q7, so the mapping is: **P8** = this fiscal-date / midnight-crossing question (blocks B1a-2's edge case and the X/Z reports), **P9** = the reprint header question from #547 (blocks B1r), **P10** = who emits a cross-day credit note and from where — raised because the backend still rejects `CREDIT_NOTE` over device transport, so the accountant's own "flujo administrativo separado" currently cannot run from the tablet, which is a day-1 procedure gap and not a code gap — **P11** = whether supervisor approval is wanted later as internal policy, explicitly labelled non-DGI. Plus three still-missing facts already asked in #535: the authorized folio range, the authorization resolution number/date, and the dead-terminal filing deadline. The document states plainly that `VOID_OWN_CURRENT_SHIFT_SALE` **does not exist yet** rather than letting her read a design decision as shipped behaviour.

**Owner decisions taken while scoping B1a (2026-09-24).** D-11 below closes D-9 and D-10; they are kept because they record why the rule is shaped the way it is.

- **D-9 — the void needs a shift FK, so it gets one.** When told "same shift" is impossible because `InvoiceEntity` has no link to `CashierSession`, the owner chose **add the FK now** over calendar-day-only. So B1a-4 becomes: Floor migration adding shift membership to invoices, written on every new sale, plus a guard comparing the invoice's shift against the open session. **The owner accepted the backfill problem explicitly**: old tickets have no recorded shift and the data cannot be reconstructed, so the guard must define its behaviour for shift-unknown invoices rather than silently excluding them.
- **D-10 — supervisor-PIN-only is not a valid answer for this deployment.** The owner rejected the framing of the role question: at a food-park kiosk the owner may be present to enter a PIN, **or may not be** — the cashier is sometimes alone. A rule that requires a supervisor to void is a rule that strands the single-operator case, which is the common case in the target market. D-11 resolves it: supervisor is not a DGI requirement for the ordinary same-shift void.

**Scout completed (task `muev5927-5-n7bo`, 27 turns / 87 tool calls, read-only). Six findings that re-shape the unit:**


| # | Finding | Evidence | Consequence |
|---|---|---|---|
| 1 | **`voidInvoice` is dead code.** Zero UI callers under `apps/pos_app/lib/ui/`. The only production caller is the activation cleanup runner. | `grep voidInvoice apps/pos_app/lib/ui` → 0 matches | V1 is genuinely a UI task, as #525 always claimed. The engine needs no work. |
| 2 | **`canVoidInvoice` already exists and is read by nobody but generated mocks.** Owner/manager only. | `sale_view_model.dart:626-627`; only readers are `*.test.mocks.dart` | Third member of the `dgi_authorization_code` class: wired, invisible. Do **not** re-create a permission system. |
| 3 | **A supervisor-override pattern already ships** for cash-restricted actions — `grantSupervisorOverride()` at `:637`, used from `sale_view.dart:324,327,437,443,564`. | read `sale_view_model.dart:630-654` | This is the third option for the role question. A cashier voids **with a supervisor PIN**, reusing a mechanism the café already knows, instead of choosing between "cashier can" and "cashier can't". |
| 4 | **`InvoiceEntity` has no shift/session foreign key.** `CashierSession` exists with `openedAt`/`closedAt`, but nothing links an invoice to it. | `invoice_entity.dart:20-80`; grep `shiftId\|sessionId\|cashierSession` → 0 | **#539 S2.1 cannot be "same shift" without a schema migration.** Offline, the only recoverable fact is calendar day. Inference by `userId + terminalId + createdAt` against session windows is possible but fragile. |
| 5 | **V3 is pure greenfield and purely additive** — no `isCanceled` field on `ReceiptDocument`, and `fromInvoice()` never reads it, so a cancelled invoice prints identically to an active one. | `receipt_document.dart:187-280,298-380,397-408`; zero `isCanceled\|void\|cancel\|anulado` matches in the whole printer domain layer | ANULADO printing is 4 additive edits, no existing code modified. |
| 6 | **The credit-note false success is confirmed and permanent.** `sales_history_view.dart:370-381` shows `"Nota de Crédito emitida correctamente"` unconditionally after `await processReturn()`; `processReturn` (`:1589-1621`) *catches* backend rejection into `_errorMessage` and never throws, and the caller never reads it. Rejected notes stay `pending` and retry the same payload forever (`sync_service.dart:565-591`). | as listed | Not introduced by void, but it is the reason AC-13 exists. Cheapest honest fix in the batch (~15-30 lines). |

**Slices, ranked by value-per-review-line:**

| Slice | Contents | Est. lines | Why this grouping |
|---|---|---|---|
| **B1a-1** | audit-JSON fix + credit-note false-success fix | ~20-35 | Both are correctness fixes with zero interaction with void. Ship first, independently. |
| **B1a-2** | V1 (UI + reason validation) **+** L2/L3 (loyalty reversal) | ~180-270 | **Inseparable.** `voidInvoice` touches only inventory reversal + flag + audit; loyalty is granted inside `try{}catch(_){}` at `:1277-1288` and `:1300-1311` and never reversed. Shipping V1 alone turns a theoretical bug into a live one on the first click. |
| **B1a-3** | V3 ("ANULADO" print) | ~60-100 | Additive, no existing code touched. #533 F2 makes it a legal requirement, not polish. |
| **B1a-4** | S2 same-day guard | ~40-60 | Blocked on the schema question from finding 4 — calendar-day now, or a migration to store shift membership. |

| B1b | Template recipes: correct `product_type` + published state, apply-version, honest message | #523 D1,D2,D3 |
| B1c | Stop showing numbers we know are wrong: honest `stock` read, inventory screens annotated | #521 F1 · #531 G2.1 |
| B1d | Print the **DGI authorization number** bottom-right on every ticket — **re-scoped by D-4: the field already exists and is client-editable, so this is "wire the orphan", not "add a field"** | #539 S1 · #540 · #531 G1.6 |

**Exit checks**
- [ ] #525 AC-1…AC-13 green, including field check AC-4 (cashier voids unaided in <15 s)
- [ ] #530 AC-5: void removes the points it granted; AC-7: a failed loyalty reversal aborts the void
- [ ] A café-template apply leaves visible, published recipes with correct product type
- [ ] No product renders "SIN STOCK" from the dead field
- [ ] **G1.3 answered by the accountant before the first printed ticket**
- [ ] A real printed ticket carries the authorization number (#539 AC-1, AC-4) — **blocked on #535 Q7: does the client hold one?**

**Why B1a bundles four units:** #525 V1 alone ships a void that corrupts loyalty balances (#530 L2), and a void with no printed evidence is incomplete under Art. 143 LCT (#533 F2). Splitting them guarantees a broken intermediate state.

## Batch 2 — Fiscal continuity (the 30-day cliff)

| ID | Unit | Issue | Depends |
|---|---|---|---|
| B2a | Numbering stops lying: **no fiscal default at all** (D-1), range warning, terminal-scoped counter, **replay tripwire**, and the named fail-closed state **`FISCAL_SEQUENCE_RECOVERY_REQUIRED`** when the last issued folio cannot be determined (D-6) | #520 D1,D4,D5,D6 · #526 B5 · D-1, D-6 | B0.1, B0.4, Q1 |
| B2c | **Same-day cancellation guard:** later-day reversal must route to a credit note, never an anulación; unblock the credit-note path the guard rejects | #539 S2 · #525 V6 · #522 | Q3, Q4c |
| B2d | Contingency stop in place **before opening**: 1.8-compliant preprinted stop, different series, numbering **reported to the Administración de Rentas**; back-entry cross-reference | #539 S3 · #531 G5.4 | Q5 |
| B2b | Incident procedure adopted by the client + operator-performable backup | #526 B4,B3 · #531 G5.1 | Q3 |
| B2e | **New, from D-3.** Regime is the single source of IVA treatment: no `0.15` survives a regime check in storage, sync fallback, or reporting. The Reporte X/Z export must not print an IVA line for a Cuota Fija tenant | D-3 · #540 · #522 | B0.3 (Q3 settles the regime) |

**Exit checks**
- [ ] Boot twice: prefix/range/counter unchanged and monotonic (#526 AC-6)
- [ ] Tripwire refuses to issue at or below a sequence the cloud already has (#526 AC-1…AC-3)
- [ ] Range warning appears below the agreed threshold, in Spanish
- [ ] Scenario A walked end to end on a real device, results in the pilot log (#526 AC-9)
- [ ] A later-day cancellation **cannot** set `is_canceled` (#539 AC-5) and the credit note is accepted upstream, not rejected (AC-7)
- [ ] The contingency stop exists, its numbering is a different series and has been reported (AC-12 sequence walked or explicitly waived in #531 G5.4)
- [ ] **Boot twice with a non-default prefix and range: both survive unchanged** — the observable form of D-1, and the exact opposite of `main.dart:259-263` today
- [ ] A fresh install against a tenant with existing invoices **cannot** silently emit sequence 1: it reaches `FISCAL_SEQUENCE_RECOVERY_REQUIRED` (D-6)
- [ ] No hardcoded fiscal range value remains anywhere in `apps/pos_app/lib` — grep gate, not a review opinion
- [ ] Reporte X/Z export for a Cuota Fija tenant prints no IVA line (B2e, D-3)

**Note on B2c/B2d:** these are not engineering preferences. B2c implements DT 09-2007 ordinal TERCERO 3.4.b ("no hacer anulaciones en formularios de facturas computarizadas" for later-day returns) and B2d implements 3.3. Both were found by **reading the disposición**, not by code sweeps — six sweeps missed them. AC-8 of #539 (credit note reverses inventory) is **not implementable before Batch 3**, because sales currently write zero movements.

**Stop condition:** do not open for business with B2a undone. `main.dart:258-263` rewrites prefix/range every boot and the pilot default caps at 1000 invoices; a mid-service stop with a raw English exception is the failure mode.

## Batch 3 — Inventory truth (#519 epic; the block whose size B0.2 determines)

| ID | Unit | Issue | Depends |
|---|---|---|---|
| B3a | Hydrate authority projections at login/boot/prime; consume the `recipeVersions` delta the backend already sends | #519 (hydration) | B0.2 |
| B3b | Movements carry real stock levels; persist path keeps the determinism contract | #524 · #519 (persistence) | B3a |
| B3c | Backend ledger authority for the `APPLIED_INVENTORY_PENDING` class + idempotent compensation | #519 (authority) | B3b |
| B3d | Resale mapping create path (the last mile) | #518 M1…M4 | B3c |

**Exit checks**
- [ ] A real sale writes kardex movements with non-zero `stock_before`/`stock_after` — the exact shape B0.2 measured as empty
- [ ] Replay of the same sale writes one set, not two (asserted on movement count)
- [ ] Void compensates the same quantities
- [ ] A resale product deducts the mapped insumo, versioned
- [ ] `flutter test` and `npm test` green

**Sequencing notes**
- B3b ships **with** B3a — same write path, one review (#524).
- #517 lands **after** B3c: availability over a ledger being compensated by hand reintroduces the rewrite problem B3c exists to prevent.
- This batch is where the "implemented, zero production callers" pattern bit repeatedly. Every exit check asserts the **call site** exists, not that the function works.

## Batch 4 — Cost accuracy and lifecycle

| ID | Unit | Issue | Depends |
|---|---|---|---|
| B4a | Modifier save transactional (AC-1…AC-3), then modifiers consume inventory (AC-4…AC-9) | #527 M6a, M1–M4 | B3b |
| B4b | Theoretical availability as a **non-blocking signal**, with registered mermas and the 10-day destruction notice documented | #517 · #533 F1 | B3c |
| B4c | Retention invoked + bounded queries | #528 R2,R3,R4 | B0.6 |
| B4d | Reports aggregate in SQL + mandatory date ranges | #529 P2,P3 | B0.5 |
| B4e | Discount attribution on the invoice; loyalty degraded state | #530 L1,L4,L5 | B1a |

**Exit checks**
- [ ] Fault injection leaves a product's options unchanged (#527 AC-2)
- [ ] "Extra shot" deducts its components and is void-symmetric (#527 AC-5, AC-7)
- [ ] No `catch (_) {}` survives the CI grep gate (#530 AC-1)
- [ ] Purge invocation is asserted by a test, not just its internals (#528 AC-4)
- [ ] Fiscal documents and ledger movements provably immune to every prune path (#528 AC-12)

## Batch 5 — Scale and multi-terminal readiness

| ID | Unit | Issue | Depends |
|---|---|---|---|
| B5a | Cloud authority for numbering: cursor becomes a cache. **Reframed by D-2:** per-terminal series is **not** a legal constant — differentiated series is required for *sucursales*, so the deliverable is a **sequence-strategy configuration gated on written approval** before a terminal is enabled, and the *Administración de Rentas* report only where Q2 confirms a sucursal exists | #526 B1 · #520 D3 · #532 T1 · #533 F3 · D-2 | Q1, Q2, B2a |
| B5b | Multi-terminal readiness gate T4 enforced at enrollment | #532 T4 | B5a |
| B5c | **Only if B0.6 measures a problem:** inbound-sync delta fetches are sequential (`inbound-sync.service.ts:141-173`, seven awaited `fetch*Deltas` calls in one request). Real, but its cost is unmeasured — no issue exists for it yet, and none should be filed on inference | open question | B0.6 |

**Exit checks**
- [ ] A terminal that dies cannot replay a sequence (#526 AC-4)
- [ ] Enrolling a second terminal is blocked until the #532 checklist verifies
- [ ] The series is informed to the Administración de Rentas and the constancia de recepción is on file (#533 F3)

## Batch 6 — Compliance deliverables that are not code

Created by D-5. Nothing in Batches 0–5 would have caught these, because no exit check observes a document that does not exist in a repository.

| ID | Unit | Basis | Status |
|---|---|---|---|
| B6a | **User manual in Spanish** for the client-facing POS | DT 09-2007 ordinal SEGUNDO 1.5 (per #533) | **No issue exists.** Not scheduled. |
| B6b | **Technical manual in Spanish** | same | **No issue exists.** Not scheduled. |
| B6c | Review the client's authorization letter / range resolution, then unblock the range-renewal decision | D-8 | Blocked **on purpose** — D-8 forbids implementing renewal logic before this. |

D-8 is a stop, not a deferral: automatic range renewal is the kind of feature an agent will happily build if this line disappears.

## Deferred by decision, not by neglect

#520 D2, D5 · #527 M5 — deferred by B0.1 (single terminal). **Not closed, not waived**: #532 T4 blocks enrollment until they verify. D-2 reframes *why* they are deferred: the per-device series is not a legal requirement, so the deferral is cheaper than the first draft assumed; per-*sucursal* series still is.

---

## Cross-cutting risks

| Risk | Mitigation in this plan |
|---|---|
| **Unmeasured.** Every "day 10–14" / "will degrade" figure is a structural inference, not a measurement; there is zero performance instrumentation today | B0.6 lands before any tuning decision; #529 P6 (N+1 batching) is explicitly gated on its own data |
| **Overstated findings.** Across this audit several subagent-reported "BLOCKER"s were refuted on inspection, one fabricated `path:line` was published and retracted (#527 M6, #531, #532), and a **second** fabricated citation was caught while drafting this plan: Batch 5 originally cited `sync-queue-runner.ts:135-143` and a "20 concurrent requests → minutes" figure for a file **that does not exist in this repository**. It was replaced with B5c. A plan built on unverified findings inherits the error | Every unit cites `AC-n` in its issue; every exit check is an observation. Refuted claims are listed in #531 and #533 so nobody re-implements them |
| **The "exists but is never called" class** — repeated across #518, #519, #520, #523, #525, #528 | Exit checks assert call sites and observable effects, never function presence |
| **Batch 3 can blow up.** Three layers deep, touches the ledger, true size unknown until B0.2 runs | Placed after the cheap visible wins; if B0.2 refutes #519 for the pilot config, B3c/B3d shrink and Batch 4 moves up |
| **Filing deadlines are real-time.** Art. 129 mitigation, the destruction notice, the contingency-stop report (3.3.a) and advance notice of system changes (1.6) are calendar-bound, not sprint-bound | B0.3 and Q3/Q5/Q7 exist so nothing legal waits on a PR |
| **The regulation was misread until the primary text was found.** An earlier draft of this plan cited a file that does not exist (`sync-queue-runner.ts`) and a #533 claim of "not retrievable" was wrong — the text was retrievable under a title-based URL slug | Every regulatory statement now carries an ordinal-level quote in #533; #539's three gaps are gated on the accountant confirming applicability (#535 Q3/Q4c/Q7) rather than implemented unilaterally |

## Order of business, if only three things get done

1. **B0.2 + B0.4** — one query each, and both can change this plan. The unique constraint is a migration that stops a fiscal illegality from being silent.
2. **B1a** — the void. Highest operator-visible value per line changed in the entire audit: the engine, transaction, audit and reversal already exist and are correct. Read **B2c** with it: shipping a void without the same-day guard ships the path DT 09-2007 3.4.b forbids.
3. **B2a** — before opening day. Everything else degrades; this one stops the register.
