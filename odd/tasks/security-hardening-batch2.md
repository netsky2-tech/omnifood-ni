# Security Hardening Batch 2 (OWASP-aligned)

Remediation of the OWASP gap analysis delivered after PR #880, plus the out-of-scope items deferred from the first audit batch. Branch `feat/security-hardening-batch2`, cut from `main` at `db7429b1` (merge of PR #880).

## Specs

- S1 (T1): Password hashing uses a single named constant `PASSWORD_BCRYPT_COST = 12` (OWASP Password Storage: bcrypt work factor ≥10, cost 12 chosen for the shared-egress-IP food-park threat model). All production hash sites (`user.service.ts` create/update) use the constant. Successful human login transparently re-hashes any stored hash whose bcrypt round count is lower than the configured cost (bridge toward argon2id; no forced migration). Seed/provision scripts may keep cost 10.
- S2 (T2): Passwords submitted during user creation and password change are checked against a bundled top-common-passwords list (≥1000 entries, local file — no external API, offline-first ethos, no credential exfiltration). Matches are rejected with 400 and a message that does not echo the password. (ASVS v5 6.2.4.)
- S3 (T3): User password minimum length is 8 (was 6) in `user-management.dto.ts` create and update DTOs; error message updated. The 4-digit offline PIN DTOs are unchanged (separate control, offline supervisor PIN). (NIST SP 800-63B / OWASP Authentication Cheat Sheet: ≥8 with a second factor, which the offline PIN provides at the terminal.)
- S4 (T4): Supervisor override hardening in `supervisor-override.service.ts`: (a) failed verification attempts (unknown supervisor, insufficient permission, wrong PIN) are counted per requesting terminal/user with a 5-attempt window; exhausting it returns 429 with a retry hint until the window closes; (b) failure responses are uniform — unknown supervisor and wrong credential return the same status and generic message, no enumeration. Audit rows (`SUPERVISOR_OVERRIDE_REJECTED`) keep the structured reason.
- S5 (T5): Sensitive authenticated business flows get tenant-keyed rate limits (API6:2023 — unrestricted access to sensitive business flows): reports/fiscal export endpoints are limited per tenant (generous default 30/min, no global per-IP default — food-park devices share one egress IP), reusing the @nestjs/throttler infrastructure from batch 1 with a tenant-keyed tracker. Limits are named and documented; a 429 response states the retry window.
- S6 (T6): Supply-chain and disclosure hygiene (API8/A06): a weekly CI workflow runs dependency audit on the backend (`npm audit --omit=dev`, fails on high/critical) and the owner dashboard publishes `/.well-known/security.txt` (RFC 9116) with the project contact.

## Tasks

- T1 (S1) bcrypt cost 12 + rehash-on-login — commit: feat(security): raise password hashing cost to 12 with transparent rehash
- T2 (S2) common-password check — commit: feat(security): reject top common passwords on user credentials
- T3 (S3) password minimum length 8 — commit: feat(security): raise the user password minimum length to 8
- T4 (S4) supervisor-override attempt counter + uniform failures — commit: feat(security): harden supervisor override verification
- T5 (S5) tenant-keyed limits on business flows — commit: feat(security): tenant-keyed limits on export flows
- T6 (S6) weekly dependency audit + security.txt — commit: chore(security): add weekly dependency audit and security.txt

## Log

- L1: "PR y despues vamos con los items fuera de este lote" (user, after audit delivery); "También veamos lo que recomienda OWASP para solidificar nuestra capa de seguridad" (user); "merge" (user, authorizing PR #880 merge); "Bien, veamos si los CIs pasan y continuamos" (user). PR #880 merged as squash `db7429b1`; this batch implements the OWASP gap list (bcrypt cost, breached-password check, password policy, supervisor-override hardening, API6 business-flow limits, API8/A06 supply-chain + security.txt) that was out of scope for #880.
- L2: Code anchors verified at batch start: `user.service.ts:88,144` (bcrypt cost 10 literals), `auth.service.ts:144` (compare + DUMMY_PASSWORD_HASH timing equalization), `user-management.dto.ts:24,29,44,49` (@MinLength 6 password / 4 pin), `supervisor-override.service.ts:97` (Spanish NotFoundException, per-reason distinct messages).
- L3: Batch 2 delivery evidence — T1 commit `feat(security): raise password hashing cost to 12 with
  transparent rehash` (unit RED observed: hash cost 10 vs expected 12; rehash absent; GREEN 79/79
  auth+user suites, identity 771/771). T2 commit `feat(security): reject top common passwords on user
  credentials` (corpus 10,184 entries; GREEN 772/772 identity). T3 commit `feat(security): raise the
  user password minimum length to 8` (DTO RED: 7-char accepted on create and update; GREEN 781/781).
  T4 commit `feat(security): harden supervisor override verification` (worker RED→GREEN 15/15 unit +
  8/8 e2e, parent-verified identity 787/787). T5 commit `feat(security): tenant-keyed limits on heavy
  report and export flows` (worker RED→GREEN 34/34 with HTTP-stack 429 and tenant isolation, parent
  verified sales 597/597). T6 commit `chore(security): add weekly dependency audit and security.txt`
  (contact verified against nhilos_support_policy_v0.1.md). Tooling note: local pnpm resolves
  prettier 3.9.6 while CI pins 3.8.3 via package-lock — only new files were formatted with
  prettier@3.8.3 and batch-1 formatting was kept byte-identical; CI remains the lint oracle.
