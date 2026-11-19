# Sistema de Inteligencia Creativa y Marketing (Creative Marketing Intelligence System)

Versión 1.4 · 18/11/2026

## Para qué existe

Separar explícitamente **investigación, estrategia, definición del brief, creación, crítica adversarial, dirección de arte, entregable estandarizado pre-render (CREATIVE PRODUCTION BRIEF en 6 secciones), ejecución programática (Remotion + Three.js), revisión comercial y analítica post-publicación en bucle cerrado**, operando mediante **cuatro roles agénticos separados** en lugar de un único agente creativo monolítico. Ninguna pieza entra a guion sin un **Creative Brief** de 9 puntos, ninguna activa **Remotion** o **Three.js** sin emitir el **CREATIVE PRODUCTION BRIEF** firmado por los 4 roles, ninguna entra a render sin pasar al **Creative Critic**, y ninguna publicación se juzga exitosa por reproducciones vanidosas.

Conecta directamente con:
- [Sistema de producción de contenido (5 Ejes y Matriz)](./nhilos_content_system_v1.0.md)
- [Principios de experiencia de marca](../nhilos_brand_experience_principles_v1.0.md)
- [Auditoría de claims OD-02](../branding/claims/product_claim_audit_od02_v1.3.md)
- [Playbook de retención](../manuals/nhilos_video_playbook_retencion_v1.0.md)
- [Registro de publicaciones](./registro_publicaciones.md)
- [Toolbox de producción de video](./nhilos_video_production_toolbox_v1.0.md)

---

## Topología Multi-Agente: Los 4 Roles Especializados (Prohibido un Único Agente Creativo)

Un único agente creativo tiende a justificar sus propias ideas, diluir el porqué comercial y decorar escenas sin rigor. Por eso el sistema divide la cognición en **4 agentes especializados con separación de poderes** (invocados como subagentes independientes `define_subagent`/`invoke_subagent` o miembros de `swarm`):

| Agente (`roster`) | Responsabilidad central | Fases que opera | Skills que carga | Secciones que posee en el Brief | Frontera / Prohibición estricta |
|---|---|---|---|---|---|
| **Marketing Strategist** (`marketing-strategist`) | **Decide qué comunicar y por qué.** | FASE 01 · INTELLIGENCE, FASE 02 · STRATEGY, entrada de FASE 03 (`brief`) y FASE 06 · PERFORMANCE | `audience-research`, `competitor-analysis`, `content-research-and-sourcing`, `brand-profile`, `social-strategy`, `content-pillars`, `creative-brief-director`, `content-performance-analyst` | **1. Estrategia** + semilla de hipótesis medible | Prohibido redactar guiones literarios, escoger animaciones o juzgar su propio ángulo. |
| **Creative Strategist** (`creative-strategist`) | **Encuentra conceptos y desarrolla narrativas.** | FASE 03 · CREATIVE DEVELOPMENT y derivación editorial (`content-repurposing`) | `viral-reverse-engineering`, `idea-generation-and-ideation`, `hook-writer`, `storytelling-and-narrative`, `short-form-video-script`, `writing-style-and-tone`, `scripting-and-storyboarding`, `content-repurposing` | **2. Concepto creativo** y **3. Guion** | Prohibido cambiar el dolor `D#`/CTA fijado por `Marketing Strategist`, definir código Remotion/Three.js o auto-aprobarse. |
| **Art Director** (`art-director`) | **Convierte conceptos en instrucciones visuales.** | FASE 04 · ART DIRECTION (antes de Remotion / Three.js) | `art-direction`, `motion-graphics`, `nhilos-video-showcase` (contrato visual), `viral-reverse-engineering` (mecanismo visual) | **4. Dirección de arte** y **5. Especificaciones técnicas** | Prohibido alterar la tesis, la oferta o el CTA del guion aprobado; prohibido abrir código TSX/Three.js antes de pasar al `Creative Critic`. |
| **Creative Critic** (`creative-critic`) | **Cuestiona y valida antes de producir.** | Compuerta 1 (post-FASE 03), Compuerta 2 (post-FASE 04) y FASE 05 · CREATIVE REVIEW (`PRE-RENDER` + `POST-RENDER`) | `creative-critic`, `creative-content-review`, `video-understand` | **6. Validación** (veredicto y lista de correcciones) | **Prohibido crear conceptos, guiones o escenas de reemplazo.** Solo interroga, veta (`KILL_OR_CUT` / `CORRECTION_LIST`) o aprueba (`PASS_TO_PRODUCTION` / `APPROVED`). |

