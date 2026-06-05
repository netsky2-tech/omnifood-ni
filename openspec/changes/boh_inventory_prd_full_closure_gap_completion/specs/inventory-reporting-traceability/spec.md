# inventory-reporting-traceability Specification

## Purpose

Define BOH reporting and traceability views that prove inventory truth, lineage, and PRD closure evidence.

## Requirements

### Requirement: Central Kardex and Document Traceability

The system MUST provide filterable BOH queries for kardex rows, purchases, production orders, count sessions, and shrinkage documents with direct cross-links between movement and source document.

#### Scenario: Tracing a movement to its source
- GIVEN an auditor opens a kardex row
- WHEN the row references a production receipt
- THEN the system MUST show the originating document, actor, timestamp, and resulting balances
- AND navigation SHALL preserve tenant isolation.

### Requirement: Batch, FIFO, and Alert Lineage

The system MUST expose batch lineage, FIFO consumption path, expiry status, and related alert history for any batch-managed item.

#### Scenario: Reviewing consumed lots
- GIVEN one sale consumed from two lots
- WHEN an auditor opens lineage detail
- THEN the system SHALL show both lots, consumed quantities, valuations, and resulting alert links.

### Requirement: Reporting Workspace Design Compliance

BOH reporting screens MUST comply with `docs/DESIGN.md`: flat outlined layout, Inter typography, tabular numerals, 56px rows, visible filters, and no shadow-based emphasis.

#### Scenario: Scanning a kardex report
- GIVEN a user opens a report table
- WHEN balances and values are rendered
- THEN the table SHALL use tabular numeric alignment and outlined sections
- AND primary, secondary, and tertiary states SHALL match the design-system meanings.
