# OmniFood NI - Backend Admin Guidelines (NestJS)

¡Buenas, loco! Estás en el motor de **OmniFood NI**. Acá manejamos la orquestación multi-tenant y la sincronización de datos con los terminales POS. El backend tiene que ser simple pero el dominio tiene que ser una roca.

## 🚀 Responsabilidades del Backend
1. **Multi-tenant Scalability**: Servir a múltiples negocios aislados. Usamos PostgreSQL con **Row-Level Security (RLS)**. Cada consulta debe estar filtrada por el `tenant_id`.
2. **Event Sync Worker**: Recibir los ajustes de inventario y ventas de las tablets. No es un CRUD tradicional; es un receptor de eventos que garantiza la consistencia eventual.
3. **DGI Compliance**: Generar los reportes fiscales y asegurar que la numeración entregada a los POS sea correlativa y autorizada.

---

## 🏗️ Arquitectura del Proyecto
Seguimos **Clean Architecture** y organización por **Feature Modules**:

- `src/core/`: Middleware global, filtros de excepción, guards de autenticación y lógica común (ej: RLS interceptors).
- `src/modules/`: Un módulo por Bounded Context.
  - `sales/`: Lógica de facturación y auditoría.
  - `inventory/`: Gestión de stock global y proveedores.
  - `tenant/`: Configuración de negocios y suscripciones.
- `src/integrations/`: Puertos y Adaptadores (Hexagonal) para DGI, BAC, Banpro.

### Reglas de Oro
- **Regla #1**: No me metas lógica de negocio en los controladores. El controlador solo recibe, valida (con `Pipes`) y escupe.
- **Regla #2**: Usa el patrón **Repository** para abstraer TypeORM. Queremos que el dominio sea testeable sin prender una base de datos.
- **Regla #3**: Las facturas son sagradas. Si hay un error, se anula. No existe el `DELETE FROM invoices`.

---

## 📝 Estándares de Código
- **Validación**: Todo lo que entra se valida con `class-validator` y `ValidationPipe`.
- **Seguridad**: Usamos `helmet` y `CORS` configurado por tenant.
- **Logging**: Logueá los eventos críticos (fallos de sync, errores de pago) usando el `Logger` de NestJS.
- **Tests**: Antes de commitear, `npm test`. Los Use Cases tienen que tener cobertura unitaria.

---

## ⚙️ Comandos del Motor
- **Modo Dev**: `npm run start:dev`
- **Build**: `npm run build`
- **Unit Tests**: `npm test`
- **E2E Tests**: `npm run test:e2e`

---

## 📚 Referencias Locales
- [PRD Principal](../../docs/Product_Requirement_Document.md)
- [Reglas NestJS](../../.agents/skills/nestjs-best-practices/AGENTS.md)

¡Dale, metele con todo que el backend no puede fallar!
