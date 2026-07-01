# Batch 3b.2 — Backend BCN FX Lookup Slice

## Implemented in this slice
- Persist backend official BCN FX rates by `invoiceDate` in `inventory_bcn_fx_rates`.
- Expose `GET /api/inventory/fx/bcn?invoiceDate=YYYY-MM-DD` for authenticated inventory BOH roles.
- Return `404 Not Found` when no official rate exists for the requested invoice date.

## Intentionally unchanged
- Purchase preview/posting still uses the explicit document `bcnRate` captured in Batch 3b.1.
- No BCN external fetcher.
- No POS autofill/cache.
- No purchase repricing against official backend rates yet.
- No correction flow.
