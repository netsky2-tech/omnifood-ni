# NHILOS POS — Client Delivery Readiness

**Document ID:** NH-CDR-001  
**Version:** 0.2  
**Status:** ACTIVE / WORKING MASTER  
**Owner:** Product / Founder  
**Applies to:** SOHO pilot first; reusable for future NHILOS POS customers  
**Purpose:** Define the complete customer-facing and internal documentation required to deliver NHILOS POS professionally as a subscription service, without blocking Pilot Readiness engineering.

---

## 1. Objective

This document is the master readiness roadmap for customer delivery.

Its purpose is to ensure that a NHILOS POS go-live is not treated as “installing an app and sharing credentials,” but as a controlled service activation with:

- a clearly defined commercial scope;
- documented subscription terms;
- explicit go-live acceptance;
- operational manuals;
- support boundaries;
- backup and recovery expectations;
- customer training evidence;
- configuration baseline;
- release traceability; and
- internal runbooks for support, deployment and incident response.

The first implementation target is SOHO, but every artifact must be designed as a reusable NHILOS template rather than a one-off document.

---

## 2. Operating Context: Founder / Freelancer Stage

NHILOS is currently operated by its founder as an independent freelancer and has not yet been incorporated as a separate legal entity.

Therefore, the documentation strategy for the first client must distinguish three different classes of artifacts.

### 2.1 Operational documents

These can be created and used immediately.

Examples:

- Go-Live Acceptance;
- Hardware Checklist;
- Configuration Record;
- Training Record;
- POS Manual;
- Dashboard Manual;
- Quick Start;
- Contingency Guide;
- Support Runbook;
- Deployment Runbook;
- Backup / Restore Runbook;
- Incident Response Runbook;
- Release Notes.

These documents describe how NHILOS is delivered and operated. They do not require waiting for company incorporation.

### 2.2 Commercial agreements

These can also be drafted now, but must identify the service provider using the founder's actual legal/commercial identity until NHILOS becomes a constituted company.

Examples:

- Subscription Agreement;
- Service Order;
- Support and Maintenance Terms;
- Cancellation / Offboarding Terms.

The template must not pretend that “NHILOS POS” is already a separate incorporated legal entity if that is not yet true.

Where appropriate, documents should use a structure such as:

> **Service Provider:** [Founder legal name], operating commercially under the name NHILOS POS.

The exact identification fields, tax treatment, invoice/receipt treatment and legal wording must be completed with the real information applicable at signing time.

### 2.3 Legal / fiscal clauses requiring validation

Some clauses should be prepared as controlled drafts, but not treated as legally definitive merely because they exist in this repository.

Examples include:

- limitation of liability;
- indemnification;
- governing law and dispute clauses;
- tax treatment;
- withholding treatment;
- privacy / personal-data obligations;
- mandatory retention periods;
- enforceability of electronic acceptance;
- intellectual-property clauses;
- data deletion obligations after termination.

For Pilot Client #001, the strategy is **targeted validation**, not “hire a corporate law firm before selling anything.”

The founder should seek professional legal and/or accounting review only for clauses that materially affect legal exposure, taxation, ownership, privacy or enforceability.

The rest of the delivery package can proceed independently.

---

## 3. Guiding Principles

### P-01 — Do not block go-live on unnecessary corporate maturity

NHILOS does not need to look like a multinational company to deliver professionally.

The target is:

- clear agreements;
- controlled scope;
- documented acceptance;
- reliable support;
- traceable releases;
- reproducible operations.

### P-02 — Do not misrepresent legal status

Customer documents must reflect the actual contracting party.

NHILOS POS may be used as the product or commercial brand, but the contract must identify the real provider responsible for the service until a legal entity exists.

### P-03 — Separate legal text from operational truth

Product behavior, support scope, backups, operational limitations and acceptance criteria should be documented independently of legal boilerplate.

### P-04 — One source of truth per responsibility

Avoid repeating the same rule in five different PDFs.

Example:

- subscription pricing → Service Order;
- general subscription terms → Subscription Agreement;
- support scope → Support Policy;
- backup behavior → Backup & Recovery Policy;
- delivered configuration → Configuration Record;
- actual go-live evidence → Go-Live Acceptance.

### P-05 — Version everything

Every customer-facing artifact must contain:

- document name;
- document ID;
- version;
- status;
- effective date when applicable;
- customer / tenant when customer-specific.

### P-06 — Never distribute internal architecture as customer documentation

The following remain internal:

- PRDs;
- architecture specs;
- execution roadmaps;
- database schemas;
- RLS internals;
- source code;
- environment variables;
- infrastructure credentials;
- security threat models;
- deployment secrets;
- low-level synchronization implementation details.

---

## 4. Existing SOHO Baseline & Repository Reality

The existing SOHO commercial proposal and technical pilots establish the authoritative delivery baseline:

