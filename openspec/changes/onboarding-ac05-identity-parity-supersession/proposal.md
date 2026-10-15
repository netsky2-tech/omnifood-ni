# Proposal: Onboarding AC-05 — Company identity parity supersedes "campo no persistido"

## Intent

Revise acceptance criterion **AC-05** of the Onboarding PRD (`docs/onboarding/prd_onboarding_v2_approved.md`, "AC-05 — Campo no persistido") to the contract the system actually has after the company identity parity feature (commit `34eaee29` "feat(tenant): persist the company identity fields the reports need").

The old criterion declared that fields the backend does not persist are not marked as saved nor used for readiness, and its e2e proof (`apps/admin_backend/test/onboarding/onboarding-sale-ready-acquisition.db.e2e-spec.ts`) asserted that `phone`, `address` and `email` sent to Fiscal Setup were **not persisted** and **not returned** (`expect(fiscalRes.body.phone).toBeUndefined()`).

The parity feature deliberately changed that: the tenant is now the owner of its identity so reports and printed tickets have one source. `tenant.phone`, `tenant.address` and `tenant.email` are nullable columns, the fiscal snapshot carries them, the terminal mirrors them into its printed-header fallback keys, and the dashboard form prefills and sends them.

## What Changes

- AC-05 is **revised, not erased**: the identity fields ARE persisted and DO travel. The old criterion is recorded below as **SUPERSEDED** with its reason.
- The e2e spec now asserts the new contract: the three fields round-trip through `POST /onboarding/fiscal-setup`, reach the tenant row, and — when never configured — read as `null`, never `undefined` and never an empty string (absence discipline S3).

## SUPERSEDED criterion (verbatim, with reason)

> **AC-05 — Campo no persistido** (SUPERSEDED by company identity parity P1)
>
> Dado un campo que el backend no persiste, la UI no lo marca como guardado ni lo utiliza para readiness.

**Reason for supersession:** the identity parity feature made the tenant the owner of its identity (`tenant.phone` / `tenant.address` / `tenant.email`, nullable by design) so reports and tickets print one source. `phone` and `address` were never throwaway inputs, and `email` joined them as a declared, nullable column. A criterion stating they are not persisted now contradicts the system's contract and its test.

## Revised criterion

> **AC-05 — Identidad de empresa persistida y transportada** (revised)
>
> Dado que el Owner envía `phone`, `address` o `email` en Fiscal Setup, el backend los persiste en el tenant y los devuelve en la respuesta; dado que nunca fueron configurados, se leen como `null` — nunca `undefined` ni cadena vacía. Un campo que el backend no persiste no se marca como guardado ni se utiliza para readiness (esa parte del criterio original sigue vigente para campos fuera de la identidad de empresa).

## Impact

| Area | Change |
|------|--------|
| `apps/admin_backend/test/onboarding/onboarding-sale-ready-acquisition.db.e2e-spec.ts` | Old `toBeUndefined()` assertion inverted to the parity contract; DB-row persistence asserted; unconfigured fields asserted as `null`. |
| `docs/onboarding/prd_onboarding_v2_approved.md` §AC-05 | **OUT OF SCOPE for this change's edit surfaces** — must be updated by the owner to match; this proposal is the record of the supersession. |
| `docs/onboarding/onboarding_execution_roadmap.md` ("AC-05 Campo no persistido") | Same: outside edit surfaces, tracked for the owner. |
| Production code | None. No behavior change; the code already implements the parity contract. |

## Rollback

Revert the spec-file edits and this change folder; production code is untouched, so no data or migration rollback exists or is needed.
