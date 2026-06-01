# Delta for infrastructure

## MODIFIED Requirements

### Requirement: Admin Backend Automated Validation
The system MUST automatically validate the code quality and logic of the Admin Backend on every Pull Request or push to `main` involving the NestJS application code.
The default backend validation command (`npm test`) MUST complete in parallel Jest mode without forced worker-exit warnings.
(Previously: Validation required lint, test, and build, but did not require warning-free default parallel Jest shutdown.)

#### Scenario: Successful NestJS Validation
- GIVEN changes are pushed to `apps/admin_backend/**`
- WHEN the CI pipeline is triggered
- THEN it MUST run `npm run lint`, `npm test`, and `npm run build`
- AND the build MUST pass for the PR to be mergeable.

#### Scenario: Default parallel test run shuts down cleanly
- GIVEN backend tests run via default `npm test` settings
- WHEN the test suite completes in parallel worker mode
- THEN Jest MUST exit without forced worker-exit warning output
- AND any required teardown MUST complete before process exit.
