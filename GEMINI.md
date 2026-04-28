# OmniFood NI - Lead Architect Guidelines

¡Buenas, loco! Si estás leyendo esto es porque te sumaste al equipo de **OmniFood NI**. Acá no tiramos código por tirar; construimos el futuro del Retail-as-a-Service en Nicaragua. Ponete las pilas que el internet en Managua no perdona y la DGI menos.

## 🚀 Visión del Proyecto

OmniFood NI es un sistema POS modular, **offline-first** y **multi-tenant**. Está pensado para Food Parks (como el piloto que estamos haciendo para el café) y escalable a cualquier negocio de retail.

### Pilares Fundamentales
1. **Offline-First o Muerte**: El sistema tiene que facturar, manejar inventario y comandas sin internet. SQLite local es la fuente de la verdad; la nube es un espejo que se sincroniza cuando hay señal.
2. **Cumplimiento Fiscal DGI**: Respetamos la Disposición Técnica 09-2007. Las facturas NO se borran, se anulan. La numeración es sagrada.
3. **Escalabilidad Multi-Tenant**: PostgreSQL con RLS (Row-Level Security) en el backend para que los datos de un negocio estén blindados de los otros.

---

## 🛠️ Stack Tecnológico (Bootstrap Completo ✅)

El proyecto está organizado como un **monorepo-lite** dentro de la carpeta `apps/`.

| Componente | Tecnología | Ubicación | Rol |
| :--- | :--- | :--- | :--- |
| **Frontend (POS)** | Flutter | `apps/pos_app` | Mobile/Desktop UI + Offline Business Logic |
| **Backend (Admin)** | NestJS | `apps/admin_backend` | Sync Worker + Multi-tenant Management |
| **Base Local** | SQLite (Floor) | `apps/pos_app` | Persistencia offline resiliente |
| **Cloud DB** | PostgreSQL | Cloud | Almacenamiento central con RLS |

### 🔧 Resoluciones Técnicas Críticas
- **Conflicto Floor/Freezed**: Se utiliza un `dependency_override` para `analyzer: 6.4.1` en `pos_app` para permitir que ambos generadores convivan sin errores de Macros/Dart SDK.

---

## 🏗️ Arquitectura y Patrones

### Clean Architecture (Núcleo)
Aplicada estrictamente en ambas aplicaciones:
- **Flutter**: `lib/core`, `lib/data`, `lib/domain`, `lib/presentation` (MVVM).
- **NestJS**: `src/core`, `src/modules` (Feature-based), `src/integrations` (Hexagonal).

### Hexagonal (Integraciones)
Solo para lo que viene de afuera: DGI, Bancos (BAC/Banpro), y Hardware (ESC/POS, MiPOS).

### DDD Táctico
Usamos **Aggregates** (ej: Venta + Items), **Value Objects** y **Entities** para que el dominio hable el idioma del negocio.

---

## 📝 Convenciones de Desarrollo

### Commits y Ramas
- **Commits**: Usamos *Conventional Commits* (`feat:`, `fix:`, `docs:`, `chore:`). Sin excepciones.
- **Ramas**: `feat/nombre-feature`, `fix/nombre-bug`.

### Reglas de Oro
- **Regla #1**: Backend simple, dominio fuerte. No me metas lógica de negocio en los controladores.
- **Regla #2**: Offline-first desde el día 1. Si no funciona sin WiFi, no sirve.
- **Regla #3**: Las facturas son inmutables. Se anulan, no se borran (`is_canceled`).
- **Regla #4**: Test-First (TDD). Con la infraestructura lista, los cambios significativos deben venir con sus tests correspondientes.

---

## ⚙️ Comandos Útiles

### Flutter (`apps/pos_app`)
- **Build Runner**: `flutter pub run build_runner build --delete-conflicting-outputs`
- **Tests**: `flutter test`
- **Run**: `flutter run`

### NestJS (`apps/admin_backend`)
- **Dev**: `npm run start:dev`
- **Build**: `npm run build`
- **Tests**: `npm test` (Unit) / `npm run test:e2e` (E2E)
- **Lint**: `npm run lint`

---

## 🔀 Git Workflow

### Conventional Commits

| Type       | Description                        |
| ---------- | ---------------------------------- |
| `feat`     | New feature                        |
| `fix`      | Bug fix                            |
| `docs`     | Documentation only                 |
| `style`    | Formatting (no logic change)       |
| `refactor` | Code refactor (no behavior change) |
| `perf`     | Performance improvement            |
| `test`     | Adding/updating tests              |
| `build`    | Build system changes               |
| `chore`    | Maintenance                        |
| `revert`   | Revert previous commit             |

### Branch Strategy

- **Naming**: `feature/ticket-description` or `fix/ticket-description`
- **Short-lived**: Delete branch after PR merge
- **Protection**: `main` branch requires PR + passing CI

### CI/CD Pipeline

| Path Changed  | Pipeline Runs                 |
| ------------- | ----------------------------- |
| `apps/api/**` | `pint` (lint) + `pest` (test) |
| `apps/web/**` | `eslint` + `vitest` + `build` |
| Root config   | Full pipeline                 |

### Release

- **Type**: Semantic Release (auto-versioning)
- **Trigger**: Merge to `main`
- **Format**: `vX.Y.Z`

---

## 📚 Referencias
- [Product Requirement Document](docs/Product_Requirement_Document.md)
- [SDD Specs (Source of Truth)](openspec/specs/)
- [DGI Nicaragua - Normativas](https://www.dgi.gob.ni)

¡Dale, loco! Cualquier duda me preguntás. El boliche ya está abierto, ahora hay que llenarlo de lógica.
