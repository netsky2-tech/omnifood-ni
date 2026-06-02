# Delta for inventory-purchasing

## ADDED Requirements

### Requirement: BCN FX Conversion by Invoice Date
Purchases entered in USD MUST convert to NIO using the official BCN exchange rate for the invoice emission date.

#### Scenario: Holiday purchase in USD (UC-01)
- GIVEN a USD invoice dated on a holiday
- WHEN purchase is posted
- THEN the system SHALL resolve BCN rate for that date from cache or approved source and convert unit cost to NIO

### Requirement: NIO-Only CPP Update
The CPP algorithm MUST execute only in NIO and persist resulting CPP at `NUMERIC(14,4)`.

#### Scenario: Mixed-currency purchases
- GIVEN prior stock with CPP in NIO and a new USD purchase
- WHEN conversion is applied
- THEN CPP recalculation SHALL use NIO values only and persist new CPP at 4 decimals
