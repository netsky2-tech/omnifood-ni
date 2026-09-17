# Offline Human Authorization Credential: Architectural & Cryptographic Exploration

> **Scope Boundary Notice:** This exploration document establishes the security, hardware, and lifecycle foundations for offline human authorization proofs. It serves as the prerequisite capability required to unblock **DSI-6 (Device-Sync Credit Note Authorization)**. All DSI-6 business domain logic (credit-note payloads, refund limits, Kardex balance adjustments) and **DSI-7 (Device Transport Credential Revocation/Recovery)** remain strictly decoupled and out of scope.

---

## 1. Executive Summary & Repository Evidence

### 1.1 Executive Summary

In offline-first retail operations, sensitive operations (such as credit-note issuance, transaction voids, or blind count overrides) require managerial authorization even when the terminal is completely disconnected from the central backend. Currently, Omnifood's mobile POS verifies supervisor approval locally via a bcrypt PIN check. However, when the terminal subsequently syncs records to the cloud backend via `POST /v1/sync/batch`, it authenticates exclusively via a **terminal device token** (`DeviceSyncPrincipal`).

Because the local check produces **zero server-verifiable cryptographic proof** that a qualified human entered a secret PIN, the backend guard (`SyncCreditNoteAuthGuard`) fails closed on device tokens, blocking offline credit-note synchronization. 

This exploration analyzes how to establish offline human authorization evidence without assuming hardware capabilities that may not exist on target devices.

### 1.1.1 Approved trust-model resolution

Product explicitly accepts an **application-sandbox/software trust model** for the first release. The manager's one-way PIN verifier may be synchronized to every enrolled tenant terminal; the POS performs the local PIN comparison and later submits a device-authenticated authorization assertion through its Device Sync JWT/API credential. The backend can verify which enrolled terminal submitted the assertion, but it **cannot cryptographically prove that the human entered the PIN** against a rooted device, modified APK, or compromised process. Those attacks are accepted residual risks rather than claims solved by this change.

"Portable user" therefore means portable PIN-based authorization across enrolled terminals, not a portable human private key. No per-user asymmetric key, private-key escrow, deterministic PIN-derived signing key, or degraded fallback is approved. After local integrity loss, the terminal fails closed and requires online device re-enrollment through a one-time Backoffice token.

