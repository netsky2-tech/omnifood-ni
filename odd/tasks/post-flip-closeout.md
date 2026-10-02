# Post-flip closeout: repair the dashboard CI and record the flipped API URL

**Feature**: `post-flip-closeout` · **Branch**: `fix/dashboard-stale-fx-label` from
`origin/main` = `2e03e423` · **Issue**: pending · **PR**: pending

## Why

Merging the hostname rename (PR #771) exposed two checks that were **already red on
`main`**, and it completed the dashboard half of the rename — which left the deploy
documents asserting the old `VITE_API_URL` value. This closes both out so the
repository stops lying about a red CI it does not have and a configuration that no
longer exists.

## Root cause of the red dashboard CI (measured, not assumed)

`5342aef8 fix(settings): the FX field is the commercial rate, not a spread over BCN`
relabelled the fiscal-setup control from `Spread Cambiario Comercial (C$) *` to
`Tipo de Cambio Comercial (C$) *`, and changed `commercialFxSpread`'s default from
`0.5` to `36.5`. It did **not** update the two tests that select that control by its
old label, so these fail with
`Unable to find a label with the text of: /Spread Cambiario Comercial/i`:

- `apps/owner_dashboard/src/__tests__/fiscal-business-profile.test.tsx:287`
- `apps/owner_dashboard/src/__tests__/w9-e2e-settings.test.tsx:305`

Evidence that the failure is not ours: in
`6821dd43..origin/main -- apps/owner_dashboard/src` (last green dashboard CI run to
now) only three commits appear — the two from PR #771 (the CSP change) and
`5342aef8`. The failure is the same, with the same test names, both on `main`
(run 37074249801) and on the PR (run 37075097444).

## Tasks

- [x] T1 Fix the two stale test selectors — commit: `b5de52f2`
- [x] T2 Record the flipped `VITE_API_URL` in the deploy documents — commit: `1ef1cb23`
- [x] T3 Verify the dashboard suite is green — 95 files, 1346 passed, 4 skipped
- [ ] T4 Retire the four stale `spread` strings the relabel left behind — commit: —

## Measured facts available for T2

- Merging to `main` updated the live CSP within ~40 s: `connect-src 'self'
  https://api.nhilospos.com https://api-staging.nhilospos.com`. This **proves the
  Cloudflare Pages production branch is `main`**, which runbook §6 recorded as
  `[unverified]`.
- The deployed bundle contains `api.nhilospos.com` and no `api-staging`:
  `/assets/tenant-B8kzKfbT.js`, identical on `soho.nhilospos.com` and on
  `nhilos-pos-dashboard.pages.dev`.
- CORS preflight from the dashboard origin to the official origin: `204`,
  `access-control-allow-origin: https://soho.nhilospos.com`.

## Out of scope, reported but not changed

- Admin Backend CI lint (14 errors) — already tracked by approved issue #234.
- The a11y spec's load sensitivity, which did not reproduce in CI.

## Correction: an earlier revision of this document was wrong

An earlier revision claimed the domain still carried a `SPREAD_PLUS_10` checkout-FX
mode, and used that claim to leave four user-visible `spread` strings untouched. That
was false. `CheckoutFxMode` has exactly two members — `COMMERCIAL` and `BCN_OFFICIAL`
(`src/features/settings/types.ts:37-42`) — and `SPREAD_PLUS_10` appears **only** in
`src/__tests__/fiscal-business-profile.test.tsx`, where it is a deliberate non-member
value that exercises `resolveCheckoutFxMode` resolving to `null`. There is no live
spread mode.

The owner confirmed that the field is consumed as the commercial exchange rate, so the
four strings are stale copy left by `5342aef8`'s incomplete rename, not a legitimate
domain term. T4 retires them.

## Constraints

- Both failures are pre-existing on `main`; this branch must not change behaviour.
- Change only what makes `main` honest: two test selectors and the deployed-value
  facts in the documents. Do not rewrite the historical staging steps in runbook
  §1–§9, which correctly describe the staging hostname as the thing that was built.
