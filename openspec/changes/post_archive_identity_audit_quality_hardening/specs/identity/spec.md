# Delta for Identity

## ADDED Requirements

### Requirement: Backend Test Hygiene

The system MUST run tests deterministically without unresolved resource locks, open handles, or deprecation warnings (e.g., `pg` client query overlap).

#### Scenario: Running test suites
- GIVEN the backend test suite is executed
- WHEN the application modules and e2e instances compile and tear down
- THEN the test runner MUST exit cleanly without forced worker termination
- AND no `pg` driver warnings about concurrent query execution SHALL be emitted

### Requirement: Identity Lint Compliance

The backend identity module MUST adhere to strict TypeScript typing patterns, eliminating unsafe types (e.g., `any`) and untyped mock injection in critical hotspots.

#### Scenario: Linting the audit controller spec
- GIVEN the `audit.controller.spec.ts` file is evaluated
- WHEN the linter validates the file
- THEN the file MUST report zero `any` usage or unsafe member access errors
- AND all dependencies and mocks MUST use explicit types or `unknown`

#### Scenario: Linting the auth service
- GIVEN the `auth.service.ts` file is evaluated
- WHEN the linter validates role checking and enum comparisons
- THEN the file MUST NOT contain enum-unsafe or loosely typed comparisons

### Requirement: Authentication Coverage

The backend authentication service MUST provide comprehensive coverage for critical edge cases and role-sensitive branches.

#### Scenario: Role-sensitive branching in auth
- GIVEN an authentication request or role-based check
- WHEN an edge-case role or invalid scope is provided to the auth service
- THEN the service MUST handle the invalid state gracefully
- AND the test suite MUST execute this branch to maintain high coverage density

### Requirement: Meaningful Entity Assertions

The system MUST enforce meaningful unit test assertions for domain entities, verifying data mapping, selection behaviors, or lifecycle hooks.

#### Scenario: Replacing trivial entity tests
- GIVEN the `user.entity.ts` entity
- WHEN its accompanying unit test is executed
- THEN it MUST assert specific mapping constraints or behaviors rather than a trivial `toBeDefined()` check
- OR the test file MUST be removed if it is entirely redundant

### Requirement: Conditional Legacy Field Removal

The system MAY drop the legacy `users.pin_hash` database column and its entity mapping, BUT MUST do so ONLY if explicit compatibility checks confirm no remaining consumers.

#### Scenario: Removing the legacy PIN hash
- GIVEN the `users.pin_hash` column is slated for removal
- WHEN the compatibility gate validates that all active credential flows use `SecurityProfile`
- THEN a database migration MUST drop the `pin_hash` column from the `users` table
- AND the `pin_hash` property MUST be removed from `User` entity
- AND if the compatibility gate fails, the column MUST remain intact

## MODIFIED Requirements

### Requirement: Cloud Database Schema

The `users` table schema MUST reflect the active state of user credentials, removing unused legacy columns if conditions are met.
(Previously: The users table defined `pin_hash` as a required text column)

#### Scenario: Verified schema update
- GIVEN the database schema is migrated
- WHEN the compatibility gate for `users.pin_hash` passes
- THEN the `users` table MUST NOT contain the `pin_hash` column
- AND offline login synchronization MUST rely on the updated security profile structure
