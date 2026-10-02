# Checklist de Aceptación de Hardware de Terminal
## NHILOS POS — Terminal de Flota MIRAY Q80 / iPOS

**Document ID:** NH-CHK-HW-001 (CD-08)  
**Versión:** 0.1  
**Estado:** CLIENT-READY  
**Aplica a:** Flota de terminales físicos NHILOS POS (Piloto: SOHO Café)  
**Referencia Técnica:** `docs/operations/q80_ipos_hardware_verification_checklist.md` y `docs/operations/q80-runbook.md`  
**Anexo a:** Acta de Go-Live `NH-GL-0001` (CD-07)

---

## 1. Ficha Técnica del Dispositivo Inspeccionado

| Parámetro | Dato Registrado en Inspección |
|---|---|
| **Cliente / Tenant** | SOHO Café (`NH-T0001`) |
| **Marca y Modelo** | MIRAY Q80 / iPOS |
| **Sistema Operativo** | Android 12 |
| **Número de Serie (S/N)** | ________________________________________ |
| **IMEI / Identificador de Hardware** | ________________________________________ |
| **Dirección MAC Wi-Fi** | ________________________________________ |
| **Ancho de Cabezal Térmico** | **80 mm** (Métrica lógica: 40 columnas / 576 puntos) |
| **Servicio / Driver de Impresión** | `net.nyx.printerservice` / Driver Q80/iPOS |
| **Fecha de Inspección Física** | _____ / _____ / 2026 |
| **Técnico Responsable** | [Nombre del Fundador] |

---

## 2. Protocolo de Inspección Física y Funcional

Marque cada casilla tras comprobar la prueba en el dispositivo físico:

### A. Integridad Física y Estética
- [ ] Carcasa plástica sin fisuras, golpes severos o daños estructurales visibles.
- [ ] Pantalla de cristal sin roturas, rajaduras ni píxeles muertos evidentes.
- [ ] Tapa del compartimiento de papel térmico cierra firmemente con enganche seguro.
- [ ] Puerto USB-C limpio, sin pines doblados ni holgura excesiva.
- [ ] Botones físicos (Encendido y Alimentación/Volumen) con respuesta táctil firme.

### B. Alimentación Eléctrica y Batería
- [ ] Adaptador de corriente original o compatible de 5V/2A verificado.
- [ ] Cable USB-C en buen estado funcional.
- [ ] El terminal reconoce la conexión eléctrica y muestra indicador de carga activa.
- [ ] La batería retiene carga de forma autónoma sin apagarse al desconectar el cable.
- [ ] Encendido en frío completado en tiempo normal sin bloqueos de bootloader.

### C. Pantalla y Entrada Táctil
- [ ] Respuesta táctil fluida y precisa en las cuatro esquinas de la pantalla.
- [ ] Teclado numérico en pantalla responde sin pulsaciones fantasma (*ghost touches*).
- [ ] Nivel de brillo suficiente para visualización en el entorno de barra/caja.

### D. Conectividad y Red
- [ ] Antena Wi-Fi detecta la red local del establecimiento (2.4 GHz / 5 GHz).
- [ ] Conexión establecida exitosamente con asignación de IP válida.
- [ ] Latencia de red aceptable y señal estable en el punto de cobro definitivo.
- [ ] Bluetooth funcional (si se requiere para lectores externos de tarjetas o periféricos).

### E. Impresora Térmica Integrada (80 mm)
- [ ] Mecanismo de arrastre de papel tracciona suavemente el rollo de 80 mm sin atascos.
- [ ] Sensor de fin de papel (*paper out*) detecta ausencia de papel correctamente.
- [ ] Emisión de ticket de prueba ejecutada exitosamente a través del servicio Nyx.
- [ ] Densidad y contraste de impresión térmico nítidos y legibles en todo el ancho (40 columnas).
- [ ] Código QR y/o código de barras de prueba impresos con líneas continuas legibles.

### F. Software del Sistema y Almacenamiento
- [ ] Versión de Android confirmada: Android 12.
- [ ] Memoria interna disponible superior a 2.0 GB para almacenamiento de base de datos local y caché.
- [ ] Zona horaria del sistema configurada en `America/Managua` (GMT-6).
- [ ] Sincronización automática de fecha y hora del sistema validada.
- [ ] Modo de depuración USB configurado y asegurado conforme a la política técnica.

---

## 3. Accesorios Entregados en Custodia al Cliente

| Elemento | Cantidad | Estado | Aceptado por Cliente |
|---|:---:|:---:|:---:|
| Terminal MIRAY Q80 / iPOS | 1 | Operativo | [ ] Sí |
| Adaptador de Corriente de Pared (Cargador) | 1 | Operativo | [ ] Sí |
| Cable de Conexión USB-A a USB-C | 1 | Operativo | [ ] Sí |
| Rollo de papel térmico de 80 mm instalado de prueba | 1 | Instalado | [ ] Sí |

---

## 4. Observaciones Técnicas de Hardware

Documentar cualquier detalle cosmético preexistente o particularidad del equipo:

```text
Observaciones: _________________________________________________________________
_________________________________________________________________________________
```

---

## 5. Dictamen de Aceptación de Hardware

- [ ] **APROBADO PARA PRODUCCIÓN:** El hardware cumple con la totalidad de los requisitos técnicos y de impresión térmica para operar NHILOS POS.
- [ ] **RECHAZADO / REQUIERE MANTENIMIENTO:** El equipo presenta fallas de hardware (impresora, táctil o carga) que impiden su despliegue comercial.

<br>

| Inspeccionado por (Proveedor) | Recibido en Custodia por (Cliente) |
|---|---|
| **Firma:** __________________________________ | **Firma:** __________________________________ |
| **Nombre:** [Nombre del Fundador] | **Nombre:** __________________________________ |
| **Fecha:** _____ / _____ / 2026 | **Fecha:** _____ / _____ / 2026 |
