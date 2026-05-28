# Propuesta Técnico-Económica: OmniCore POS

**Fecha**: 20/05/2026
**Cliente**: SOHO
**Referencia**: OE-001OM

---

## 1. Introducción
OmniCore POS es el sistema de Punto de Venta (POS) de la suite OmniCore Platform, diseñado para operar de forma ultra-resiliente bajo las condiciones reales del mercado nicaragüense. Nuestra arquitectura **Offline-First** y de **Red Local** garantiza la continuidad de sus operaciones frente a los cortes de internet y de energía eléctrica comunes en Managua.

## 2. Nuestra Propuesta de Valor

- **Continuidad Operativa Total (Offline-First & LAN)**: El POS factura y descuenta inventario localmente sin internet. Además, si la señal externa cae pero hay router Wi-Fi local, los meseros siguen enviando comandas de forma inalámbrica a la cocina (KDS) y a las ticketeras térmicas en tiempo real.
- **Doble Esquema de Tipo de Cambio Desacoplado**: Permite registrar el Tipo de Cambio Oficial del Banco Central de Nicaragua para cumplimiento contable/fiscal, y a la vez definir un Tipo de Cambio Comercial personalizado (ej: recibir USD a 36.00) para cobros rápidos y cálculo automático del vuelto en caja.
- **Motor de Vigilancia Fiscal (Fiscal Sentinel)**: Supervisa las resoluciones de facturación de la DGI de forma automática. Emite advertencias visuales al alcanzar el 90% de uso de folios y ejecuta un bloqueo preventivo (hard-stop) al llegar al 100% o la fecha de expiración para evitar que su negocio opere con facturas no autorizadas.
- **Control de Costos de Producción**: Gestión de recetas avanzadas (Bill of Materials - BOM) para conocer su Costo Real de Venta, utilidad y control de mermas físicas en tiempo real.
- **Aprobaciones Remotas Fuera de Línea (TOTP)**: Si un mesero o cajero necesita una anulación o descuento especial y el gerente está ausente, este puede dictarle un código temporal de un solo uso (tipo Google Authenticator) generado desde su celular para autorizar la acción de forma remota y sin internet.

## 3. Inversión Económica

### 3.1 Implementación Inicial (Setup)
**Monto: $200.00 (Pago único)**
Incluye:
- Configuración y vinculación del dispositivo POS inicial (sea Tablet de mano de 58mm o All-in-One de caja).
- Carga masiva de catálogo de productos e insumos iniciales (hasta 150 ítems/recetas utilizando nuestras plantillas digitales de importación rápida en Excel).
- Configuración de la red local del negocio (LAN) para comunicación multi-dispositivo (opcional si inicia con un solo terminal).
- Capacitación integral del personal (Cajeros, Meseros y Administradores).

### 3.2 Suscripción de Servicio (SaaS)
**Cuota Mensual: $60.00** (Plan Pro - Diseñado para crecer con su negocio)
Incluye:
- Licencia de uso del POS OmniCore POS.
- **Escalabilidad de Dispositivos**: Puede iniciar operando con **una sola tablet con impresora térmica integrada (58mm)**. Cuando su negocio migre a restaurante, la misma suscripción le permite activar la red local LAN para conectar la caja central (80mm), comanderas de meseros y pantallas KDS en cocina, sin costo de licencia de software adicional.
- Sincronización transaccional por deltas y almacenamiento seguro en la nube.
- Respaldo de bitácoras de auditoría (*Audit Trail*) inalterables exigidas por DGI.
- Actualizaciones de software gratuitas (mejoras operativas y parches legales).

## 4. Hardware Soportado y Recomendado
El cliente adquiere el hardware recomendado por su cuenta con los proveedores sugeridos. La suite OmniCore POS es compatible con:
- **Caja Principal**: Dispositivos táctiles All-in-One (Windows/Linux) con impresora térmica de 80mm.
- **Meseros**: Dispositivos móviles Android portátiles (Handhelds) con impresora integrada de 58mm.
- **Cocina/Barra**: Pantallas KDS (tablets Android o monitores HDMI estándar).

## 5. Próximos Pasos
1. Aceptación de la propuesta técnico-económica.
2. Pago del Setup Fee ($200.00) y provisión del acceso administrativo del Tenant.
3. Entrega de plantillas de Excel provistas por nosotros con el catálogo inicial del negocio.
4. Despliegue técnico y Go-Live en 72 horas hábiles tras la entrega de datos.

---
**OmniCore POS** - *Resiliencia sobre Conectividad*
Contacto: +505 8194 8526
