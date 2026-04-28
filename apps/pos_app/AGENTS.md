# Agent Guidelines: Frontend POS (Flutter)

This document provides specific instructions for AI agents working on the **OmniFood NI** mobile/desktop application.

## 🚀 Core Responsibilities
- **Offline-First Resilience**: All business transactions MUST happen locally in **SQLite (Floor)** first. Assume the connection is unstable.
- **UI Performance**: Minimize rebuilds and ensure smooth interaction during peak hours.
- **Local Source of Truth**: The local database is authoritative for the user session. Sync happens in the background.

---

## 🏗️ Technical Architecture
- **Framework**: Flutter.
- **State Management**: ViewModels using `ChangeNotifier` with `Provider`.
- **Domain Layer**: Clean Architecture with **Freezed** for inmutable domain models.
- **Data Layer**: **Floor** for SQLite persistence and **Dio** for API interactions.

## 📝 Rules of Engagement
1. **Dumb Views**: Widgets should only render state. Logic belongs in the ViewModel or UseCase.
2. **Aggregates**: Group related entities (e.g., Sale and its Items) into aggregates to ensure transactional consistency.
3. **Dependency Lock**: Do not update `analyzer` above `6.4.1` without checking Floor/Freezed compatibility.
4. **Code Generation**: Always run `build_runner` after modifying entities or DAOs.

---

## ⚙️ Development Commands
- `flutter pub run build_runner build --delete-conflicting-outputs` - Generate boilerplate.
- `flutter test` - Execute unit and widget tests.

Refer to the root [AGENTS.md](../../AGENTS.md) for global project principles.
