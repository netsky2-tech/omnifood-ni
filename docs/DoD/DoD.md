# Checklist de Definition of Done

## 1. Resiliencia Offline y Sincronización (Frontend)

- [x] **Persistencia Local Garantizada**: La UI permite cobrar facturas, abrir cajón y guardar comandas con latencia cero usando BD local (Floor/SQLite), sin importar el estado del Wi-Fi. *(Validado en `apps/pos_app/test/integration/phase4_offline_outbox_resilience_integration_test.dart`)*
- [x] **Outbox Pattern Funcional**: Las transacciones offline se encolan correctamente y se disparan al backend de forma secuencial al recuperar la conexión, preservando el timestamp original de la venta. *(Validado en `apps/pos_app/test/integration/phase4_offline_outbox_resilience_integration_test.dart` y `sales/sync-batch.e2e-spec.ts`)*
- [x] **Manejo de Conflictos (Idempotencia)**: El envío duplicado accidental de un tiquete desde la tablet es detectado y descartado por el backend gracias a identificadores únicos (UUIDv4) y hashes de payload. *(Validado en `apps/admin_backend/src/modules/sales/controllers/inbound-sync.controller.spec.ts`)*
- [x] **Reinicio Seguro**: Si la aplicación se cierra repentinamente a mitad del día offline, los datos locales sobreviven en SQLite y la sesión se recupera sin pérdida de información transaccional. *(Validado en la arquitectura SQLite FFI / Floor de `apps/pos_app`)*

## 2. Integridad del Motor Financiero (Kardex y Moneda)

- [x] **Cálculo de Costo Promedio Ponderado (CPP)**: Las compras de insumos a distintos precios actualizan matemáticamente el CPP en tiempo real sin descuadrar el valor total del inventario. *(Validado en `apps/pos_app/test/integration/phase2_dynamic_costing_kardex_integration_test.dart` y `apps/admin_backend/src/modules/inventory/batch-costing.service.spec.ts`)*
- [x] **Manejo Multimoneda Exacto**: Los pagos fraccionados (NIO / USD) se calculan sin errores de redondeo utilizando la tasa de cambio del día. El sistema jamás devuelve vuelto en moneda extranjera (vuelto obligatorio en NIO). *(Validado en `apps/pos_app/test/integration/phase3_complex_multicurrency_split_integration_test.dart`)*
- [x] **Cumplimiento Tributario Local**: El cálculo del 15% de IVA se segrega correctamente del ingreso neto. La propina voluntaria no afecta la base imponible del impuesto según las normativas de la DGI (Disposición Técnica 09-2007). *(Validado en `apps/pos_app/test/integration/phase7_fiscal_dgi_compliance_integration_test.dart`)*

## 3. Hardware y Despacho Físico

- [x] **Impresión Térmica Híbrida (ESC/POS)**: El motor genera correctamente comandos de bytes para imprimir tiquetes con logo monocromático en terminales integradas (58mm/80mm) y en impresoras de red (puerto 9100). *(Validado en `apps/pos_app/test/domain/services/printer/receipt_58mm_formatter_test.dart` y `apps/pos_app/test/integration/phase6_kitchen_hardware_kds_integration_test.dart`)*
- [x] **Telemetría de Cajón de Dinero**: El pulso por puerto RJ12 exige y valida la confirmación de estado del hardware (sensor de apertura). Los fallos se registran inmediatamente en el Audit Trail. Configurable a nivel de negocio (`openDrawerOnCash`). *(Validado en `apps/pos_app/test/integration/phase1_rbac_override_integration_test.dart` y `PrinterConfigService`)*
- [x] **Enrutamiento KDS / Comandas**: Los artículos configurados como `isPrepared: true` se disparan automáticamente a la impresora de cocina o pantalla, incluyendo de forma visible el número de Beeper asignado en cabecera. *(Validado en `apps/pos_app/test/integration/phase6_kitchen_hardware_kds_integration_test.dart`)*

## 4. Seguridad, RBAC y Auditoría

- [x] **Evaluación de Permisos Granulares**: Las acciones restringidas se validan contra el permiso específico (ej. `pos:drawer:open_manual`, `pos:discount:override`) y no contra cadenas de texto fijas de roles (hardcoding). *(Validado en `apps/pos_app/test/integration/phase1_rbac_override_integration_test.dart` y `apps/admin_backend/test/identity/permissions.e2e-spec.ts`)*
- [x] **Elevación de un Solo Uso (One-Time Grant)**: Las autorizaciones mediante PIN de gerente expiran instantáneamente al ejecutar la acción o al producirse un fallo/timeout de hardware, sin dejar ventanas de tiempo vulnerables. *(Validado en `apps/pos_app/test/integration/phase1_rbac_override_integration_test.dart`)*
- [x] **Control de Concurrencia Optimista (CAS)**: Intentar guardar sobreescrituras en las políticas de seguridad o inventario físico con un `version` / ETag obsoleto genera un error HTTP 412 Precondition Failed, impidiendo la pérdida de datos. *(Validado en `apps/admin_backend/test/infrastructure/device-provisioning-cas.e2e-spec.ts`)*
- [x] **Audit Trail Inmutable**: Todo cierre forzado, anulación de factura, ajuste de Kardex o alteración de roles genera un registro con fecha UTC, ID de usuario ejecutor, ID de terminal autorizada y firma hash encadenada RFC 8785. *(Validado en `src/core/audit/v3/conformance.spec.ts` y `apps/pos_app/test/integration/phase1_rbac_override_integration_test.dart`)*

## 5. Infraestructura y Despliegue (CI/CD)

- [x] **Migraciones de Base de Datos (PostgreSQL)**: Los esquemas, tablas de auditoría, índices y constraints se han aplicado exitosamente sin comprometer datos preexistentes. *(Validado en todas las migraciones TypeORM en `apps/admin_backend/src/migrations/*.spec.ts` - 116 suites pasando)*
- [x] **Feature Flags (Dark Launching)**: Las funcionalidades experimentales o módulos no aprobados están apagados por defecto a través del sistema de Tenant Capabilities (`TenantCapabilityService` / `TenantCapabilityCache`). *(Validado en `apps/admin_backend/test/capability.e2e-spec.ts`)*
- [x] **Aislamiento por Tenant**: Todas las consultas al backend filtran obligatoriamente por `tenant_id` y aislamiento RLS, garantizando que ninguna sucursal o comercio pueda acceder a catálogos o facturas ajenas. *(Validado en `apps/admin_backend/test/identity/auth.e2e-spec.ts` y entidades TypeORM)*
