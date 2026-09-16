# Offline Human Authorization Credential

Approved prerequisite change for **DSI-6**.

## Purpose

Define and provision a device-attributed offline authorization assertion that an enrolled POS reports successful local PIN reauthentication by an eligible human for one exact operation.

The approved first-release trust model is application-sandbox/software: the backend verifies the submitting enrolled terminal and the assertion bindings, but does not claim cryptographic proof of PIN entry against root, a modified APK, or a compromised process. The capability covers monotonic tenant/user/role/status policy epochs delivered through authenticated HTTPS and Device Sync JWT; terminal acknowledgement; rollback detection; portable one-way PIN verifiers across enrolled terminals; persistent PIN-attempt controls; fail-closed online re-enrollment after local integrity loss with a 15-minute single-use Backoffice token; assertion verification; lifecycle auditability; and explicit residual risks. It must preserve offline-first behavior and must not treat an unkeyed audit hash chain or a device credential as a human principal.

## Boundaries

- DSI-6 consumes this capability but remains a separate, blocked change.
- Do not include DSI-6 credit-note canonical payload or business logic.
- DSI-7 device credential rotation/revocation/recovery remains separate.
- DSI-8 acceptance remains separate.
- Dependencies on DSI-6, DSI-7, and DSI-8 are recorded during design/specification; they are not implemented here.

## Status

Scaffold initialized only. Proposal, exploration, specification, design, tasks, and implementation are intentionally not started.
