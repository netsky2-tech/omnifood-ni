# Design: La política de supervisión la define el tenant

## 1. El problema, en una frase

La regla de autorización del POS está escrita en el código (`OWNER` || `MANAGER`), no en
la configuración del negocio; en un food park —donde muchas veces no hay nadie más en el
turno— esa regla no crea un control, crea un **callejón sin salida**: el corte de caja
queda imposible de completar.

## 2. El modelo: la CAPACIDAD y la AUTORIZACIÓN son dos preguntas

| Pregunta | Quién la responde | Dónde vive |
|---|---|---|
| ¿Puede esta persona **operar** esto? | El rol y la capacidad | Código + permisos del backoffice |
| ¿Hace falta la **firma de otro** para esta operación? | La **política del tenant** | Configuración (este change) |

Antes de este change las dos preguntas tenían la misma respuesta (`OWNER`/`MANAGER`), y por
eso aparecía el defecto por los dos lados: se le exigía un supervisor a un cajero y, a
continuación, ni siquiera se le dejaba cerrar su propio turno.

## 3. El contrato

```ts
interface SupervisionPolicy {
  authorizingRoles: UserRole[];                     // quién firma en nombre del negocio
  selfAuthorizationAllowedCloseBox: boolean;        // cierre de turno (Corte Z)
  selfAuthorizationAllowedCashDrawer: boolean;      // gaveta a mano
  selfAuthorizationAllowedManualDiscount: boolean;  // descuento manual
  supervisorRequiredForModifierQuantity: boolean;   // cantidad de un extra
}
```

**El vocabulario es de roles, no de permisos por persona**, y es una decisión con razón:
la terminal recibe el ROL de cada persona por el sync de entrada, pero **no** recibe sus
permisos (`InboundSyncUserDto` no los lleva). Una política basada en permisos por persona
sería inaplicable en un terminal sin conexión — es decir, sería una política de adorno.
Llevar los permisos al terminal es un change propio (extender el contrato de identidad).

**La forma del JSON es la misma que la terminal guarda localmente** (`supervision_policy`),
así que la proyección es una copia sin capa de traducción que pueda desincronizarse.

## 4. El canal: el snapshot, y sólo el snapshot

La política viaja en el **snapshot de configuración** (el mismo que lleva el modo de
operación, los topes de descuento y la identidad fiscal). Es la regla de la casa: *el
snapshot es el ÚNICO canal de entrega; no un segundo mecanismo de sincronización*.

- El snapshot es **content-addressed** (fingerprint JCS) y **versionado** (revisión
  monótona): cambiar la política cambia el fingerprint → las terminales la reciben.
- El terminal **acuse** la revisión aplicada.
- Guardar la política **SIEMPRE**bumpea la revisión (`recordRevisionChange`).

El valor vive en la tabla de parámetros del tenant (`system_parameters_config`, append-only
con vista activa) — el mismo lugar que todos los demás parámetros del negocio.

## 5. El invariante: el cierre de turno siempre se puede completar

Sólo el **cierre de turno** es una obligación (fiscal). El resto de operaciones pueden
legítimamente **rechazarse** (el cliente paga el precio completo), así que no son
bloqueantes.

| Combinación | Veredicto |
|---|---|
| Sin roles que autoricen + cierre de turno sin auto-autorización | **ERROR** (no se guarda) |
| Sin roles que autoricen + gaveta sin auto-autorización | Advertencia |
| Sin roles que autoricen + descuento sin auto-autorización | Advertencia |
| Sin roles que autoricen + cantidad de extra con supervisor | Advertencia |

El invariante se aplica en **tres** capas, cada una con su propia razón:

1. **El backoffice** lo explica ANTES de guardar (el dueño ve el problema en palabras).
2. **El servidor** lo rechaza (una política guardada a mano tampoco puede colarse).
3. **La terminal** no la aplica (fail-safe): un mostrador atascado a las 6pm es peor que
   una política vieja; la terminal conserva el valor por defecto de su modo.

## 6. La proyección en la terminal

Semántica **FULL de snapshot** (como los topes de descuento): la nube es la dueña.

- Snapshot con política → se escribe `local_configs['supervision_policy']`.
- Snapshot sin política (o corrupta) → se **borra** la clave → la terminal aplica el valor
  por defecto de su modo.

No es un espejo "gestionado por marca": ninguna pantalla del POS escribe esa clave (la
política es una decisión de la oficina), así que una revisión que la retira puede
borrarla sin riesgo de pisar un valor del operador.

La **versión de proyección** sube de 1 a 2 (`FiscalProjectionKeys.currentVersion`), lo que
dispara el mecanismo de reparación en las instalaciones que ya aplicaron la versión 1.

## 7. La interfaz: las palabras del dueño, no las del sistema

| En el código | En la pantalla |
|---|---|
| `selfAuthorizationAllowedCloseBox` | «Cerrar el turno (Corte Z)» |
| `authorizingRoles` | «Quién puede autorizar» (Dueño, Gerente, Cajero, Mesero) |
| `supervisionPolicy == null` | «Sin definir: cada terminal aplica el valor por defecto» |

Reglas de la experiencia que esta tarjeta cumple:

- **Sin centinelas mudos**: el valor por defecto se NOMBRA (con su modo de operación), no
  es un «(sin definir)» que esconde lo que la terminal está aplicando.
- **La consecuencia, no el interruptor**: cada opción dice qué significa.
- **La verdad de la entrega**: «las terminales la aplican en su próxima sincronización».
- **Sin marcadores de permiso**: si no hay permiso, no hay pestaña ni consulta.
- **El error explica lo que sigue vivo**: si la política no carga, «sus terminales siguen
  funcionando con la que ya tienen aplicada».

## 8. Lo que este change NO resuelve

- **Permisos por persona** como criterio de autorización (exige llevar los permisos al
  terminal).
- **La cola de revisión** de auto-autorizaciones en el backoffice (el dato ya está en la
  cadena forense; su presentación es otro change).
- **Un rol «encargado de turno»** propio: hoy un encargado de turno se registra como
  MANAGER.
