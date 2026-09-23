# Founder Pilot — Execution Plan

**Answers:** *"do we have what we need to implement?"* → now yes. **Scope:** issues #517–#532 plus the gate #531. **Rule:** no batch is entered until the previous batch's **exit checks** are observed, not asserted.

Every unit below maps to acceptance criteria (`AC-n`) in its issue body. An item without a `DONE` is not done, and `DONE` means the criterion was executed and observed.

## Reading this plan

- **Batch 0 is not optional and is not "prep".** It decides the size of Batch 3 and whether Batch 4 exists at all.
- **PR shape:** one reviewable work unit per PR, target under ~400 changed lines. Split before opening, not during review.
- **TDD per `AGENTS.md`:** failing test first for every logic change. Two units (R2, L1) exist specifically because a unit-tested method with no production caller shipped broken repeatedly — assert the *call*, not just the internals.
- Commits land on the feature branch as work units. Push/PR/merge remain the user's decisions.

---

## Batch 0 — Decide and measure (no behaviour change)

| ID | Unit | Issue | Why here |
|---|---|---|---|
| B0.1 | Single-terminal decision **DONE** (2026-09-24, #531 G0.1) | #531 | collapses #520 D2/D5, #527 M5 |
| B0.2 | Run the field queries (device + cloud) | #534 | decides whether #519 is urgent or partly masked |
| B0.3 | Send the 6 questions to the accountant | #535 | Q1/Q2 gate B2a and B5a |
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
| B1d | Print the **DGI authorization number** bottom-right on every ticket (needs the field in the fiscal payload first) | #539 S1 · #531 G1.6 |

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
| B2a | Numbering stops lying: idempotent `initializeRange`, range warning, terminal-scoped counter, **replay tripwire** | #520 D1,D4,D5,D6 · #526 B5 | B0.1, B0.4, Q1 |
| B2c | **Same-day cancellation guard:** later-day reversal must route to a credit note, never an anulación; unblock the credit-note path the guard rejects | #539 S2 · #525 V6 · #522 | Q3, Q4c |
| B2d | Contingency stop in place **before opening**: 1.8-compliant preprinted stop, different series, numbering **reported to the Administración de Rentas**; back-entry cross-reference | #539 S3 · #531 G5.4 | Q5 |
| B2b | Incident procedure adopted by the client + operator-performable backup | #526 B4,B3 · #531 G5.1 | Q3 |

**Exit checks**
- [ ] Boot twice: prefix/range/counter unchanged and monotonic (#526 AC-6)
- [ ] Tripwire refuses to issue at or below a sequence the cloud already has (#526 AC-1…AC-3)
- [ ] Range warning appears below the agreed threshold, in Spanish
- [ ] Scenario A walked end to end on a real device, results in the pilot log (#526 AC-9)
- [ ] A later-day cancellation **cannot** set `is_canceled` (#539 AC-5) and the credit note is accepted upstream, not rejected (AC-7)
- [ ] The contingency stop exists, its numbering is a different series and has been reported (AC-12 sequence walked or explicitly waived in #531 G5.4)

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
| B5a | Cloud authority for numbering: cursor becomes a cache; per-terminal series assigned **and informed to the Administración de Rentas** | #526 B1 · #520 D3 · #532 T1 · #533 F3 | Q1, Q2, B2a |
| B5b | Multi-terminal readiness gate T4 enforced at enrollment | #532 T4 | B5a |
| B5c | **Only if B0.6 measures a problem:** inbound-sync delta fetches are sequential (`inbound-sync.service.ts:141-173`, seven awaited `fetch*Deltas` calls in one request). Real, but its cost is unmeasured — no issue exists for it yet, and none should be filed on inference | open question | B0.6 |

**Exit checks**
- [ ] A terminal that dies cannot replay a sequence (#526 AC-4)
- [ ] Enrolling a second terminal is blocked until the #532 checklist verifies
- [ ] The series is informed to the Administración de Rentas and the constancia de recepción is on file (#533 F3)

## Deferred by decision, not by neglect

#520 D2, D5 · #527 M5 — deferred by B0.1 (single terminal). **Not closed, not waived**: #532 T4 blocks enrollment until they verify.

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