```
Current Security Deficit:
┌─────────────────────────────────────────────────────────┐
│                      POS Terminal                       │
│  [ Cashier Action ] ──► [ Manager Enters Local PIN ]    │
│                                   │                     │
│               BCrypt.checkpw(pin, local_hash)           │
│                                   │ (returns boolean)   │
│                                   ▼                     │
│                        Local Action Executed            │
└─────────────────────────────┬───────────────────────────┘
                              │
          Device Transport:   │ POST /v1/sync/batch
          (DeviceSyncPrincipal│ Claims: "Manager Alice authorized this"
           proves device only)│ Proof: None (zero server-verifiable proof)
                              ▼
┌─────────────────────────────────────────────────────────┐
│                     Admin Backend                       │
│   SyncCreditNoteAuthGuard: REJECT (Fails Closed)        │
│   "Cannot verify human authorization from device token" │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Repository Evidence Base

The findings throughout this exploration are grounded in concrete implementations across `apps/pos_app` and `apps/admin_backend`:

| Component / Subsystem | Repository Location | Architectural Reality |
|---|---|---|
| **Local PIN Verification** | `apps/pos_app/lib/data/services/local_auth_service.dart:6-16` | Executes `BCrypt.checkpw(pin, hash)`. Yields only an in-memory boolean; produces no signature, certificate, HMAC, or server-verifiable artifact. |
| **Local Rate Limiting & Lockout** | `apps/pos_app/lib/data/repositories/auth_repository_impl.dart:34-35, 455-502` | Tracks `_pinFailures` (threshold: 3) and `_pinLockedUntil` (`Duration(minutes: 5)`) strictly in volatile memory. A process restart, app kill, or local SQLite modification clears lockout state entirely. |
| **Local Policy & Profile Store** | `apps/pos_app/lib/data/daos/security_profile_dao.dart:1-25`<br>`apps/pos_app/lib/data/models/security_profile_entity.dart:1-24` | Table `security_profiles` stores `user_id`, `pin_hash`, `totp_secret_seed`, `is_totp_enabled`, `is_pin_enabled`. Plain SQLite projection with zero cryptographic signatures, HMAC integrity, or policy epochs. |
| **Staff & Policy Sync Projection** | `apps/pos_app/lib/data/repositories/auth_repository_impl.dart:373-395` | `syncStaff` ingests unsigned JSON payloads from the cloud. Replaces local user records and security profiles without verifying epoch monotonically or validating issuer signatures. |
| **Forensic Audit Hash-Chain** | `apps/pos_app/lib/data/repositories/audit_repository_impl.dart:101-180`<br>`apps/pos_app/lib/core/audit/v3/canonicalizer.dart:63-88`<br>`apps/pos_app/lib/core/audit/v3/sha256.dart` | Constructs tamper-evident stream using RFC-8785 JSON canonicalization and `SHA-256(prevHash + frame)`. This is strictly an **unkeyed hash chain** providing append-only sequencing; it provides **zero signer authentication** or proof of authorization. |
| **Transport Device Principal** | `apps/admin_backend/src/modules/identity/security/device-sync-principal.ts:1-45`<br>`apps/admin_backend/src/modules/identity/guards/sync-transport.guard.ts:25-45` | Authenticates device sync sessions with `principalType: 'DEVICE_SYNC'`, containing `deviceId`, `tenantId`, `scopes`, and `credentialVersion`. It proves terminal identity at transport, never human operator presence or approval. |
| **Credit Note Guard Fail-Closed** | `apps/admin_backend/src/modules/sales/guards/sync-credit-note-auth.guard.ts:28-45` | Rejects any batch payload item of type `CREDIT_NOTE` if the request context contains a `devicePrincipal`. Blocks offline sync because transport identity cannot substitute for human approval. |
| **Flutter Dependencies** | `apps/pos_app/pubspec.yaml:45-53` | Includes `flutter_secure_storage: ^10.0.0`, `crypto: ^3.0.7`, `encrypt: ^5.0.3`, and `bcrypt: ^1.2.0`. Contains no asymmetric signing libraries (e.g. Ed25519/ECDSA), zero WebAuthn/FIDO2 bindings, and no attestation bridge. |
| **Android Native Channels** | `apps/pos_app/android/app/src/main/kotlin/com/nhilos/pos_app/MainActivity.kt:1-32` | Native integration is strictly limited to thermal receipt printers (`SunmiPrinterHandler`, `IPosPrinterHandler`). No platform channels exist for AndroidKeyStore, biometric authentication, hardware key release, or KeyGuard integration. |
| **Hardware Keystore Fragility** | `apps/pos_app/lib/data/security/flutter_secure_device_sync_credential_store.dart:18-65`<br>`apps/pos_app/lib/data/security/resilient_device_sync_credential_store.dart:25-70`<br>`apps/pos_app/lib/data/security/app_private_device_sync_credential_store.dart:15-55` | Employs an aggressive circuit breaker (`timeout: 3s`, degradation tripwire) around `FlutterSecureStorage` and provides an unencrypted app-private SQLite fallback. Proves that Keystore instability is an established operational reality in POS fleet environments. |

---

## 2. Current Trust Boundaries & Failure Modes

### 2.1 Why PIN Hashes Are Insufficient
1. **Local Consumption Only:** `LocalAuthService.verifyPin` compares a plaintext PIN against a bcrypt hash stored in SQLite. The hash cannot leave the terminal without exposing password equivalence.
2. **Offline Brute-Force Vulnerability:** If the local SQLite database (`security_profiles`) is extracted (via ADB, backup exploit, storage read, or root), a 4-to-6 digit numeric PIN has an entropy space of only $10^4$ to $10^6$ combinations. BCrypt with standard work factors ($cost = 10$ to $12$) can be brute-forced locally across all permutations within minutes on commodity hardware.
3. **No Proof of Entry:** An attacker modifying the APK or SQLite database can simply force `verifyPin()` to return `true` or overwrite `pin_hash` with the hash of a known PIN (`1234`). The backend cannot detect whether the PIN check was executed or bypassed.

### 2.2 Why Unkeyed Audit Chains (Audit-v3) Are Insufficient
1. **Unkeyed Tamper Evidence vs. Signer Authentication:** POS Audit-v3 hashes canonical JSON payloads with standard SHA-256 (`entryHash = sha256(prevHash + canonicalFrame)`). An unkeyed hash provides integrity verification only if the trusted digest head is already held by the verifier.
2. **Trivial Forgery in Modified Environments:** Anyone with write access to the client runtime or database can construct an entirely valid, cryptographically unbroken SHA-256 hash chain that asserts a manager approved an operation, even if no manager was present.

### 2.3 Why Device Transport Credentials Are Insufficient
1. **Role & Privilege Conflation:** `DeviceSyncPrincipal` proves that a legitimate, registered POS terminal sent the request. Elevating a device credential to authorize financial operations (e.g., credit notes, refunds) implies that any compromised terminal process possesses carte blanche managerial authority.
2. **Lack of Human Accountability:** OmniFood's audit and fiscal-integrity requirements require attributable human authorization history for sensitive financial operations; device identity alone does not satisfy that project boundary.

---

## 3. Threat Model

To evaluate potential offline authorization mechanisms, we assess threats against an explicit matrix of threat actors and system boundaries:

| Threat Actor / Boundary | Capabilities | Target Asset | Defense Objective |
|---|---|---|---|
| **Honest POS Client** | Standard app operation; legitimate cashier and manager entering PINs on device UI. | Normal business operations. | Seamless offline approval; zero false rejections during valid offline workflows. |
| **Copied SQLite Database** | Attacker extracts `app_database.db` from backup, unencrypted external storage, or maintenance port. | Stored bcrypt hashes, offline keys, audit logs. | Low-entropy PIN must not allow rapid decryption of offline signing authority; audit history must not reveal secret keys. |
| **Modified APK / In-Process Hook** | Attacker patches Flutter engine, modifies Smali/DEX, hooks memory via Frida, or repacks APK. | Local PIN verification logic, in-memory keys, authorization tokens. | Prevent client tampering from generating authorization proofs acceptable to the backend without the genuine human secret. |
| **Rooted POS Terminal** | Complete administrative OS control; reads/writes app private data; inspects memory. | Android Keystore keys, master seeds, secure storage. | Evaluate whether hardware isolation (TEE/StrongBox) exists to resist root; contain blast radius to single device. |
| **Stolen POS Device** | Physical possession of the terminal while offline; unlimited time to attempt PIN or hardware extraction. | Financial ledger, store credit, offline authorization authority. | Device-level PIN rate limiting; remote revocation epoch effective upon reconnection; terminal decommissioning. |
| **Malicious Cashier** | Legitimate operator access; attempts to issue unauthorized refunds/credit notes without manager. | Managerial authorization capability. | Cashier cannot generate manager proofs without genuine manager interaction; cashier cannot capture manager secret during entry. |
| **Colluding Cashier + Manager** | Legitimate cashier and manager coordinate to execute fraudulent offline credits and claim terminal theft. | Financial ledger, audit trail. | Cryptographic attribution binds authorization to manager identity, device ID, exact operation hash, and sequence. |
| **Replay & Rollback Attacks** | Attacker captures a valid past authorization proof and replays it on a subsequent unauthorized transaction; or rolls back local policy to re-enable a revoked user. | Idempotency engine, policy epoch state. | Strict payload binding (one-to-one hash match); monotonic epoch enforcement preventing stale policy activation. |
| **Backend / DB Compromise** | Attacker has read access to backend PostgreSQL database or transport logs. | Human PINs, private keys. | Server never stores plaintext PINs or private keys; zero-knowledge or asymmetric public key verification only. |
| **Offline Revocation Delay** | A manager is terminated at HQ while a terminal remains offline for days/weeks. | Authorized managerial status. | Acknowledged policy epoch protocol; risk boundary explicitly defined and accepted by business stakeholders. |

---

## 4. Candidate Mechanism Comparison

We analyze six potential architectural mechanisms for offline human authorization against required security criteria:

| Evaluation Criteria | Candidate 1: PIN-Derived Encrypted Human Key | Candidate 2: Android Keystore User-Auth Key | Candidate 3: Signed Staff-Policy Epoch + Operation Proof | Candidate 4: Server-Issued One-Time Offline Macaroons / Vouchers | Candidate 5: WebAuthn / Passkeys (FIDO2) | Candidate 6: Online-Only Authorization |
|---|---|---|---|---|---|---|
| **Offline Operation Support** | **Full:** Generates proof locally while disconnected. | **Full:** Hardware crypto operates offline. | **Full:** Authorizes against locally held signed epoch. | **Partial/Poor:** Requires pre-minted pool; fragile under offline burst. | **Partial/Unproven:** Native FIDO2 on custom POS ROM is unproven offline. | **Zero:** Hard blocker for disconnected retail. |
| **Same-Terminal Hardware Binding** | Software-only unless wrapped in Keystore secret. | **High:** Key pair generated inside Keystore / TEE. | Requires pairing with terminal-bound key pair. | Tied to device credential at minting. | High: Bound to hardware authenticator. | High: Cloud verifies live session. |
| **Proof of App-Specific PIN Entry** | Weak: PIN is key-derivation input; prone to bypass if key is cached. | Strong if Keyguard/Auth prompt is OS-enforced. | Verifies signature, not PIN entry directly. | Proves pre-issuance, not local PIN entry. | Proves user gesture (biometric/OS PIN), not app PIN. | Direct server auth; not offline. |
| **Low-Entropy PIN / Offline Brute-Force** | **Extremely Vulnerable:** 4-digit PIN easily cracked if encrypted blob is extracted without TEE. | **Strong:** Hardware enforces rate-limiting / retry counter. | Depends on underlying key storage protection. | High: Server-generated high-entropy tokens. | High: Hardware rate limits PIN/gesture attempts. | High: Server rate limits attempts. |
| **Compromised-App / Root Resistance** | **None:** Modified APK / root can extract derived key from memory or dump storage. | **Moderate-High:** Private key non-exportable even under root if TEE backed. | None for software key; moderate if epoch signed by backend. | Token pool can be exfiltrated if stored in plaintext SQLite. | High: Private keys protected in hardware authenticator. | High: No offline authority held on device. |
| **Recovery & Rotation Workflow** | Re-derive key on PIN change; requires new public key upload. | Must generate new key pair on device and re-enroll with backend. | Server publishes new epoch with rotated public keys or revoked IDs. | Revoke unused tokens on server; issue new pool upon reconnect. | User registers new passkey on device; re-enrollment required. | Immediate server-side revocation. |
| **Current Stack Readiness** | Requires adding cryptographic signing library (e.g. Ed25519) to Flutter. | **Low:** Requires native Kotlin MethodChannels; Keystore stability unproven on Q80. | High backend readiness; requires envelope schemas and verifier guards. | High complexity: pool management, pre-issuance sync, invalidation. | **Very Low:** No WebAuthn/FIDO2 plugins or hardware token seams in stack. | Currently implemented in `AuthGuard`, but breaks offline POS requirement. |

---

## 5. Critical Caution on Software Key Assumptions

> ### ⚠️ Critical Security Notice: Software Keys Do Not Equal Non-Repudiation
> 
> A common temptation in offline mobile architectures is to derive an asymmetric key pair (e.g. Ed25519) from a user's 4-digit or 6-digit PIN using Argon2id or PBKDF2, store the encrypted private key in SQLite or SharedPreferences, and sign operations locally upon PIN entry.
> 
> **This approach must NOT be adopted as a "recommended core" without severe qualification:**
> 1. **Zero Attestation of PIN Entry:** Against a modified APK, hooked process, or rooted device, a software-held key can be dumped from memory upon first derivation or extracted via memory inspection. The presence of a cryptographic signature proves only that *the key was used*, never that *a human physically entered a PIN*.
> 2. **Vulnerability to Offline Brute-Force:** A 4-digit numeric PIN possesses less than 14 bits of entropy ($10,000$ combinations). Even with memory-hard key derivation functions like Argon2id ($m=64\text{MB}, t=4, p=4$), an extracted key blob can be brute-forced on a modern GPU in under 30 seconds. Without a hardware rate-limiting boundary (such as a secure element or TEE retry counter), software PIN encryption is purely security-through-obscurity.
> 3. **Non-Repudiation Fallacy:** Software-generated signatures under local client control cannot provide legal or forensic non-repudiation in an untrusted terminal environment.
> 
> **Decision for this Exploration:** Asymmetric schemes (Ed25519, Argon2id, SQLite key encryption) are cataloged strictly as **provisional candidates**, pending the results of physical hardware discovery on the target device fleet.

---

## 6. Physical Q80 Hardware Discovery Plan

The OmniPOS fleet includes Android-based rugged handheld terminals (specifically models such as the **Q80**). The repository contains zero evidence establishing the Q80's exact Android OS version, Linux kernel build, KeyStore reliability, biometric capabilities, or TEE/StrongBox security levels.

### 6.0 Current probe status

A read-only Stage-1 attempt ran `adb devices -l` during this exploration and found no connected or authorized Android device. No properties were queried and no repository or device state changed. All hardware-security conclusions therefore remain blocked until the Q80 is reconnected.

To prevent designing architecture on unvalidated assumptions, the following exact physical probe plan must be executed on real hardware:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   PHYSICAL Q80 DISCOVERY PIPELINE                      │
├────────────────────────────────┬───────────────────────────────────────┤
│ Stage 1: Fast ADB Probes       │ Stage 2: Diagnostic Android APK       │
│ • OS / Security Patch Level    │ • KeyInfo security level probe        │
│ • ro.crypto / Keystore props   │ • Keyguard & Biometric availability   │
│ • Secure lockscreen status     │ • Thermal printer & sleep stress test │
└────────────────────────────────┴───────────────────────────────────────┘
```

