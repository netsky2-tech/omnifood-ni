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

## 📚 Reference Documentation
- **Product Requirement Document**: `docs/Product_Requirement_Document.md`
- **Change History & Specs**: `openspec/`
- **Platform Guidelines**: `GEMINI.md` (root and apps)

When proposing code changes, always ask: **"How does this work if the WiFi goes down?"** and **"Does this violate DGI norms?"**
