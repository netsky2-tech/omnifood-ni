# Agent Guidelines: Backend Admin (NestJS)

This document provides specific instructions for AI agents working on the **OmniFood NI** backend.

## 🚀 Core Responsibilities
- **Multi-Tenant Isolation**: Every database interaction MUST respect PostgreSQL **Row-Level Security (RLS)**. Always ensure the `tenant_id` context is set correctly.
- **Event Consistency**: This backend acts as a receptor for offline events. Logic should focus on **idempotency** and **eventual consistency**.
- **DGI Fiscal Logic**: Centralized management of invoice numbering and tax calculations (15% IVA).

---

## 🏗️ Technical Architecture
- **Framework**: NestJS (Node.js).
- **Organization**: Feature-based modules in `src/modules/`.
- **Integrations**: Hexagonal architecture for external banking and tax APIs in `src/integrations/`.
- **Persistence**: TypeORM with PostgreSQL.

## 📝 Rules of Engagement
1. **Domain Over Controllers**: Keep controllers thin. All business logic MUST reside in the Domain/Service layer.
2. **Repository Pattern**: Use repositories to abstract persistence details.
3. **No Deletions**: Invoices can only be canceled, never deleted from the database.
4. **Validation**: Use NestJS `ValidationPipe` with `class-validator` for all incoming DTOs.

---

## ⚙️ Development Commands
- `npm run start:dev` - Local development.
- `npm test` - Unit tests for domain logic.
- `npm run test:e2e` - Integration tests for API endpoints.

Refer to the root [AGENTS.md](../../AGENTS.md) for global project principles.