### 6.1 Stage 1: ADB OS & Property Probes

Execute the following non-destructive shell commands via ADB on a test Q80 terminal:

```bash
# 1. Inspect Android OS version, SDK level, and security patch
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.sdk
adb shell getprop ro.build.version.security_patch

# 2. Inspect device manufacturer, model, and hardware platform
adb shell getprop ro.product.manufacturer
adb shell getprop ro.product.model
adb shell getprop ro.board.platform
adb shell getprop ro.hardware

# 3. Check Keystore, crypto, and TEE system properties
adb shell getprop ro.crypto.state
adb shell getprop ro.crypto.type
adb shell getprop | grep -iE 'keystore|tee|trustzone|strongbox'

# 4. Check available system features (biometrics, secure lockscreen)
adb shell pm list features | grep -iE 'hardware|security|fingerprint|biometric|autofill'

# 5. Check if KeyGuard / secure lockscreen is configured or enforced
adb shell dumpsys trust
```

### 6.2 Stage 2: Minimal Diagnostic Native APK Probes

Because ADB properties alone cannot prove whether the AndroidKeyStore implementation actually works under POS workloads, build and deploy a dedicated, minimal diagnostic APK containing the following probes:

1. **`KeyInfo` Security Level Probe:**
   - Generate an EC (`secp256r1`) or RSA key pair in `AndroidKeyStore`.
   - Query `KeyFactory.getInstance(...).getKeySpec(privateKey, KeyInfo.class)`.
   - Record `keyInfo.getSecurityLevel()`:
     - `KeyProperties.SECURITY_LEVEL_STRONGBOX` (Hardware StrongBox).
     - `KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT` (Hardware TEE / TrustZone).
     - `KeyProperties.SECURITY_LEVEL_SOFTWARE` (Software Master Key fallback).
