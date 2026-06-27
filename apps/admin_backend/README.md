# OmniFood NI - Admin Backend

Este es el motor central de **OmniFood NI**, desarrollado con **NestJS**. Su responsabilidad principal es la gestión multi-tenant, la sincronización de eventos con los terminales POS y el cumplimiento fiscal centralizado.

## 🚀 Características Principales
- **Multi-Tenant Scalability**: Aislamiento de datos nativo con **PostgreSQL Row-Level Security (RLS)**.
- **Event Sync**: Receptor de ajustes de inventario y transacciones para garantizar la consistencia eventual.
- **DGI Compliance**: Generación de reportes fiscales y control de numeración autorizada.
- **Hexagonal Integration**: Adaptadores listos para BAC Credomatic y Banpro.

## 🏗️ Arquitectura del Proyecto (`src/`)
- **`core/`**: Infraestructura global (middleware de RLS, filtros de excepción, guards).
- **`modules/`**: Dominios de negocio (Sales, Inventory, Tenant management).
- **`integrations/`**: Puertos y adaptadores para servicios externos (Bancos, DGI).

## 🛠️ Comandos Esenciales

```bash
# Instalar dependencias
npm install

# Iniciar en modo desarrollo
npm run start:dev

# Compilar para producción
npm run build

# Correr tests unitarios
npm test

# Correr tests DB-backed de migraciones/inmutabilidad
npm run test:db

# Correr tests de integración (E2E)
npm run test:e2e
```

## 📝 Base de Datos
El proyecto utiliza **TypeORM**. Asegurate de tener configuradas las variables de entorno correspondientes para la conexión a PostgreSQL. El sistema espera que el schema tenga habilitado RLS para el aislamiento de tenants.

Las pruebas DB-backed reutilizan `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` y `DB_DATABASE`; si faltan, `npm run test:db` falla explícitamente en lugar de omitirse.

## 🔎 Notas de Ingesta Forense (Identity)
- El endpoint `/identity/audit` valida cadena forense por evento (`sequence_no`, `prev_hash`, `entry_hash`) para preservar inmutabilidad operativa.
- La ingesta mantiene lectura retrocompatible del campo de acción (`action` o `tipo_accion`) y normaliza persistencia en `action`.
- Esta normalización elimina necesidad de dual-write temporal en el contrato de sincronización, sin romper clientes previos.

Para más guías específicas del motor, revisá el archivo [GEMINI.md](./GEMINI.md) local.
