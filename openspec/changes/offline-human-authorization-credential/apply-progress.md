# Apply Progress: offline-human-authorization-credential

## Slice A / PR 1

- Date: 2026-09-17
- Branch: `feat/ohac-slice-a-canonical-contracts`
- Base implementation commits: `957f3e8`, `fabc490`
- Strict TDD: active
- Delivery: issue-first, chained slices
- Review budget: 400 changed lines; the user explicitly approved a PR 1 waiver because the TypeScript contracts, Dart contracts, and shared vectors are one cross-runtime conformance unit.
- Artifact store for this session: Engram, with this OpenSpec mirror retained because the normative change artifacts already live in the repository.

## Completed PR 1 scope

- [x] `I-1` — `fixtures/human-authorization/v1/canonical-vectors.json` is consumed by both runtimes. It contains:
  - C01–C09 canonical vectors: reordered keys, escaped controls, astral UTF-8, UTF-16 key ordering, NFC/NFD distinction, empty arrays, nested objects, and decimal strings;
  - R01–R06 scanner rejections: numbers, null, duplicate keys, invalid Unicode, truncated JSON, and invalid UTF-8;
  - K01–K03 contract vectors: leading-zero sequence, digest-valid unknown field, and an authored one-byte mutation producing `OHAC_DIGEST_MISMATCH`;
  - S01–S02 compact size recipes: exactly 1 MiB accepted and 1 MiB + 1 rejected with `OHAC_LIMIT_EXCEEDED`.
- [x] `A-RED` — contract tests were authored before the initial implementation. During correction work, each confirmed defect was reproduced behaviorally before its fix: Int64 overflow/unbounded parsing, mutable Dart lists, unsupported minimum assertion schema, malformed accepted head values, and unpinned Dart audit-code mapping.
- [x] `A-GREEN` — TypeScript and Dart implement the same OHAC-C14N-1, staff-policy epoch v1, and assertion v1 contracts.
- [x] `A-TRIANGULATE` — stable rejection coverage includes tenant/terminal scope, build/schema pairs, digest mismatch, chain continuity, non-newer sequence, malformed accepted local head, Int64 boundaries, unknown fields, reserved `__proto__`, size limits, and mutation detection.
- [x] `A-REFACTOR` — contracts remain framework-free value objects. Dart collections are defensive unmodifiable copies. Digest construction preserves every own JSON key in both runtimes. Decimal sequences are canonical signed Int64 strings (`0..9223372036854775807`) and are rejected before `BigInt` parsing.
- [x] `A-EVIDENCE` — current commands and outcomes are recorded below.

## Review corrections applied

Fresh 4R review found and the correction pass resolved:

1. unbounded decimal strings causing multi-second synchronous Dart `BigInt.parse` work;
2. mutable Dart `policyEntries`, `permissions`, and `permissionsUsed` after validation;
3. TypeScript dropping `__proto__` while reconstructing the digest body;
4. malformed `acceptedSequence` / `acceptedDigest` escaping stable result semantics;
5. unenforced `minimumAssertionSchema`;
6. missing shared vectors for leading-zero, unknown-field, one-byte mutation, and size boundaries;
7. misleading cryptographic “signed” wording and silent Dart audit-code fallback.

## Cross-runtime evidence

- Both runners consume the same repository file: `fixtures/human-authorization/v1/canonical-vectors.json`.
- Independent Python `hashlib` verification matched all C01–C09 and K01–K03 authored digests. UTF-16 code-unit sorting is required for C07; Python's default code-point key sorting is not an OHAC oracle.
- K03 valid and mutated envelopes are both 659 bytes and differ at exactly one UTF-8 byte (`backend-build-1` → `backend-build-2`); the unchanged authored digest makes the mutation fail closed.
- S01 materializes exactly 1,048,576 bytes and S02 exactly 1,048,577 bytes from compact shared metadata.
- Stable OHAC wire codes are aligned in TypeScript and Dart; Dart mapping tests pin all current audit-v3 codes and throw on an unmapped future code instead of silently returning `OHAC_INVALID_JSON`.

## Current verification

| Command | Result |
| --- | --- |
| `npx prettier --check src/modules/identity/human-authorization/contracts/*.ts` | PASS — 9 files formatted |
| `npx eslint src/modules/identity/human-authorization/contracts/*.ts` | PASS — no diagnostics, no `--fix` |
| `npm test -- --runInBand` | PASS — 190 suites / 1,558 tests passed; 3 suites / 8 tests skipped |
| `flutter analyze` | PASS — no issues |
| `flutter test test/data/models/human_authorization` | PASS — 44 tests |
| `flutter test` | ENVIRONMENTAL RED — candidate tests passed, but `purchase_view_test.dart` failed to load because `flutter_tester` returned an invalid WebSocket upgrade; repeated full run failed at the same harness boundary |
| `flutter test test/ui/features/inventory/purchases/purchase_view_test.dart` | PASS in isolation — 9 tests |

The full Flutter suite must not be reported as green: its exit code was 1. Evidence points to a pre-existing runner/load failure rather than a candidate regression because the untouched failing file passes in isolation and all candidate-owned tests pass. CI remains the final full-suite gate.

## Changed scope at verification time

- 5 Dart contract files under `apps/pos_app/lib/data/models/human_authorization/`;
- 4 Dart test/helper files under `apps/pos_app/test/data/models/human_authorization/`;
- 6 TypeScript contract/spec files under `apps/admin_backend/src/modules/identity/human-authorization/contracts/`;
- shared fixture JSON + README;
- PR 1 checkbox updates and this progress record.

The Dart source/test directories contain 2,063 physical lines. Tracked diff before this progress file: 439 insertions, 13 deletions across 9 files. No migration, Floor entity/DAO, Nest route/module, pepper configuration, drain/outbox logic, or other later-slice behavior is included.

## Remaining later-slice work

- Infrastructure `I-2`–`I-5`;
- Slice B epoch/ack state machine and drain-before-ack gate;
- Slice C PIN/assertion creation;
- Slice D verifier and recovery lifecycle;
- Phase 3/CI tasks `T-1`–`T-7` and external dependencies `DEP-1`–`DEP-4`.

## Delivery state

Apply is complete for PR 1. Native verify/re-review, work-unit commit, issue-first PR creation, and CI observation remain. Nothing in this progress record authorizes merge or deployment.