- **Commercial Scope:**
  - Implementation fee: **US$200** (one-time setup).
  - Monthly subscription: **US$79 / month** (Founder tier / *Plan Fundador*, price protected for 24 months under single terminal/location).
  - Billing start condition: Subscription billing begins strictly upon documented and signed **Go-Live Acceptance** (no free pilot month).
  - Topology: One location, one physical terminal, Owner backoffice dashboard included.
  - Payment documentation (Freelancer stage): Simple non-fiscal receipts agreed with SOHO, with clear contractual provisions for tax adjustment if formal withholding or invoicing requirements arise.
- **Physical Hardware Fleet Reality:**
  - Actual delivery terminal: **MIRAY Q80 / iPOS** (Android 12, integrated 80 mm thermal printer with 40 logical columns / 576 points raster width, driver communication bound to `net.nyx.printerservice`).
  - *Note on legacy references:* Early proposals and draft materials referenced the Sunmi V2s. Code-level identifiers (`woyou.aidlservice.jiu_mi`, `com.nhilos.pos/sunmi_printer`, `SUNMI_V2S`) remain live compatibility and fallback protocol paths in `apps/pos_app`, but customer-facing contracts, hardware checklists, and runbooks must strictly specify the **MIRAY Q80 / iPOS**.
- **Existing Repository Foundations:**
  - Commercial Proposal Baseline: `docs/templates/proposal_client_v1.md` and `docs/proposals/OE-001OM-propuesta-SOHO.html`.
  - Support & Backup Annex: `docs/templates/annex_support_backups_v1.md`.
  - Configuration & Onboarding Intake: `docs/client-onboarding/SOHO_REQUISITOS_PUESTA_EN_MARCHA.md`.
  - Hardware Verification Runbook: `docs/operations/q80_ipos_hardware_verification_checklist.md` and `docs/operations/q80-runbook.md`.
  - Incident & Support Procedures: `docs/operations/pilot-terminal-incident-procedure.md`.
  - Release & Signing Integrity: `docs/operations/release-signing-runbook.md`.

### Required cleanup before reuse

The repository materials must be normalized during artifact generation for:

1. **Brand Name:** Full transition from legacy "OmniFood NI" to **NHILOS POS** across all customer-facing text.
2. **Provider Identity:** Founder operating commercially as NHILOS POS (no fictitious legal entity).
3. **Hardware Model:** MIRAY Q80 / iPOS 80mm as the contractual terminal.
4. **Backup Reality:** Railway native PostgreSQL snapshots + Cloudflare R2 client-side encrypted logical dumps, explicit exclusion of unsynchronized local SQLite data from cloud RPO.
5. **Support Channels:** Official direct contact channels (WhatsApp / support email) routed directly to founder.

---

# 5. Master Document Inventory

Status vocabulary:

- `MISSING`: Needs drafting from scratch.
- `DRAFT IN REPO`: Existing baseline in repository ready for normalization.
- `MAPPED IN REPO`: Operational logic exists in repo documents; requires extraction into customer/internal template.
- `READY IN REPO`: Operational protocol is complete and validated in repository.
- `DRAFTING`: Currently being authored.
- `REVIEW`: Awaiting founder / technical review.
- `LEGAL/ACCOUNTING REVIEW`: Flagged for targeted specialist review.
- `APPROVED`: Internally validated.
- `CLIENT-READY`: Formatted and ready for customer presentation/signature.
- `SIGNED`: Executed by customer.
- `INTERNAL-READY`: Operational procedure active and ready for field use.
- `DEFERRED`: Non-blocking, scheduled post-stabilization.

