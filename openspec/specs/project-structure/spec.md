# Project Structure Specification

## Purpose
Define the foundational directory structure and configuration for the OmniFood NI multi-app repository, ensuring compliance with Clean Architecture and Offline-first principles.

## Requirements

### Requirement: Flutter POS App Scaffolding
The system MUST include a Flutter project located at `apps/pos_app` that serves as the primary POS terminal.

#### Scenario: Successful Flutter Initialization
- GIVEN the `apps/` directory exists
- WHEN the command `flutter create pos_app` is executed within `apps/`
- THEN a valid Flutter project structure MUST be present at `apps/pos_app`

### Requirement: NestJS Admin Backend Scaffolding
The system MUST include a NestJS project located at `apps/admin_backend` that serves as the multi-tenant central cloud backend.

#### Scenario: Successful NestJS Initialization
- GIVEN the `apps/` directory exists
- WHEN the command `nest new admin_backend` is executed within `apps/`
- THEN a valid NestJS project structure MUST be present at `apps/admin_backend`

### Requirement: Clean Architecture Alignment (Flutter)
The Flutter project MUST be refactored into `core`, `data`, `domain`, and `presentation` layers to support Separation of Concerns.

#### Scenario: Folder Refactoring for Clean Architecture
- GIVEN the default Flutter `lib/` directory
- WHEN the directories `core`, `data`, `domain`, and `presentation` are created under `lib/`
- THEN all business logic and UI components MUST be moved into their respective layers

### Requirement: Clean Architecture Alignment (NestJS)
The NestJS project MUST organize code by feature modules and separate core logic from integration adapters.

#### Scenario: Module Organization
- GIVEN the default NestJS `src/` directory
- WHEN the directories `core`, `modules`, and `integrations` are created under `src/`
- THEN feature-specific code MUST be placed within the `modules` directory
