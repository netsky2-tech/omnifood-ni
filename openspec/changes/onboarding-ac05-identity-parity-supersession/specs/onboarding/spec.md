# Delta for onboarding

## MODIFIED Requirements

### Requirement: AC-05 — Company identity fields persist and travel

The system MUST persist `phone`, `address` and `email` sent through Fiscal Setup on the tenant row as nullable columns, and MUST return them in the Fiscal Setup response.
The system MUST declare absence of a never-configured identity field as `null` — never as `undefined` and never as an empty string (absence discipline S3).
A field the backend does not persist MUST still not be marked as saved in the UI nor used for readiness (the surviving half of the original criterion).

(Previously: "AC-05 — Campo no persistido" declared identity-adjacent fields were not persisted and their values were not returned. SUPERSEDED by company identity parity P1 — commit `34eaee29` made the tenant the owner of its identity so reports and tickets print one source. The original text is preserved verbatim in this change's `proposal.md`.)

#### Scenario: Identity fields round-trip and persist

- GIVEN the Owner submits Fiscal Setup with `phone: '+505 8888-0000'`, `address: 'Plaza Central'` and a valid `email`
- WHEN the fiscal setup is accepted
- THEN the response MUST echo the three values back
- AND the tenant row MUST store the same three values.

#### Scenario: Unconfigured identity fields read as null

- GIVEN Fiscal Setup is submitted without `phone`, `address` or `email`
- WHEN the response is returned
- THEN the three identity fields MUST be present and MUST be `null`
- AND none of them MUST be `undefined` or an empty string.
