# Founder Pilot — 30-Day Operability Gate

Source: `founder-pilot-readiness-sweep` (2026-09-23) + three follow-on sweeps (cart money mechanics, upgrades/backup/growth, performance at volume) on 2026-09-24. All assertions below are **falsifiable on the real device**. Every claim traces to a GitHub issue; nothing here rests on an agent's word — every item cited was personally re-verified against source.

## Issue index

| Issue | Area | Gate | Origin |
|---|---|---|---|
| #517 theoretical availability signal | inventory | G2 | prior sweep |
| #518 resale mapping create path | inventory | G2 | prior sweep |
| #519 authority hydration orphan (sales deduct no stock) | inventory | G2.2 | prior sweep |
| #520 DGI range overwritten on boot, 1000 cap | fiscal | G3 | prior sweep |
| #521 par levels / UOM / payment methods never reach terminal | sync | G2, G4 | prior sweep |
| #522 X/Z fake success; credit notes fail closed | fiscal/sync | G1.2 | prior sweep |
| #523 template recipes unreachable (product_type, DRAFT, no publish) | onboarding | G2.3 | prior sweep |
| #524 Kardex rows persist stock as 0 | inventory | G2.1 | prior sweep |
| **#525 cashiers cannot void a ticket** | money/UX | **G1.1** | this sweep |
| **#526 no terminal backup; dead tablet restarts numbering at 1** | fiscal/DR | **G3.4** | this sweep |
| **#527 modifiers never sync, destroyed on edit, no inventory** | catalog | G4.3, G4.4 | this sweep |
| **#528 retention never invoked; unbounded queries; no capacity signal** | lifecycle | G5.5 | this sweep |
| **#529 dashboard loads all invoices, no pagination, no index** | performance | G4.5 | this sweep |
| **#530 loyalty swallowed by `catch(_){}`; void skips loyalty** | money | G4.1, G4.2 | this sweep |