| ID | Artifact | Audience | Priority | Current Status | Blocks Go-Live? | Repository Baseline / Source Path |
|---|---|---|---|---|---|---|
| CD-01 | NHILOS Welcome Letter | Customer | P2 | MISSING | No | — |
| CD-02 | Subscription Agreement | Customer | P0 | CLIENT-READY DRAFT | Yes | `docs/nhilos/contracts/nhilos_subscription_agreement_v0.1.md` |
| CD-03 | Service Order — SOHO | Customer | P0 | CLIENT-READY DRAFT | Yes | `docs/nhilos/contracts/nhilos_service_order_soho_v0.1.md` |
| CD-04 | Support & Maintenance Policy | Customer | P0 | CLIENT-READY | Yes | `docs/nhilos/contracts/nhilos_support_policy_v0.1.md` |
| CD-05 | Backup & Recovery Policy | Customer | P0 | CLIENT-READY | Yes | `docs/nhilos/contracts/nhilos_backup_recovery_policy_v0.1.md` |
| CD-06 | Privacy / Data Handling Notice | Customer | P0 | CLIENT-READY | Yes | `docs/nhilos/contracts/nhilos_privacy_data_notice_v0.1.md` |
| CD-07 | Go-Live Acceptance Record | Customer | P0 | CLIENT-READY TEMPLATE | Yes | `docs/nhilos/go_live/nhilos_golive_acceptance_record_v0.1.md` |
| CD-08 | Hardware Acceptance Checklist | Customer / Internal | P0 | CLIENT-READY | Yes | `docs/nhilos/go_live/nhilos_hardware_acceptance_checklist_v0.1.md` |
| CD-09 | Customer Configuration Record | Customer / Internal | P0 | CLIENT-READY TEMPLATE | Yes | `docs/nhilos/go_live/nhilos_customer_configuration_record_v0.1.md` |
| CD-10 | Training Record | Customer / Internal | P1 | CLIENT-READY TEMPLATE | Yes | `docs/nhilos/go_live/nhilos_training_record_v0.1.md` |
| CD-11 | POS User Manual | Customer | P0 | CLIENT-READY | Yes | `docs/nhilos/manuals/nhilos_pos_user_manual_v0.1.md` |
| CD-12 | Owner Dashboard Manual | Customer | P0 | CLIENT-READY | Yes | `docs/nhilos/manuals/nhilos_owner_dashboard_manual_v0.2.md` |
| CD-13 | Quick Start Guide | Customer | P0 | CLIENT-READY | Yes | `docs/nhilos/manuals/nhilos_quick_start_guide_v0.1.md` |
| CD-14 | Contingency Guide | Customer | P0 | CLIENT-READY | Yes | `docs/nhilos/manuals/nhilos_contingency_guide_v0.1.md` |
| CD-15 | Roles & Access Matrix | Customer | P1 | MAPPED IN REPO | No | `docs/Scenarios/gestion_identidad_acceso_auditoria.md` |
| CD-16 | Release Notes Template | Customer | P1 | MISSING | No | — |
| CD-17 | Change / Update Policy | Customer | P1 | MISSING | No | — |
| CD-18 | Cancellation / Offboarding Procedure | Customer | P1 | MISSING | No | Outlined in Sec. 8 (OP-08) |
| OP-01 | Customer Provisioning Runbook | Internal | P0 | INTERNAL-READY | Yes | `docs/nhilos/runbooks/nhilos_op01_customer_provisioning_runbook_v0.1.md` |
| OP-02 | Deployment Runbook | Internal | P0 | MAPPED IN REPO | Yes | `docs/operations/staging-cutover.md`, `docs/plans/deployment/` |
| OP-03 | Support Runbook | Internal | P0 | MAPPED IN REPO | Yes | `docs/operations/pilot-terminal-incident-procedure.md` |
| OP-04 | Backup / Restore Runbook | Internal | P0 | MAPPED IN REPO | Yes | `docs/templates/annex_support_backups_v1.md` |
| OP-05 | Incident Response Runbook | Internal | P0 | MAPPED IN REPO | Yes | `docs/operations/pilot-terminal-incident-procedure.md` |
| OP-06 | Terminal Replacement Runbook | Internal | P1 | READY IN REPO | No | `docs/operations/q80-runbook.md`, Sec. 8 (OP-06) |
| OP-07 | Release Checklist | Internal | P0 | INTERNAL-READY | Yes | `docs/nhilos/runbooks/nhilos_op07_release_checklist_v0.1.md` |
| OP-08 | Customer Offboarding Runbook | Internal | P1 | MISSING | No | — |
| CS-01 | Day-7 Stabilization Review | Customer Success | P1 | MISSING | No | Framework in Sec. 9 (CS-01) |
| CS-02 | Day-30 Value Review | Customer Success | P1 | MISSING | No | Framework in Sec. 9 (CS-02) |
| CS-03 | Day-90 Business Review | Customer Success | P1 | MISSING | No | Framework in Sec. 9 (CS-03) |
| CS-04 | Case Study Permission / Evidence Pack | Customer Success | P2 | MISSING | No | Framework in Sec. 9 (CS-04) |

---

# 6. P0 Customer-Facing Package

## CD-02 — Subscription Agreement

### Purpose

Create the reusable commercial framework governing continued use of NHILOS POS after implementation.

### Must define

- provider identity;
- customer identity;
- licensed product;
- subscription nature of the service;
- permitted use;
- number of branches / terminals governed through Service Orders;
- billing cycle;
- payment;
- non-payment / suspension process;
- renewal;
- cancellation;
- support reference;
- customer responsibilities;
- third-party dependencies;
- ownership of customer data;
- ownership of NHILOS software and intellectual property;
- confidentiality;
- data export / offboarding;
- change management;
- relationship with Service Orders and policies.

### Freelancer-stage rule

Do not write the contracting party as an incorporated company unless such company exists at signature time.

### Validation required before APPROVED

Targeted legal/accounting validation is recommended for:

- limitation of liability;
- indemnification;
- governing law;
- tax / withholding language;
- intellectual-property wording;
- privacy;
- termination and data retention.

### Exit Gate

`CLIENT-READY` when:

