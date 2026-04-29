## Exploration: Identity, Access, and Audit Management

### Current State
The project is in its early stages. The `apps/admin_backend` and `apps/pos_app` have been scaffolded but lack the identity and auth logic. There is a placeholder `tenant` module in the backend.

### Affected Areas
- `apps/admin_backend/src/modules/identity` (New) — Backend logic for users, roles, and JWT.
- `apps/admin_backend/src/core/auth` — Guards and RLS integration.
- `apps/pos_app/lib/domain/models/user.dart` — Domain entity for users.
- `apps/pos_app/lib/data/daos/user_dao.dart` — Local persistence for users and PIN hashes.
- `apps/pos_app/lib/ui/features/auth/` — UI for switching users and PIN entry.
- `apps/pos_app/lib/data/daos/audit_dao.dart` — Local audit trail.

### Approaches
1. **Hybrid Sync-based Auth (Recommended)** — Profile and PIN hashes are synced from Cloud to Local SQLite.
   - Pros: Consistent permissions across devices, supports offline PIN login, easy auditing.
   - Cons: Requires sync logic for user updates.
   - Effort: Medium-High

2. **Cloud-only Auth with Local Cache** — Simple local storage for session only.
   - Pros: Simple to implement.
   - Cons: Breaks requirement for offline daily login (PIN) if the tablet reboots or session expires while offline.
   - Effort: Low

### Recommendation
Implement **Approach 1**. It fulfills the PRD's vision for "Offline-First Excellence" and "Nicaraguan Fiscal Compliance" by ensuring every action is linked to a user even without internet.

### Risks
- Local hash storage: Must use BCrypt and ensure SQLite isn't easily accessible.
- Forced logouts: Implementation needs a way to invalidate local sessions when sync occurs if the user was deactivated in the cloud.

### Ready for Proposal
Yes.
