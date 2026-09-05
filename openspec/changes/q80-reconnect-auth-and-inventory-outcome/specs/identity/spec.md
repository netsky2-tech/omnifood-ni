# Delta for Identity, Access, and Audit Management

## ADDED Requirements

### Requirement: Refresh Credential Lifecycle
The POS MUST securely persist access and refresh credentials after successful online login, rotate refresh credentials atomically, and serialize concurrent refresh attempts so only one refresh is in flight per session/device.

#### Scenario: Online login stores both tokens
- GIVEN valid email/password credentials and cloud connectivity
- WHEN login succeeds
- THEN the POS MUST persist the access token and refresh token securely
- AND associate them with the local tenant and user session.

#### Scenario: Concurrent 401 responses serialize refresh
- GIVEN multiple cloud requests receive HTTP 401 for the same session
- WHEN reconnect handling begins
- THEN exactly one refresh attempt MUST execute
- AND waiting requests MUST use the resulting rotated credentials rather than starting parallel refreshes.

#### Scenario: Rotation is atomic
- GIVEN a refresh returns a new access token and refresh token
- WHEN credentials are stored
- THEN both tokens MUST become active together
- AND a crash or failed write MUST NOT leave a partially rotated credential pair active.

### Requirement: Offline PIN Independence and Reauthentication State
PIN unlock MUST remain available offline and independent of cloud availability. Failed, absent, expired, or revoked refresh credentials MUST preserve the local identity, PIN session, and locally committed operations while emitting explicit `cloudReauthenticationRequired`; the POS MUST NOT mask this condition as `Sales;Catálogo`.

#### Scenario: Restart, offline unlock, and successful reconnect
- GIVEN a previously authenticated POS with a locally stored PIN and a pending invoice
- WHEN the app restarts offline and the cashier unlocks with the PIN
- AND connectivity returns after the access token expires while the refresh token remains valid
- THEN the POS MUST refresh credentials, retry the original request once, and sync the same invoice without duplication.

#### Scenario: Refresh unavailable preserves local operation
- GIVEN a cashier has unlocked locally and created a pending invoice
- WHEN the refresh credential is absent, expired, or revoked
- THEN the invoice MUST remain pending locally
- AND the local session and PIN unlock MUST remain usable
- AND the system MUST emit `cloudReauthenticationRequired`
- AND the UI MUST NOT report generic `Sales;Catálogo`.

## MODIFIED Requirements

### Requirement: Successful online authentication
The system MUST support online authentication against the cloud backend using email and password, and MUST establish the access/refresh credential lifecycle defined above.
(Previously: online authentication granted POS access without a normative refresh-token contract.)

#### Scenario: Successful online authentication
- GIVEN the POS has an active network connection
- WHEN a user enters valid email and password
- THEN the system MUST authenticate against the cloud backend
- AND grant access to the POS
- AND securely store both returned tokens.