- commercial structure is internally approved;
- provider identity is accurate;
- variable customer fields are templated;
- high-risk clauses are flagged or reviewed;
- it does not contradict the SOHO Service Order.

---

## CD-03 — Service Order — SOHO

### Purpose

Define exactly what SOHO is buying without rewriting the master Subscription Agreement.

### Required fields

- Service Order ID;
- Customer;
- Tenant;
- Location;
- terminal count;
- terminal model;
- plan;
- implementation fee;
- recurring fee;
- subscription start trigger;
- included onboarding;
- included training;
- included support;
- excluded services;
- optional services;
- agreed go-live acceptance reference;
- authorized contacts.

### Recommended commercial structure

The Service Order should state:

> Subscription billing begins only after the documented Go-Live Acceptance is achieved.

This preserves the logic already used in the SOHO proposal.

### Exit Gate

`SIGNED`.

---

## CD-04 — Support & Maintenance Policy

### Purpose

Define the difference between:

- product maintenance;
- included platform support;
- customer-operation assistance;
- paid consulting / training;
- custom development.

### Severity model

#### SEV-1 — Critical

Example:

- POS cannot complete sales and no reasonable operational workaround exists.

#### SEV-2 — High

Major operational capability impaired, but operation can continue through a workaround.

#### SEV-3 — Normal

Non-critical defect or degraded secondary capability.

#### SEV-4 — Request

Configuration question, training, enhancement or non-defect request.

### Important Pilot rule

Do not advertise aggressive contractual SLA guarantees until NHILOS has real support telemetry and operational history.

Use operational targets only when they can be measured and supported.

### Exit Gate

`CLIENT-READY`.

---

## CD-05 — Backup & Recovery Policy

### Purpose

Explain clearly what NHILOS backs up and what it can recover.

### Required distinction

#### Local POS data

Information may exist locally before reaching the cloud.

#### Cloud-synchronized data

Information that has already synchronized can be protected by cloud backup layers.

### Must document

- backup layers;
- schedule;
- retention;
- encryption where applicable;
- integrity verification;
- restore testing;
- current RPO objective;
- current RTO objective;
- what is not covered;
- local unsynchronized data limitation.

### Exit Gate

`CLIENT-READY`.

---

## CD-06 — Privacy / Data Handling Notice

### Purpose

Explain how NHILOS handles customer business information.

### Minimum scope

- categories of business information processed;
- reason for processing;
- account and authentication information;
- customer data ownership;
- access controls;
- tenant isolation principle;
- backup processing;
- service providers / infrastructure vendors where disclosure is appropriate;
- incident communication;
- retention after cancellation;
- data export;
- deletion process.

### Freelancer-stage rule

This can be drafted now, but any statement implying a specific statutory obligation should be validated before publication if not already established.

### Exit Gate

`CLIENT-READY`.

---

## CD-07 — Go-Live Acceptance Record

### Purpose

Create the authoritative proof that NHILOS was delivered into production in an agreed state.

### Header

- Customer;
- Tenant;
- Location;
- Date;
- NHILOS version;
- Device;
- App build;
- Dashboard release;
- implementer;
- customer representative.

### Acceptance Sections

#### A. Hardware

- device powers on;
- touch input works;
- charging works;
- connectivity works;
- integrated printer works;
- test ticket is legible.

#### B. Identity

- OWNER access validated;
- POS user login validated;
- local PIN validated;
- expected roles loaded.

#### C. POS Core

- open shift;
- product sale;
- modifier / extra where applicable;
- NIO payment;
- USD payment if enabled;
- card workflow if enabled;
- split payment if enabled;
- print;
- hold / restore where applicable;
- void authorization;
- close shift.

#### D. Offline / Sync

- sale while offline;
- local persistence;
- reconnect;
- outbound synchronization;
- cloud reflection;
- no duplicate sale;
- no authentication dependency that blocks local operations.

#### E. Dashboard

- OWNER login;
- tenant context;
- sales visibility;
- inventory visibility;
- sync freshness disclosure;
- agreed management features.

#### F. Configuration

- product catalog;
- prices;
- recipes;
- inventory baseline;
- users;
- tax / fiscal settings;
- payment methods;
- loyalty;
- promotions.

#### G. Backup / Recovery

- backup configuration validated;
- recovery procedure delivered;
- backup responsibility boundaries understood.

#### H. Training

- designated users trained;
- contingency guide delivered;
- support channels delivered.

### Final Result

One and only one:

- `ACCEPTED`
- `ACCEPTED WITH OBSERVATIONS`
- `NOT ACCEPTED`

### Pending findings

Every finding must record:

- ID;
- description;
- severity;
- owner;
- target date;
- whether it blocks billing / production.

### Exit Gate

Signed or otherwise formally acknowledged by both sides.

---

## CD-08 — Hardware Acceptance Checklist

The terminal must be validated independently from application acceptance.

