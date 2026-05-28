# SDD Init Premium — omnifood-ni

## Mode

- artifact_store: `openspec`
- execution_mode: `interactive`
- chained_pr_strategy: `ask-always`
- review_budget_lines: `400`

## Detected Stack & Conventions

- Monorepo with:
  - `apps/admin_backend` → NestJS + TypeORM + PostgreSQL
  - `apps/pos_app` → Flutter + Provider + Floor/SQLite
- Architecture conventions from AGENTS docs:
  - Clean Architecture (global)
  - Hexagonal for external integrations
  - DDD tactical concepts in domain boundaries
- Commit/test conventions:
  - Conventional Commits
  - Test-first for meaningful logic changes

## Strict TDD Resolution

- Source: `openspec/config.yaml`
- Value: `strict_tdd: true`

## Testing Capabilities

| Workspace | Runner | Test Layers | Coverage | Lint/Analyze | Type/Compile | Formatter |
|---|---|---|---|---|---|---|
| admin_backend | jest | unit (`npm test`), e2e (`npm run test:e2e`) | `npm run test:cov` | `npm run lint` (ESLint) | `npm run build` (Nest/TS compile) | `npm run format` (Prettier) |
| pos_app | flutter_test | unit/widget (`flutter test`) | `flutter test --coverage` | `flutter analyze` | `flutter build web` smoke build | n/a (formatter not codified in scripts) |

## CI Detection

- `.github/workflows/admin-backend-ci.yml`: lint, unit tests, e2e, build.
- `.github/workflows/pos-app-ci.yml`: codegen, analyze, tests with coverage, web build smoke test.

## Init/Bootstrap Artifacts Updated

- `.atl/skill-registry.md` (generated)
- `openspec/init/sdd-init-premium.md` (this report)
