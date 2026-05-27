## Exploration: identity_audit_scenarios_coverage_wave1

### Current State
Checklist baseline is **PASS 8 / PARTIAL 17 / FAIL 10** (`docs/Scenarios/gestion_identidad_acceso_auditoria_signoff_checklist.md`).

Key validated findings from code:
- Hybrid auth fallback logic already exists in repository layer (`apps/pos_app/lib/data/repositories/auth_repository_impl.dart`, `loginOnline()` fallback branch), but `LoginViewModel` still shows generic online error behavior and lacks explicit fallback UX/state contract (`apps/pos_app/lib/ui/features/auth/viewmodels/login_viewmodel.dart`).
- PIN verification currently uses **bcrypt** (`apps/pos_app/lib/data/services/local_auth_service.dart`), so scenario S-SEC-02 (Argon2/PBKDF2) remains FAIL by strict checklist wording.
- Supervisor override and manual drawer audit logging are implemented in sales flow (`apps/pos_app/lib/ui/features/sales/sale_view.dart`) and covered by targeted widget tests (`apps/pos_app/test/ui/features/sales/sale_view_security_flows_test.dart`).
- Backend audit ingest enforces forensic continuity and hash chain on insert (`apps/admin_backend/src/modules/identity/controllers/audit.controller.ts`), but there is no explicit DB-level evidence here for hard reject of UPDATE/DELETE on audit rows (immutability scenario remains PARTIAL).
- RBAC exists in backend guard primitives (`apps/admin_backend/src/modules/identity/guards/roles.guard.ts`) and owner-only user endpoints, but checklist flags missing full role-action matrix across POS UI + direct routes/API.

### Affected Areas
- `docs/Scenarios/gestion_identidad_acceso_auditoria_signoff_checklist.md` — source of FAIL/PARTIAL closure targets and dependency ordering.
- `apps/pos_app/lib/ui/features/auth/viewmodels/login_viewmodel.dart` — auth fallback signaling and user flow behavior.
- `apps/pos_app/lib/data/repositories/auth_repository_impl.dart` — pending-sync contract and offline permission coherence behavior.
- `apps/pos_app/lib/data/services/local_auth_service.dart` — PIN hash algorithm policy (bcrypt vs Argon2/PBKDF2).
- `apps/pos_app/lib/ui/widgets/app_drawer.dart` — role-based navigation gating (reports/recipes/user management visibility).
- `apps/pos_app/lib/ui/features/sales/sale_view.dart` — restricted actions, override reuse semantics, drawer controls, cash-session interactions.
- `apps/pos_app/test/ui/features/sales/sale_view_security_flows_test.dart` — extension point for role matrix + one-transaction override assertions.
- `apps/admin_backend/src/modules/identity/guards/roles.guard.ts` — server-side role enforcement baseline.
- `apps/admin_backend/src/modules/identity/controllers/audit.controller.ts` — forensic insert pipeline; integration point for immutability evidence and gap detection alerts.
- `apps/admin_backend/src/modules/identity/entities/audit-log.entity.ts` — forensic sequence model; candidate for stronger invariants/triggers support evidence.

### Approaches
1. **Wave 1 = “High-risk closure slice” (RBAC critical + auth fallback contract + immutability guardrails + test evidence)** — close the most compliance-sensitive FAIL/PARTIAL scenarios with minimal code churn.
   - Pros: Directly attacks blocker set (S-AUTH-02, RBAC criticals, audit immutability evidence) with review-safe scope; strongest risk reduction per line changed.
   - Cons: Leaves anti-tampering, PIN algorithm migration, and benchmark still open for next wave.
   - Effort: Medium

2. **Wave 1 = “Broad functional sweep” (touch all FAILs including anti-tamper + perf + hash migration)** — attempt one-pass closure across all remaining categories.
   - Pros: Faster checklist movement in one cycle if successful.
   - Cons: Very likely over 400 changed lines, cross-cutting risk (security, crypto migration, perf harness), harder reviewability, higher rollback complexity.
   - Effort: High

### Recommendation
Use **Approach 1** and split dependency-aware roadmap as follows:

**Roadmap (dependency-aware from FAIL/PARTIAL):**
1) **Security contract first (foundation):**
   - Formalize fallback online→offline contract and pending-sync semantics (S-AUTH-02, S-AUTH-05).
   - Add explicit role-action policy table used by POS checks + backend endpoint annotations for critical routes (S-RBAC-01/02/04/05).
2) **Immutability and anti-abuse hardening:**
   - Add DB-level evidence path for audit immutability (reject UPDATE/DELETE) and test it (S-AUDIT-01, S-DRAWER-03 partial closure reinforcement).
3) **Wave 1 test closure (targeted):**
   - Widget/unit/integration tests proving fallback, role matrix criticals, one-transaction override (S-PIN-06), and route/API denial.
4) **Wave 2 candidates (chained):**
   - Anti-tampering lock + persistence (S-TAMPER-01/02), PIN algorithm policy migration (S-SEC-02), benchmark harness (S-PERF-01), and cash-model B power-loss recovery (S-CASH-B-02).

**400-line budget forecast:**
- A true closure of all high-risk groups in one PR likely exceeds 400 LOC.
- Recommended Wave 1 under budget with chained slices:
  - **Slice A (~220–320 LOC):** fallback contract + RBAC critical matrix enforcement + focused tests.
  - **Slice B (~140–240 LOC):** audit immutability DB guard/test + S-PIN-06 one-transaction test refinement.
  - Ask-always chained strategy should be used if Slice A estimate drifts >320 LOC.

### Risks
- **Policy mismatch risk:** S-SEC-02 remains FAIL unless algorithm policy is changed to Argon2/PBKDF2 or checklist wording is formally updated.
- **False confidence risk:** UI-only RBAC gating without endpoint/data enforcement can be bypassed.
- **Operational risk offline:** anti-tampering still absent; if deferred too long, forensic trust model is weakened.
- **Scope creep risk:** mixing perf benchmark + anti-tamper + crypto migration in same PR will likely violate 400-line review budget.
- **Compliance risk:** immutability claims without DB-level reject evidence are weak for audit sign-off.

### Ready for Proposal
Yes — proceed with proposal focused on **Wave 1 Slice A/B chained plan**. Tell the user this wave intentionally maximizes risk-reduction per review line and defers anti-tampering + PIN algorithm migration + perf benchmark to Wave 2 explicit slices.