### Target Hardware Profile: MIRAY Q80 / iPOS
The operational standard for the SOHO pilot and fleet deployment is the **MIRAY Q80 / iPOS** (Android 12, 80 mm thermal head). Verification must strictly follow `docs/operations/q80_ipos_hardware_verification_checklist.md`.

### Minimum checks

- serial / device identifier (IMEI / Serial printed on chassis);
- model confirmed: MIRAY Q80 / iPOS (fleet target);
- Android OS version: Android 12;
- power adapter & USB-C cable received and operational;
- battery health & charging cycle verified;
- display touch sensitivity and calibration;
- physical hardware buttons (power, volume/feed);
- Wi-Fi 2.4/5GHz connectivity and signal stability;
- Bluetooth pairing (if peripheral used);
- thermal printer paper compartment (80 mm roll);
- paper feed mechanism;
- driver execution via `net.nyx.printerservice` / iPOS printer protocol;
- test ticket execution (40 logical columns / 576 points raster width);
- ticket readability (contrast, alignment, fiscal footer);
- internal flash storage available (>2 GB recommended);
- system date/time and timezone synchronization (America/Managua);
- physical damage or chassis scratches documented;
- accessories checklist signed.

### Exit Gate

Attached to Go-Live Acceptance (`CD-07`). Operational protocol validated in `docs/operations/q80_ipos_hardware_verification_checklist.md`.

---

## CD-09 — Customer Configuration Record

### Purpose

Freeze the baseline configuration accepted at go-live.

### Template

```text
Customer:
Tenant:
Location:
Business mode:
Timezone:

Base currency:
USD enabled:
Official FX source:
Commercial FX:

Tax configuration:
Fiscal series:
Authorized range:
Other fiscal parameters:

Device:
Device logical ID:
Printer:
Printer profile:

Inventory:
Recipes:
Production:
Promotions:
Loyalty:

OWNER:
Managers:
Cashiers:

Support contacts:
Go-live version:
Acceptance reference:
```

### Rule

Never place passwords, PINs, TOTP secrets, access tokens or private keys in this document.

---

## CD-10 — Training Record

### Minimum syllabus

- Login;
- Shift opening;
- Basic sale;
- Modifiers / extras;
- Payments;
- Card payment handling;
- Offline operation;
- Reconnection;
- Reprint;
- Holds;
- Voids;
- Inventory;
- Closing;
- Dashboard;
- Support escalation;
- Contingencies.

### Evidence

- training date;
- trainer;
- customer participants;
- modules covered;
- observations;
- customer acknowledgment.

---

# 7. Customer Manuals

## CD-11 — POS User Manual

Structure by workflow, not by screen.

Recommended chapters:

1. Start of Day
2. Login
3. Open Shift
4. Make a Sale
5. Products and Modifiers
6. Customers and Loyalty
7. Promotions
8. Payments
9. Card Payments
10. Split Payments
11. Hold / Resume Ticket
12. Void / Supervisor Authorization
13. Offline Operation
14. Synchronization
15. Production / BOH operations where applicable
16. End of Day
17. Common Problems
18. Support

---

## CD-12 — Owner Dashboard Manual

Recommended chapters:

1. Access
2. Tenant / Branch Context
3. Dashboard Overview
4. Sales
5. Inventory
6. COGS / Margin
7. Kardex
8. Promotions
9. Loyalty
10. Users & Permissions
11. Catalog
12. Recipes
13. Fiscal Views
14. Exports
15. Sync Freshness
16. Understanding POS vs Cloud Data
17. Troubleshooting
18. Support

### Critical explanation

The manual must explain explicitly:

> The POS is the operational application. The dashboard reflects cloud-synchronized information and may temporarily lag behind transactions completed locally.

---

## CD-13 — Quick Start Guide

Target: one page.

Sections:

- Open;
- Sell;
- Collect;
- Print;
- Offline;
- Close;
- Need Help?

Must be usable by a new cashier without reading the full manual.

---

## CD-14 — Contingency Guide

Format:

> **What do I do if...?**

Minimum scenarios:

- Internet unavailable;
- dashboard temporarily unavailable;
- printer fails;
- terminal battery low;
- POS closes unexpectedly;
- sale not visible in dashboard;
- sync pending;
- payment approved externally but POS not closed;
- forgotten PIN;
- incorrect product price;
- need to void a sale;
- inventory mismatch;
- device replacement;
- suspected security issue.

---

# 8. Internal Operations Package

## OP-01 — Customer Provisioning Runbook

Must cover:

- create tenant;
- create OWNER;
- validate tenant isolation;
- provision device;
- install release;
- configure device sync;
- configure catalog;
- configure users;
- configure fiscal parameters;
- configure loyalty / promotions as contracted;
- sync test;
- customer acceptance preparation.

---

## OP-02 — Deployment Runbook

Must cover:

- approved release;
- environment;
- backup before deployment where applicable;
- backend deployment;
- frontend deployment;
- POS APK;
- database migration;
- smoke tests;
- rollback;
- version evidence.