**Refuted during this sweep — do not re-investigate:** "stale shift locks out the next day" (any user can close it, `cash_shift_view_model.dart:236-246`); "`seedAll` scans the ledger at boot" (guarded, `database_seeder.dart:37-39`); "all terminals share one `app_database.db`" (each device has its own file); "DGI prefix has no configuration path" (it does — `business_profile_view_model.dart:46-48`; the defect is the boot overwrite, as #520 already states); `migration22_23`'s destructive rebuild (historical v22→v23; a fresh tenant is at version 54).

**Two more, added 2026-09-24 — and these were published as findings, not merely believed:** "café mermas are nowhere in the system, no waste type in the POS's 5-value enum" (**#535 Q6, #533 F1 — FALSE**: `MovementType` has 6 values incl. `shrinkage`, `inventory_movement.dart:7-13`; a BOH "Mermas" screen writes stock **and** a kardex row via `movement_engine_impl.dart:109-136`; the cloud handles `SHRINKAGE` at `inventory.service.ts:196-199`; pilot's 0 rows = operator non-use) and "no DGI authorization-number field exists anywhere — schema gap" (**#539 S1 — FALSE**: `dgi_authorization_code` exists and is client-editable at `business_profile_view.dart:370` with **zero consumers**, so it is an *orphan*, which is worse than absent because it saves without error and silently changes nothing). Both survived six static sweeps because both greps looked for English identifiers in a Spanish-named codebase. Full four-test inventory in **#540**. Owner directives are in `odd/plans/founder-pilot-execution-plan.md`.

What survived of the merma finding is smaller and real: `recordShrinkage` never sets `userId` (`movement_engine_impl.dart:123-136`; the field exists at `inventory_movement.dart:28`), so a merma proves what/when/why but not **who**; there is no `DESTRUCCION` reason key although `boh_navigation_shell_view.dart:102` advertises "Registros de merma, **destrucción**"; and recording is entirely operator-initiated.

## How to use this

Run each assertion on the **production tablet, with the real tenant**. Any single ❌ is a NO-GO for the capability it gates. "Waivable" means the user may accept the risk in writing; it does not mean skip the check.

The gate answers one question, and it is *not* "is the code good?". It is: **can this café trade for 30 days without you being on-site, and without an audit finding?**

---

## GATE 0 — Single terminal (collapse factor; decide before anything else)

| # | Assertion | Why it collapses | Waivable |
|---|---|---|---|
| G0.1 | The pilot runs on **exactly one** terminal, and that is a written decision, not a default | kills #520 D5 (duplicate DGI numbers), #520 D2 (offline per-terminal counters), and the "owner left, nobody can log in" scenario in one move | No — it is a scope decision, not a fix |

**DECIDED 2026-09-24 — single terminal.** The founder elected one POS device for the pilot. This shortens the pilot's critical path. It does **not** descope anything: multi-terminal is the product (RaaS for Food Parks), and `openspec/specs/inventory-sync-topologies` already specifies per-source ordering. **Everything below is `deferred`, tracked at #532 — not `not applicable`.**

| Deferred by this decision | Pilot effect | Product status |
|---|---|---|
| #520 D2 — offline per-terminal counter divergence | Not exercised (one writer) | **Required before terminal #2** — #532 |
| #520 D5 — duplicate DGI numbers across terminals | Not exercised | **Required before terminal #2** — #532 |
| #527 M5 — modifier & variant catalog differs per terminal | Not exercised | **Required before terminal #2** — #532; **M6 is not deferred, see correction 2** |
| "Owner left, nobody can log in" support scenario | Reduced to one device to re-provision | — |
| G5.4 — multi-terminal sync contention | Reduced to a single queue | — |

**Two corrections to the first draft of this decision, both material:**

1. **The deferral is cost-asymmetric.** Most deferred items stay as cheap as they are today. Two get *strictly more expensive* with every client, because fixing them later means migrating live data: **cloud authority for DGI numbering** (#520 D3 + #526 B1 — numbers already printed cannot be un-printed, and `AGENTS.md` forbids deleting invoices) and **versioned modifier/variant master data** (#527 M5 — later, N devices each hold the only copy of their own catalog). Those two should be decided **during** the pilot, not after. #532 carries the reasoning and the checklist, and notes the pattern already exists in-repo (`tenant_id + source_device_id + flow_type + source_sequence`, unique-indexed on `inventory-sync-receipt` / `inventory-sync-outbox`) but is absent from `invoice.entity.ts`.
2. **#527 M6 was misfiled as multi-terminal — and my stated reason for it was wrong.** I claimed delete-then-reinsert orphans historical invoice lines. It does not, and the correction is instructive: `InvoiceItemModifierEntity` stores a **denormalized snapshot** (`name`, `extraPrice`) with no FK to `product_modifiers`, and variant IDs are **preserved** across edits (`item_options_editor.dart:167` → `inventory_mapper.dart:320`). So history resolves. What actually survives of M6, on a single device, is smaller and different: **(a)** `saveProductOptions` is **not** `@transaction`-wrapped (`inventory_repository_impl.dart:162-183`) — the deletes and the inserts are separate awaits, so a failure between them leaves the product with **zero** options; **(b)** definitions are unversioned, so you cannot reconstruct *which* catalog was in force on a past date (what was *charged* is preserved, which is the fiscally important part). (a) is a pilot-scope reliability defect; (b) is an audit nicety. Neither is data corruption, and #527 M6 has been rewritten accordingly.
| "Owner left, nobody can log in" support scenario | Reduced to re-provisioning one device |
| G5.4 — multi-terminal sync contention | Reduced to a single queue |

**What this decision does NOT buy — do not let it be read as such:**

- **#520 D1/D3 remain fully in scope.** The `end: 1000` cap and the boot-time prefix overwrite are *per-device* defects. One terminal hits them exactly as hard as twelve, on the same timeline.
- **#526 is unchanged.** It concerns losing *the* device, not coordinating several. A single terminal makes #526 marginally easier to work around by hand and in no way fixes it.
- **#519 is unaffected** — it is a per-sale deduction failure, orthogonal to terminal count.

Reopen this gate item the moment a second terminal is contemplated: at that point #520 D5 and #527 M5 become hard prerequisites, not cleanups. **Better: do not wait for that moment for #520 D3 / #526 B1 / #527 M5 — their cost is a function of how much live data exists, so deciding them during the pilot is the cheap window.**

---

## GATE 1 — Money leaves the register correctly (day 1)

| # | Assertion | Issue | Waivable |
|---|---|---|---|
| G1.1 | A cashier can **void a wrong ticket** from the POS UI, with a mandatory reason, and the customer receives an "ANULADO" paper | #525 | **No** |
| G1.2 | Every correction an operator can *reach* is one that actually works: no reachable path prints "correctamente" for something the cloud will reject | #522, #525 | **No** |
| G1.3 | Cuota Fija IVA-exemption classification for prepared food confirmed in writing by the client's accountant, and the receipt renders it as they expect | — | **No** |
| G1.4 | A manual discount on a ticket shows gross → discount → net on the receipt, and the authorizer is identifiable for that invoice | #530 L4 | Yes (documented workaround: forensic log cross-reference) |
| G1.5 | A sale completes on the POS in under ~1s on the real device (Stopwatch on `CheckoutInventoryPreparationService.prepare()` and the sale transaction) | #529 P5 | Yes |

**Why G1.1 is first:** #519 corrupts cost data silently. #525 stops the cashier **in front of a customer at 09:00 day 1**. Mis-rings are the most common daily event in a café, and today the only reachable correction is the credit note that #522 rejects.

## GATE 2 — Inventory is trustworthy enough to be seen (day 1–7)

| # | Assertion | Issue | Waivable |
|---|---|---|---|
| G2.1 | The **kardex/inventory screens are hidden or annotated as unreliable** until #519 lands — the operator is not shown numbers we know are wrong | #519, #524 | **No** (this is the cheap substitute for fixing #519) |
| G2.2 | #519 confirmed empirically on the test tenant: `SELECT inventory_outcome, inventory_outcome_reason, COUNT(*) FROM invoices GROUP BY 1,2;` → outcome recorded and matching expectation | #519 | **No** — it decides whether the fix is urgent or already done |
| G2.3 | Applying the café template leaves the admin dashboard in a state the owner can act on: recipes visible with correct product type, or an explicit "pending publication" state — never a false "Apply" success | #523 | Yes (procedure: create recipes manually in the dashboard) |
| G2.4 | The "SIN STOCK" chip no longer paints every product red for a dead `products.stock` field | #521 | Yes (subsumed by G2.1) |
| G2.5 | Stock intake (purchase receipts) exist for the pilot insumos and produce movements the owner can see | — | **No** — an empty kardex is indistinguishable from a broken one |

## GATE 3 — The counter is legal on day 30, not just day 1

| # | Assertion | Issue | Waivable |
|---|---|---|---|
| G3.1 | Projected invoice volume over 30 days is **known**, and the authorized DGI range exceeds it with margin. Prefix/range/counter are not reverted to `001-001-01-` / `1..1000` on every boot | #520 | **No** — a hard stop at ~#1000 with an English exception, mid-service |
| G3.2 | The real authorized prefix from the client's DGI resolution is configured and **survives a reboot** (reboot → read `local_configs` → assert identical) | #520 | **No** |
| G3.3 | There is a **numbered, operator-performable procedure** for the authorized-range boundary that does not require an engineer or an APK rebuild | #520, #526 | **No** — but cheaper than it looks: Business Profile already exposes prefix/range to the operator (`business_profile_view_model.dart:46-48`, rendered in `business_profile_view.dart`), so this needs a boot guard (#520 D1) plus a written procedure, **not a new channel** |
| G3.4 | A dead/stolen terminal cannot cause a **replayed invoice sequence**: either the cursor is cloud-derived, or `max(sequence)` is asserted on activation, or a tripwire refuses to issue below a known maximum | #526 | **No** — this is a legal event, not a data event |
| G3.5 | The accountant has signed off on what happens to fiscal documents that exist only on a dead device | #526 | **No** |

**G3 is the gate that answers "30 days".** G1 answers "day 1". G3 is the one nobody sees coming because nothing breaks on day 1.

## GATE 4 — Nothing silently lies to the operator (day 1–30)

| # | Assertion | Issue | Waivable |
|---|---|---|---|
| G4.1 | No money-path write is wrapped in `catch (_) {}`: a failed loyalty earn/redeem becomes a visible, durable failure state, never a swallowed one | #530 | Yes, **only** if loyalty is disabled for the pilot — decide it explicitly |
| G4.2 | Voiding a sale reverses its loyalty effect (earn reversed, redeem refunded) inside the same transaction | #530 | **No if G1.1 shipped** — a reachable void that corrupts balances is worse than no void |
| G4.3 | Modifiers/variants are **identical on every terminal** on day 1, or the pilot is single-terminal (G0.1) | #527 M5 | Yes via G0.1 — **but this waiver does not cover #527 M6**, which breaks on a single device |
| G4.3b | Editing a product's variants/modifiers cannot leave it with **zero** options after a partial failure — the delete+reinsert must be one transaction | #527 M6(a) | **No** — `saveProductOptions` is not `@transaction`-wrapped (`inventory_repository_impl.dart:162-183`); breaks on one device. Originally justified by a claim about orphaned history that was **wrong** — see the correction under G0.1 |
| G4.4 | The owner is told, in writing, that modifier "extras" do not consume inventory, so their COGS is optimistic by an amount proportional to how much they sell in extras | #527 | Yes (accepted risk, documented) |
| G4.5 | Reports the owner opens daily (dashboard, top products) respond in acceptable time at **30 days of data**, not at seed data | #529 | Yes with P1 (indexes) landed |

## GATE 5 — You can be off-site for a week (day 7–30)

| # | Assertion | Issue | Waivable |
|---|---|---|---|
| G5.1 | There is a written incident procedure for "tablet won't boot": who is called, what is preserved, how selling resumes, what is reported to DGI | #526 | **No** — the absence of the procedure is the risk |
| G5.2 | An operator-performable backup of the terminal database exists, or the pilot accepts that an unsynced ticket is unrecoverable | #526 | Yes (documented, with the 5-min sync window understood) |
| G5.3 | Reboot the real device mid-shift → shift, catalog, unsynced queue and counter all intact, and the operator can resume without help | #526, #520 | **No** |
| G5.4 | A terminal offline for 24h catches up without a manual push and without a sync error state | #477, #529 H4 | Yes for a single terminal with good WiFi — verify anyway |
| G5.5 | Capacity is visible before it fails: DB size, unsynced depth, remaining DGI numbers. Retention purge is actually invoked, not merely implemented | #528 | Yes (monitoring deferred, but G3.1 must then be computed by hand) |

## GATE 6 — Remote support is possible without an APK rebuild

| # | Assertion | Issue | Waivable |
|---|---|---|---|
| G6.1 | The POS can perform a documented maintenance action (range renew, manual sync, forced re-provision, remote log pull) **without rebuilding the APK** | #520, #526 | **No** — today *every* fix on that tablet is a rebuild, which is why G3.3 exists |
| G6.2 | A support person can read the device's last N errors remotely | #528 | Yes |

---

## The minimum set for a 30-day pilot

**Blocking (must land or be designed around):** G0.1, G1.1, G1.2, G1.3, G2.1, G2.2, G2.5, G3.1, G3.2, G3.3, G3.4, G3.5, G4.2, G5.1, G5.3, G6.1

**Accepted risk, written down:** #517, #518, #521, #522, #524 (follows #519), #527 G4.4, #528, #529 P6

**Deferred to #532 (multi-terminal readiness) — not waived, not closed:** #520 D2, #520 D5, #527 M5. Two of these (#520 D3/#526 B1 numbering authority, #527 M5 versioned master data) become **more expensive per client shipped**, so they should be decided during the pilot window rather than after it.

**Promoted into pilot scope by re-reading the deferral:** #527 M6(a) — `saveProductOptions` deletes then re-inserts without a transaction, so a partial failure empties a product's options on a single device. See G4.3b. (The original justification — orphaned invoice history — was checked and **refuted**; see the correction block under G0.1.)

**The three highest-leverage items, all cheap relative to their blast radius:**
1. **G0.1 single terminal** — defers #520 D2/D5 and #527 M5 out of the critical path, and removes a support scenario. Costs nothing. Note the two items above whose price rises with delay.
2. **G1.1 void UI (#525 V1)** — the service, transaction, audit and inventory reversal already exist and are correct. This is a button plus a reason dialog. Highest operator-visible value per line changed in the whole audit.
3. **G2.1 hide/annotate inventory until #519** — buys the time to fix #519 properly without the owner making decisions on numbers we know are fiction.

**And the honest caveat:** G2.2 is still unrun, so the actual severity of #519 is unconfirmed — it may be that the pilot config is fine. Run that one query before scheduling anyone. Every "day 10–14" and "will OOM at day 30" figure in this document is a **structural inference from query patterns, not a measurement**; the system has no performance instrumentation, so #528 R1 / #529 P5 exist to replace this guesswork with data. Do not let the precision of this checklist pretend to be more than it is.

## Sequencing note that is easy to get wrong

- **#524 ships with #519**, never after (same write path, one review).
- **#530 L2 ships with #525 V1**, never after — a reachable void that doesn't reverse loyalty is worse than an unreachable one.
- **#517 lands after #519** and must be reviewed against #519's determinism contract, or it reintroduces the ledger-rewrite problem #519's compensating-transaction design exists to prevent.
- **#528 R1 and #529 P1 (indexes + measurement) go first** — they are cheap and they determine how much of #528/#529 is actually needed.
- **#526 B1 (cloud-owned counter) subsumes several #520 units** — if you take B1, revisit #520's D3/D5 rather than implementing both independently.
