# NHILOS POS — Guión de Video y Especificación de Showcase
## Flujo Completo: Creación de Cliente ➔ Promoción Convenio ➔ Descuento en Caja POS

**Document ID:** NH-VID-001  
**Versión:** 2.0  
**Estado:** ALINEADO CON UI REAL Y MARCA OFICIAL  
**Duración Total:** 30.0 segundos (900 frames @ 30 FPS)  
**Logo Oficial:** `apps/owner_dashboard/public/logo.png`  
**Colores Oficiales:** `#00BF81` (Verde Esmeralda), `#003757` (Azul Marino Profundo), `#CCCCCC` (Gris Neutro)  

---

## 1. Estructura Narrativa y Tiempos por Escena

```
[00:00 - 00:03] Escena 1: Intro Oficial (90 frames)
[00:03 - 00:10] Escena 2: Paso 1 — Creación de Cliente Corporativo en Backoffice (210 frames)
[00:10 - 00:18] Escena 3: Paso 2 — Creación de Promoción "Convenio con Cliente" (240 frames)
[00:18 - 00:27] Escena 4: Paso 3 — Terminal POS en Acción y Descuento Automático (270 frames)
[00:27 - 00:30] Escena 5: Outro Oficial (90 frames)
```

---

## 2. Detalle Escena por Escena

### Escena 1: Intro Oficial (Frames 0 – 90 | 0.0s – 3.0s)
* **Fondo:** Sólido `#003757` institucional.
* **Composición centrada (Únicamente los 4 elementos aprobados):**
  1. **Logo oficial:** Imagen PNG original del repositorio (`logo.png`).
  2. **Identidad:** `NHILOS POS` (fuente `Renogare`, tracking `6px`, mayúsculas).
  3. **Badge:** `Directorio de Clientes & Convenios` (fondo `#00BF81` al 15%, borde verde).
  4. **Eslogan:** `Conectamos los hilos de tu negocio.` (en `#CCCCCC`).

---

### Escena 2: Paso 1 — Creación de Cliente en Backoffice (Frames 90 – 300 | 3.0s – 10.0s)
* **Entorno:** Owner Dashboard en `/customers` con Sidebar oficial en `#003757` y sección *Clientes* activa.
* **Acción animada:**
  1. Clic en el botón `+ Nuevo Cliente`.
  2. Se abre el modal oficial `CustomerDialog` (`Nuevo Cliente`).
  3. Llenado interactivo de campos:
     - **Nombre / Razón Social:** *Banco Atlántico de Nicaragua*
     - **Tipo de Cliente:** *Empresa / Jurídica* (selector con borde `#00BF81`)
     - **RUC / Cédula:** *J0310000123456*
     - **Teléfono:** *+505 2278-0000*
     - **Correo Electrónico:** *convenios@atlantico.ni*
  4. Clic en `Guardar cliente` con toast de confirmación verde menta.
  5. El cliente queda inmediatamente registrado en la tabla del directorio.

---

### Escena 3: Paso 2 — Pantalla de Promociones y Creación de Convenio (Frames 300 – 540 | 10.0s – 18.0s)
* **Entorno:** Owner Dashboard navegando a `/promotions` con el ítem *Promociones* activo en el Sidebar.
* **Acción animada:**
  1. Clic en `+ Nueva Promoción`.
  2. Se despliega el formulario real `PromotionForm`:
     - **Nombre de la Promoción:** *Convenio Banco Atlántico*
     - **Tipo de Promoción:** *Convenio con Cliente* (con icono de apretón de manos `Handshake`)
     - **Alcance del Descuento:** *Cliente / Empresa específica*
     - **Cliente / Empresa del Convenio:** *Banco Atlántico de Nicaragua (NIT: J0310000123456)*
     - **Categoría Objetivo:** *Global (sin categoría)*
     - **Porcentaje de Descuento:** *15%*
     - **Días de la Semana:** Lunes a Viernes activos en `#003757`
     - **Horarios:** *11:30* a *15:00*
  3. Clic en `Guardar Promoción`.
  4. El listado de promociones se actualiza al instante, mostrando la fila con el badge `Convenio con Cliente`, objetivo corporativo y switch `Activa`.

---

### Escena 4: Paso 3 — Terminal POS en Acción con Selección y Descuento (Frames 540 – 810 | 18.0s – 27.0s)
* **Entorno:** Terminal POS táctil Sunmi (resolución 800x1280 portrait).
* **Acción animada:**
  1. Pedido en curso en la caja: *2x Combo Almuerzo Ejecutivo (C$ 500.00)* + *1x Café Americano (C$ 60.00)*.
  2. El cajero presiona el botón `ASIGNAR CLIENTE`.
  3. Se selecciona a *Banco Atlántico de Nicaragua* de la base de datos local SQLite.
  4. **El Momento Clave:** El motor de promociones evalúa las reglas activas de forma autónoma:
     - El cliente aparece identificado con badge corporativo.
     - Se inserta en el carrito la línea en verde esmeralda:  
       `Convenio Banco Atlántico (-15%): -C$ 75.00`
     - Total recalculado automáticamente: `C$ 485.00`.
  5. Clic en `Cobrar Factura Fiscal DGI`.

---

### Escena 5: Outro Oficial (Frames 810 – 900 | 27.0s – 30.0s)
* **Fondo:** Sólido `#003757` institucional.
* **Composición centrada (Únicamente los 3 elementos aprobados):**
  1. **Logo oficial:** Imagen PNG original del repositorio (`logo.png`).
  2. **Nombre de la app:** `NHILOS POS` (mayúsculas con espaciado amplio).
  3. **Eslogan oficial:** `Conectamos los hilos de tu negocio.` (en `#CCCCCC`).
