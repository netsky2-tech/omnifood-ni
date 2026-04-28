## Exploration: CI/CD Setup for OmniFood NI

### Current State
The project has no CI/CD pipeline configured. Pull requests and pushes are currently unvalidated.

### Affected Areas
- `.github/workflows/ci.yml` — New file for the CI pipeline.
- `apps/pos_app/` — Path filter for Flutter CI.
- `apps/admin_backend/` — Path filter for NestJS CI.

### Approaches
1. **Monolithic Workflow** — A single workflow file that runs everything on every push.
   - Pros: Simple to write.
   - Cons: Slow, wastes CI minutes (runs Flutter tests when only Backend docs change).
   - Effort: Low

2. **Path-Filtered Workflows** — Use GHA `on: push: paths:` or a filtering action to trigger specific jobs based on changed files.
   - Pros: Efficient, faster feedback loop.
   - Cons: Slightly more complex YAML logic.
   - Effort: Medium

3. **Separate Workflow Files** — One file for `flutter-ci.yml` and another for `nestjs-ci.yml`.
   - Pros: Cleanest separation.
   - Cons: Might duplicate some boilerplate (like checkout).
   - Effort: Low

### Recommendation
Use **Approach 3 (Separate Workflow Files)** combined with path filtering. This keeps the logic for each platform isolated and easy to maintain while ensuring we only run what's necessary.

### Risks
- Version mismatch between CI environment and local environment (should use fixed versions in GHA).
- Secrets management for future CD steps (BAC/Banpro keys).

### Ready for Proposal
Yes.
