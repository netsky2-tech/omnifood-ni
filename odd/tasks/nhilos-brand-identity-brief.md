# NHILOS — Brief de Identidad de Marca y Paquete de Inicio para Diseño

**Origen:** pedido del usuario — completar la capa de branding que falta y dejar listos los
documentos para que el diseñador arranque las web comerciales.
**Base:** `origin/main` = `b4b5ad27`. Rama: `feat/nhilos-branding-reality-audit`.
**Estado:** EN CURSO.

---

## Decisiones del usuario (2026-10-08)

| # | Decisión | Valor elegido |
|---|---|---|
| D1 | Constitución legal de la empresa | **Posterior.** Se constituye solo si el negocio da frutos. Dominio ya comprado. |
| D2 | Prototipo de estructura y copy | **En paralelo**, con la documentación existente. |
| D3 | Brief de identidad | **Escribirlo** con lo que hay. |
| D4 | Logo | **Dejar la evaluación como sugerencia al diseñador.** El diseñador propuso **rehacer el logo con concepto de telaraña** (una red que une y mantiene juntos los procesos) en lugar de la aguja, que "no aporta nada". |

---

## Diagnóstico verificado del estado de marca

| Hecho | Evidencia |
|---|---|
| No existe ningún documento de identidad visual | `find docs -iname "*identity*"` → solo PRDs de identidad de *acceso*, nada de marca |
| La constitución exige el sistema de identidad y lo declara futuro | `nhilos_brand_experience_principles_v1.0.md` §49 paso 4 y §22 (master tokens → product expression rules → productos) |
| La secuencia documental que falta está escrita | BP `:1443-1458`: `brand_identity_system` → `verbal_identity_guide` → `product_expression_specs/` → `experience_playbooks/` |
| Existe un logo en uso | `apps/owner_dashboard/public/logo.png` (2161×2161 RGBA): N navy + aguja con hilo verde + "POS" apilado |
| El favicon del dashboard NO es el logo | `apps/owner_dashboard/public/favicon.svg` usa `#863bff`, `#7e14ff`, `#47bfff` (violeta/celeste) |
| El verde del logo no está en la paleta documentada | Paleta del estándar POS: `#059669 #0F172A #0F292E #1E3A40 #3949AB #795548 #D97706 #DC2626 #E2E8F0 #F8FAFC #FFFFFF` |
| Existen tokens de producto implementados | `apps/pos_app/lib/ui/design_system/nhilos_tokens.dart` (77 líneas; color, radios, tipografía) |
| Dirección visual existe como principio, no como sistema | BP §23 (70/20/10, "cuidado no caro") y §24 (fotografía) |

---

## Tareas

### T1 · Brief de identidad de marca
1. Crear `docs/nhilos/branding/nhilos_brand_identity_brief_v0.1.md`.
2. Recapitular el núcleo de marca desde la constitución, sin reeditarlo.
3. Documentar el estado verificable y la evaluación del mark actual como **sugerencia**, no como orden.
4. Capturar la propuesta de telaraña del diseñador como una dirección a explorar, con su análisis de riesgo semántico en español y alternativas.
5. Fijar restricciones no negociables, entregables, estructura técnica requerida y criterios de aceptación.

**Checks:** el brief no se autodeclara autoridad; cita secciones de la constitución; no inventa hex ni tipografías.
**Commit evidencia:** pendiente.

### T2 · Paquete de inicio para diseño
1. Crear `docs/nhilos/branding/nhilos_design_kickoff_handover_v0.1.md`.
2. Orden de lectura obligatorio con el aporte de cada documento.
3. Alcance del prototipo web, reglas no negociables, decisiones tomadas y decisiones abiertas.

**Checks:** todos los documentos listados existen en la ruta indicada.
**Commit evidencia:** pendiente.

### T3 · Gobernanza
1. Registrar los dos documentos nuevos en el registro de `nhilos_branding_document_governance_v1.0.md`.
2. Agregar la capa de identidad a la cadena de autoridad.
3. Declarar el roadmap de documentos de marca que siguen faltando, para que no se pierdan.

**Checks:** registro, cadena y archivos reales coinciden.
**Commit evidencia:** pendiente.

### T4 · Verificación
1. Verificación independiente del lote nuevo: rutas citadas, referencias cruzadas, conteos, vocabulario prohibido, y que ningún documento nuevo altere un claim publicado.

**Checks:** informe con PASS/FAIL por punto.
**Commit evidencia:** pendiente.

---

## RESULTADO (2026-10-08)

**2 commits empujados:** `5cf8f6c8` (brief + paquete + gobernanza) y `71bc8e45` (corrección de 7
defectos). Rama `feat/nhilos-branding-reality-audit`, 17 commits totales.

| Entregable | Estado |
|---|---|
| `nhilos_brand_identity_brief_v0.1.md` | Encargo de identidad: núcleo, `R-01`..`R-11`, 3 direcciones, entregables, criterios de aceptación |
| `nhilos_design_kickoff_handover_v0.1.md` | Paquete operativo: 3 frentes, orden de lectura, alcance, decisiones tomadas y abiertas |
| `nhilos_branding_document_governance_v1.0.md` | Capa de identidad en la cadena, registro ampliado, roadmap con disparadores |

### Error propio, detectado por verificación

El brief declaraba que el favicon del dashboard contradecía el logo. **Es falso:**
`apps/owner_dashboard/index.html` carga `/favicon.png`, byte-idéntico a `logo.png` (mismo hash).
Yo encontré `favicon.svg` (violeta), asumí que era el favicon activo sin mirar el `index.html`, y
lo usé como una de las dos "pruebas vivas" de la brecha. Retractado en `71bc8e45`. Lo que sí
sobrevive: el verde del logo (`#00BE84`) no está en la paleta documentada.

Otros 6 defectos corregidos: paleta citada al revés (incluía los dos colores que el estándar
prohíbe y omitía `#64748B`), atribución exagerada a §49 (el sistema de identidad está **diferido**
por §47/§48, no exigido), `R-04` citando una sección inexistente, `R-11` sin fuente, rutas
atribuidas falsamente a aprobación de la IA, y una capacidad de 80 mm afirmada sin fila de
registro.

### Decisión de diseño registrada

El diseñador propuso rehacer el logo con concepto de **telaraña**. El brief la explora en serio
(la intuición —una red que mantiene junto lo separado— es correcta) y deja escritos los riesgos
semánticos en español: descuido/abandono, trampa de depredador, *enredado* = confuso (lo opuesto a
la claridad que la marca promete), fragilidad, y cliché de software empresarial. Se ofrece una
tercera dirección que conserva la metáfora sin el riesgo: **el tejido** (urdimbre y trama).

Sobre el mark actual: la idea del hilo se conserva porque el `N` ya la encarna; lo que falla es la
construcción —líneas finas de color que no sobreviven el ticket térmico a 1 bit ni 16 px— y la
aguja, que es instrumento y no significado. Queda como **sugerencia**, no como orden.
