# Registro de Configuración Inicial del Cliente (Línea Base)
## NHILOS POS

**Document ID:** NH-CFG-001 (CD-09)  
**Versión:** 0.1  
**Estado:** CLIENT-READY TEMPLATE  
**Aplica a:** SOHO Café (`NH-T0001`)  
**Referencia Técnica:** `docs/client-onboarding/SOHO_REQUISITOS_PUESTA_EN_MARCHA.md`  
**Anexo a:** Acta de Go-Live `NH-GL-0001` (CD-07)

---

> **REGLA DE SEGURIDAD ESTRICTA:**  
> Este documento registra la línea base operativa y comercial congelada para la puesta en marcha. **NUNCA** deben anotarse en este registro contraseñas de usuarios, códigos PIN numéricos, semillas TOTP de autenticación en dos pasos, tokens de acceso ni llaves criptográficas privadas.

---

## 1. Identidad del Negocio y Sucursal

| Parámetro | Configuración Congelada |
|---|---|
| **Razón Social / Propietario** | SOHO Café / [Nombre del Titular] |
| **Nombre Comercial en Tickets** | SOHO Café |
| **Número RUC** | [RUC del Negocio] |
| **Identificador de Inquilino (Tenant ID)** | `NH-T0001` |
| **Código de Sucursal (Branch ID)** | `BR-01` (Principal) |
| **Dirección del Establecimiento** | Managua, Nicaragua |
| **Teléfono de Contacto Comercial** | [Teléfono de SOHO Café] |
| **Giro / Modalidad de Operación** | Alimentos y Bebidas (F&B) — Cafetería de Especialidad |
| **Zona Horaria del Sistema** | `America/Managua` (GMT-6) |

---

## 2. Parámetros Monetarios y Cambiarios

| Parámetro | Valor Configurado | Notas de Operación |
|---|---|---|
| **Moneda Base Contable** | Córdobas (NIO — C$) | Moneda obligatoria para reportes de cierre y kardex |
| **Cobro Multimoneda (USD)** | **HABILITADO** | Permite recibir dólares en caja |
| **Tipo de Cambio Oficial** | BCN (Banco Central de Nicaragua) | Sincronizado para referencia estadística |
| **Tipo de Cambio Comercial en Caja** | **C$ [Valor, ej. 36.60] por US$ 1.00** | Tipo de cambio fijo aplicado al vuelto y conversión en ticket |
| **Regla de Vuelto en Efectivo** | Córdobas (NIO) | Los pagos en USD devuelven cambio en NIO salvo excepción autorizada |

---

## 3. Configuración Fiscal y Comprobantes (DGI Nicaragua)

| Parámetro | Configuración Congelada |
|---|---|
| **Régimen Tributario Declarado** | **Cuota Fija** / **Régimen General** |
| **Tratamiento de Precios en Menú** | Precios de venta al público con impuestos incluidos |
| **Prefijo de Serie de Facturación** | `FAC-` (o serie autorizada) |
| **Rango de Numeración Inicial** | `000001` en adelante (Secuencia ascendente ininterrumpida) |
| **Política de Modificación de Facturas** | **Inmutable:** No se permite eliminación física de comprobantes. Solo se permiten anulaciones registradas (*voids* auditables). |
| **Encabezado del Ticket Térmico** | SOHO Café / RUC: [RUC] / Managua, Nicaragua |
| **Pie de Página del Ticket** | *"¡Gracias por su visita! Disfrute su café."* |

---

## 4. Perfil de Terminal e Impresión de Flota

| Parámetro | Configuración Congelada |
|---|---|
| **Identificador Lógico de Terminal** | `POS-SOHO-01` |
| **Modelo de Dispositivo** | MIRAY Q80 / iPOS |
| **Sistema Operativo** | Android 12 |
| **Driver de Impresión Seleccionado** | Driver Nyx / iPOS (`net.nyx.printerservice`) |
| **Ancho de Papel Configurado** | **80 mm** |
| **Métricas de Renderizado** | 40 columnas de texto / 576 puntos de mapa de bits (raster) |
| **Corte Automático / Manual** | Barra dentada de corte manual |
| **Reimpresión de Comprobantes** | Habilitada con marca explícita *"REIMPRESIÓN"* |

---

## 5. Estructura de Catálogo, Recetas e Inventario

| Componente | Estado en Puesta en Marcha | Detalle |
|---|:---:|---|
| **Categorías de Menú** | Activo | Bebidas Calientes, Bebidas Frías, Repostería, Desayunos, Extras/Modificadores |
| **Productos de Venta** | Cargado | Lista completa de productos y presentaciones con precio congelado |
| **Insumos y Materias Primas** | Cargado | Café en grano, leche entera, leche vegetal, jarabes, azúcar, vasos 12oz/16oz, tapas |
| **Fórmulas de Recetas** | Cargado | Consumo teórico descontado en cada venta por receta |
| **Control de Merma** | Habilitado | Registro de descarte por preparación o caducidad |
| **Kardex y Costo Promedio (CPP)** | Habilitado | Cálculo de margen bruto teórico en tiempo real |

---

## 6. Estructura de Usuarios y Roles Autorizados

| Nombre del Usuario | Rol en Plataforma | Nivel de Acceso | Método de Acceso |
|---|---|---|---|
| [Nombre del Propietario] | **PROPIETARIO (Owner)** | Acceso total: Dashboard web + Terminal POS | Correo / Contraseña + PIN Maestro |
| [Nombre del Encargado] | **SUPERVISOR / MANAGER** | Acceso POS + Autorización de Anulaciones y Cortes | PIN numérico local |
| [Nombre Cajero 1] | **CAJERO / OPERADOR** | Apertura, venta, cobro y cierre de turno | PIN numérico local |
| [Nombre Cajero 2] | **CAJERO / OPERADOR** | Apertura, venta, cobro y cierre de turno | PIN numérico local |

---

## 7. Registro de Aprobación de la Configuración

La presente configuración ha sido cargada, verificada y aceptada por las Partes como la línea base inicial de producción:

<br>

| Configurado por (Proveedor) | Validado por (Cliente) |
|---|---|
| **Firma:** __________________________________ | **Firma:** __________________________________ |
| **Nombre:** [Nombre del Fundador] | **Nombre:** __________________________________ |
| **Fecha:** _____ / _____ / 2026 | **Fecha:** _____ / _____ / 2026 |