---

## OP-03 — Support Runbook

Must define:

- identity verification;
- incident intake;
- severity;
- evidence collection;
- reproduction;
- workaround;
- escalation;
- resolution;
- customer communication;
- closure;
- knowledge-base update.

---

## OP-04 — Backup / Restore Runbook

Must define:

- backup verification;
- restore procedure;
- isolated restore test;
- integrity validation;
- tenant validation;
- RPO evidence;
- RTO evidence;
- incident record.

---

## OP-05 — Incident Response Runbook

Minimum categories:

- POS operational incident;
- sync incident;
- cloud outage;
- data integrity issue;
- security event;
- fiscal sequence issue;
- payment discrepancy;
- device loss / theft.

---

## OP-06 — Terminal Replacement Runbook

Example baseline:

1. Verify customer and device.
2. Determine last known sync.
3. Disable / revoke old device credentials.
4. Provision replacement.
5. Install approved NHILOS release.
6. Restore or pull required master data.
7. Verify local login.
8. Verify fiscal configuration.
9. Verify printer.
10. Execute controlled test transaction.
11. Verify cloud sync.
12. Update Configuration Record.
13. Customer acceptance.

---

## OP-07 — Release Checklist

Every production release must record:

- version;
- commit / build;
- release date;
- migration status;
- automated tests;
- Pilot Readiness tests;
- backup status;
- rollback path;
- release notes;
- customer action required;
- deployment evidence.

---

## OP-08 — Customer Offboarding Runbook

Must cover:

- termination effective date;
- billing closure;
- customer export request;
- user access disablement;
- device credentials;
- data retention policy;
- deletion schedule;
- audit evidence;
- confirmation to customer.

Legal retention requirements must not be invented; validate them before final policy approval.

---

# 9. Customer Success Framework

## CS-01 — Day-7 Stabilization Review

Review:

- incidents;
- cashier friction;
- sync reliability;
- device reliability;
- support questions;
- missing training;
- critical workflow gaps.

Output:

`SOHO_STABILIZATION_REVIEW_D7.md`

---

## CS-02 — Day-30 Value Review

Possible metrics:

- tickets processed;
- successful sync rate;
- sales by payment method;
- active operators;
- inventory movements;
- voids;
- promotions used;
- loyalty usage;
- support incidents.

Only publish metrics that can be reliably measured by NHILOS.

---

## CS-03 — Day-90 Business Review

Review:

- adoption;
- operational impact;
- recurring friction;
- requested enhancements;
- measured value;
- expansion opportunity;
- terminal / location growth;
- case study eligibility.

---

## CS-04 — Case Study Evidence Pack

No testimonial should be fabricated.

Capture only verified statements and approved metrics.

Possible future structure:

### Before NHILOS
Observed customer workflow.

### Implementation
Scope and migration.

### After NHILOS
Measured outcomes.

### Customer Quote
Only with explicit approval.

---

# 10. Commercial Identity Standards

## 10.1 Customer numbering

Recommended:

```text
NH-C0001       Customer
NH-T0001       Tenant
NH-SA-0001     Subscription Agreement
NH-SO-0001     Service Order
NH-GL-0001     Go-Live Acceptance
NH-INC-000001  Incident
NH-REL-1.0.0   Release
```

---

## 10.2 Support identity

Recommended customer-facing channels when available:

```text
soporte@nhilospos.com
ventas@nhilospos.com
facturacion@nhilospos.com
security@nhilospos.com
```

These may initially route to the founder while maintaining a consistent product identity.

---

## 10.3 Document naming

Recommended:

```text
NHILOS_POS_Subscription_Agreement_v1.0.pdf
NHILOS_POS_Service_Order_NH-SO-0001_SOHO.pdf
NHILOS_POS_GoLive_NH-GL-0001_SOHO.pdf
NHILOS_POS_User_Manual_v1.0.pdf
NHILOS_POS_Quick_Start_v1.0.pdf
```

Avoid filenames such as:

```text
contrato_final_v2_ahora_si.pdf
```

---

# 11. Customer Delivery Folder

Recommended structure:

```text
NHILOS_POS_SOHO/
│
├── 00_WELCOME/
│   └── NHILOS_Welcome.pdf
│
├── 01_COMMERCIAL/
│   ├── Subscription_Agreement.pdf
│   ├── Service_Order_SOHO.pdf
│   ├── Support_Policy.pdf
│   └── Privacy_Data_Notice.pdf
│
├── 02_GO_LIVE/
│   ├── Go_Live_Acceptance.pdf
│   ├── Hardware_Checklist.pdf
│   ├── Configuration_Record.pdf
│   └── Training_Record.pdf
│
├── 03_MANUALS/
│   ├── POS_User_Manual.pdf
│   ├── Owner_Dashboard_Manual.pdf
│   ├── Quick_Start.pdf
│   └── Contingency_Guide.pdf
│
├── 04_SUPPORT/
│   ├── Support_Channels.pdf
│   └── Backup_Recovery_Policy.pdf
│
└── 05_RELEASE/
    └── NHILOS_POS_Release_Notes.pdf
```

