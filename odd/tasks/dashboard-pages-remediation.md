# dashboard-pages-remediation

## Goal
Add the three missing owner-dashboard pages from audit Batch 6: B6 (cash sessions), H6 (audit), H7 (kardex remediation). All UI/UX must comply with the mandatory project standards:
- `@docs/nhilos/nhilos_backoffice_experience_standard_v1.0.md`
- `@docs/nhilos/nhilos_backoffice_module_audit_template_v2.1.md`

## Findings
- B6: no cash-session page in dashboard — owner cannot verify who opened/closed cash remotely.
- H6: no audit page — owner cannot review staff actions remotely (attention signals already link to /audit which 404s).
- H7: no kardex remediation page — owner cannot approve inventory corrections remotely.

## Verified backend support (from audit mapping)
- Cash: GET routes exist in `cash-shift.controller.ts` (human auth) — list/history read may need a collection route; verify what exists for listing many shifts (only GET /active and GET /:shiftId confirmed — check whether a list route exists or must be added).
- Audit: `GET /operations/audit/summary` + dashboard API client `fetchAuditSummary` already exists; attention signals link to `/audit`.
- Kardex: `GET /inventory/regularization/pending` + `POST /inventory/regularization/approve` exist (OWNER/MANAGER); no dashboard client functions yet.

## Slices (chained, one work-unit commit each)
### 6a — Cash sessions page (B6)
### 6b — Audit page (H6)
### 6c — Kardex remediation page (H7)

## Constraints
- NHILOS experience standard + module audit template are MANDATORY for every page (design language, states, accessibility, audit criteria).
- Follow existing dashboard feature conventions (feature folder = page + api + hooks + types; router registration in src/app/router.tsx; RBAC entry if the app has one).
- Backend endpoints are tenant-scoped with OWNER/MANAGER roles — reuse existing guards, do not weaken auth.
- Tests per page following existing `src/__tests__` conventions.
- English identifiers/UI copy for new code unless the existing module convention is Spanish (check existing pages — much of the dashboard copy is Spanish; follow the module convention).

## Status
- [x] 6a — commit see below (incl. backend GET /sales/shifts — no list route existed)
- [ ] 6b
- [ ] 6c

## Commits
- 6a: `feat(dashboard): add cash sessions page`
- 6b: `feat(dashboard): add audit page`
- 6c: `feat(dashboard): add kardex remediation page`
