# inventory-count-sessions Specification

## Purpose

Define audit-safe physical count sessions from opening through approval and closure.

## Requirements

### Requirement: Count Session Lifecycle

The system MUST support draft, open, counting, recount, approval-pending, approved, posted, and closed states for each physical count session.

#### Scenario: Opening a warehouse count
- GIVEN an authorized user selects a warehouse and cutoff
- WHEN the session is opened
- THEN the system MUST freeze the theoretical baseline for that scope
- AND create a count document with status `open`.

### Requirement: Line Counting and Recount

The system MUST let operators record counted quantities per line, flag disputed lines, and request recount without losing prior entries.

#### Scenario: Recounting a disputed item
- GIVEN a line has a disputed first count
- WHEN a recount is entered
- THEN the system SHALL preserve both entries
- AND mark which value proceeds to approval.

### Requirement: Variance Approval and Posting

The system MUST require authorized approval before posting variances and SHALL create only compensating `AJUSTE_CONTEO` movements linked to the session.

#### Scenario: Posting a shortage (UC-04)
- GIVEN theoretical stock is 15.0000 kg and approved count is 10.0000 kg
- WHEN the session is posted
- THEN the system MUST create a `-5.0000 kg` count adjustment at current CPP
- AND keep the original theoretical history unchanged.

### Requirement: Count Workspace Design Compliance

Count list, worksheet, variance review, and close-session screens MUST comply with `docs/DESIGN.md` using visible labels, 48px controls, flat borders, tabular numerals, and full-width critical modals for irreversible posting.

#### Scenario: Approving variances
- GIVEN a manager reviews a count session
- WHEN variances are displayed
- THEN quantity and value columns SHALL use tabular figures
- AND approval/close actions SHALL follow design-system hierarchy.