### Secuencia obligatoria de relevo y veto entre los 4 roles

1. **`Marketing Strategist`** investiga (`FASE 01`), fija estrategia/rotación (`FASE 02`), cierra los 9 puntos en `creative-brief-director` y bloquea la **Sección 1 (`1. Estrategia`)** del **CREATIVE PRODUCTION BRIEF**.
2. **`Creative Strategist`** recibe la Sección 1 cerrada, diseña conceptos, 3 pares `[Hook Verbal + Hook Visual]` y el guion en 3 pistas + storyboard agnóstico, entregando las **Secciones 2 (`Concepto creativo`) y 3 (`Guion`)**.
3. **`Creative Critic` (Compuerta 1 — Concepto y Guion)** audita con las 7 preguntas adversariales (`creative-critic`). Si falla `Q1..Q5` o `Q7`, devuelve con **`KILL_OR_CUT`** al **`Creative Strategist`** (no se pasa a dirección de arte).
4. **`Art Director`** convierte las Secciones 2–3 aprobadas en la **Sección 4 (`Dirección de arte`)** y la **Sección 5 (`Especificaciones técnicas` para Remotion / Three.js)** dentro del **CREATIVE PRODUCTION BRIEF**.
5. **`Creative Critic` (Compuerta 2 — Pre-Render y Decoración Visual)** evalúa `Q6` (*¿aporta algo o es decoración?* + 4 pruebas 3D/Isométricas) y las compuertas `PRE-RENDER` de `creative-content-review`, firmando la **Sección 6 (`Validación`)** con **`PASS_TO_PRODUCTION`**.
6. **Ejecución programática (`Remotion` / `Three.js`) → Auditoría Post-Render → Analítica Real:** solo tras la firma de los **4 roles** (`agent_roles_signoff`) se renderiza en `apps/showcase_video`; el **`Creative Critic`** verifica el MP4/stills finales (`POST-RENDER` con `video-understand` y `360px`), y tras publicar el **`Marketing Strategist`** cierra el bucle en **FASE 06** contrastando las hipótesis de la Sección 6.

### Contrato de Delegación en Runtime (Antigravity Subagents / Swarm)

Al ejecutar una pieza nueva con múltiples agentes, el orquestador **NO concentra los 4 roles en una sola conversación**: instancia 4 especialistas con su propio contrato de lectura de skills:
- `marketing-strategist` *(solo estrategia y datos)*: carga `audience-research`, `competitor-analysis`, `content-research-and-sourcing`, `brand-profile`, `social-strategy`, `content-pillars`, `creative-brief-director`, `content-performance-analyst`.
- `creative-strategist` *(solo concepto y narrativa)*: carga `viral-reverse-engineering`, `idea-generation-and-ideation`, `hook-writer`, `storytelling-and-narrative`, `short-form-video-script`, `writing-style-and-tone`, `scripting-and-storyboarding`.
- `art-director` *(solo visual y especificaciones Remotion/Three.js)*: carga `art-direction`, `motion-graphics`, `nhilos-video-showcase`.
- `creative-critic` *(solo cuestionamiento y QA independiente)*: carga `creative-critic`, `creative-content-review`, `video-understand`.

### Biblioteca Física de Videos de Referencia

Al iniciar cualquier pieza nueva, el equipo consulta los videos de referencia almacenados localmente en:
- **Windows:** `C:\Users\Octavio Morales\Pictures\nhilos\referencias`
- **WSL2 / Linux:** `/mnt/c/Users/Octavio Morales/Pictures/nhilos/referencias`

