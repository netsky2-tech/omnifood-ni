# Tasks: Pricing & Business Proposal Implementation

## Status
- [ ] **Task 1: Business Proposal Template (PDF-Ready Markdown)**
  - Create a professional markdown template in `docs/templates/proposal_client_v1.md`.
  - Include placeholders for client name, date, and specific hardware recommendations.
  - Integrate the $200 Setup and $55 SaaS fees.
  - Priority: HIGH | Effort: Low

- [ ] **Task 2: Internal Pricing & Cost Calculator**
  - Create a simple markdown table in `docs/internal_pricing_calculator.md` to track margins.
  - Formula: $Profit = (Clients \times SaaS\_Fee) - (IA\_Costs + Internet + Cloud\_Infra)$.
  - Include the "Negotiation Floor" of $45/mo to see impact on break-even point.
  - Priority: MEDIUM | Effort: Low

- [ ] **Task 3: Roadmap Update (Hardening for SaaS)**
  - Update `docs/task-manager.md` to include "SaaS Readiness" tasks:
    - Implement a basic "Tenant Onboarding" script to automate the $200 setup.
    - Ensure "Audit Trail" is prominent for the $55/mo value proposition.
  - Priority: HIGH | Effort: Medium

- [ ] **Task 4: Final Review & Archive**
  - Verify all business documents are consistent across `docs/` and `openspec/`.
  - Run `/sdd-archive` to close the pricing change.
  - Priority: LOW | Effort: Low

## Review Workload Forecast
- **Estimated lines changed**: ~150 lines across markdown files.
- **Complexity**: Low (Documentation and strategy only).
- **Chained PRs recommended**: No.
- **Decision needed before apply**: No.
