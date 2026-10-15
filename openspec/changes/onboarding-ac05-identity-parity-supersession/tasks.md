# Tasks: Onboarding AC-05 identity parity supersession

## 1. Contract revision

- [x] 1.1 Record AC-05 supersession (old text verbatim + reason) and the revised criterion (`proposal.md`, `specs/onboarding/spec.md`).
- [x] 1.2 Invert the e2e assertion: `phone`/`address`/`email` echo back from `POST /onboarding/fiscal-setup` (`onboarding-sale-ready-acquisition.db.e2e-spec.ts`).
- [x] 1.3 Assert row-level persistence of the three identity fields on `tenants`.
- [x] 1.4 Assert the absence discipline: unconfigured identity fields read as `null`, not `undefined`, not `''`.

## 2. Out-of-surface follow-ups (owner, not this change)

- [x] 2.1 Update `docs/onboarding/prd_onboarding_v2_approved.md` §AC-05 to the revised criterion.
- [x] 2.2 Update `docs/onboarding/onboarding_execution_roadmap.md` label "AC-05 Campo no persistido".

## 3. Verification

- [x] 3.1 Focused spec run green (6/6).
- [x] 3.2 Full e2e suite `DB_DATABASE=omnifood_rig npm run test:e2e -- --runInBand` green (742/742).
- [x] 3.3 `npx eslint` clean on the touched spec file.
