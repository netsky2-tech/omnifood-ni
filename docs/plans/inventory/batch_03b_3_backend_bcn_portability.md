# Batch 3b.3 — Backend BCN Portability and Proxy Hardening

## Implemented in this slice

- Keep exact-date `inventory_bcn_fx_rates.effective_date` lookup as the first official FX path.
- Fetch BCN monthly SOAP rates only when an official lookup misses local persistence.
- Support `BCN_PROXY_URL` as the configured first transport endpoint and `BCN_TIMEOUT` for bounded network calls.
- Parse both plain monthly `Detalle_TC/Tc` responses and legacy `<any>`-wrapped `RecuperaTC_MesResult` payloads.
- Persist the consumed official exact-date rate before returning it to purchase preview/posting.

## Safety behavior

- Missing exact invoice date returns the existing safe not-found behavior.
- Proxy, BCN network, HTTP, or parser failures return safe not-found semantics; no invented or last-known rate is used.
- Manual/explicit purchase rates remain offline-safe and unchanged.

## Intentionally unchanged

- POS sync contract and `fxRateMode` payload shape.
- Purchase correction flow and compensating movement work.
- Broad monthly sync job, scheduler, or operational import UI.
