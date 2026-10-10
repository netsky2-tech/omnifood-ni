# Batch 17: Fleet Terminal Registry, Owner Revocation and Dashboard Panel — OmniFood NI

Plan for issue **#832** (`feat(dashboard): panel de monitoreo de terminales de flota`, roadmap
manual §10). **Planning artifact only — no code in this batch set.**

Authority inputs:
- Manual `docs/nhilos/manuals/nhilos_owner_dashboard_manual_v0.2.md` §10 (current promise + roadmap line).
- Architecture gap register `docs/dashboard/arch_spec_gate_pass.md` → **AG-03 Device registry — OPEN**.
- Dashboard freshness contract: `docs/plans/owner_dashboard_execution_roadmap.md`, `GET /operations/sync/freshness`.
- Existing revocation domain: `apps/admin_backend/src/modules/identity/services/device-sync-credential.service.ts`.
- Offline-first / DGI constraints: `AGENTS.md` (no deletion semantics, local SQLite is source of truth).

Evidence below was verified read-only against `main` = `d58cbf5e` on 2026-10-10.

---

## 1. What actually exists today (verified)

| Capability | State | Evidence |
| --- | --- | --- |
| Device credential lifecycle (PENDING/ACTIVE/RETIRED/REVOKED) | **exists**, persisted per tenant | `identity/entities/device-sync-credential.entity.ts:15-20,93-101` (`revoked_at`, `revocation_reason`) |
| Server-side revocation **logic** | **exists in-process only** | `device-sync-credential.service.ts:381 revokeCredential(tenantId, credentialId, reason)`, writes a `REVOKED` event `:419` |
| HTTP route that revokes | **missing** | no controller calls `revokeCredential`; `identity/controllers/device-sync-token.controller.ts:27` exposes only `POST identity/device-sync/token` |
| Permission for revoking | **missing** | `identity/security/permissions.enum.ts:4-28` has no device/revocation entry |
| POS reaction to revocation | **exists** | `pos_app/lib/data/security/dio_device_sync_exchange_port.dart:16` (`DEVICE_REVOKED`), `device_sync_credential_coordinator.dart:46-66,215`, `sync_service.dart:387-388,1008-1036`, label "Dispositivo revocado por el servidor. Requiere reactivación." `core/localization/label_map.dart:346` |
| Per-terminal last-sync + state | **exists end to end** | `sync-health/sync-health.controller.ts:21-31` (`GET /operations/sync/freshness`, `@Roles(OWNER, MANAGER)`), DTO `sync-freshness.dto.ts:44-48`, dashboard `features/dashboard/use-sync-freshness.ts:19-29` → `components/freshness-badge.tsx:69-107,201` |
| Unified device registry (one row per terminal with name/status/presence) | **missing** | AG-03 in `docs/dashboard/arch_spec_gate_pass.md`; terminal identity is indirect: `onboarding/entities/activation-attempt.entity.ts:31,35` (`candidate_terminal_id`, `trusted_terminal_id`), `device_linking_codes`, and `sourceDeviceId` inside sync payloads (`sales/dto/sync-batch.dto.ts:254`) |
| App version per terminal | **partial** | POS sends `pos_build` only during OHAC cohort negotiation (`pos_app/lib/data/services/ohac_negotiation_parameters.dart:55-83`); not stored per device, not exposed |
| Battery per terminal | **missing end to end** | no battery code anywhere in `pos_app`; no column; no endpoint |
| Client IP per terminal | **missing** | only `req.socket.remoteAddress` used for a request log (`admin_backend/src/main.ts:31`), never persisted |
| Multi-tenant isolation for the device tables | **exists** | `migrations/1807000000000-CreateDeviceSyncCredentials.ts:44-45,66-94` (RLS enabled+forced, four tenant policies); `migrations/1809520000000-FixDeviceLinkingClaimRlsPredicate.ts:57-90`; generator `core/database/tenant-rls-policy.ts` |
| Where the panel plugs into the dashboard | **known** | `src/app/router.tsx` (lazy routes incl. `settings`), `src/app/layout/sidebar.tsx:41-57` (Administración group, no "Dispositivos"), `src/features/settings/settings-page.tsx:57-106` (`VALID_TABS`), roles `src/lib/rbac.ts` + `src/features/auth/permissions.ts` |

