# Owner Dashboard V2 — UI Wireframe Reference

**Document:** `ui_wireframe_reference.md`
**Status:** DESIGN REFERENCE ONLY — non-authoritative. Per PRD §10, behavior and priority are
contractual; exact layout is not. This wireframe translates the PRD composition (§10) into a
visual target for Batches 4–6 and records the design decisions taken.

**Source:** owner-proposed wireframe (2026-09-24), reviewed against the PRD v1.0 and the verified
gate pass. Kept: overall structure, KPI strip contents, trend+attention pairing, bottom summary
band. Changed: eight points listed in §3.

---

## 1. Target wireframe — Cuota Fija tenant (SOHO case)

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│ Dashboard                      SOHO · Régimen fiscal: Cuota Fija               │
│                                ● Datos completos hasta 9:54 pm · sync 9:52     │
│ [Hoy][Ayer][7D][30D][Este mes][Mes ant.]        23 Sep — 23 Sep 2026     [↻]   │
│ Comparación: vs martes anterior (16 Sep)                                       │
├────────────────────────────────────────────────────────────────────────────────┤
│  VENTAS NETAS              TICKETS        TICKET PROM.      MARGEN BRUTO       │
│  C$48,520                  171            C$283.74          61.4%              │
│  ↑12.4%                    ↑8.2%          ↑3.8%             ↑1.9 pp            │
│  ▁▂▃▅▇█▆                   (vs martes anterior — etiqueta en cada card)       │
├──────────────────────────────────────────────┬─────────────────────────────────┤
│ Evolución de ventas                  Ver →   │ ATENCIÓN REQUERIDA              │
│   Netos · hoy vs martes anterior             │ ● 3 stock crítico            →  │
│   ╭────╮                                     │ ● 2 vouchers pendientes      →  │
│ ──╯    ╰──╮      ╭────                       │ ▲ 2 anulaciones · C$840      →  │
│           ╰──────╯                           │ ✓ Secuencia fiscal sin gaps    │
├──────────────────────┬───────────────────────┴───┬─────────────────────────────┤
│ Ventas por hora  Ver →│ Top productos        Ver →│ Mix de pagos          Ver → │
│ ▂ ▃ ▅ █ █ ▆ ▄        │ Cappuccino  214u C$10,080 │ Efectivo  C$23,290 · 48%    │
│ 12:00 ─── 22:00      │ Latte       186u C$ 8,060 │ Tarjeta   C$18,923 · 39%    │
│                      │ Croissant    98u C$ 4,320 │ Otros     C$ 6,307 · 13%    │
│                      │ (unidades + venta + share)│ (moneda original + NIO)     │
├──────────────────────┴──────────────┬────────────┴─────────────────────────────┤
│ RENTABILIDAD — Margen Bruto   Ver → │ FLUJOS SEPARADOS DE VENTAS               │
│ Ventas netas        C$48,520        │ Descuentos C$1,420 · 2.8% base  ↑0.4pp → │
│ Costo de ventas     C$18,740        │ Propinas*  C$3,740 · 8.1%                │
│ Margen bruto        C$29,780·61.4%  │ (no incluidas en ventas; por ticket:     │
│ Mermas (operativa)  C$920 — no      │  C$21.90 · participación 64%)            │
│   reduce el margen mostrado         │                                          │
└─────────────────────────────────────┴──────────────────────────────────────────┘
   * Solo perfiles con propinas habilitadas y tras la remediación de datos (Batch 7).
```

## 2. Variant — Régimen General (conditional fifth slot)

```text
│  VENTAS NETAS    TICKETS    TICKET PROM.    MARGEN BRUTO    IVA GENERADO       │
│  C$48,520        171        C$283.74        61.4%           C$6,341            │
│  ↑12.4%          ↑8.2%      ↑3.8%           ↑1.9 pp         ↑9.1%              │
```

Under Cuota Fija the strip stays at four cards — no hole (PRD FR-KPI-05, FR-FISCAL-03). Under
Régimen General the fifth slot shows historical IVA. Unknown fiscal configuration replaces the
slot with a non-destructive warning linking to Settings (FR-FISCAL-04).

## 3. Changes vs the owner proposal — and why

| # | Change | Driver |
|---|---|---|
| 1 | Context bar adds **"Régimen fiscal: Cuota Fija"** and the **comparison label** ("vs martes anterior") | PRD §10.1 (context = fiscal profile + comparison), FR-KPI-01 (comparison label), FR-FISCAL-03 |
| 2 | Freshness badge keeps **two timestamps separated**: business completeness ("hasta 9:54") and sync heartbeat ("sync 9:52") | FR-SYNC-01/04: `generatedAt` must not masquerade as completeness; AC-08/AC-09A |
| 3 | "Fiscal OK" renamed **"Secuencia fiscal sin gaps"** | Derivable fact (sequence-audit `hasGaps`), not a vague claim; AC-11 |
| 4 | Attention items carry **severity dots** (● critical / ▲ warning) and **drill-down arrows** | §19.1 severity model; §24 drill-down; §28 color-independent signaling |
| 5 | **Discounts move out of the footer into "Flujos separados de ventas"** with the comparison delta, next to a clearly-labeled tips strip | FR-DISC-01 (amount + rate + delta); §21.3 visible separation of tips from sales; §21.4 no zero placeholders |
| 6 | **Rentabilidad moves to the management band** (bottom), out of the performance grid | PRD §10 layering: Operational Profitability is Level 3 (management), not Level 2 (performance); also de-duplicates the margin KPI by framing it as the breakdown |
| 7 | Top Products gains **units**; Payment Mix gains **amounts** and currency note | FR-PRODUCT-01 (product/units/sales/share); FR-PAY-01/03 (amount by method, original currency + NIO equivalent) |
| 8 | Merma carries the caption **"no reduce el margen mostrado"** | FR-PROFIT-03/§7.7: shrinkage is displayed separately, never folded into Margen Bruto |

**Kept as proposed:** Net Sales hero with sparkline; four-KPI baseline; trend + attention pairing
(2:1); hourly/top-products/payment-mix band; the bottom management band concept.

## 4. Gating notes (what this wireframe cannot show yet)

| Element | Dependency |
|---|---|
| Propinas row | Batch 7 (#545) — never render before the data path exists (§21.4) |
| Vouchers pendientes | Batch 6 reconciliation summary contract |
| Freshness states (●) | Batch 3 freshness endpoint; until then the badge stays `generatedAt`-labeled |
| Margin KPI + COGS block for MANAGER | Batch 6 AG-06 cost permission (AC-17) |
| No-sales / partial-sync variants | FR-STATE-01..03 behaviors, not separate layouts |

## 5. Rules the implementation must not break

- Every number on screen reconciles to the Batch-1 semantics (`netSalesNio`, `averageTicketNetNio`,
  `salesCogsNio`); no widget may fall back to `grossSales` (PRD §7.2 cross-widget invariant).
- Comparison labels are mandatory wherever a delta is shown (FR-KPI-01..04); `—` when the base is
  zero (§9.5).
- Color is never the only signal (§25.3, §28); severity and trend direction need text/shape.
- Drill-down is navigation only (§24).
