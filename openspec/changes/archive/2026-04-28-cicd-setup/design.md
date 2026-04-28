# Design: CI/CD Pipeline

## Technical Approach
Implement separate GitHub Actions workflows for the POS application and the Admin Backend. This modular approach ensures that each platform's build and test cycles are isolated and triggered only when relevant code changes, following the monorepo-lite structure.

## Architecture Decisions

### Decision: Workflow Granularity
| Option | Choice | Rationale |
|--------|--------|-----------|
| Single Workflow | Separate Workflows | Easier to maintain platform-specific runner versions and secrets. Reduces YAML complexity. |

### Decision: Path Filtering
| Option | Choice | Rationale |
|--------|--------|-----------|
| Global Trigger | Path-based triggers | Optimizes CI minutes and provides faster feedback by only running relevant jobs. |

## CI Workflows

### 1. POS App CI (`.github/workflows/pos-app-ci.yml`)
- **Runner**: `ubuntu-latest`
- **Flutter version**: Stable (matching project `3.41.8`)
- **Jobs**:
    - `lint`: Runs `flutter analyze`.
    - `test`: Runs `flutter test --coverage`.
    - `build-check`: Runs `flutter build web` (smoke test for compilation).

### 2. Admin Backend CI (`.github/workflows/admin-backend-ci.yml`)
- **Runner**: `ubuntu-latest`
- **Node version**: `22.x` (matching project `v24.14.1` as closely as possible in standard runners)
- **Jobs**:
    - `lint`: Runs `npm run lint`.
    - `test`: Runs `npm run test` (Unit).
    - `e2e`: Runs `npm run test:e2e`.
    - `build`: Runs `npm run build`.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `.github/workflows/pos-app-ci.yml` | Create | CI pipeline for Flutter POS. |
| `.github/workflows/admin-backend-ci.yml` | Create | CI pipeline for NestJS Backend. |

## CI Interfaces (GitHub Actions)

### Flutter Setup
```yaml
uses: subosito/flutter-action@v2
with:
  channel: 'stable'
  flutter-version: '3.41.8'
```

### Node.js Setup
```yaml
uses: actions/setup-node@v4
with:
  node-version: '22'
  cache: 'npm'
  cache-dependency-path: apps/admin_backend/package-lock.json
```

## Testing Strategy
The CI/CD pipeline ITSELF is verified by:
1. **Trigger Validation**: Verify that pushing to `apps/pos_app` does NOT trigger `admin-backend-ci`.
2. **Failure Validation**: Introduce a deliberate lint error and verify the CI blocks the PR.

## Migration / Rollout
No migration required. This is a new infrastructure setup.

## Open Questions
- [ ] Do we need automated versioning (Semantic Release) now? (Recommendation: Postpone to Phase 2).
- [ ] Should we use Self-Hosted runners for faster Flutter builds? (Recommendation: Stick to GitHub-hosted for now).
