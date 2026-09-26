# Issue #569 — Single linking flow (code first, attempt pre-bound)

Status: in progress · Branch: `feat/569-single-linking-flow` (worktree `issue-569-single-linking-flow`, base `main`)

## Problem

Today onboarding a terminal takes TWO owner-side steps with manual id transcription: (1) create the activation attempt entering the terminal's `candidateTerminalId` manually, (2) generate a linking code.
The founder wants ONE flow: the owner generates the code, the POS claims it (which binds the `device_id` server-side), and the dashboard detects the claim to offer a one-click "Create attempt" pre-filled with the claimed `device_id`.

## Target Architecture

1. **Backend**: Needs a new endpoint `GET /onboarding/activation/linking-codes` that lists linking codes for the tenant (sorted by `createdAt` DESC, limit 20), returning id, status, deviceId, expiresAt, and claimedAt.
2. **Dashboard Data Layer**: `onboarding-api.ts` `fetchLinkingCodes` + `use-onboarding.ts` `useLinkingCodes` (with polling interval, like `useActiveActivationAttempt`).
3. **Dashboard UI**: Unify the two cards ("Iniciar Activación" and "Vincular Terminal") into a single UX flow.
   - If there is NO `activeAttempt`:
     - Show the "Generate linking code" UI first.
     - Below it, if there are any codes with `status === "CLAIMED"` and a valid `deviceId` (and optionally not expired or recent), show a list of "Terminales Listas para Activar". For each, render the `deviceId` and a button "Iniciar Activación" that calls `startActivationAttempt` with that `deviceId`.
     - Remove the manual text input for `candidateTerminalId`.
   - If there IS an `activeAttempt`: show the current attempt progress UI (as it exists today).

## Edit Surfaces

- `apps/admin_backend/src/modules/onboarding/controllers/device-linking.controller.ts`
- `apps/admin_backend/src/modules/onboarding/services/device-linking.service.ts`
- `apps/admin_backend/src/modules/onboarding/dto/linking-code.dto.ts` (create if needed, for the response schema)
- `apps/owner_dashboard/src/features/onboarding/onboarding-api.ts`
- `apps/owner_dashboard/src/features/onboarding/use-onboarding.ts`
- `apps/owner_dashboard/src/features/onboarding/setup-center-view.tsx`
- Related tests in both apps.

## Acceptance Criteria

1. Backend endpoint `GET /onboarding/activation/linking-codes` exists and returns tenant-scoped codes.
2. Dashboard `setup-center-view.tsx` eliminates the manual `candidateTerminalId` input in favor of a one-click activation button bound to a claimed code's `deviceId`.
3. `npm run lint` and `npm test` remain green in both applications.
