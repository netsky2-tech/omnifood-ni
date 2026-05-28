# Identity Audit Scenarios Coverage - Wave 1

## Overview
Exploration of identity, authentication, and offline access coverage across OmniFood NI.

## Current Scenarios Analyzed
- **Offline Login**: Supported via loginOffline(String userId, String pin) in AuthRepository.
- **Online Login**: Implemented as loginOnline(String email, String password).
- **Supervisor Override**: uthorizeOverride using PIN or TOTP for offline/privileged actions.
- **Tenant Isolation**: Backend enforces Row-Level Security (RLS) based on 	enant_id.

## Gaps & Findings
- Offline mode requires PIN syncing (syncStaff()). Conflict resolution during intermittent connectivity needs further specification.
- Supervisor override must log actions locally and sync later to satisfy DGI audit requirements.

## Next Steps
- Transition to Wave 2: Detailed architecture of the sync conflict resolution for identities.
