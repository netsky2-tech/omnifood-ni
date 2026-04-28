# OmniFood NI - Retail-as-a-Service Platform

¡Bienvenidos a **OmniFood NI**! Esta es una plataforma modular de punto de venta (POS) diseñada específicamente para el mercado nicaragüense, con un enfoque agresivo en ser **offline-first**, multi-tenant y cumplir con todas las de la ley ante la **DGI**.

## 🚀 Visión del Proyecto
Desarrollar una solución robusta para entornos de alta rotación (como Food Parks) que garantice la resiliencia operativa incluso cuando el internet de Managua decide tomarse el día.

## 🏗️ Estructura del Monorepo
El proyecto está organizado como un monorepo-lite para facilitar la gestión de los diferentes componentes:

- **`apps/pos_app`**: Aplicación Flutter (Android/Windows/iOS). El frente de batalla.
- **`apps/admin_backend`**: Motor NestJS (Node.js) con PostgreSQL. El cerebro multi-tenant.
- **`docs/`**: Documentación estratégica y requerimientos de producto (PRD).
- **`openspec/`**: Trazabilidad del desarrollo bajo la metodología Spec-Driven Development (SDD).

## 🛠️ Stack Tecnológico
- **Frontend**: Flutter + SQLite (Floor) para persistencia local.
- **Backend**: NestJS + PostgreSQL (RLS) para aislamiento de datos.
- **Infraestructura**: Integración nativa con BAC API Center y Banpro QR.

## 📝 Reglas de Oro
1. **Offline-First o Muerte**: Todo proceso de negocio debe poder ocurrir localmente.
2. **Clean Architecture**: Capas bien definidas para asegurar la escalabilidad.
3. **Inmutabilidad Fiscal**: Las facturas no se borran, se anulan (Cumplimiento DGI).

---

## ⚙️ Guía de Inicio Rápido
Para empezar a trabajar, asegurate de tener instalados los CLIs de Flutter y NestJS.

```bash
# Instalar dependencias globales del backend
npm install -g @nestjs/cli

# Configurar Flutter (ver guía en apps/pos_app)
git clone https://github.com/flutter/flutter.git -b stable ~/development/flutter
```

Para más detalles, revisá el archivo [GEMINI.md](./GEMINI.md) en la raíz.
