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

---

## RESULTADO (2026-10-08)

**Commits empujados:** `a2ad8b3b` (documentos ODD trackeados) y `4909e280` (reorganización).
Rama `feat/nhilos-branding-reality-audit`, 20 commits totales.

### Estructura final

```text
docs/nhilos/branding/
  README.md                 índice: qué es, orden de lectura, qué NO está acá, reglas de edición
  gobernanza/               gobernanza del set + informe de auditoría de realidad
  identidad/                brief de identidad + paquete de inicio de diseño
  claims/                   registro de claims verificado (OD-02)
  web/                      brief de marketing, IA, contenido de homepage, spec no funcional
  producto/                 contenido de página de producto, inventario de medios
```

`Recursos/` disuelta. Tres copias eliminadas y referencias redirigidas a la canónica en
`docs/nhilos/` — incluida la plantilla de auditoría de módulo, ahora en su versión vigente **v2.1**
en lugar de la copia de v1.0.

### El dato que justificó la deduplicación

La copia del estándar de backoffice estaba **19 líneas por detrás** de su canónica: le faltaban las
secciones 17.5 y 26.1 y varios párrafos. Una copia que ya divergió en silencio es la prueba de que
copiar estándares no funciona.

### Integridad de enlaces: el riesgo real

155 enlaces relativos cruzan los documentos. Dos intentos fallidos antes del correcto:

1. **77 rotos** — el script solo recalculaba enlaces cuyo *destino* se movía, y saltaba los que
   apuntaban a documentos que no se movieron (la constitución) aunque **la fuente sí se movió**.
2. **48 rotos** — al corregir, recalculé por segunda vez enlaces que ya estaban bien, aplicando el
   desplazamiento dos veces.

**Solución:** reescribir desde el contenido de `HEAD` con una **sola** pasada y la fórmula
`relpath(MAP(destino), dir_nueva_fuente)`, aplicada a **todos** los enlaces relativos. Resultado
verificado: **155 enlaces, 0 rotos**, conteos intactos (43 / 61 / 34).

**Nota de proceso:** `git reset --hard` fue bloqueado por la política de seguridad del harness, y
estuvo bien. Leer el contenido original con `git show HEAD:<ruta>` y reescribir desde ahí es
equivalente, no destructivo y auditable.
