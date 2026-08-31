# Durable Print Lifecycle Specification

## Purpose
Define ordered, auditable printing and safe recovery.

## Requirements

### Requirement: Ordered Durable Attempts
Print attempts MUST persist PENDING, PRINTING, PRINTED, and FAILED states with device, user, time, and outcome evidence. On one printer, the customer receipt MUST precede one consolidated fulfillment ticket containing all physical lines.

#### Scenario: Successful checkout printing
- GIVEN a sale has physical items and one printer
- WHEN printing begins
- THEN the customer receipt SHALL be attempted first and exactly one consolidated ticket SHALL follow.

### Requirement: Confirmed Failure and Safe Retry
Confirmed failures MAY be explicitly retried; uncertain outcomes MUST NOT be blindly retried and SHALL require operator confirmation. Retries MUST NOT duplicate fiscal, inventory, fulfillment, or sync effects.

#### Scenario: Ambiguous printer result
- GIVEN a ticket may have printed but outcome is uncertain
- WHEN the operator chooses no retry
- THEN the attempt SHALL remain traceable without another print or business effect.

### Requirement: Authorized Copy Reprints
Reprints MUST be copy operations requiring an authorized role and reason, and MUST append audit evidence. They MUST NOT create a new invoice, movement, fulfillment work, or synchronization aggregate.

#### Scenario: Manager reprints receipt
- GIVEN a manager supplies a reason for a prior receipt
- WHEN the reprint is authorized
- THEN one marked copy SHALL print and the audit record SHALL identify role, reason, user, device, and time.
