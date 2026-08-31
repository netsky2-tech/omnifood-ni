# Delta for sales-core

## ADDED Requirements

### Requirement: Atomic Offline Sale Work
Offline finalization MUST atomically create one invoice, sale, policy-based Kardex effect, fulfillment work, and required print work using stable identities. Cancellation MUST retain the invoice and append reversal effects.

#### Scenario: Offline mixed sale
- GIVEN the POS is offline and routing is missing for one item
- WHEN checkout is finalized
- THEN exactly one sale, invoice, inventory effect, and fulfillment aggregate SHALL be committed and general dispatch SHALL be visible.

#### Scenario: Copy reprint
- GIVEN an existing invoice is reprinted after checkout
- WHEN the authorized copy operation completes
- THEN no new invoice number, sale, inventory movement, fulfillment work, or sync aggregate SHALL exist.
