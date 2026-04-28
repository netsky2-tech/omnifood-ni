# Infrastructure Specification: CI/CD Pipeline

## Purpose
Define the automated validation and build requirements for the OmniFood NI monorepo to ensure code quality and system stability.

## Requirements

### Requirement: POS App Automated Validation
The system MUST automatically validate the code quality and logic of the POS application on every Pull Request or push to `main` involving the Flutter application code.

#### Scenario: Successful Flutter Validation
- GIVEN changes are pushed to `apps/pos_app/**`
- WHEN the CI pipeline is triggered
- THEN it MUST run `flutter analyze` and `flutter test`
- AND the build MUST pass for the PR to be mergeable

### Requirement: Admin Backend Automated Validation
The system MUST automatically validate the code quality and logic of the Admin Backend on every Pull Request or push to `main` involving the NestJS application code.

#### Scenario: Successful NestJS Validation
- GIVEN changes are pushed to `apps/admin_backend/**`
- WHEN the CI pipeline is triggered
- THEN it MUST run `npm run lint`, `npm test`, and `npm run build`
- AND the build MUST pass for the PR to be mergeable

### Requirement: Path-Based Execution (Monorepo Optimization)
The CI system MUST only execute the jobs relevant to the changed files to optimize resource usage and feedback time.

#### Scenario: Isolated Backend Change
- GIVEN a change only touches `apps/admin_backend/src/main.ts`
- WHEN the CI pipeline runs
- THEN the NestJS validation job MUST run
- AND the Flutter validation job MUST NOT run

### Requirement: Build Guard
The system MUST prevent merging any code that does not pass the automated validation pipeline.

#### Scenario: Failed Test Blocks Merge
- GIVEN a PR contains a failing unit test in `admin_backend`
- WHEN the CI pipeline completes with a failure
- THEN the GitHub PR interface MUST indicate that the checks failed
- AND the PR SHOULD NOT be mergeable until the tests pass