2. **Key Non-Exportability & Attestation Probe:**
   - Attempt to call `privateKey.getEncoded()`; verify that Android KeyStore correctly returns `null` (confirming non-exportability).
   - Test `keyPairGeneratorSpec.setAttestationChallenge(nonce)`; observe whether `getCertificateChain()` yields an authenticatable X.509 attestation certificate rooted in Google or device vendor CA.
3. **App PIN vs. OS KeyGuard Disambiguation:**
   - Probe whether the device has a secure lockscreen (PIN/Pattern/Password) enabled.
   - **Crucial probe:** Test whether Android's `setUserAuthenticationRequired(true)` can be satisfied by an *in-app custom 4-digit PIN*, or if it strictly requires the system Keyguard/Biometric prompt (`BiometricPrompt` / `KeyguardManager`). (Android documentation dictates that `setUserAuthenticationRequired` gates keys via the OS Keyguard, not custom app UI).
4. **App Reinstall & Data Clear Lifecycle:**
   - Generate a named key in KeyStore; execute `pm clear com.nhilos.pos_app` or reinstall; test whether the key survives or is irreversibly purged.
5. **Sleep/Wake & Thermal Load Resilience:**
   - Execute 1,000 consecutive cryptographic sign operations in a loop while concurrently firing thermal receipt print cycles via `SunmiPrinterHandler`/`IPosPrinterHandler`.
   - Measure KeyStore latency, crash frequency, and thread deadlocks to determine if KeyStore trips the POS app circuit breaker.

