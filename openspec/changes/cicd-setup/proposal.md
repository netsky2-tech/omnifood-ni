# Proposal: CI/CD Setup

## Goal
Implement a robust CI/CD pipeline using GitHub Actions to validate code quality and ensure build stability across the Flutter and NestJS applications.

## Capabilities

### New Capabilities
- **Automated Validation**: Every PR to `main` must pass linting and tests.
- **Path-Based Execution**: Flutter CI runs only on `apps/pos_app/**` changes; NestJS CI runs only on `apps/admin_backend/**` changes.
- **Build Guard**: Prevents merging code that fails to compile.

## Technical Strategy
Create two separate workflow files in `.github/workflows/`.

### 1. POS App CI (`pos-app-ci.yml`)
- Trigger: `pull_request` on `main`, `push` on `main`.
- Paths: `apps/pos_app/**`, `.github/workflows/pos-app-ci.yml`.
- Steps:
  - Setup Flutter.
  - `flutter pub get`.
  - `flutter analyze`.
  - `flutter test`.
  - Build check (e.g., `flutter build web` or apk).

### 2. Admin Backend CI (`admin-backend-ci.yml`)
- Trigger: `pull_request` on `main`, `push` on `main`.
- Paths: `apps/admin_backend/**`, `.github/workflows/admin-backend-ci.yml`.
- Steps:
  - Setup Node.js.
  - `npm install`.
  - `npm run lint`.
  - `npm test`.
  - `npm run build`.

## Risks
- CI time limits (managed via path filtering).
- Dependency on external actions (use verified actions).

## Rollback Plan
Delete the `.github/workflows/` directory.
