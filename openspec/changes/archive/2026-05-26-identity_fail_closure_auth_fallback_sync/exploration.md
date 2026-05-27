## Exploration: Identity fail closure — auth fallback + sync-pending contract

### Current State
POS login is online-only at ViewModel level (`login_viewmodel.dart` calls `loginOnline` and returns generic error on null), so S-AUTH-02 remains FAIL. Backend already supports scoped staff sync (`x-offline-sync-scope=pos-auth-continuity`) and masked security profile behavior, but there is no explicit “permission snapshot pending sync” contract surfaced to POS (S-AUTH-05 remains PARTIAL). PIN hashing in POS local auth still uses bcrypt, which mismatches scenario S-SEC-02 (Argon2/PBKDF2).

### Affected Areas
- `apps/pos_app/lib/ui/features/auth/viewmodels/login_viewmodel.dart` — add automatic online→offline fallback flow orchestration.
- `apps/pos_app/lib/domain/repositories/auth_repository.dart` — likely needs fallback-friendly contract (offline identity by email/username and sync-state exposure).
- `apps/pos_app/lib/data/repositories/auth_repository_impl.dart` — implement deterministic fallback path + local permission snapshot state marker.
- `apps/pos_app/lib/data/daos/user_dao.dart` (and maybe query additions) — support offline login lookup by unique identifier instead of strict userId-only call path.
- `apps/pos_app/test/data/repositories/auth_repository_security_profile_sync_test.dart` — extend for fallback and pending-sync behavior assertions.
- `apps/pos_app/test/ui/features/**/login*` (new or existing) — verify fallback UX and generic error semantics.
- `apps/admin_backend/src/modules/identity/services/auth.service.ts` — optional minimal extension: include explicit continuity metadata (e.g., snapshot timestamp/version) in staff sync payload.
- `apps/admin_backend/src/modules/identity/services/auth.service.spec.ts` — test explicit continuity metadata contract and role/scope behavior remains intact.

### Approaches
1. **POS-only fallback orchestration first** — implement fallback in ViewModel+repo without backend contract changes.
   - Pros: closes FAIL S-AUTH-02 quickly; smallest review slice.
   - Cons: S-AUTH-05 may stay PARTIAL if “pending sync” state remains implicit.
   - Effort: Medium.

2. **Vertical slice: fallback + explicit pending-sync contract** — POS fallback plus minimal backend continuity metadata and tests.
   - Pros: closes FAIL S-AUTH-02 and advances critical PARTIAL S-AUTH-05 in one bounded slice; clearer auditability.
   - Cons: cross-app coordination; slightly larger diff.
   - Effort: Medium.

### Recommendation
Choose **Approach 2** as the NEXT change, but constrain scope to a hard 400-line review budget:
- implement fallback and generic failure handling in POS login flow,
- add a tiny explicit “permissions snapshot pending sync” marker contract,
- add focused tests only for these two scenarios.

Do **not** include Argon2/PBKDF2 migration or anti-tampering in this same PR; they deserve follow-up slices to avoid over-budget and mixed-risk review.

### Risks
- Offline identity matching ambiguity (email vs userId) can introduce false negatives if local cache keys are inconsistent.
- Cross-slice coupling with hashing migration (bcrypt→Argon2/PBKDF2) could break existing offline PIN verification if mixed in prematurely.
- If backend metadata contract is too broad, it can unintentionally expose sensitive profile details to cashier/waiter scope.
- Regression risk in existing `pos-auth-continuity` scoped masking logic in `auth.service.ts`.

### Ready for Proposal
Yes — propose change `identity_fail_closure_auth_fallback_sync` as a 1-PR slice (target 250–380 LOC including tests) focused on S-AUTH-02 + S-AUTH-05.