---

# 12. Do Not Deliver to Customers

The following artifacts are internal and must not be part of the customer delivery package:

- source code;
- private repository access;
- architecture specs;
- implementation roadmaps;
- infrastructure credentials;
- database credentials;
- `.env` files;
- private API keys;
- device credentials;
- TOTP seeds;
- encryption keys;
- CI/CD secrets;
- threat models;
- internal incident details unrelated to the customer;
- RLS internals;
- raw production database access;
- security bypass procedures.

---

# 13. Readiness Gates

## Gate DR-0 — Commercial Identity

Required:

- product name frozen as NHILOS POS;
- provider legal identity defined accurately (founder as sole proprietorship / freelancer);
- customer naming convention established (`NH-C0001`, `NH-T0001`, `NH-SO-0001`);
- document IDs standardized;
- direct founder support channels established (WhatsApp Business / direct email).

**Status:** IN PROGRESS (Naming, numbering, and legal persona models frozen; awaiting final contact routing confirmation).

---

## Gate DR-1 — Commercial Contract Pack

Required:

- CD-02 Subscription Agreement (Master SaaS Freelancer template);
- CD-03 SOHO Service Order (Translating `proposal_client_v1.md` into standard template: US$200 setup, US$79/month, Q80 hardware, 1 terminal, 1 location);
- CD-04 Support Policy (Normalized from `annex_support_backups_v1.md`);
- CD-05 Backup & Recovery Policy (Normalized from `annex_support_backups_v1.md`);
- CD-06 Privacy / Data Notice (Business data isolation and retention).

Legal/accounting-sensitive clauses remain explicitly marked `[REVISIÓN LEGAL/CONTABLE REQUERIDA]` for targeted review, but the operational structure is complete.

**Status:** CLIENT-READY (All 5 artifacts drafted under `docs/nhilos/contracts/` ready for customer presentation/signature).

---

## Gate DR-2 — Go-Live Pack

Required:

- CD-07 Go-Live Acceptance Record (Formal trigger for monthly billing);
- CD-08 Hardware Checklist (`docs/operations/q80_ipos_hardware_verification_checklist.md` adapted for customer attachment);
- CD-09 Configuration Record (`docs/client-onboarding/SOHO_REQUISITOS_PUESTA_EN_MARCHA.md` baseline frozen);
- CD-10 Training Record (Checklist of operators and topics delivered).

**Status:** CLIENT-READY (All 4 artifacts drafted under `docs/nhilos/go_live/` ready for execution during on-site deployment).

---

## Gate DR-3 — Customer Documentation

Required:

- CD-11 POS Manual (Role & workflow oriented);
- CD-12 Dashboard Manual (Owner web backoffice & synchronization visibility);
- CD-13 Quick Start (1-page cashier reference sheet);
- CD-14 Contingency Guide ("What do I do if..." emergency troubleshooting).

Manuals describe exact behavior of the SOHO Pilot release.

**Status:** CLIENT-READY (All 4 artifacts CD-11, CD-12, CD-13, CD-14 completed and formatted under `docs/nhilos/manuals/`).

---

## Gate DR-4 — Internal Operational Readiness

Required:

- OP-01 Provisioning Runbook (Tenant setup, device registration);
- OP-02 Deployment Runbook (Staging to production cutover, APK signing);
- OP-03 Support Runbook (Severity classification, triage);
- OP-04 Backup / Restore Runbook (Railway snapshots, Cloudflare R2 dumps, monthly isolation drill);
- OP-05 Incident Response Runbook (Offline sync issues, fiscal sequence anomalies);
- OP-06 Terminal Replacement Runbook (Revocation & fast re-provisioning);
- OP-07 Release Checklist (Pre-deployment test verification).

**Status:** READY FOR GO-LIVE (Core operational runbooks OP-01 Provisioning and OP-07 Release Gate completed under `docs/nhilos/runbooks/`; incident and replacement procedures active in `docs/operations/`).

---

## Gate DR-5 — Customer Success Readiness

Required:

- Day-7 template (`SOHO_STABILIZATION_REVIEW_D7.md`);
- Day-30 template;
- Day-90 template;
- case-study evidence rules.

This gate does not block initial go-live but must be prepared before the first post-production review.

**Status:** NOT STARTED (Deferred to post-launch).

---

# 14. SOHO Go-Live Responsibility & Execution Matrix

### 14.1 Roles & Responsibilities