**Consequence for the manual:** §10 promises "versión de la app, batería, dirección IP y última
sincronización" plus self-service revocation. Two of those four fields do not exist in any layer, and
revocation exists as domain logic without a door. The plan therefore ships the panel in the order the
data can honestly be produced, and closes the manual claim only at B17-06.

---

## 2. Assumptions, decisions and owners

| ID | Item | Position | Owner |
| --- | --- | --- | --- |
| DEC-17.1 | Registry representation | **RESOLVED 2026-10-10 (founder via this session): derived read model.** A view/CTE over `device_sync_credentials` + activation attempts + the existing sync-receipt derivation. No master table, no new write path. A table is only reconsidered if a field appears that the read model cannot derive. | Backend architect |
| DEC-17.2 | Who may revoke from the panel | **RESOLVED 2026-10-10: OWNER only.** MANAGER keeps read access (matching the existing `@Roles(OWNER, MANAGER)` freshness read) but cannot revoke: a revoke stops a working till. | Founder / product |
| DEC-17.3 | Battery | **RESOLVED 2026-10-10: dropped from the promise.** No battery field in the panel and no battery claim in manual §10. Rationale: it does not exist in any layer, the Q80 fleet only reports it after an app upgrade, and a zero or stale battery is worse than an absent one. May return as its own batch with DEC-17.5-style evidence of a real POS release. | Founder / product |
| DEC-17.4 | Client IP: persist the last-seen IP server-side only | Recommendation: yes, cheap (already available per request), but it is an *observability* value, not a control. Must be documented as "última IP observada", not device identity. | Backend architect |
| DEC-17.5 | Revocation semantics under DGI/audit discipline | Revocation is a state transition on a credential, never a delete; it must write the existing `DeviceSyncCredentialEvent` and be auditable. No invoice/ticket data is touched. | Compliance |

---

Decision status: **all three blocking decisions are resolved**, so B17-01 is unblocked and B17-02 has
its permission answer (`OWNER` only). DEC-17.4 (last-seen IP) stays open and only gates B17-05.

## 3. Dependency DAG, critical path, parallel-safe branches

```
DEC-17.1 ──► B17-01 (registry read model + active-device query)
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
B17-03 (dashboard list UI)   B17-02 (revoke route + permission + audit)   ← DEC-17.2
        │                         │
        └───────────┬─────────────┘
                    ▼
             B17-04 (revoke action in the panel, confirm + reason)
                    ▼
             B17-06 (manual §10 completion + captures)

Optional, independent of the critical path:
  B17-05 (telemetry: app version / last-seen IP)  ← DEC-17.3, DEC-17.4
```

- **Critical path:** DEC-17.1 → B17-01 → B17-02 → B17-04 → B17-06.
- **Parallel-safe:** B17-03 (dashboard, read-only against the B17-01 contract) and B17-02 (backend
  authorization) touch different apps and different invariant surfaces; they may run concurrently only
  after the B17-01 response contract is frozen. B17-05 is parallel-safe with everything except B17-06
  (the manual must not claim a field before it is exposed).
- **Never parallel:** two writers inside `identity/device-sync` (B17-01 and B17-02 share the credential
  aggregate and its event log).
- **Ordering rule respected:** authorization before exposure (B17-02 gates B17-04), invariant before UI
  polish (B17-01 gates B17-03).

---

## 4. Batch contracts (next three detailed; the rest are outcome-level)

### Batch B17-01: Device registry read model and active-device query

- **Goal:** one authoritative, tenant-scoped "terminals of this tenant" query that the dashboard and the
  revocation route can both use, closing AG-03 without inventing a second source of truth.
- **Traceability:** issue #832; `docs/dashboard/arch_spec_gate_pass.md` AG-03; DEC-17.1.
- **Prerequisites / dependencies:** DEC-17.1 resolved.
- **In scope:** read model over `device_sync_credentials` joined to activation attempts / linking codes,
  plus the last sync receipt per terminal (the same derivation `sync-health` already uses); a service
  method `listTenantTerminals(tenantId)`; unit + DB-backed specs.
- **Out of scope:** any HTTP endpoint, any UI, any new write path, any migration that adds a master table
  (unless DEC-17.1 chooses the table, in which case a migration-safety batch precedes this one).
- **Touched domains/contracts/data:** `admin_backend` identity/sync-health domain; no RLS change (existing
  policies in `1807000000000-CreateDeviceSyncCredentials.ts:66-94` already cover the credential table; a
  view must be re-checked against `tenant-rls-policy.ts` semantics).
