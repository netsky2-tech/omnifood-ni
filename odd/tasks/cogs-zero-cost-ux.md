# cogs-zero-cost-ux

## Goal
Remediate audit finding H10: the POS COGS report presents $0.00 margins as real when no purchase cost basis exists. Show a clear zero-cost state instead of a misleading figure.

## Finding
- H10: `cogs_report_view.dart` shows `$0.00` rows whenever cost basis is missing; empty-state only appears when there are no movements at all. Dashboard already gates this (coverage-notes.ts margin gate); POS does not.

## Constraints
- Align copy vocabulary with the dashboard's canonical "Sin costo" notes (`apps/owner_dashboard/src/features/dashboard/coverage-notes.ts`) — same failure, same words, no divergent treatment between surfaces.
- Offline-first: detection must be local (no backend call). Detection signals: movement rows exist whose `unitCostNio` is null AND `insumo.averageCost` is 0/absent (i.e. no recorded purchase cost).
- NHILOS state rules apply (AGENTS.md): distinguish no-data vs zero-basis; `—` for unavailable, never a confident `0`.
- Do not change movement/cost calculation logic itself — this is presentation + coverage signaling only.

## Allowed edit surfaces
- apps/pos_app/lib/ui/features/inventory/reports/cogs_report_view.dart
- apps/pos_app/lib/ui/features/inventory/reports/cogs_report_view_model.dart
- apps/pos_app/test/ui/features/inventory/reports/cogs_report_view_test.dart
- apps/pos_app/test/ui/features/inventory/reports/cogs_report_view_model_test.dart

## Tasks
1. View model: expose cost-coverage state (e.g. complete / partial / zero-basis) derived from the computed report — count movements with vs without resolved cost.
2. View: when movements exist but coverage is missing/partial, render an explanatory "Sin costo…" banner (Spanish, dashboard-aligned vocabulary) instead of presenting bare $0 totals as real.
3. Rows lacking cost basis: present as `—` (unavailable) rather than `0.00` where the report shows per-item unit cost, or annotate; justify choice in handoff.
4. Tests: zero-basis detection, banner shown/not shown, existing report assertions unaffected.

## Acceptance criteria
- With sales but no purchase costs: user sees an explicit "Sin costo" explanation, not confident $0 margins.
- With full cost basis: no banner, report unchanged.
- Targeted tests green; no calculation logic changes.

## Commit
- Branch: `fix/cogs-zero-cost-ux`
- Message: `fix(pos): surface zero-cost basis state in COGS report`
