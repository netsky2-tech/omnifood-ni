# Financial dashboard — 2026-08 / CONSERVATIVE

> Internal management report. Every result is **before taxes and withholdings**. Economic result and client contribution are not net profit.

## Viability states

| Dimension | State | Exact rule |
| --- | --- | --- |
| Cash | NON_NEGATIVE | `POSITIVE_SURPLUS` > 0; `NON_NEGATIVE` = 0; `NEGATIVE` < 0. |
| Economic after owner labor | NON_NEGATIVE | Same boundaries; zero covers recognized costs and confirmed owner labor without surplus. |
| Recurring model | NEGATIVE | Same boundaries; zero covers fixed budget and active-interval reserves without surplus. |

## Actuals for the month

| Metric | Value |
| --- | ---: |
| Cleared cash income | US$0.00 |
| Cleared cash expenses | US$0.00 |
| Cleared owner capital in | US$0.00 |
| Cleared owner capital out | US$0.00 |
| Net cash flow | US$0.00 |
| Non-cash income | US$0.00 |
| Non-cash expenses | US$0.00 |
| Operating result before taxes/withholdings | US$0.00 |
| Confirmed owner labor | 0.00 hours / US$0.00 |
| Economic result after owner labor, before taxes/withholdings | US$0.00 |
| Setup revenue actual | US$0.00 |
| Recurring revenue actual | US$0.00 |

PENDING: **0** rows, signed cash effect US$0.00.  
UNVERIFIED: **0** rows, signed cash effect US$0.00.  
Neither status affects actual metrics.

## Recurring model

| Metric | Value |
| --- | ---: |
| Active clients at period end | 0 |
| MRR | US$0.00 |
| ARR | US$0.00 |
| Fixed monthly budget | US$170.02 |
| Variable reserve from active subscription intervals | US$0.00 |
| Modeled recurring contribution before taxes/withholdings | -US$170.02 |
| Break-even state or client count | NO_ACTIVE_SUBSCRIPTIONS |
| Actual expense budget | US$170.02 |
| Actual-vs-budget expense variance | -US$170.02 |

Break-even states: `NO_ACTIVE_SUBSCRIPTIONS` means no observed active fee/reserve; `UNATTAINABLE_NONPOSITIVE_MARGIN` means average fee minus reserve is zero or negative; otherwise the value is a numeric client count.

## Shared-cost reconciliation

| Unallocated item | Value |
| --- | ---: |
| Shared cash expenses | US$0.00 |
| Shared non-cash expenses | US$0.00 |
| Shared confirmed owner labor | US$0.00 |

Client contribution excludes these unallocated shared costs and therefore does **not** equal client profit.

## Effective fixed budget inputs

| Line ID | Category | Description | Monthly amount |
| --- | --- | --- | ---: |
| CLOUDFLARE_PAGES | INFRASTRUCTURE | Cloudflare Pages | US$0.00 |
| CLOUDFLARE_R2 | BACKUP | Cloudflare R2 | US$1.35 |
| DOMAIN | INFRASTRUCTURE | Domain | US$1.92 |
| GEMINI | AI | Gemini | US$20.00 |
| GPT | AI | GPT | US$100.00 |
| INTERNET | OPERATIONS | Internet | US$20.00 |
| RAILWAY | INFRASTRUCTURE | Railway Pro and usage | US$26.75 |

Generated from effective-dated contracts. PLANNED, PAUSED and CANCELLED intervals do not create MRR.