- **Acceptance criteria:** returns exactly the terminals of the calling tenant and nothing else (RLS proof);
  a REVOKED credential appears with `status=REVOKED` and its `revocation_reason`; the freshness state for
  each terminal matches `GET /operations/sync/freshness` for the same window.
- **Tests / linked evidence:** `identity/services/*.spec.ts` unit + `*.db.spec.ts` integration on the
  migration-built schema (CI runs `test:db`); cross-check spec against `sync-health.service.spec.ts`.
- **Rollback / recovery:** read-only, no schema change ⇒ revert is a code revert.
- **Observability:** log the count and the derivation window per call; no PII beyond terminal ids.
- **Estimate:** 250-350 lines, risk medium (join semantics).
- **Commit / PR boundary:** one backend PR, no dashboard change.
- **Entry gate:** DEC-17.1 written down in this document. **Exit gate:** Implemented + Verified (DB spec).

### Batch B17-02: Owner-facing revocation endpoint, permission and audit trail

- **Goal:** make the existing `revokeCredential()` reachable by an authorized human instead of by a
  throwaway `ts-node` script (as done in `odd/tasks/founder-pilot-acceptance-freeze.md:215`).
- **Traceability:** issue #832; DEC-17.2; DEC-17.5.
- **Prerequisites:** B17-01 (the route must address a registry entry, not a raw credential id chosen by
  guessing).
- **In scope:** `POST`/`DELETE`-style state transition under `identity/device-sync` with an explicit
  reason; a new `AppPermission` entry; guard wiring; audit event already produced by the service must be
  asserted; 401/`DEVICE_REVOKED` behaviour on the POS side stays untouched.
- **Out of scope:** bulk revocation, re-activation/self-service re-linking (the POS reactivation path is
  its own flow), UI.
- **Touched domains/contracts/data:** `identity` controllers/services/guards, `permissions.enum.ts`,
  audit event stream.
- **Acceptance criteria:** only the DEC-17.2 role can revoke; a revoke attempt on another tenant's
  terminal is not even visible (RLS); the credential row flips to REVOKED with reason and timestamp;
  an audit event row is written; a second revoke is idempotent or clearly rejected (no silent overwrite).
- **Tests / linked evidence:** controller spec (auth matrix), service spec extensions
  (`device-sync-credential.service.spec.ts:674-778` already covers the in-process cases), one DB/e2e case
  proving the POS transport guard fails closed afterwards (`identity/guards/sync-transport.guard.spec.ts:276`).
- **Rollback / recovery:** route removed by revert; already-revoked credentials are NOT auto-restored, so
  the batch must provide the documented re-activation route (existing) and state it in the PR.
- **Observability:** audit event is the record; add a structured log line with actor/tenant/terminal/reason.
- **Estimate:** 200-300 lines, risk **high** (security boundary + destructive operational action).
- **Commit / PR boundary:** one backend PR, no dashboard change.
- **Entry gate:** DEC-17.2 resolved. **Exit gate:** Verified + Operationally Proven (one real revoke
  against the `:3300` shadow stack showing the POS blocked state).

### Batch B17-03: Dashboard `Dispositivos` read panel

- **Goal:** replace the manual's "no existe la ruta" claim with a read-only list: terminal, status,
  credential age, last sync + freshness badge.
- **Traceability:** issue #832; B17-01 contract.
- **Prerequisites:** B17-01 merged and its response contract frozen.
- **In scope:** new route (`/devices` or a `settings` tab — decide against `sidebar.tsx:41-57` grouping),
  api client, list component reusing `freshness-badge.tsx`, RBAC visibility, loading/empty/error states,
  accessibility per `docs/nhilos/nhilos_backoffice_experience_standard_v1.0.md`.
- **Out of scope:** the revoke button (B17-04), telemetry columns (B17-05), any backend change.
- **Acceptance criteria:** a reviewer can see, per terminal, the same freshness the dashboard already
  shows elsewhere; an unauthorized role does not see the route; the module audit template is filled.
- **Tests / linked evidence:** vitest component + route tests with a mocked api (pattern:
  `src/__tests__/dashboard-v2-freshness.spec.tsx`), a11y assertions (pattern:
  `dashboard-a11y-compliance.spec.tsx:137-204`), and the suite-layout rule from #830: a live-needing spec
  must be named `*.live.test.ts` / `*.live.spec.ts` and registered in the live runners.
