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
| B0.4 | `invoices` unique constraint on `(tenant_id, invoice_number)` + dedupe pass | #526 AC-7 | duplicates **already exist**; the constraint is the missing tripwire |
| B0.5 | Report indexes + `EXPLAIN ANALYZE` proof | #529 P1 AC-13 | no behaviour change, biggest cheap win |
| B0.6 | Capacity + latency instrumentation | #528 R1 AC-1…AC-3, #529 P5 | every remaining estimate is unmeasured until this lands |

**Exit checks**
- [ ] Query results recorded in #534; they confirm or refute #519's severity for the pilot tenant
- [ ] Duplicate-number blast radius known (real vs synthetic tenants)
- [ ] `EXPLAIN` shows index scans for the two report paths
- [ ] One day of capacity + checkout-latency data from the real device
- [ ] Accountant answered Q1 and Q2, or their absence is a written risk acceptance

**Stop condition:** if the unique constraint reveals duplicates on a live tenant, stop and route through Scenario D of `docs/operations/pilot-terminal-incident-procedure.md` before continuing.

## Batch 1 — Day-1 operability (what the cashier sees)

| ID | Unit | Issue |
|---|---|---|
| B1a | Void reachable + mandatory reason + **"ANULADO" print** + **loyalty reversal in the same transaction** | #525 V1,V2,V3 · #530 L2,L3 |
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
