# Tasks: CI/CD Pipeline Setup

## Phase 1: Flutter POS App Workflow
- [x] 1.1 Create `.github/workflows/pos-app-ci.yml`.
- [x] 1.2 Configure triggers for `pull_request` and `push` on `main` with path filters (`apps/pos_app/**`).
- [x] 1.3 Add job to setup Flutter `3.41.8`, run `pub get`, and `flutter analyze`.
- [x] 1.4 Add job to run `flutter test --coverage`.
- [x] 1.5 Add smoke-test job to run `flutter build web`.

## Phase 2: NestJS Admin Backend Workflow
- [x] 2.1 Create `.github/workflows/admin-backend-ci.yml`.
- [x] 2.2 Configure triggers for `pull_request` and `push` on `main` with path filters (`apps/admin_backend/**`).
- [x] 2.3 Add job to setup Node.js `22`, run `npm ci`, and `npm run lint`.
- [x] 2.4 Add job to run `npm test` and `npm run test:e2e`.
- [x] 2.5 Add job to run `npm run build`.

## Phase 3: Repository Protection (Manual Verification)
- [x] 3.1 Verify that workflows trigger correctly by pushing to a test branch.
- [ ] 3.2 (Action required by user) Enable Branch Protection rules on GitHub for `main` requiring passing CI status.

## Phase 4: Final Verification
- [x] 4.1 Commit and push both workflows.
- [x] 4.2 Verify successful run on GitHub Actions interface.