---

## 7. Epoch / Acknowledgement Lifecycle & Monotonic Rollback

### 7.1 The Approved Epoch Policy

To maintain offline autonomy while providing control over staff credentials and permissions, the following policy is established:

```
Policy Epoch Rule:
Revocation of human authorization authority becomes effective for a given
terminal ONLY AFTER that terminal receives a newer staff/policy epoch through
the authenticated HTTPS/Device Sync JWT channel and acknowledges it.

Offline proofs generated under the terminal's last acknowledged epoch remain
valid and admissible by the backend during later transport sync.
```

### 7.2 The Indefinite Delayed-Revocation Risk

> ### ⚠️ Explicit Business & Operational Risk
> Because Omnifood POS terminals do not enforce a strict wall-clock TTL on offline operation (to prevent sudden retail stoppage in disconnected rural environments), **delayed revocation is potentially indefinite**. 
> 
> If a rogue manager is terminated at 8:00 AM, but Terminal #2 remains offline or transport-isolated for three weeks, Terminal #2 will continue to accept that manager's offline PIN and authorize transactions under the old epoch. When Terminal #2 eventually reconnects, those offline authorizations **will be admitted as valid**.
> 
> **Stakeholder Mandate:** This operational risk is an inherent trade-off of offline-first capability and must be formally signed off by finance and risk leadership.