*(Nota de entorno: si la carpeta está vacía o el runtime está en sandbox sin unidad `C:\` montada, el agente documenta la verificación y trabaja con la biblioteca `v1..v9` o los clips provistos por el usuario, sin inventar contenido no visto.)*

Cómo entra en el flujo de los 4 roles:
1. **`Marketing Strategist` y `Creative Strategist`** inspeccionan los clips elegidos de `referencias` mediante [`viral-reverse-engineering`](../../../.agents/skills/viral-reverse-engineering/SKILL.md) + `video-understand` (`-threads 1 -filter_threads 1`) y completan la **Case Study Card** de 6 preguntas para aislar el mecanismo estructural reutilizable.
2. **`Art Director`** cita obligatoriamente el nombre exacto del video de referencia y el mecanismo de ritmo/encuadre/transición adoptado en la **Sección 4 (`Dirección de arte` → `Referencias visuales`)** del **CREATIVE PRODUCTION BRIEF**.
3. **`Creative Critic`** audita que se haya adaptado la estructura y mecánica narrativa, nunca copiado el estilo superficial ni repetido el patrón `T5` monotónico.

---

## Arquitectura Creativa en 6 Fases + Ejecución Dual (Bucle Cerrado)

```text
  ▲  [RETROALIMENTACIÓN DEL SISTEMA -> Marketing Strategist] ────────┐
  │                                                                 │
FASE 01 · INTELLIGENCE          [Rol: Marketing Strategist]         │
  audience-research · competitor-analysis · viral-reverse-engineering · content-research-and-sourcing
  └─▶ Resultado: investigación, insights, casos de estudio (6 preguntas), cifras verificadas y oportunidades.
          │                                                         │
          ▼                                                         │
FASE 02 · STRATEGY              [Rol: Marketing Strategist]         │
  brand-profile · social-strategy · content-pillars                 │
  └─▶ Resultado: objetivo, audiencia, mensaje, 4 preguntas estratégicas, tupla de 5 Ejes + Sección 1 del Brief.
          │                                                         │
          ▼                                                         │
FASE 03 · CREATIVE DEVELOPMENT  [Rol: Creative Strategist]          │
  creative-brief-director -> idea-generation-and-ideation · hook-writer · storytelling-and-narrative · short-form-video-script · writing-style-and-tone · scripting-and-storyboarding
     ◀──▶ [Compuerta 1: Creative Critic] (cuestiona con 7 preguntas; veto KILL_OR_CUT)
  └─▶ Resultado: Secciones 2 y 3 del Brief (concepto, guion en 3 pistas, 3 hooks y storyboard agnóstico).
          │                                                         │
          ▼                                                         │
FASE 04 · ART DIRECTION         [Rol: Art Director]                 │
  art-direction ◀──▶ [Compuerta 2: Creative Critic] (Q6 decoración vs utilidad + PRE-RENDER)
  └─▶ Entregable firmado por 4 roles: CREATIVE PRODUCTION BRIEF (6 secciones) -> Secciones 4, 5 y 6 cerradas.
          │                                                         │
          ├──────────────────────────────────┐                      │
          ▼                                  ▼                      │
  EJECUCIÓN · REMOTION               EJECUCIÓN · THREE.JS           │
  (nhilos-video-showcase +           (Escenas 3D, objetos,          │
   motion-graphics)                   iluminación; 4 pruebas 3D)    │
          └──────────────────────────────────┬──────────────────────┘
                                             ▼                      │
FASE 05 · CREATIVE REVIEW       [Rol: Creative Critic -> Creative Strategist (Repurposing)]
  creative-content-review (POST-RENDER: video-understand + 360px) (+ content-repurposing tras aprobación)
  └─▶ Resultado: Pieza aprobada (APPROVED) o Lista de correcciones (CORRECTION_LIST -> Fase 03 / Fase 04 / Ejecución).
          │                                                         │
          ▼                                                         │
FASE 06 · PERFORMANCE & FEEDBACK LOOP  [Rol: Marketing Strategist]  │
  content-performance-analyst ──────────────────────────────────────┘
  └─▶ Contrasta hipótesis de Sección 6 (retención, guardados, compartidos, intención comercial y leads; cero métricas vanidosas).
```

---

## Inventario de las 19 Skills por Fase (14 adaptadas + 5 propias)

### FASE 01 · INTELLIGENCE (Investigación)

| Skill | Qué resuelve en NHILOS | Regla crítica |
|---|---|---|
| [`audience-research`](../../../.agents/skills/audience-research/SKILL.md) | Dolores hablados del dueño-operador (`D1..D15`), cajero y contador | Expresar dolores en voz del dueño, nunca como módulos |
| [`competitor-analysis`](../../../.agents/skills/competitor-analysis/SKILL.md) | Mapa competitivo POS Nicaragua/LATAM y brechas reales | Exponer imprecisiones del mercado sin atacar competidores |
| [`viral-reverse-engineering`](../../../.agents/skills/viral-reverse-engineering/SKILL.md) | Deconstruir la biblioteca de Reels (`v1..v9`) como casos de estudio | Usar `video-understand` y responder las **6 preguntas de caso** |
| [`content-research-and-sourcing`](../../../.agents/skills/content-research-and-sourcing/SKILL.md) | Respaldar cifras con aritmética condicional (`"si..."`), leyes e inventario real | Ninguna afirmación sin respaldo verificable (Compuerta #5) |

---

### FASE 02 · STRATEGY (Estrategia y Posicionamiento)

| Skill | Qué resuelve en NHILOS | Regla crítica |
|---|---|---|
| [`brand-profile`](../../../.agents/skills/brand-profile/SKILL.md) | Identidad maestra (`NHILOS` / `NHILOS POS`), diferenciadores y límites OD-02 | Cero hype, cero jerga técnica en copy |
| [`social-strategy`](../../../.agents/skills/social-strategy/SKILL.md) | Objetivo, rol de plataforma (TikTok, IG, FB) y CTA único | Bloquea toda pieza que no responda las **4 preguntas estratégicas** |
| [`content-pillars`](../../../.agents/skills/content-pillars/SKILL.md) | Pilares temáticos y matriz publicada de 5 Ejes | Regla anti-monotonía: no repetir `(D#, T#)` ni últimos 2 `T#` |

---

### FASE 03 · CREATIVE DEVELOPMENT (Desarrollo Creativo)

| Skill | Qué resuelve en NHILOS | Regla crítica |
|---|---|---|
| [`creative-brief-director`](../../../.agents/skills/creative-brief-director/SKILL.md) *(Propia)* | Fija antes de producir los **9 campos del Creative Brief** (objetivo, audiencia/conciencia, dolor, mensaje único, ángulo, emoción, hook visual/verbal, CTA, formato/duración) | Bloquea guionado si falta precisión o mezcla dos objetivos/mensajes |
| [`idea-generation-and-ideation`](../../../.agents/skills/idea-generation-and-ideation/SKILL.md) | Sintetizar insights + mecanismo + evidencia en 3 conceptos | Producir argumentos causales, nunca tours de pantallas |
| [`hook-writer`](../../../.agents/skills/hook-writer/SKILL.md) | Aperturas 0–3s que interrumpen el scroll | Exige **Tríada**: Hook con tensión + Hook visual (frame 0) + Hook cinético |
| [`storytelling-and-narrative`](../../../.agents/skills/storytelling-and-narrative/SKILL.md) | Arco causal, escalamiento condicional y contraste problema/solución | Sustituir secuencia de pantallas por causa y efecto |
| [`short-form-video-script`](../../../.agents/skills/short-form-video-script/SKILL.md) | Guiones 9:16 en 3 pistas (`Visual`, `On-screen`, `Locución TTS`) | Estructura `dolor → mecanismo → prueba → cifra → llamado temprano` |
| [`writing-style-and-tone`](../../../.agents/skills/writing-style-and-tone/SKILL.md) | Español nicaragüense sobrio, preciso y copy separado por red | Cero contradicción entre texto e imagen |
| [`scripting-and-storyboarding`](../../../.agents/skills/scripting-and-storyboarding/SKILL.md) | Storyboard agnóstico por beats (`30fps`, `T1..T7`, transiciones de estado) | Puente formal hacia `art-direction` (Fase 04) |
| [`creative-critic`](../../../.agents/skills/creative-critic/SKILL.md) *(Propia)* | Agente adversarial que **cuestiona** (no crea) mediante **7 preguntas obligatorias** | Emite `PASS_TO_PRODUCTION` o `KILL_OR_CUT` contra ideas genéricas, monotonía, escenas sobrantes o decoración visual |

---

### FASE 04 · ART DIRECTION (Dirección de Arte)

| Skill | Qué resuelve en NHILOS | Artefacto de salida |
|---|---|---|
| [`art-direction`](../../../.agents/skills/art-direction/SKILL.md) *(Propia)* | Descomposición de escenas, referencias, retícula, movimiento, transiciones, recursos gráficos y contrato técnico Remotion/Three.js (auditado por `creative-critic`) | **CREATIVE PRODUCTION BRIEF en 6 secciones** (`production-brief-template.md` + `production-brief-schema.json`) |

---

### FASE 05 · CREATIVE REVIEW y Distribución

| Skill | Qué resuelve en NHILOS | Resultado |
|---|---|---|
| [`creative-content-review`](../../../.agents/skills/creative-content-review/SKILL.md) *(Propia)* | Valida **mensaje, claridad, ritmo, coherencia visual, calidad técnica y objetivo comercial** (`PRE-RENDER` y `POST-RENDER` con `video-understand` y prueba a `360px`) | **Pieza aprobada** (`APPROVED`) o **Lista de correcciones** (`CORRECTION_LIST`) |
| [`content-repurposing`](../../../.agents/skills/content-repurposing/SKILL.md) | Adapta la pieza aprobada a 9:16 video, 4:5 carrusel IG, 9:16 TikTok Photo Mode y Web | Recompone zonas seguras sin estirar lienzos |

---

### FASE 06 · PERFORMANCE & FEEDBACK LOOP (Analítica Real)

| Skill | Qué resuelve en NHILOS | Regla crítica |
|---|---|---|
| [`content-performance-analyst`](../../../.agents/skills/content-performance-analyst/SKILL.md) *(Propia)* | Analiza retención/tiempo promedio, completado, compartidos, guardados, comentarios con intención comercial, visitas al perfil y leads/conversiones | **Prohibido concluir éxito solo por reproducciones**; actualiza `registro_publicaciones.md` y retroalimenta la siguiente FASE 01 |

---

## Entregable Estandarizado Pre-Render: CREATIVE PRODUCTION BRIEF (Compuerta hacia Remotion / Three.js)

Antes de activar **Remotion** (`nhilos-video-showcase` + `motion-graphics`) o **Three.js**, el agente debe emitir una salida única y estandarizada en **6 secciones** conforme a [production-brief-template.md](../../../.agents/skills/art-direction/assets/production-brief-template.md) y su esquema JSON [production-brief-schema.json](../../../.agents/skills/art-direction/assets/production-brief-schema.json):

| Sección del Brief | Rol propietario | Campos obligatorios | Skills que la alimentan |
|---|---|---|---|
| **1. Estrategia** | **Marketing Strategist** | Objetivo de marketing · Público objetivo · Insight del consumidor · Problema o deseo (`D1..D15`) · Mensaje principal · Etapa del embudo (`TOFU/MOFU/BOFU`) | `audience-research`, `competitor-analysis`, `content-research-and-sourcing`, `brand-profile`, `social-strategy`, `content-pillars`, `creative-brief-director` |
| **2. Concepto creativo** | **Creative Strategist** | Nombre del concepto · Idea central · Ángulo de comunicación · Emoción buscada · Diferenciación | `idea-generation-and-ideation`, `creative-brief-director`, desafiado por `creative-critic` |
| **3. Guion** | **Creative Strategist** | 3 alternativas de hook (`[Verbal + Visual Frame 0]`) · Hook seleccionado y justificación · Desarrollo narrativo · Clímax o revelación · Resolución · CTA (`DEMO`/`CONTROL`) · Voz en off y textos en pantalla | `hook-writer`, `storytelling-and-narrative`, `short-form-video-script`, `writing-style-and-tone` |
| **4. Dirección de arte** | **Art Director** | Referencias visuales (`v1..v9`) · Paleta y composición (`safe zones` y legibilidad `360px`) · Storyboard por escena (`T1..T7`) · Movimiento de cámara (`Macro-Zoom >= 1.6`, reset `f45–f60`) · Transiciones · Diseño sonoro · Duración de cada escena | `viral-reverse-engineering`, `scripting-and-storyboarding`, `art-direction` |
| **5. Especificaciones técnicas** | **Art Director** | Motor (`Remotion` / `Three.js` / `HyperFrames` / `Híbrido`) · Componentes y assets necesarios · Animaciones · Resolución y formato (`1080×1920` / `1080×1350`, `30fps`) · Timing de cada elemento (`remotion_execution_spec`, `threejs_execution_spec`, `audio_execution_spec` y `hyperframes_execution_spec` opcional) | `art-direction` → consumido por `nhilos-video-showcase`, `motion-graphics`, runtime **Three.js**, **HyperFrames + GSAP** y `scripts/audio` |
| **6. Validación** | **Creative Critic** | Coherencia con la marca · Calidad del hook · Claridad del mensaje · Potencial de retención · Capacidad de generar acción · **Hipótesis que se medirán al publicar** *(medidas por Marketing Strategist)* | `creative-critic`, `creative-content-review` → contrastado en **FASE 06** por `content-performance-analyst` |

---

## Cómo se conecta el Production Brief (Sección 5) con Remotion, Three.js y audio

El **Production Brief** emitido por [`art-direction`](../../../.agents/skills/art-direction/SKILL.md) divide la capa de ejecución en tres contratos sincronizados sobre la misma línea de tiempo (`1080×1920`, `30fps`), sin permitir que decisiones de copy o estrategia se improvisen dentro del código:

1. **Bloque `remotion_execution_spec` → Remotion (`nhilos-video-showcase` + `motion-graphics`):**
   - Controla la línea de tiempo maestra (`<Series.Sequence>` en `apps/showcase_video`), los presupuestos de frames con `20–30` frames de aire sobre el audio `edge-tts`, la tipografía cinética (`Renogare`, `Achemost`, `Poppins`), tablas/tarjetas de costos (`T2`, `T4`), demostraciones reales de UI (`T5`) con coreografía de cursor (`4` frames de asentamiento + `FALLBACK_TARGETS`) y transiciones concéntricas `absolute inset-0` sin flash blanco.
   - Define el orden de apilamiento (`layer_stack_order`) donde una escena 3D o SVG convive detrás de los textos cinéticos y del overlay en zonas seguras (`top >= 130px`, `bottom >= 280px–320px`, `right >= 120px`).

2. **Bloque `threejs_execution_spec` → Three.js (Escenas 3D, objetos e iluminación):**
   - Solo se habilita (`enabled: true`) cuando el beat aprueba las **4 pruebas obligatorias** de [`nhilos_content_system_v1.0.md`](./nhilos_content_system_v1.0.md) y supera la pregunta Q6 de `creative-critic` (*"¿aporta algo o es decoración?"*).
   - Especifica cámara (`OrthographicCamera` 2:1 o `PerspectiveCamera`), geometrías/objetos, paleta de iluminación (`#003757`, `#00BF81`, `#F59E0B`, `#EF4444`) y animación **determinista por frame** (`progress = interpolate(frame, [start, end], [0, 1])`, nunca reloj en tiempo real).
   - **Modos de integración compatibles con el stack actual (React 19):** Como `@remotion/three` + `@react-three/fiber` v8 fallan con React 19 al crear el contexto WebGL (`nhilos_content_system_v1.0.md`), `art-direction` selecciona explícitamente el modo operativo permitido:
     - `imperative_webgl_synced_to_remotion_frame`: `THREE.WebGLRenderer` en `<canvas>` manejado por `useCurrentFrame()`.
     - `pre_rendered_alpha_sequence`: Escena Three.js renderizada aparte en secuencia PNG/WebM transparente y compuesta en Remotion.
     - `r3f_v9_aligned`: Solo tras validar `@react-three/fiber` v9 en una composición mínima aislada.
     - `svg_2_1_fallback`: Vector isométrico 2:1 nativo dentro de Remotion cuando las líneas planas ofrecen mayor nitidez móvil.

3. **Bloque `audio_execution_spec` → mezcla determinista (`scripts/audio`):**
   - Voz (`edge-tts`), música y SFX comparten la misma línea de frames. Cada cue declara `frame`, `kind`, `source`, `gain_db` y `pan`; el mixer resuelve `uisfx` (CC0), archivos locales `assets/sfx` (CC0/PDM) o `synth` de respaldo, sin descargar nada en tiempo de render.
   - `python3 -m scripts.audio.mixer <spec> --out <render>` aplica `adelay`/`amix`/`alimiter` y normaliza a `-14 LUFS / -1 dBTP / LRA <= 6`; `python3 -m scripts.audio.qa <render> --json` emite la evidencia de las compuertas `A1..A5`.
   - Openverse se usa **antes** del render: `python3 -m scripts.audio.source_openverse fetch --query ... --role ...` filtra CC0/PDM y escribe `assets/sfx/licenses.json` con `sha256`; el render queda offline-first.
   - Handoff opcional a Real SFX (`from_cues.py` + `mix.py`) para bibliotecas locales; Earshot queda como adaptador de medición/crítica, no como dependencia del render.

4. **Bloque `hyperframes_execution_spec` (opcional) → HyperFrames + GSAP:**
   - Se habilita (`enabled: true`) para motion graphics cortos, highlights y anotaciones sobre capturas reales de producto, tarjetas de cifras (`T2`/`T4`), lower-thirds y overlays transparentes (`webm_alpha` VP9 / `mov_alpha`) que pueden componerse sobre grabaciones de producto o escenas 3D.
   - Exige determinismo estricto offline (GSAP local vendored, `@font-face` local, `gsap.timeline({ paused: true })` en `window.__timelines["<id>"]`, `tl.seek(0)`) y ejecución en WSL2 con `--no-browser-gpu --workers 1`.
   - **Cierre de audio:** si la pieza lleva audio, **nunca** se usa `normalize-audio` de HyperFrames; el mix y loudness final (`-14 LUFS / -1 dBTP / LRA <= 6`) cierran siempre en `scripts/audio`. Ver el contrato completo y métricas verificadas en [Toolbox de producción de video](./nhilos_video_production_toolbox_v1.0.md).
