# OTA automatic discovery batch — salvage from feat/ota-b5a-clean

- **Status:** EN CURSO.
- **Branch:** TBD, from `main` = `b394df32`.
- **Origin:** owner decision (2026-10-12): the next APK carries automatic OTA. The two
  annotated branches hold real unmerged work; this batch ports the slices that main lacks.
- **Already on main via other paths (do NOT re-port):** the localhost-fallback fix
  (`api_base_url_service.dart`, debug-only), OTA URL persistence after first upgrade,
  build-time API_URL visibility for discovery. The client OTA coordinator exists (350
  lines) and only checks when the operator opens the terminal card and taps the button.

## Target slices (from feat/ota-b5a-clean, 27 commits)

1. **Silent background polling** — poll for OTA updates without opening a screen.
2. **Offer suppression on dismissal** — persist the "don't show again" decision, never
   re-offer the same release every tick (shared_preferences store).
3. **Discovery I/O split** — `ota_discovery_service.dart` separated from coordinator state.
4. **Silent-offer UX** — report the installed version, surface the discovered offer on the
   terminal card honestly.
5. **Unconfigured-terminal honesty** — offline login without a configured server; the
   operator is told the truth when no server is configured (may partially exist on main).

## Out of scope

- The release itself (bump, build, publish) — separate owner decision after this batch.
- docs commits of the source branches — main's OTA task docs get updated, not replayed.

## Evidence log

| Task | Commit | Evidence |
|---|---|---|
| Release | `a112ee2c` | Bump `1.1.0+20030` → build split-per-ABI: arm64 **22030** (`6ecdfb95…`), armeabi-v7a **21030** (`2dfb68d9…`), x86_64 **24030** (`c68e6c68…`). Release key `CN=NHilos Upload` (`d44db6eb…`), SHA256SUMS OK, manifiesto limpio (el guard anti-stale de T4 funcionó: 3 artefactos exactos). **Publicado** a `pilot` con `min_from=1`, no mandatory, notas de changelog — catálogo remoto (Railway) **y** local. Endpoint verificado en vivo: a 21030 sirve 22030 con digest coincidente; a 22030 → 204. |