### 7.3 Monotonic Rollback Resistance

Terminals must be strictly protected against rollback attacks (e.g. an attacker replacing local database files with a previous backup to restore a revoked manager's status).

```
┌────────────────────────────────────────────────────────────────────────┐
│               EPOCH RECEIPT & ACKNOWLEDGEMENT PROTOCOL                 │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Server returns over authenticated HTTPS/Device Sync JWT:            │
│    StaffPolicyEpoch {                                                  │
│      epochId: UUID,                                                    │
│      tenantId: UUID,                                                   │
│      sequenceNumber: Int64 (strictly monotonic),                       │
│      issuedAt: ISO8601,                                                │
│      activeStaffPolicies: [...],                                       │
│      payloadDigest: SHA-256                                            │
│    }                                                                   │
│                                                                        │
│ 2. Terminal validates the authenticated response and:                  │
│    incoming.sequenceNumber > local.highestAcknowledgedSequence         │
│                                                                        │
│ 3. Terminal commits epoch to local storage atomically.                 │
│                                                                        │
│ 4. Terminal sends TerminalEpochAck to backend via transport:           │
│    TerminalEpochAck { epochId, sequenceNumber, ackHash }               │
│                                                                        │
│ 5. Server registers acknowledgement in terminal sync ledger.           │
│    Subsequent offline proofs from this device MUST reference           │
│    sequenceNumber >= acknowledgedSequenceNumber.                       │
└────────────────────────────────────────────────────────────────────────┘
```

#### Why EncryptedSharedPreferences Is Insufficient for Rollback
`EncryptedSharedPreferences` encrypts key-value pairs at rest, but it **provides zero rollback protection**. An attacker who copies an entire app private directory at Epoch 1, updates the app to Epoch 2, and later overwrites the directory with the Epoch 1 image will successfully roll back `EncryptedSharedPreferences` without triggering a decryption failure. Monotonic anti-rollback requires either:
- Hardware-backed monotonic counters (e.g. AndroidKeyStore rollback-resistant keys, where available).
- Server-side rejection of stale epoch sequences upon transport sync.
- Coordination with device sync versioning (`DeviceSyncPrincipal.credentialVersion`).

### 7.4 Transport Boundary & DSI-7 Isolation
The epoch synchronization protocol operates across the device transport layer (`DeviceSyncPrincipal`). However, **DSI-7 (Device Credential Revocation & Recovery)** governs the life cycle of the terminal transport secret itself. 
- If a device transport credential is revoked under DSI-7, the terminal cannot exchange sync batches or receive new epochs until emergency device recovery occurs.
- Human authorization credentials remain logically separate from device transport credentials.

---

## 8. Credential Lifecycle Matrix

The operational lifecycle of human authorization credentials must address the following states and transitions:

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                        CREDENTIAL LIFECYCLE PHASES                             │
├──────────────────────┬────────────────────────┬────────────────────────────────┤
│ Phase 1: Enrollment  │ Phase 2: In-Shift Auth │ Phase 3: Update & Invalidation │
│ • User created at HQ │ • Cashier prompts mgr  │ • Manager PIN reset            │
│ • Role assigned      │ • Local PIN entered    │ • Role change / promotion      │
│ • Credential minted  │ • Proof generated      │ • Termination / revocation     │
│ • Epoch published    │ • Attached to outbox   │ • Device reassignment          │
└──────────────────────┴────────────────────────┴────────────────────────────────┘
```

| Lifecycle Event | POS Terminal Behavior | Backend / Cloud Behavior | Consistency & Admissibility Guarantee |
|---|---|---|---|
| **Initial Staff Enrollment** | Ingests a new staff profile through authenticated inbound sync. Profile contains authorizer identity, permitted actions, and one-way PIN verifier. | Admin publishes a new monotonic policy epoch ($S_{n+1}$) to active tenant terminals. | Terminal cannot authorize with the new user until epoch $S_{n+1}$ is atomically stored and acknowledged. |
| **Terminal-User Binding** | Staff authorization is portable across enrolled tenant terminals that received the applicable epoch. | Admin controls enrolled terminal membership. Policy history records which terminals acknowledged each epoch. | Backend attributes the assertion to the submitting enrolled terminal and checks its acknowledged epoch; it does not claim human cryptographic proof. |
| **PIN Change / Reset** | Manager changes PIN at HQ or on an online terminal. Local terminal receives updated epoch with new credential hash/key. | Server increments epoch sequence ($S_{n+1}$), revoking previous authorization material. | Previous PIN proofs minted prior to epoch receipt remain valid under the old epoch; subsequent proofs require the new PIN. |
| **Role Change / Demotion** | Manager is demoted to Cashier. Local epoch update removes authorization privileges. | Server updates role permissions in new epoch ($S_{n+1}$). | Any authorization generated *after* terminal acknowledges epoch $S_{n+1}$ is rejected by the backend verifier. |
| **Emergency Revocation** | Terminal receives epoch $S_{n+1}$ flagging user as `REVOKED`. Local auth fails closed immediately for that user. | HQ marks user `REVOKED`. If terminal is unreachable, DSI-7 transport may quarantine the terminal if compromised. | Offline proofs generated prior to terminal's epoch receipt remain admissible per agreed business policy. |
| **App Reinstall / Clear Data** | Reinstall purges all local SQLite state and cached epochs. Terminal boots unactivated. | Terminal must undergo complete device reactivation and pull the latest authoritative epoch from scratch. | Zero offline authorization allowed until full re-activation and initial epoch acknowledgement succeed. |
| **Terminal Reassignment / Stolen Device** | Terminal wiped or decommissioned. Device sync token revoked via DSI-7. | Server revokes `DeviceSyncPrincipal`. Later sync batches are rejected at the transport guard. | Device cannot sync after transport revocation; disposition of previously created offline transactions remains an explicit DSI-7 policy decision. |
| **Multi-Terminal Staff Roaming** | Manager visits Store B. Terminal B pulls store policy epoch containing roaming manager's credential. | Server includes roaming staff in tenant-wide or store-group epoch envelopes. | Roaming manager can authorize offline on any terminal that has acknowledged an epoch containing their profile. |

---

## 9. Smallest Coherent Prerequisite Scope

To satisfy DSI-6 prerequisites without expanding into unbounded device identity or hardware abstraction refactors, this change is constrained strictly to:

```
┌────────────────────────────────────────────────────────────────────────┐
│                 SMALLEST COHERENT PREREQUISITE SCOPE                   │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Authenticated Staff Policy Epoch Schema & Ingestion                 │
│    - Deliver monotonic epochs over HTTPS + Device Sync JWT.            │
│    - POS atomic epoch storage, sequence validation, and ack loop.      │
│                                                                        │
│ 2. Canonical Human Authorization Proof Schema                          │
│    - Standardized proof data structure capturing:                      │
│      (epochId, authorizerUserId, operationDigest, timestamp, proof).   │
│                                                                        │
│ 3. POS Local Authorization Port & Fallback Architecture                │
│    - Clean Hexagonal domain port for authorization proof generation.   │
│    - Abstraction accommodating software candidate vs. KeyStore probe.  │
│                                                                        │
│ 4. Backend Proof Verification Port & Service                          │
│    - Reusable verifier for human authorization proof against the       │
│      recorded terminal epoch sequence and authorizer policy.           │
│                                                                        │
│ 5. Strict Decoupling:                                                  │
│    - ZERO DSI-6 credit-note business logic or invoice payload changes. │
│    - ZERO DSI-7 device transport credential rotation changes.          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Implementation Analysis & Review Budget Forecast

### 10.1 Affected Modules & Files

```
Backend Edit Surface: apps/admin_backend/
├── src/modules/identity/
│    ├── entities/staff-policy-epoch.entity.ts           # Epoch persistence & acknowledgement history
│    ├── services/staff-policy-epoch.service.ts          # Epoch minting, signing, and sequence management
│    ├── ports/human-authorization-verifier.port.ts      # Domain verification contract
│    ├── services/human-authorization-verifier.service.ts # Transaction-compatible verifier
│    └── dto/staff-policy-epoch.dto.ts                   # DTOs for epoch pull and terminal acknowledgement
└── src/migrations/
     └── <timestamp>-CreateStaffPolicyEpochs.ts          # Database schema for epochs and terminal ack states

POS Edit Surface: apps/pos_app/
├── lib/domain/
│    ├── ports/human_authorization_port.dart             # DDD domain port for human auth proof generation
│    └── models/human_authorization_proof.dart           # Immutable value objects for proofs & epochs
├── lib/data/
│    ├── daos/staff_policy_epoch_dao.dart                # Local SQLite persistence for active policy epochs
│    ├── models/staff_policy_epoch_entity.dart           # Floor entity with monotonic sequence constraints
│    ├── services/human_authorization_service.dart       # Adapter coordinating PIN verification & proof signing
│    └── adapters/http_staff_epoch_sync_port.dart        # Transport adapter syncing epochs & acknowledgements
└── lib/core/crypto/
     └── canonical_proof_hasher.dart                     # RFC-8785 canonical hash generator for operations
```

### 10.2 Review-Budget Risk Analysis (>400 Lines of Code)

This prerequisite change represents a multi-tier security foundation spanning backend NestJS modules, database migrations, Dart domain ports, and cryptographic serialization:
- **Estimated Code Delta:** **500 - 750 lines of code** (backend + POS + tests).
- **Cognitive Load Drivers:** Cross-language cryptographic serialization (RFC-8785 canonical JSON), monotonic sequence validation, database transactions, and security guard suites.
- **Strict-TDD Protocol:** All epoch verification guards, monotonic reject logic, and proof validation algorithms must follow Strict TDD (RED $\to$ GREEN $\to$ TRIANGULATE $\to$ REFACTOR).
- **PR Slicing Note:** In accordance with repository instructions, **no PR split is selected during exploration**. Slicing will be evaluated during the Proposal and Tasks specification phases.

---

## 11. Resolved Decisions and Remaining Proposal Questions

### 11.1 Resolved product and security decisions

- **Trust level:** Application-sandbox/software. The backend trusts a device-authenticated assertion that the enrolled POS completed its local PIN check; it does not claim proof against root, a modified APK, or a compromised process.
- **Portable manager access:** One-way PIN verifiers are distributed through staff policy to enrolled tenant terminals. No human private key is copied or derived.
- **Transport attribution:** Device Sync JWT/API credentials authenticate the terminal that submits the assertion but never become the human principal.
- **Integrity-loss recovery:** Clear-data, reinstall, protected-state corruption, or Keystore loss causes fail-closed operation and online device re-enrollment with a one-time Backoffice token.
- **Zero escrow / no fallback:** No private human signing keys are backed up in cloud storage, and no weaker automatic fallback is allowed.
- **Epoch authenticity:** Epochs rely on authenticated HTTPS plus Device Sync JWT delivery; no detached epoch signature or per-user asymmetric key is required in the first release.
- **Epoch delivery:** New epochs travel through the existing device-authenticated inbound sync channel.
- **Revocation timing:** Authority changes become effective per terminal after acknowledgement of a newer authenticated epoch, with no wall-clock TTL. The potentially indefinite disconnected-terminal window is an accepted operational risk.
- **PIN attempt controls:** Failure counters and backoff persist per user-terminal across process restarts.
- **Re-enrollment token:** Backoffice issues a tenant- and terminal-bound, single-use token valid for 15 minutes.
- **Physical Q80 discovery:** Hardware probing remains valuable hardening evidence but no longer blocks the selected software trust model. Results may justify a stronger future adapter without changing first-release claims.
- **Operation policy:** The shared assertion carries operator and authorizer identities but does not impose one global dual-custody rule. DSI-6 permits self-authorization after fresh PIN reauthentication.

### 11.2 Remaining proposal questions

1. **Acknowledgement persistence:** What exact server/local facts establish the highest terminal-acknowledged epoch and classify stale rollback after reconnect?
2. **Assertion ledger:** Which reusable verification/acknowledgement facts belong to this prerequisite, and which consumption facts remain atomic within each consuming domain?
3. **Persistent PIN attempt reset:** Which successful or administrative events reset persisted user-terminal lockout state without allowing process restart to bypass it?
4. **One-time re-enrollment authority:** Which Backoffice roles may mint the 15-minute token, and what audit event records issuance, redemption, expiry, and revocation without absorbing DSI-7?
5. **Transport/storage integrity classification:** Because epochs have no detached signature, specify exact fail-closed behavior for digest mismatch, tenant/device mismatch, sequence rollback, and missing acknowledgement while retaining the accepted sandbox threat model.
