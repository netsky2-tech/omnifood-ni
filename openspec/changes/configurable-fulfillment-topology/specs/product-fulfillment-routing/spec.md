# Product Fulfillment Routing Specification

## Purpose
Define explicit product fulfillment actions, stations, defaults, and safe fallback.

## Requirements

### Requirement: Explicit Product Routing
Each product fulfillment profile MUST explicitly identify `PREPARE` or `DIRECT_HANDOFF` and MAY identify a station. Category settings MAY seed defaults only; product-level values are authoritative.

#### Scenario: Product overrides category default
- GIVEN a category defaults to PREPARE at Grill and a product is configured DIRECT_HANDOFF
- WHEN the product is sold
- THEN the output SHALL use DIRECT_HANDOFF and its explicit station, if present.

### Requirement: General Dispatch Fallback
Missing or invalid routing MUST route visibly to general dispatch, raise an operator alert, and MUST NOT block an offline sale.

#### Scenario: Missing route offline
- GIVEN a product has no valid profile and the POS is offline
- WHEN the product is sold
- THEN the sale SHALL complete and fulfillment SHALL visibly identify general dispatch with an alert.
