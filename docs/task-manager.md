# Task Manager para OmniFood NI

## Fase 1: Motor de Inventario y MVP Pilot (Semanas 1-4)

Objetivo: Tener un café operando 100% offline con control de costos.

- Configuración de Infraestructura Local
  - Configurar proyecto Flutter con arquitectura de capas (Data, Domain, UI).
  - Implementar base de datos local SQLite (usando Floor o Drift).
  - Definir esquema de tablas core: Items, Recipes, StockMovements, Invoices.
- Módulo de Inventario (El Cimiento)
  - Pantalla de registro de Insumos (Café en grano, Leche, Azúcar) con unidades de medida.
  - Implementar lógica de Recetas (BOM): Vincular un producto final a múltiples insumos con cantidades específicas.
  - Módulo de Compras: Registrar entrada de mercadería y actualizar costo promedio ponderado.
  - Registro de Mermas: Pantalla para dar de baja insumos dañados o desperdiciado
- Core de Ventas (FOH)
  - Pantalla de selección de productos con categorías y modificadores (ej: tipo de leche).
  - Carrito de compras con cálculo automático de impuestos (15% IVA).
  - Trigger de Inventario: Programar el descuento automático de insumos en SQLite al confirmar una venta.
- Cumplimiento Fiscal y Hardware (DGI Nicaragua)
  - Configurar driver de impresión térmica (ESC/POS) para 80mm.
  - Implementar Numeración Consecutiva Autorizada (bloqueo de edición de facturas).
  - Desarrollar módulo de Anulaciones: Marcar como anulado sin borrar el registro de la DB para auditoría.
  - Formato de factura legal: Incluir RUC, datos de emisor y desglose de IVA.

## Fase 2: Consolidación Cloud e Integración Bancaria (Semanas 5-8)

Objetivo: Centralizar datos y modernizar los métodos de cobro.

- Sincronización Offline-First
  - Desarrollar API Multi-tenant en el backend (Node.js/Python) con aislamiento de datos.
  - Implementar Sync Worker en Flutter: Enviar ventas locales a la nube al detectar conexión.
  - Resolución de conflictos: Lógica para manejar ventas de productos con stock limitado hechas simultáneamente offline.
- Pagos Digitales (Banca Local)
  - Integración con BAC API Center: Procesamiento de tarjetas y conciliación automática.
  - Integración con Banpro ProPay/QR: Habilitar cobros sin contacto desde el terminal o tablet.
- Reportería y Auditoría
  - Dashboard administrativo en la nube: Ventas en tiempo real, COGS (Costo de ventas) y utilidad.
  - Reportes de arqueo de caja (Reporte X y Z) para cierre de jornada.
  - Alertas push al móvil del dueño cuando el stock caiga por debajo del nivel PAR.
- Automatización de Onboarding (Escalabilidad de Carga)
  - Módulo de Importación Masiva: Herramienta para cargar menús e inventarios desde Excel para migrar clientes en minutos.
  - Base de Datos de Insumos Predeterminada: Precargar insumos estándar (leche, tipos de café, azúcar) para acelerar la configuración inicial.

## Fase 3: Multi-tenancy y Escalabilidad de Nicho (Semanas 9+)

Objetivo: Distribuir el software a todo el Food Park y retail general

- Escalabilidad Horizontal (Food Park)
  - Habilitar módulo de Cuentas Abiertas/Mesas (específico para bares o servicio completo).
  - Implementar KDS (Kitchen Display System): Pantalla para que la cocina marque pedidos como listos.
  - Módulo de "Combos" (hamburguesa + papas + soda) con descuento de inventario agrupado.
- Nuevos Nichos (Verticalización)
  - Módulo Retail: Variantes de productos por talla y color (para tiendas de ropa del parque).
  - Módulo Salud: Control de lotes y fechas de vencimiento (para farmacias o minimarkets).
- Formalización Comercial
  - Trámite de certificación oficial del sistema ante la DGI como proveedor autorizado.
  - Creación de manuales de usuario y técnicos (requisito legal para la DGI).

## Fase 4: Blindaje Comercial y "Hardening" (Semanas 12+)

Objetivo: Convertir el software en un producto escalable y protegido legalmente.

- Documentación Legal y Técnica (Obligatorio DGI)
  - Manual de Usuario y Técnico: La DGI exige estos manuales para autorizar el sistema a cualquier contribuyente.
  - Contrato de Asistencia Técnica: Debes tener un modelo de contrato listo. La ley nicaragüense vincula la autorización del sistema a la existencia de un responsable técnico que brinde soporte.
- Comercialización y SaaS Readiness
  - **Pricing & Proposal**: Finalizar template de cotización profesional y calculadora de márgenes.
  - **SLA & Support**: Redactar el contrato de soporte mensual que justifica los $60/mes.
- Protección de Propiedad Intelectual (MIFIC)
  - Registro de Marca: Iniciar el trámite en el Registro de la Propiedad Intelectual (Managua) para proteger el nombre "OmniFood NI".
  - Depósito de Obra (Software): Registrar el código fuente para tener respaldo legal ante posibles plagios en el food park.
- Seguridad y Auditoría Proactiva
  - Log de Auditoría (Audit Trail): Registro inalterable de quién abrió caja, quién hizo un descuento y quién anuló una factura. Esto es lo que más valoran los dueños de negocios para evitar robos hormiga.
  - Cifrado de Datos en Reposo: Asegurar que si roban la tablet/terminal, la base de datos SQLite no pueda ser leída por terceros.
