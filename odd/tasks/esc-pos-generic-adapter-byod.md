# Adaptador ESC/POS genérico y habilitación de BYOD

- **Issue:** [#983](https://github.com/netsky2-tech/omnifood-ni/issues/983)
- **Authority:** `docs/finance/estrategia_precios_nhilos_pos_v1.md`; decisión del usuario de construir el adaptador y habilitar BYOD para el plan Esencial.
- **Estado:** planificado, sin implementación.
- **Riesgo:** alto. Toca hardware, formato fiscal impreso y el camino de cobro offline.

## Objetivo

Permitir que el POS imprima en impresoras térmicas externas por Bluetooth, red TCP y USB, para que un negocio pequeño pueda usar su propio celular o tablet Android con una impresora de 58 mm, y para que el kit de estación pueda usar una impresora de 80 mm con gaveta.

## Problema

Hoy solo existen adaptadores para hardware con SDK integrado: Sunmi V2s y MIRAY Q80/iPOS. El enum `PrinterDriverType.escPosNetwork` y la configuración `networkIp`/`networkPort` existen, pero `PrinterResolver` los envía a `UnavailablePrinterAdapter` porque no hay transporte real. Sin impresora externa no hay factura DGI impresa, y el plan Esencial con BYOD no se puede vender.

## Por qué

Sunmi/iPOS cubren un solo perfil de hardware y dejan fuera al negocio pequeño que ya tiene un celular Android. Sin impresora externa no hay factura impresa, y sin factura impresa no se puede vender el plan de entrada ni el kit de estación. El adaptador no cambia el formato fiscal: solo agrega un transporte que hoy falta.

## Alcance

### Transporte

- Interfaz `EscPosTransport` con `connect`, `write`, `close`, `status` y timeouts.
- `BluetoothSppTransport` en Android por MethodChannel:
  - UUID SPP `00001101-0000-1000-8000-00805F9B34FB`.
  - Fallback por reflexión al canal 1 para clones que no negocian SPP.
  - Permisos Android 12+ (`BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`) y emparejamiento guiado.
  - Lista de dispositivos vinculados y búsqueda explícita; no asumir que ya está pareado.
- `TcpEscPosTransport` en Dart con `Socket`, puerto por defecto 9100.
- `UsbEscPosTransport` solo si la validación física demuestra que hace falta; puede quedar en una segunda entrega.

### Renderizado

- `EscPosPrinterAdapter implements PrinterPort` que consume `ReceiptDocument` y produce bytes.
- Reutilizar `ReceiptLayoutFormatter`/`Receipt58mmFormatter` y `EscPosBuilder`; no reimplementar el formato fiscal.
- Anchos 58 mm (32 CPL Font A) y 80 mm (42/48 CPL).
- Logo raster con `GS v 0` y `ThermalLogoProcessor`.
- Apertura de gaveta con `ESC p` cuando el perfil lo indique.
- Comanda, corte X y corte Z con paridad funcional frente a Sunmi/iPOS.

### Codificación

- Sistema de code page ESC/POS (`ESC t n`): CP850, CP437 y Latin-1.
- Prueba explícita de acentos y `ñ` en los modelos comprados; el texto fiscal no puede salir corrupto.
- `PrintableTextCodec` sigue siendo la normalización de entrada; la selección de code page es del adaptador.

### Estado y errores

- `DLE EOT n` para estado en tiempo real cuando el modelo lo soporte.
- Si el modelo no responde al estado, no inventar "sin papel" ni "listo": reportar el resultado real del write y mostrar "sin confirmación de estado" en la UI.
- Nunca usar `MockPrinterAdapter` para declarar una prueba física exitosa.
- Errores accionables: impresora no encontrada, no pareada, puerto ocupado, sin papel, offline, tiempo de espera.

### Configuración y UI

- Nuevo `PrinterDriverType.escPosBluetooth`.
- Implementar el `ESCPOS_NETWORK` existente; dejar de resolver a `UnavailablePrinterAdapter`.
- Claves nuevas: `printer_bt_address`, `printer_bt_name`, `printer_code_page`.
- Pantalla de hardware: seleccionar transporte, buscar/vincular impresora, elegir ancho y code page, prueba de impresión real.
- La prueba de impresión debe distinguir mock de hardware real y no confundir activación con impresión.

## Fuera de alcance

- iOS, Windows o Linux.
- Impresión en la nube.
- Integración con datáfonos bancarios.
- KDS.
- Sustituir los adaptadores Sunmi/iPOS existentes.

## Restricciones

- Offline-first: una falla de impresora nunca revierte ni bloquea la venta en SQLite.
- El formato fiscal DGI no cambia; el adaptador solo transporta bytes.
- Sin fallback silencioso a mock.
- Configuración explícita por terminal.
- TDD: pruebas antes de la aceptación física.
- Entrega en unidades revisables; si un slice supera 400 líneas, dividirlo.
- Forecast: 5 slices; el total es alto porque toca Android nativo, renderizado y aceptación física.

## Unidades de trabajo

### ESP-01 — Contrato de transporte y adaptador de red

Status: pending.

- Definir `EscPosTransport`, timeouts, serialización de writes y errores.
- Implementar `TcpEscPosTransport`.
- Cambiar `PrinterResolver` para `escPosNetwork`.
- Pruebas con servidor TCP local y bytes grabados.

### ESP-02 — Renderizador de bytes desde ReceiptDocument

Status: pending.

- Mapear `ReceiptDocument` a líneas y a `EscPosBuilder`.
- Cubrir factura, comanda, corte X, corte Z y etiqueta de producción.
- Golden tests de bytes para 58 mm y 80 mm.
- Prueba de code page con acentos y `ñ`.

### ESP-03 — Transporte Bluetooth Android

Status: pending.

- MethodChannel `com.nhilos.pos/escpos_bluetooth`.
- SPP + fallback por reflexión.
- Permisos, emparejamiento y ciclo de conexión.
- Manejo de desconexión y reintento acotado.

### ESP-04 — Integración de configuración y UI

Status: pending.

- Enum, claves de configuración y migración de perfiles existentes.
- Pantalla de hardware con búsqueda, selección y prueba real.
- Mensajes de error y estados vacíos.

### ESP-05 — Aceptación física

Status: pending.

- Comprar dos impresoras Bluetooth de 58 mm para demostración y venta.
- Validar factura, comanda, corte, logo, acentos y gaveta.
- Registrar modelo, serie, firmware y resultado por impresora.
- Documentar lista de compatibilidad y limitaciones.

## Criterios de aceptación

- [ ] Una venta con perfil Bluetooth imprime la factura fiscal completa en 58 mm.
- [ ] La misma venta imprime en 80 mm sin desalineación.
- [ ] Corte X, corte Z y comanda usan el mismo renderizador.
- [ ] La gaveta abre por pulso cuando el perfil lo indica; el fallo es visible.
- [ ] `ESCPOS_NETWORK` imprime por TCP y deja de resolver a `UnavailablePrinterAdapter`.
- [ ] Estados sin papel, offline y error se reflejan en la UI y en el resultado.
- [ ] Ninguna prueba física pasa por mock.
- [ ] La venta no se bloquea si la impresora falla.
- [ ] `flutter analyze` y pruebas enfocadas pasan.

## Checks

- `flutter test` enfocado en adapters, formatter y resolver.
- `flutter analyze`.
- Prueba manual con servidor TCP local.
- Checklist físico firmado por modelo y serie.

## Evidencia

Pendiente. Cada slice debe registrar comandos ejecutados, resultados y, en ESP-05, el checklist físico.

## Riesgos

- Firmware distinto entre Xprinter, GOOJPRT y clones.
- Impresoras que solo exponen BLE y no SPP.
- Code page incorrecta que corrompe acentos.
- Gaveta no conectada o no soportada por el modelo.
- Permisos Android 12+ y emparejamiento previo.

## Siguiente paso

Aprobar el issue #983 y ejecutar ESP-01 y ESP-02 antes de comprar hardware, para no invertir en impresoras que el transporte no pueda manejar.