| Area | NHILOS (Founder / Provider) | SOHO Café (Client / Owner) |
|---|---|---|
| **Hardware** | Verification of Q80 terminal, OS audit, printer driver QA, release APK installation. | Device custody, physical care, electrical power, paper rolls (80 mm). |
| **Catalog & Prices** | Database seeding, category structure, modifier trees, recipe baseline. | Delivery of menu prices, taxes included/excluded, ingredient quantities and costs. |
| **Fiscal Data** | Configuration of Cuota Fija or General, sequential numbering format, invoice header. | Providing RUC, commercial name, legal fiscal regime, DGI compliance directives. |
| **Training** | Delivery of hands-on training to designated shift supervisors and cashiers. | Designating operators, ensuring attendance and uninterrupted training window. |
| **Go-Live Acceptance** | Conducting verification tests (Sale, Offline, Sync, Void, Reprint, Closing). | Formally signing the Go-Live Acceptance Record (`CD-07`) or documenting observations. |
| **Billing** | Issuing monthly non-fiscal receipt for US$79 on the agreed monthly anniversary. | Timely payment within agreed grace period (default: 5 business days). |

### 14.2 Sequencing to Go-Live

```text
1. Freeze Baseline (DR-0 & DR-1)
   ├── Finalize CD-02 (Subscription Agreement) & CD-03 (Service Order)
   └── Deliver CD-04/05 (Support & Backup policies)
            ↓
2. Data & Hardware Preparation (DR-2 & DR-4)
   ├── Freeze CD-09 Configuration Record (Menu, prices, users, fiscal data)
   ├── Execute CD-08 Hardware Checklist on MIRAY Q80/iPOS
   └── Install signed Release Candidate APK & seed tenant database
            ↓
3. Delivery & Training Session (On-site at SOHO)
   ├── Deliver CD-13 (Quick Start) & CD-14 (Contingency Guide)
   ├── Conduct staff training & sign CD-10 (Training Record)
   └── Perform live smoke tests (Sale, Offline mode, Sync, Hold, Void, Shift close)
            ↓
4. Formal Go-Live Sign-Off (CD-07)
   ├── Result: ACCEPTED (or ACCEPTED WITH OBSERVATIONS)
   └── Monthly subscription billing officially activated
            ↓
5. Post-Launch Stabilization (Gate DR-5)
   └── Day-7 review (SOHO_STABILIZATION_REVIEW_D7.md)
```

---

# 15. Definition of Done — Client Delivery Readiness

Client Delivery Readiness is `PASS` only when:

- provider identity is correct;
- commercial scope is explicit;
- subscription start condition is explicit;
- SOHO Service Order is accepted;
- support boundaries are documented;
- backup / recovery boundaries are documented;
- data handling notice exists;
- Pilot Readiness technical gate is PASS;
- the terminal passes hardware acceptance;
- customer configuration is frozen and documented;
- OWNER access works;
- POS users work;
- offline sale works;
- reconnect / sync works;
- dashboard access works;
- manuals match the installed version;
- Quick Start and Contingency Guide are delivered;
- training is recorded;
- internal provisioning, deployment, support, restore and incident procedures exist;
- release version is recorded;
- pending items are classified and assigned;
- go-live acceptance is formally captured;
- no customer-facing document contains credentials or internal secrets.

---

# 16. Specific Decision for First Client

For SOHO, do **not** wait for incorporation to professionalize the delivery.

Proceed with:

1. operational documentation immediately;
2. commercial templates identifying the real freelancer/provider correctly;
3. targeted legal/accounting review only for high-risk clauses;
4. no invented “corporate” identity;
5. no unsupported SLA guarantees;
6. no claims of regulatory compliance that have not been independently validated;
7. a signed or otherwise formally acknowledged Go-Live Acceptance;
8. reusable templates that can later be migrated from founder → incorporated NHILOS entity without redesigning the entire delivery system.

The objective for Client #001 is not “corporate theater.”

The objective is **controlled, reproducible and defensible delivery**.

---

# 17. Next Artifacts & Immediate Action Plan

With **Gate DR-1 (Contracts)**, **Gate DR-2 (Go-Live Pack)**, **Gate DR-3 (Customer Manuals)** and the critical path of **Gate DR-4 (Operational Runbooks OP-01 & OP-07)** fully authored, validated and client-ready, the delivery readiness infrastructure is **100% prepared**.

The single remaining track prior to production launch is the **Technical Execution of SOHO Day-1 (Track A)**, documented in `odd/tasks/soho-dia1-integral-test.md`:

1. **Obtain Client Open Inputs:** Real business/legal name, official RUC, owner password & 6-digit PIN.
2. **Execute Provisioning (`OP-01`):** Run clean tenant setup via `npm run provision` and fiscal setup endpoint.
3. **Menu Ingestion:** Preview & commit `Menu_SOHO_import_listo.xlsx` (58 items SIMPLE).
4. **Terminal QA & Activation:** Run Fases 1–14 on the physical MIRAY Q80 terminal in accordance with `docs/plans/sales/prueba_integral_dia_1_soho.md`.
