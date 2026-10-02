# Guía de Contingencias Operativas en Punto de Venta
## NHILOS POS — "¿Qué hago si...?"

**Document ID:** NH-MAN-CTG-001 (CD-14)  
**Versión:** 0.1  
**Aplica a:** Personal en caja y supervisores de SOHO Café  
**Objetivo:** Respuestas directas y accionables ante incidentes comunes en la operación diaria.

---

### 1. ¿Qué hago si se cae la señal de Internet o el Wi-Fi?
* **Acción:** **Seguí cobrando normalmente.**  
* **Explicación:** NHILOS POS está diseñado bajo la filosofía *Offline-First*. Todas las ventas, cálculos y tickets se guardan de forma segura en la memoria interna del terminal.
* **Qué verás:** El indicador de nube en la barra superior cambiará a estado desconectado / sincronización pendiente con un contador de ventas pendientes.
* **Al volver el internet:** No toques nada. La aplicación detectará la red y subirá automáticamente todas las ventas acumuladas a la nube en segundo plano.

---

### 2. ¿Qué hago si la impresora se queda sin papel durante una venta?
* **Acción:**
  1. No canceles la venta: la venta ya quedó registrada en el sistema.
  2. Abrí la palanca superior del compartimiento de papel del MIRAY Q80.
  3. Retirá el cono vacío e introducí un nuevo rollo térmico de **80 mm**, con la cara térmica orientada hacia el cabezal (el papel debe desenrollarse desde abajo hacia el frente).
  4. Dejá asomar unos 2 cm de papel hacia afuera y cerrá la tapa con firmeza hasta escuchar el clic.
  5. En la pantalla del POS, andá al menú superior > **"Último Ticket"** > **"Reimprimir"**.

---

### 3. ¿Qué hago si el papel se atora (*atasco de papel*)?
* **Acción:**
  1. Apagá la pantalla del terminal con un toque corto al botón de encendido.
  2. Abrí la tapa del compartimiento de papel con cuidado sin forzar el mecanismo.
  3. Retirá el papel arrugado y cortá el borde irregular en línea recta.
  4. Volvé a colocar el rollo, cerrá la tapa firmemente y encendé la pantalla.
  5. Ejecutá una prueba de impresión desde **Ajustes > Probar Impresora**.

---

### 4. ¿Qué hago si la batería del terminal está baja y estamos en hora pico?
* **Acción:**
  1. Conectá de inmediato el cable USB-C al cargador original de pared de 5V/2A.
  2. El terminal puede **seguir operando normalmente mientras carga**.
  3. Asegurate de que el cable no quede tirante ni en una zona de paso donde pueda tropezar el personal o derramarse líquidos.

---

### 5. ¿Qué hago si la aplicación se cierra inesperadamente?
* **Acción:**
  1. Volvé a tocar el ícono de **NHILOS POS** en la pantalla principal de Android.
  2. Ingresá tu PIN de cajero.
  3. Tu turno de caja continuará abierto exactamente en el estado en que estaba. Si tenías un ticket abierto sin cobrar, verificalo en pantalla o en "Tickets en Espera".

---

### 6. ¿Qué hago si el datáfono bancario cobró la tarjeta, pero el POS no cerró la venta?
* **Acción:**
  1. Verificá que el voucher físico del datáfono bancario esté efectivamente impreso y diga **"APROBADO"**.
  2. En el POS, si el ticket sigue en pantalla, tocá **"Cobrar"**, seleccioná **"Tarjeta"**, ingresá el número de referencia del voucher y presioná **"Confirmar"**.
  3. **Regla de oro:** Nunca vuelvas a pasar la tarjeta del cliente por el datáfono bancario sin antes verificar si la transacción anterior fue exitosa.

---

### 7. ¿Qué hago si un cajero olvidó su PIN de acceso?
* **Acción:**
  1. El Encargado o el Propietario (Owner) puede acceder con su PIN maestro.
  2. En el menú de **Ajustes > Usuarios**, el administrador puede reasignar un nuevo PIN de 4 dígitos para el cajero en menos de 1 minuto.

---

### 8. ¿Qué hago si un producto tiene un precio incorrecto en la pantalla?
* **Acción:**
  1. El cajero no puede cambiar precios libremente para evitar descuadres.
  2. Notificá al Administrador/Propietario.
  3. El Administrador puede actualizar el precio en el menú de catálogo o desde el Owner Dashboard web.
  4. En el terminal POS, tocá el menú > **"Actualizar Catálogo"** para recibir el nuevo precio al instante si hay internet.

---

### 9. ¿Qué hago si necesito anular una venta ya cobrada e impresa?
* **Acción:**
  1. Llamá al Supervisor o Administrador.
  2. Andá a **Menú > Historial de Ventas / Tickets**.
  3. Localizá el ticket por número de comprobante o monto y seleccioná **"Anular Venta"**.
  4. El sistema solicitará el **PIN de Supervisor** y el motivo de anulación (ej. error de digitación, cambio de orden, devolución).
  5. El sistema emitirá un ticket de comprobante de anulación (*Void*) y ajustará el inventario descontado.
  6. **Importante:** Por normativas fiscales, el ticket original anulado no desaparece del historial; queda registrado como anulado con su justificación.

---

### 10. ¿Qué hago si una venta no aparece de inmediato en el Owner Dashboard web?
* **Acción:**
  1. Revisá el terminal físico de caja: ¿está conectado a internet?
  2. Mirá el indicador de sincronización en el terminal. Si dice "Pendientes de sincronizar", es porque el terminal no tiene señal Wi-Fi suficiente para transmitir en ese momento.
  3. En cuanto el terminal recupere conectividad, los datos viajarán a la nube y se reflejarán en el Dashboard web en su siguiente actualización.

---

### 11. ¿Qué hago si sospecho de una anomalía de seguridad o pérdida del terminal?
* **Acción:**
  1. Comunicá el hecho de inmediato al canal de soporte prioritario de NHILOS.
  2. El equipo técnico procederá a **revocar remotamente la sesión y credenciales** del dispositivo para impedir cualquier acceso no autorizado a los datos del negocio.

---

### Canales de Asistencia Inmediata
* **Soporte Técnico Directo (WhatsApp):** [Número de Soporte Fundador]
* **Correo de Escalamiento:** `soporte@nhilospos.com`
* **Horario de Atención:** Lunes a Sábado de 8:00 AM a 8:00 PM.
