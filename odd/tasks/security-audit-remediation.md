# Security Audit Remediation — Public Web Portal

Security audit of the public-facing web portal (owner_dashboard SPA + admin_backend API) found
two critical gaps (no rate limiting, no failed-attempt control) plus medium/low hardening items.
This feature implements remediation items 1–6 from the audit report as reviewable work units.

## Specs

- S1: Install `@nestjs/throttler` and apply aggressive rate limits on the pre-auth
  credential endpoints `POST /api/identity/login`, `POST /api/identity/refresh`, and
  `POST /api/identity/device-sync/token` (per-IP; order of 5/min), with per-account
  tracking on login (email+IP key). Audit evidence: no throttler dependency exists
  (`apps/admin_backend/package.json`); login/refresh unguarded (`auth.controller.ts:28-41`).
  AMENDED (L3): no global per-IP default guard — POS devices of one food park share a
  single egress IP, so a global IP throttle would lock out whole stores.
- S2: Configure `app.set('trust proxy', 1)` in `apps/admin_backend/src/main.ts` so `req.ip`
  resolves to the real client behind the Railway/Cloudflare proxy. Audit evidence: unset today;
  single limiter keys on proxy IP (`device-linking.controller.ts:118`).
- S3: Re-enable HSTS and CSP in helmet when `NODE_ENV=production`, keeping dev relaxed
  (`main.ts:38-43` currently sets `hsts:false`, `contentSecurityPolicy:false` unconditionally).
- S4: Write login success/failure and refresh events to the hash-chained audit log
  (pattern: `user.service.ts:123` `AuditLog` writes; login/refresh currently write nothing).
- S5: Add `RolesGuard` + `@Roles(OWNER, MANAGER)` to `POST /api/identity/audit/drawer-opens`
  (`audit.controller.ts:69-71` has AuthGuard only).
- S6 (AMENDED, see L4): Restrict POS cleartext (plain `http://`) to LAN hosts:
  the operator-supplied API URL validation accepts `http://` only for private
  IP literals (RFC1918), localhost/127.0.0.1, single-label hostnames, and
  `.local`/`.lan` names; `https://` is always accepted. Mirrored in
  `scripts/build_pos_apk.sh` validate_api_url. (`AndroidManifest.xml:16`
  `usesCleartextTraffic="true"` stays because Android network security config
  cannot express private-IP ranges.)

Out of scope (audit lows, later batches): supervisor-override gate/attempt counter, password
policy, bcrypt cost bump, ParseUUIDPipe, noopener, `_headers` preload, exception-passthrough
filter hardening.

## Tasks

- T1 [S2] trust proxy in main.ts — commit `4f1ba6c9` (feat: resolve real client IP behind the reverse-proxy chain)
- T2 [S1] throttler install + login/refresh/device-sync-token limits — commit `aa8bab40` (feat: rate limit the pre-auth credential endpoints)
- T3 [S3] helmet HSTS/CSP in production — commit `d662703c` (feat: enable HSTS and CSP in production)
- T4 [S4] audit login/refresh events — commit `db4f6068` (feat: audit login and refresh events on the hash-chained audit log)
- T5 [S5] drawer-opens role gate — commit `9557475a` (fix: require owner or manager for manual drawer-open audit records)
- T7 [S4 fix] anchored REFRESH_FAILURE rows — commit `9b01d062` (fix: anchor REFRESH_FAILURE audit rows after the rotation transaction)
- T8 [S6 fix] exact Dart↔bash LAN-rule mirror — commit `13ac790f` (fix: make the bash LAN-host rule an exact mirror of the Dart rule)
- T9 feature doc committed on the branch — this file

## Post-verification decisions (independent verify, findings 4-1..4-3, 6)

- 4-1 (fixed): REFRESH_FAILURE now lands on the hash chain anchored to the
  resolved tenant + verified JWT subject, written AFTER the rotation
  transaction closes so the audit insert never waits on the pessimistic
  user-row lock. Deleted users fail the FK and drop to the app log.
- 4-2 (accepted residual): unknown-email failures log without a DB row while
  wrong-password failures write one; a small latency delta remains after the
  (equalized) bcrypt compare. Accepted: no anchor exists for unknown users,
  and per-account throttling already bounds probing.
- 4-3 (accepted residual): anchored failure writes open a second connection
  after the first transaction closes (sequential, not concurrent). Under a
  ≥10-connection failed-login flood the audit write may be dropped and
  logged; auth availability is never affected. Revisit if pool pressure
  becomes observable.
- 6 (fixed): one LAN-host contract implemented identically in Dart
  (`isLanHost`) and bash (`is_lan_host`), verified by a 24-case
  accept/reject matrix: userinfo rejected, exactly one colon = host:port,
  ≥2 colons (IPv6) rejected, private ranges match only exact dotted quads,
  then .local/.lan/.internal, then single-label names.
- Note: the branch was cut from the origin/main merge-base (0f665a4d);
  origin/main has since advanced (8e2c67f9, c5c8f48f, 04940562 — loyalty/
  sales). Rebase/merge at PR time, not part of this feature.

## Log

- L1: User requested a full security audit of the public web portal (HSTS, CSRF, whitelist, user
  numbering, webhooks, AI limits, prompt injection, rate limiting, sanitization, CORS, directory
  listing, admin routes, failed-attempt blocking, event logging, secure cookie flags "entre otros
  detalles"). Audit delivered; user chose option "(b) pase al plan de remediación con los fixes
  1–6 como PRs revisables" — implement fixes 1–6 as reviewable work units.
- L2: Audit evidence base: three parallel explore reports (auth/RBAC; HTTP hardening/webhooks;
  AI/XSS/secrets) + parent verification of helmet wiring, `_headers`, `.env.example` placeholders.
- L3: S1 amended during T2 design: global per-IP throttling would break multi-device stores
  sharing one egress IP (offline-first device sync). Limits stay scoped to pre-auth credential
  endpoints; per-account keying on login prevents one client from locking out an IP's quota.
- L4: S6 amended during T6 design: Android NSC cannot allowlist arbitrary private-IP hosts, and
  plain-HTTP LAN backends are a documented, deliberate pilot deployment mode (docs/plans/deployment/
  batch_12_sunmi_v2s_release_candidate_apk.md R3, docs/operations/q80_ipos_hardware_verification_checklist.md).
  The restriction therefore moves to the URL validation layer (Dart service + build script rule),
  which keeps LAN-HTTP working while refusing cleartext to public hosts.
