# Human Regularization Tenant RLS Binding

## Objective

Fix issue #486 so the human regularization pending and approval paths bind `app.tenant_id` on the same PostgreSQL transaction and manager that access FORCE-RLS tables.

## Problem

`GET /inventory/regularization/pending` and `POST /inventory/regularization/approve` receive a validated tenant from the human request, but their service methods do not bind that tenant to the database session that runs protected queries. `getPendingQueue` uses a global repository, while `approveRegularization` uses a transaction manager without calling `bindTenantContext` before its first query. Under the restricted runtime role, legitimate rows are hidden or a cleared pooled setting can cause an empty-string UUID cast failure.

## Why

Tenant presence in an HTTP request is not PostgreSQL RLS binding. Every protected read and write must execute through repositories obtained from one transaction manager after transaction-local tenant binding. Without that invariant, human regularization cannot work reliably in production and tenant isolation depends on connection-pool accident.

## Scope

- Bind tenant context before the first protected query in `getPendingQueue` and `approveRegularization`.
- Ensure protected work uses only manager-scoped repositories from the bound transaction.
- Add unit ordering/fail-fast coverage.
- Add a real PostgreSQL contract using FORCE RLS and a `NOSUPERUSER NOBYPASSRLS` role for both human routes.

## Non-goals

- Changing controller guards or route transport classes.
- Reworking the fail-closed human actor validation delivered by issue #482.
- Implementing DSI-6/OHAC actor attestation.
- Changing regularization accounting behavior or invoice history.

## Constraints

- Offline-first behavior remains unchanged; these are administrative cloud routes, not POS background transport.
- DGI-protected history remains append-only; no invoice or historical movement deletion is introduced.
- Tenant isolation must be proven against real FORCE RLS, not a superuser or `synchronize: true` schema.
- TDD mode: strict, sourced from `openspec/config.yaml` and established project practice.
- Backend runners: focused Jest unit spec, `npm run test:e2e`, `npm run build`, targeted ESLint, and `git diff --check`.
- Delivery strategy: `single-pr` exception accepted by the founder on 2026-09-21 after the implementation reached 452 authored changed lines (443 additions, 9 deletions). Production behavior, unit ordering proofs, and the real FORCE-RLS contract remain one atomic review unit because splitting them would leave an incomplete security claim.

## Route and delegation

- HR-01: delegated direct writer. Trigger: implementation spans one production service plus unit and real-database tests (multi-file writer rule).
- Verification: writer self-verification followed by native risk assessment; route any required independent command verification according to the returned plan.

## Tasks

### HR-01 — Bind and prove human regularization RLS context

Status: complete — implementation and independent verification green; published in PR #487.

- [x] Observe RED unit coverage for manager scope, bind-before-query ordering, and blank-tenant fail-fast behavior.
- [x] Observe RED real-database behavior for human pending/approve under FORCE RLS and a non-bypass role.
- [x] Bind `getPendingQueue` and `approveRegularization` on their query transaction before protected repository access.
- [x] Keep explicit tenant predicates as defense in depth and preserve current actor/accounting semantics.
- [x] Observe GREEN focused unit and real-database coverage.
- [x] Run build, targeted ESLint, and `git diff --check`.
- [x] Reconcile verification evidence and issue/branch state.

## Acceptance criteria

- `GET /inventory/regularization/pending` returns only the authenticated tenant's queue rows under FORCE RLS.
- `POST /inventory/regularization/approve` can approve a same-tenant item under FORCE RLS and persists only same-tenant corrections and movement updates.
- A tenant cannot observe or mutate another tenant's queue item; the route returns its existing not-found behavior without leaking cross-tenant state.
- Tenant binding is the first SQL operation in each protected transaction.
- Blank tenant input fails before protected SQL.
- No protected query uses a global repository outside the bound manager.

## Verification evidence

Strict RED/GREEN evidence:

- Unit RED: five new cases failed before production changes; the preserving manager-scope approval case already passed. GREEN: 13/13 in `kardex-regularization.service.spec.ts`.
- Real HTTP/PostgreSQL RED: all three new human-route cases returned HTTP 500 from the unbound `''::uuid` RLS cast. GREEN: 7/7 in `kardex-regularization-tenant-binding.db.e2e-spec.ts`, including the four pre-existing ST-06 device-sync cases.
- The restricted test role is `NOSUPERUSER NOBYPASSRLS`; the queue uses a UUID tenant column plus FORCE-RLS SELECT/UPDATE policies and a role default `app.tenant_id = ''`, so a missing same-transaction binding cannot pass vacuously.

Writer checks:

- Focused unit: 13/13 passed.
- Real HTTP/PostgreSQL contract: 7/7 passed.
- `npm run build`: exit 0.
- Targeted ESLint on all three changed files: 0 errors and 7 existing-pattern `no-unsafe-argument` warnings in the e2e request calls.
- `git diff --check`: clean.

Independent verification (required because native assessment was unavailable):

- Re-ran focused unit 13/13, real PostgreSQL 7/7, build exit 0, and `git diff --check` clean.
- Verified bind-before-query ordering, manager-only repositories, same-transaction binding, realistic human JWT guards, cross-tenant 404 with zero mutation, non-vacuous FORCE RLS, and unchanged ST-06 behavior.
- No blocking, high, or medium findings. Low/informational observations: the harness models equivalent SELECT/UPDATE policies rather than production's single `FOR ALL` policy; approval filters retain the raw tenant argument after the binder trims it and therefore fail closed on whitespace; the formerly injected global repositories are now unused.

Parent spot check:

- Re-ran targeted ESLint: exit 0 with the same 7 warnings and no errors.
- Read back the production diff and confirmed only the two human service paths changed.

## Progress

- 2026-09-21: Issue #486 created and approved with `status:approved` and `type:bug`.
- 2026-09-21: Read-only mapping confirmed both missing bindings and identified the existing ST-06 transaction pattern.
- 2026-09-21: Branch `fix/regularization-human-rls` created from clean `main` at `a0584cc`.
- 2026-09-21: HR-01 implementation completed uncommitted across the three authorized source/test files. Unit RED was 5 failures and GREEN was 13/13; real HTTP/PostgreSQL RED was 3 HTTP 500 failures from the unbound empty-string UUID cast and GREEN was 7/7, including four prior device-sync cases. Build, targeted ESLint, and `git diff --check` passed in the writer run.
- 2026-09-21: Native risk assessment returned unavailable/empty and therefore required high-risk independent verification.
- 2026-09-21: Founder chose one atomic PR and accepted the 452-line size exception rather than separating the production fix from its security proof.
- 2026-09-21: Independent verification completed with no blocking, high, or medium findings; all authorized commands passed. Parent targeted-ESLint spot check also passed with 0 errors and the same 7 warnings.
- 2026-09-21: Founder authorized delivery. Work-unit commit `e1e72e0` was pushed and PR #487 opened against `main` with `Closes #486` and exactly one `type:bug` label. GitHub reported the PR mergeable; checks were pending (`UNSTABLE`) at publication.

## Next step

Wait for PR #487 checks to reach a terminal state, then decide merge.
