# Tasks: La política de supervisión la define el tenant

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 1100-1400 (a mano, sin generados) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes (3 unidades encadenadas) |
| Delivery strategy | ask-on-risk |

### Work Units

| Unit | Goal | Commit |
|------|------|--------|
| 1 | La nube: contrato, servicio, endpoint, permiso y el viaje en el snapshot | `ace7e0d1` |
| 2 | El backoffice: la tarjeta que la edita, con el invariante explicado antes de guardar | `4f5821a0` |
| 3 | La terminal: la proyección con fallo seguro y la reparación de las instalaciones v1 | (este change) |

---

## Unidad 1 — La nube (HECHA, `ace7e0d1`)

- [x] 1.1 `modules/supervision/contracts/supervision-policy.contract.ts`: la política, el
      valor por defecto según el modo de operación, el parse estricto y el invariante
      (errores = bloqueo; advertencias = aviso).
- [x] 1.2 `modules/supervision/services/supervision-policy.service.ts`: lectura y
      escritura del parámetro del tenant (append-only + vista activa) y bumaneo de la
      revisión del snapshot.
- [x] 1.3 `modules/supervision/dto/supervision-policy.dto.ts`: el cuerpo entero + el
      guard de HTTP que impide guardar una política imposible.
- [x] 1.4 `modules/supervision/controllers/supervision-policy.controller.ts`:
      `GET /supervision/policy`, `PUT /supervision/policy`, `DELETE /supervision/policy`
      (restablecer es un verbo propio: es un acto explícito y auditable).
- [x] 1.5 Permiso `supervision:configure` (OWNER y MANAGER por defecto) + registro en el
      registro de transporte de rutas.
- [x] 1.6 La política viaja en el snapshot de configuración (payload, fingerprint,
      revisión) — el único canal de entrega.
- [x] 1.7 Pruebas: contrato (parse, defaults, invariante) y servicio (lectura, escritura,
      borrado, rechazo de la política imposible).

## Unidad 2 — El backoffice (HECHA, `4f5821a0`)

- [x] 2.1 `features/supervision/types.ts`: el vocabulario, el parse defensivo y el
      invariante espejo del servidor (las mismas palabras).
- [x] 2.2 `features/supervision/supervision-policy-card.tsx`: la tarjeta. Copy en
      palabras de negocio; el valor por defecto se nombra; cada opción explica su
      consecuencia; el invariante se explica antes de guardar; la verdad de la entrega
      (próxima sincronización) está a la vista.
- [x] 2.3 Permiso: sin `supervision:configure` no hay pestaña, no hay tarjeta y no hay
      consulta.
- [x] 2.4 La pestaña «Supervisión» en Configuración (direccionable por URL: `?tab=`).
- [x] 2.5 Pruebas de la tarjeta: el estado «sin definir», el bloqueo del invariante, el
      aviso que no bloquea, la honestidad de la entrega, el guardado, el restablecimiento
      y el error de carga.

## Unidad 3 — La terminal (HECHA)

- [x] 3.1 `SupervisionPolicy.tryParse`: parse estricto de una fuente no confiable
      (ausencia y corrupción se leen igual).
- [x] 3.2 `keepsShiftCloseCompletable`: el invariante del cierre de turno, en el
      terminal.
- [x] 3.3 Proyección en el snapshot: presente → se escribe; ausente o corrupta → se
      borra (semántica FULL de snapshot); una política imposible → NO se aplica
      (fallo seguro) y se registra el motivo.
- [x] 3.4 `FiscalProjectionKeys.currentVersion` 1 → 2 (repara las instalaciones que ya
      aplicaron la v1) + el nuevo key de proyección.
- [x] 3.5 Pruebas de proyección: se escribe, se borra, se rechaza la imposible, nunca se
      guarda una corrupta.

## Pendiente (fuera de este change)

- [ ] **La cola de revisión** de auto-autorizaciones en el backoffice: el dato ya está en
      la cadena forense del terminal; falta su presentación.
- [ ] **Permisos por persona** como criterio de autorización: exige llevar los permisos
      al terminal (extender `InboundSyncUserDto` y la tabla local de personal).
- [ ] **Un rol «encargado de turno»** propio en el vocabulario de roles.
