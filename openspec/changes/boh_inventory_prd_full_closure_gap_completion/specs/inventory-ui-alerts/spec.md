# Delta for inventory-ui-alerts

## MODIFIED Requirements

### Requirement: Alert Persistence

The system MUST persist active inventory alerts beyond the current session until they are acknowledged, resolved, or superseded, and SHALL expose the same alert truth to BOH admins and relevant operators.
(Previously: Alerts were only expected to remain visible until acknowledgment or session end.)

#### Scenario: Persistent alert in session
- GIVEN a low-stock alert was triggered
- WHEN the user navigates between features
- THEN the alert SHALL NOT be lost and should remain accessible or visible if configured.

#### Scenario: Alert survives restart
- GIVEN an unacknowledged forensic alert exists
- WHEN the POS restarts and sync completes
- THEN the alert MUST reappear in the BOH inbox
- AND its current acknowledgement state SHALL remain intact.

## ADDED Requirements

### Requirement: Alert Acknowledgement Lifecycle

The system MUST track alert states as active, acknowledged, resolved, or superseded with actor, timestamp, note, and source movement references.

#### Scenario: Manager acknowledges an alert
- GIVEN an active alert is open
- WHEN a manager acknowledges it with a note
- THEN the system SHALL persist the actor, timestamp, and note
- AND operator views SHALL reflect the updated state.

### Requirement: Alert Inbox Design Compliance

BOH alert inbox, detail, and acknowledgement flows MUST comply with `docs/DESIGN.md`, including flat bordered cards/tables, status chips, Inter typography, tabular numerals for values, and full-width critical confirmation actions.

#### Scenario: Reviewing a critical alert
- GIVEN a user opens an alert detail
- WHEN valuation and movement metadata are displayed
- THEN the UI SHALL use tabular figures for numbers
- AND critical actions SHALL use the design-system modal and button behavior.
