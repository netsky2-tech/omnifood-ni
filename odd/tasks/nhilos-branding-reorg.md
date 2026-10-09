# NHILOS — Reorganización del set de branding y deduplicación

**Origen:** pedido del usuario — incluir los documentos ODD en la rama, deduplicar `Recursos/`
(dissolviéndola si no tiene razón de ser) y ordenar los documentos de forma lógica.
**Base:** `origin/main` = `b4b5ad27`. Rama: `feat/nhilos-branding-reality-audit`.
**Estado:** EN CURSO.

---

## Diagnóstico

`docs/nhilos/branding/` tenía 9 documentos en la raíz y una carpeta `Recursos/` con 5 archivos, de
los cuales **3 eran copias** de documentos canónicos que viven en `docs/nhilos/`:

| Archivo en `Recursos/` | Naturaleza | Problema |
|---|---|---|
| `nhilos_pos_experience_standard_v1.0.md` | Copia | Idéntica a la canónica |
| `nhilos_backoffice_experience_standard_v1.0.md` | Copia | **19 líneas por detrás** de la canónica |
| `nhilos_backoffice_module_audit_template_v1.0.md` | Copia | Superada: la canónica vigente es `_v2.1.md` (la referencia `AGENTS.md`) |
| `nhilos_website_non_functional_spec_v1.0.md` | **Original** | — |
| `product_claim_audit_od02_v1.3.md` | **Original** | — |

Una copia que puede divergir de su fuente es el defecto de **dueño duplicado** que esta auditoría
ya corrigió una vez (la copia byte-idéntica de Brand Principles). `Recursos` no tiene razón de ser:
mezcla "recursos" con "originales del set", y su nombre no dice nada.

## Estructura objetivo

Agrupada por el rol de cada documento en la cadena de autoridad:

```text
docs/nhilos/branding/
  README.md                                              índice y orden de lectura
  gobernanza/      gobernanza del set + informe de auditoría
  identidad/       brief de identidad + paquete de inicio de diseño
  claims/          registro de claims verificado (OD-02)
  web/             brief de marketing, IA, contenido de homepage, spec no funcional
  producto/        contenido de página de producto, inventario de medios
```

`Recursos/` se disuelve. Las copias se eliminan y toda referencia a ellas se redirige a la
canónica en `docs/nhilos/`.

## Riesgo declarado

Mover archivos rompe enlaces relativos: hay **261 enlaces con ancla** recién verificados y ~15
menciones de ruta en backticks (registro de gobernanza, cadena, paquete de inicio). El script
reescribe los enlaces **antes** de mover, resolviendo cada destino en la estructura vieja y
recalculando la ruta relativa en la nueva.

## Tareas

### T1 · Incluir los documentos ODD en la rama
1. Copiar los tres `odd/tasks/nhilos-*.md` del checkout principal al worktree y commitearlos.

**Checks:** los tres quedan trackeados en la rama.
**Commit evidencia:** pendiente.

### T2 · Reorganizar y deduplicar
1. Reescribir enlaces relativos con el mapa viejo → nuevo.
2. Reescribir menciones de ruta en backticks (formas `docs/…`, `branding/…`, `Recursos/…`).
3. `git mv` a la estructura nueva; eliminar las tres copias.
4. Redirigir las referencias a las copias hacia la canónica.

**Checks:** cero rutas muertas; cero referencias a archivos eliminados.
**Commit evidencia:** pendiente.

### T3 · README índice
1. Crear `docs/nhilos/branding/README.md`: qué es cada documento, orden de lectura, y qué NO está acá.

**Checks:** todos los documentos del set aparecen listados con su ruta real.
**Commit evidencia:** pendiente.

### T4 · Verificación
1. Verificación independiente: enlaces, rutas, conteos, y que no quede referencia a `Recursos/`.

**Checks:** informe con PASS/FAIL.
**Commit evidencia:** pendiente.
