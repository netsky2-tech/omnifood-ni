# Owner Dashboard Menu QR — ODD Tasks

## Objective
Deliver an urgent, offline-capable owner-dashboard utility that lets OWNER and MANAGER users generate and download a QR code for an HTTP(S) menu URL, including Google Drive links.

## Problem and why
Business owners need a printable QR that customers can scan to open an externally hosted menu. The first release must solve that need without prematurely introducing menu hosting, content management, or backend persistence.

## Authorized scope
- Dedicated `/menu-qr` route in the owner dashboard, visible under `Gestión`.
- OWNER and MANAGER access only.
- Accept trimmed `http:` and `https:` URLs; reject empty values, credentials, unsupported schemes, and oversized payloads.
- Generate and download a PNG entirely in the browser with a bundled encoder.
- Persist the last accepted URL in local storage.
- Spanish user-facing copy; English technical artifacts.
- Isolated branch/worktree: `feat/owner-dashboard-qr` at `/home/octavio_morales/omnifood-ni-worktrees/owner-dashboard-qr`, based on `origin/main` at `94d274f`.

## Non-goals
- Backend API or cloud synchronization.
- Menu authoring, hosting, analytics, dynamic/redirectable QR codes, or tenant branding.
- Arbitrary free-text QR payloads.
- Claiming that the complete owner dashboard works offline; only generation and download are network-free after the page loads.

## Constraints
- No external QR API or CDN; CSP permits self-hosted scripts and data images only.
- Do not use blob image URLs unless CSP is changed and verified; prefer a PNG data URL.
- Preserve the unrelated dirty `fix/408-enum-columns` root worktree.
- Keep behavior and tests in the same reviewable work unit.
- No commit, push, or PR without explicit user authorization.

## Acceptance criteria
1. OWNER and MANAGER can navigate to `QR del menú`; other roles cannot access the route.
2. A valid HTTP(S) URL generates a scannable QR whose payload is the normalized input URL.
3. Empty, unsafe-scheme, credential-bearing, and oversized values show inline validation and generate nothing.
4. The preview has an accessible text alternative and generation feedback is announced.
5. Download creates a local PNG without making a network request.
6. The last valid URL is restored from local storage.
7. Focused tests, typecheck, lint, unit suite, build, and relevant browser coverage pass or are reported honestly.

## Dependency DAG
`T1 encoder + validation` → `T2 page behavior` → `T3 route/RBAC/navigation + end-to-end verification`

## Tasks

### T1 — Establish the local QR contract
- **Status:** done
- Added bundled `uqr` dependency and a narrow PNG data-URL adapter.
- Added canonical HTTP(S) URL validation with credential rejection and a 1024-byte UTF-8 payload bound.
- Added focused tests for encoder options, PNG fidelity, canonicalization, typed failures, and validation boundaries.
- **Checks:** `pnpm exec vitest run src/features/menu-qr` — 2 files, 32 tests passed; `pnpm run typecheck` — passed; `pnpm run lint` — passed with two pre-existing unrelated warnings.
- **Independent verification:** PNG matrix fidelity matched `uqr` with zero mismatches; no medium-or-higher findings remain after bounded correction.
- **Runtime harness:** N/A; T1 has no routed browser UI or network boundary.
- **Rollback boundary:** QR dependency, encoder adapter, validation contract, and their focused tests.
- **Commit evidence:** `1ce5f5554bc0b5ceb5fa17595ea615f260d8d599` — `feat(owner-dashboard): add local menu QR contract`.

### T2 — Build the accessible QR workflow
- **Status:** verified; awaiting commit authorization
- Implemented the dedicated page, URL workflow, accessible preview, data-URL download, best-effort local persistence, and Spanish copy using existing UI primitives.
- Covered validation, generation, state invalidation after edits, error recovery, persistence, preview, download, offline behavior, and CSP-safe URLs with hook/component tests.
- **Checks:** focused T2 suite — 3 files, 33 tests passed; full menu-QR suite — 4 files, 60 tests passed; typecheck passed; lint passed with two pre-existing unrelated warnings.
- **Independent verification:** no medium-or-higher code findings remain; restored URLs regenerate only after explicit user action, and generation/download make no network calls.
- **Runtime harness:** Vitest + jsdom + Testing Library exercised type → generate → preview → download and remount → restore → regenerate.
- **Rollback boundary:** remove `src/features/menu-qr/use-menu-qr.ts`, `menu-qr-page.tsx`, `use-menu-qr.test.ts`, `menu-qr-page.test.tsx`, `src/__tests__/menu-qr-page.test.tsx`, and the corresponding T2 task-progress lines; preserve committed T1.
- **Commit evidence:** pending explicit commit authorization.

### T3 — Integrate and verify the feature
- **Status:** pending
- Wire lazy routing, role permissions, and sidebar navigation.
- Add relevant integration/e2e coverage without relying on external network services.
- Run typecheck, lint, tests, build, and the feasible Playwright scenario.
- Confirm no calls to a remote QR service and no CSP-incompatible preview URL.
- **Checks:** owner-dashboard verification commands and structural readback.
- **Rollback boundary:** route, RBAC, sidebar, e2e integration, and QR feature files.
- **Commit evidence:** pending explicit commit authorization.

## Progress and evidence
- 2026-09-19: Read-only exploration confirmed React/Vite owner dashboard conventions, no existing QR dependency, CSP restrictions, and the absence of a service worker.
- 2026-09-19: User authorized the recommended dedicated-route MVP and a separate worktree.
- 2026-09-19: Created `feat/owner-dashboard-qr` worktree from `origin/main` (`94d274f`) without touching the dirty #408 worktree.
- 2026-09-19: T1 implemented under TDD. Independent verification found a multibyte byte-capacity defect and raw-vs-canonical URL drift; both were corrected with regression tests.
- 2026-09-19: T1 re-verification passed 32 focused tests, typecheck, and lint; PNG matrix fidelity had zero mismatches and no medium-or-higher findings remained.
- 2026-09-19: User authorized and created T1 work-unit commit `1ce5f5554bc0b5ceb5fa17595ea615f260d8d599`.
- Review workload note: T1 contains 736 inserted lines including tests and this recovery document, above the preferred 400-line PR slice. Keep subsequent behavior in separate work-unit commits so the history can support chained review if requested.
- 2026-09-19: T2 implemented under TDD. Independent verification found stale generated state after input edits and missing recovery coverage; both were corrected with focused tests.
- 2026-09-19: T2 re-verification passed 33 focused tests, the 60-test menu-QR suite, typecheck, and lint; no medium-or-higher code findings remain.
- Review workload note: T2 adds approximately 853 lines across page, hook, and behavior-first tests. Preserve it as a separate work-unit commit and treat T1/T2 as independent review slices if a PR is opened.

## Next step
Obtain explicit authorization for the T2 work-unit commit, record its identity, then advance T3 integration and browser verification.
