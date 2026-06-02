# Delta for inventory-sync-topologies

## ADDED Requirements

### Requirement: BOH Document Sync Contract

Topology A and B clients MUST sync purchases, production orders, count sessions, alerts acknowledgements, and inventory master-data mutations as ordered document events with stable idempotency keys and document revision metadata.

#### Scenario: Offline count approval replay
- GIVEN a count session is approved offline
- WHEN connectivity returns
- THEN the client SHALL send the approval document after its dependent count lines
- AND the backend MUST apply it once even if the document is retried.

### Requirement: Sync Acknowledgement and Conflict Truthfulness

The backend MUST acknowledge accepted inventory documents with per-document status, applied movement references, and conflict reasons without rewriting previously accepted kardex history.

#### Scenario: Purchase replay after partial timeout
- GIVEN a purchase document timed out after backend acceptance
- WHEN the POS retries with the same idempotency key
- THEN the backend SHALL return the original acceptance result
- AND the POS SHALL mark the document synced without posting duplicates.