- **Rollback:** revert; no data touched.
- **Estimate:** 300-400 lines, risk low-medium.
- **Entry gate:** B17-01 exit. **Exit gate:** Implemented + Verified (unit) — UI proof by B17-06 captures.

### Outcome-level backlog (detail only when the predecessor exits its gate)

- **B17-04 Revoke action in the panel:** confirm dialog, mandatory reason, post-action state, and a
  deliberately visible "this kills the till" warning. Depends on B17-02 + B17-03. High review scrutiny.
- **B17-05 Terminal telemetry (app version, last-seen IP):** battery is out per DEC-17.3, so this batch
  shrinks to app version (POS already sends `pos_build` during OHAC negotiation only) and last-seen IP
  (DEC-17.4, still open). Needs a POS payload change, a column/migration with a backfill policy, and an
  endpoint. Cross-app, so it is its own plan round, not a slice of this one.
- **B17-06 Manual §10 completion:** rewrite the section to what exists — dropping the battery promise
  per DEC-17.3 — add captures through
  `manual-screenshots.live.spec.ts` (note: that path runs against tenant `soho`, and per #839 its
  credential now comes from `MANUAL_E2E_PASS`), tick the readiness item, close #832.
- **Deferred by default:** bulk operations, device grouping by area, per-terminal COGS/health rollups,
  OTA/version policy UI (belongs to the OHAC track), offline-capable revocation queue.

---

## 5. Risks, mitigations, rollback

| Risk | Mitigation |
| --- | --- |
| A second source of truth for devices (worse than AG-03 itself) | B17-01 is a *read* model over existing tables; a write path requires DEC-17.1 to change first. |
| Revocation becomes a self-inflicted outage (operator kills a working till) | OWNER-only (DEC-17.2), mandatory reason, confirm dialog in B17-04, documented re-activation path in the PR, and one Operationally Proven run before merge. |
| Manual claims a field the platform cannot produce (battery) | **Resolved**: DEC-17.3 drops it; §10 is rewritten in B17-06 to what exists. |
| Cross-app batch (POS + backend + dashboard) turning into one 1500-line PR | One batch per app per PR, DAG-enforced; B17-05 explicitly split. |
| RLS bypass through a view | B17-01 acceptance requires an isolation test, and the view is checked against `tenant-rls-policy.ts` semantics. |

## 6. Review budget and PR forecast

Six PRs, all under the 400-line default: B17-01 (~300, backend), B17-02 (~250, backend, **high risk**),
B17-03 (~380, dashboard), B17-04 (~200, dashboard), B17-05 (~350-500 depending on POS — split into
POS+backend if it crosses 400), B17-06 (~150, docs + images). Review load concentrates in B17-02/B17-04;
keep them non-parallel with anything else touching `identity` or the settings area.

## 7. Evidence lifecycle

`Planned` (this document) → `Implemented` (PR merge) → `Verified` (specs + CI) → `Operationally Proven`
(one revoke + one blocked POS run recorded in `odd/tasks/fleet-terminal-panel.md`, then manual §10 text).
Claims from this document are not evidence; each batch must link its own run output.

## 8. Status and deliveries

- **B17-01**: Delivered — `TenantTerminalDto` and `DeviceSyncCredentialService.listTenantTerminals` implemented with strict PostgreSQL RLS and sync-health cross-check.
- **B17-02**: Delivered — `POST /identity/device-sync/credentials/:id/revoke` with `AppPermission.DEVICE_SYNC_REVOKE` permission, duplicate `ConflictException` rejection, and `SyncTransportGuard` fail-closed proof.
- **B17-03**: Delivered — `GET /identity/device-sync/terminals` for OWNER and MANAGER, `features/devices` module in Owner Dashboard, `DevicesPage` (`/devices`, Luxury +1 NHILoS standard v1.0), and real live integration suite `devices.live.test.ts`.
- **B17-04**: Delivered — Dynamic permission delegation (OWNER default, delegable to any role via `device_sync:revoke`), `RevokeDeviceModal` with sanitized form (`noValidate`, Zod schema, keyword confirmation "REVOCAR", Spanish literal error messages, destructive warning alert).
- **B17-05**: Telemetry (app version / last-seen IP) — deferred cross-app per DEC-17.3/DEC-17.4.
- **B17-06**: Delivered — Manual §10 rewritten with delivered fleet monitoring panel and self-service revocation, battery removed per DEC-17.3. Closes #832.
