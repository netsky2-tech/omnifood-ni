# Agent Guidelines: OmniFood NI

This document provides essential context and instructions for AI agents working on the **OmniFood NI** project. OmniFood NI is a Retail-as-a-Service (RaaS) platform designed for the Nicaraguan market, specifically targeting Food Parks and high-rotation retail environments.

## 🚀 Project Vision & Core Constraints

- **Offline-First or Muerte**: The system must be fully operational without internet connectivity. Local SQLite is the **Source of Truth**; the cloud is an eventually consistent mirror.
- **DGI Compliance (Nicaragua)**: Strict adherence to Disposición Técnica 09-2007. Invoices **MUST NOT** be deleted; only cancellations (`is_canceled`) are allowed. Sequential numbering is mandatory.
- **Multi-Tenant Scalability**: Backend data isolation using PostgreSQL Row-Level Security (RLS) based on `tenant_id`.

---

## 🏗️ Architecture & Patterns

### Universal Principles
- **Clean Architecture**: Strict separation of layers (`domain`, `data`, `core`, `presentation/modules`).
- **Hexagonal Architecture**: Used **ONLY** for external integrations (DGI, Banks, POS Hardware).
- **Tactic DDD**: Apply Aggregates (e.g., Sale + Items), Value Objects, and Entities to reflect business domain language.

### Application Specifics

#### Frontend POS (`apps/pos_app` - Flutter)
- **Pattern**: MVVM (Views + ViewModels using `ChangeNotifier` & `Provider`).
- **Persistence**: **Floor (SQLite)**.
- **Floor @transaction**: Methods annotated with `@transaction` in DAOs **MUST** use positional arguments. Named arguments break code generation in `.g.dart` files.
- **Immutability**: Use **Freezed** for all domain models.
- **Constraints**: Locked `analyzer: 6.4.1` in `pubspec.yaml` to resolve conflicts between Floor and Freezed.

#### Admin Backend (`apps/admin_backend` - NestJS)
- **Structure**: Feature-based modules (e.g., `sales`, `inventory`, `tenant`).
- **Persistence**: **TypeORM (PostgreSQL)**.
- **Sync Logic**: Receptor of inventory and transaction events; not a simple CRUD.

---

## 📝 Development Conventions

- **Conventional Commits**: `feat:`, `fix:`, `docs:`, `chore:`, etc.
- **Test-First (TDD)**: Meaningful logic changes must include unit/integration tests.
- **Error Handling**: Differentiate between local persistence errors and synchronization errors.
- **Validation**: Strict input validation using NestJS Pipes (backend) and robust casting in Flutter `fromJson`.

---

## ⚙️ Essential Commands

### Flutter POS
- **Code Generation**: `flutter pub run build_runner build --delete-conflicting-outputs`
- **Testing**: `flutter test`

### NestJS Backend
- **Development**: `npm run start:dev`
- **Testing**: `npm test` (Unit) / `npm run test:e2e` (E2E)

---

## 🧠 Test Execution Limits (Mandatory on WSL2 dev hosts)

The local dev host runs WSL2 with a hard cap (12 GiB RAM + 4 GiB swap). Jest defaults to one
worker per core (11 on this machine) and each worker compiles TypeScript in memory, so a plain
`npm test` peak exceeds the cap and the **Linux OOM killer fires globally** — it does not just
kill the test run, it kills the user-session services (`engram`, `moshi-hook`) that the agent
harness depends on, which is why runs die mid-session with no useful error.

- **Backend**: `maxWorkers: 2` is pinned in `apps/admin_backend/package.json` (jest config), so
  `npm test` is already capped. Do not remove it to "speed up" local runs. CI is unaffected
  (`ubuntu-latest` has 2–4 cores; `test:db` and `test:e2e` already pass `--runInBand`).
- **Flutter**: run full suites with `flutter test --concurrency=2`, or per-directory blocks.
  Default concurrency on 12 cores is a known OOM trigger on this host.
- **Never** launch a full suite (Flutter or Jest) while subagents are still running. Each
  subagent is its own Node process; the combined peak is what crosses the cliff.
- If a run dies with `Killed`, or tools start returning no result, check `dmesg`/`/var/log/kern.log`
  for `oom-kill` before debugging the code — the code is usually fine.
- `flutter test` WebSocket load flakes (`Invalid WebSocket upgrade request`) that move between
  files per run are toolchain noise under memory pressure, not test failures: re-run the specific
  file isolated (`--concurrency=1`) before attributing them to a change.
- See `docs/devex/wsl2-memory-limits.md` for the host-side `.wslconfig` raise and how to verify it.

---

## 📚 Reference Documentation
- **Product Requirement Document**: `docs/Product_Requirement_Document.md`
- **Change History & Specs**: `openspec/`
- **Platform Guidelines**: `GEMINI.md` (root and apps)

When proposing code changes, always ask: **"How does this work if the WiFi goes down?"** and **"Does this violate DGI norms?"**

## 🎨 Design & UX Standards (Mandatory)

For **any UI/UX or design-related change** in this monorepo, apply the following standards **automatically**:

- **Experience Standard**: `@docs/nhilos/nhilos_backoffice_experience_standard_v1.0.md`
- **Module Audit Template**: `@docs/nhilos/nhilos_backoffice_module_audit_template_v2.1.md`

These documents define the required design language, interaction rules, accessibility, and audit criteria for backoffice modules, dashboards, and any user-facing components in OmniFood NI. Agents must reference and adhere to them without needing explicit reminders.
