# Proposal: La política de supervisión la define el tenant

## Intent

El backoffice puede decir qué cantidad descuenta un extra, pero **no puede decir quién
firma**: la regla de autorización está escrita en el código del POS (`OWNER` o `MANAGER`),
no en la configuración del negocio. Y esa regla tiene un defecto que el dueño del producto
señaló en sus palabras:

> «En un food park donde solo hay 1 persona como vendedor y preparador... no tenemos un
> manager u owner presente. Se entendería en restaurantes o negocios grandes con más
> burocracia... no podemos amarrar esa parte. Debería de ser configurable con los roles y
> permisos del backoffice.»

La regla atada al código no crea un control en un food park: crea un **callejón sin
salida**. Si el único operador no puede firmar, el turno no se puede cerrar (obligación
fiscal) y la terminal queda atrapada al final del día. Un turno sin cerrar es un problema
fiscal **peor** que un turno auto-autorizado.

Lo que en un negocio pequeño existe de verdad no es la separación de funciones: es el
**registro**. Quién lo hizo, con qué credencial, y si hubo supervisor. Por eso el override
nunca es una cerradura: es un asiento que el dueño puede revisar después.

## Scope

### In Scope

- **Contrato de la política**: qué roles autorizan en este negocio y qué operaciones
  admiten la firma del propio operador (cierre de turno, gaveta, descuento manual, cantidad
  de un extra).
- **Backoffice**: la política se edita en el backoffice (pestaña «Supervisión»), con el
  invariante explicado **antes** de guardar.
- **Entrega**: la política viaja a las terminales por el **único canal versionado y con
  acuse** que existe (el snapshot de configuración), no por un canal nuevo.
- **Terminal**: la política se proyecta a la configuración local; sin política, la terminal
  aplica el valor por defecto de su modo de operación.

### Out of Scope

- **Permisos por usuario como criterio de autorización**: la terminal hoy recibe el ROL de
  cada persona (el sync de entrada no entrega permisos). Una política basada en permisos
  por usuario exigiría extender el contrato de sincronización de identidad; es un change
  propio. La política actual trabaja con el vocabulario de roles que la terminal ya
  conoce sin conexión.
- El nuevo rol «encargado de turno»: hoy un encargado de turno se registra como MANAGER.
- La cola de revisión de auto-autorizaciones en el backoffice (el dato ya se registra en la
  cadena forense; su presentación es otro change).

## Capabilities

### New Capabilities

- `supervision-policy`: quién autoriza en este negocio y qué pasa cuando nadie que
  pueda está en el turno; la política es del tenant, viaja al terminal y nunca deja una
  operación obligatoria sin forma de completarse.

## Approach

1. **Contrato primero**: la política vive en el tenant, no en el código. El backend la
   guarda, la valida y la sirve.
2. **Un solo canal**: la política viaja en el snapshot de configuración (revisión +
   fingerprint + acuse del terminal). La regla de la casa — «el snapshot es el ÚNICO canal
   de entrega, no un segundo mecanismo de sincronización» — manda.
3. **El invariante antes que la libertad**: una política que dejaría el corte de caja
   imposible se rechaza en el backoffice (con las palabras del problema) y **no se aplica**
   en la terminal (que es la última línea de defensa: un mostrador atascado a las 6pm es
   peor que una política vieja).
4. **El backoffice con la voz de las personas**: nada de «auto-autorización por flujo» en
   la pantalla; el dueño ve «Cerrar el turno (Corte Z)» y lo que significa cada opción.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/admin_backend/src/modules/supervision/**` | New | Contrato, servicio y endpoints de la política. |
| `apps/admin_backend/src/modules/identity/security/permissions.enum.ts` | Modified | Permiso `supervision:configure`. |
| `apps/admin_backend/src/modules/onboarding/**` | Modified | La política viaja en el snapshot (payload, fingerprint, revisión). |
| `apps/owner_dashboard/src/features/supervision/**` | New | La tarjeta que la edita, con el invariante explicado. |
| `apps/owner_dashboard/src/features/settings/settings-page.tsx` | Modified | La pestaña «Supervisión». |
| `apps/pos_app/lib/data/services/fiscal_inbox_handler.dart` | Modified | La proyección a la configuración local (con fail-safe). |
| `apps/pos_app/lib/domain/models/config/supervision_policy.dart` | Modified | Parse estricto y el invariante del cierre de turno. |

## Risk & Rollback

- **Riesgo**: que una terminal quede con una política que no puede aplicar. Mitigado por
  el fail-safe: la terminal nunca aplica una política que deje el cierre de turno
  imposible; en su lugar conserva el valor por defecto de su modo.
- **Riesgo**: que el backoffice deje al dueño configurar un callejón sin salida. Mitigado
  por el invariante del servidor (rechaza) y por la explicación previa en la UI.
- **Rollback**: la política es un parámetro del tenant; se restablece (DELETE) y cada
  terminal vuelve al valor por defecto de su modo en su próxima sincronización. La
  proyección es aditiva y no toca la ruta fiscal.
