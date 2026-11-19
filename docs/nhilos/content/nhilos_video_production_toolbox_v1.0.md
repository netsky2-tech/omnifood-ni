# NHILOS · Toolbox de Producción de Video

Versión 1.0 · 19/11/2026

## 1. Propósito y principio de coexistencia

Este documento define el stack técnico canónico para producir piezas de video, motion graphics y overlays en NHILOS / OmniFood NI. Fija qué motor usar según el tipo de pieza, las versiones y licencias verificadas, las reglas operativas en WSL2 y el cierre de audio obligatorio.

**Principio de coexistencia:**

- **No reemplaza el pipeline 3D aprobado.** El pipeline `Three.js + Playwright + Python/FFmpeg` sigue intacto para piezas insignia isométricas 3D.
- **Piezas aprobadas intocables.** Las piezas aprobadas del **19/11** y **20/11** no se modifican ni se re-renderizan con herramientas nuevas.
- **Combinación por composición transparente.** HyperFrames + GSAP se suma como capa ligera de motion graphics 2D, anotaciones sobre capturas reales y overlays con canal alfa (VP9 WebM / MOV) que pueden componerse sobre grabaciones de producto o renders 3D existentes.
- **Cierre de audio único.** Todo render con pista de audio cierra exclusivamente en `scripts/audio` (`mixer.py` + `qa.py`).

---

## 2. Matriz de selección de motor

| Motor / Pipeline | Cuándo seleccionarlo | Salidas principales | Cuándo combinarlo |
|---|---|---|---|
| **Three.js + Playwright + Python/FFmpeg** | Piezas insignia isométricas 3D o escenas con profundidad real que superan las 4 pruebas 3D (`nhilos_content_system_v1.0.md`) y Q6 de `creative-critic`. | MP4 H.264, secuencias PNG con alfa | Puede recibir overlays 2D (callouts, lower-thirds, stat cards) exportados en WebM alfa desde HyperFrames + GSAP. |
| **HyperFrames + GSAP** | Motion graphics cortos (≤ 30 s), anotaciones y highlights sobre capturas reales de producto, tipografía cinética, tarjetas de cifras (`T2`/`T4`), lower-thirds y overlays transparentes para web o video. | MP4 H.264 standalone, WebM VP9 con alfa (`ALPHA_MODE=1`), MOV con alfa | Como overlay transparente compuesto vía FFmpeg sobre grabaciones reales del dashboard/POS (p. ej. `dsh_bom_recetas.13330051.mp4`) o sobre renders Three.js. |
| **Remotion (`nhilos-video-showcase`)** | Composiciones React multi-escena existentes en `apps/showcase_video`, demostraciones largas con `<Series.Sequence>`, coreografía de cursor y láminas estáticas de carrusel (`4:5` / `9:16`). | MP4 H.264, PNG stills | Evaluar antes de ampliar uso por licenciamiento corporativo de Remotion (ver Sección 3). |
| **Audio (`scripts/audio`)** | **Siempre** que una pieza lleve voz, música o SFX. Mezcla determinista por frames y normalización final de loudness. | WAV/AAC/MP4 normalizado (`-14 LUFS / -1 dBTP / LRA <= 6`) + reporte QA JSON | Obligatorio al final de cualquier motor visual con audio; nunca delegado al motor de video. |

---

## 3. Inventario verificado: versiones, licencias y huella en disco

Todas las mediciones corresponden al entorno WSL2 verificado del repositorio.

### Herramientas activas

| Herramienta / Activo | Versión / Origen | Licencia | Huella en disco verificada | Notas de alcance y uso |
|---|---|---|---|---|
| **HyperFrames** (`hyperframes`) | `0.9.70` (HeyGen) | `Apache-2.0` | **~397 MB total** (`npm` unpacked ~25.5 MB; caché `npx` `~/.npm/_npx/059f4a4c7b2129c7` = `113 MB`; `chrome-headless-shell` `158.0.8127.36` + fuentes en `~/.cache/hyperframes` = `284 MB`) | CLI de render HTML/CSS/JS determinista vía Chromium headless. |
| **GSAP** | `3.15.0` (Webflow / GreenSock) | Standard License (`https://gsap.com/standard-license`, 100% gratis incluso para uso comercial desde 2025) | `72,927 bytes` (~71 KB) en `assets/vendor/gsap.min.js` | Copia vendored compartida lista para copiar dentro de cada proyecto `videos/<slug>/assets/vendor/` y garantizar determinismo offline. |
| **Skill `motion-graphics`** | `.agents/skills/motion-graphics/PROVENANCE.md` — vendored de `https://github.com/OpenMontageInc/OpenMontage` (commit `2e003e65fa99a0f329478a2c1cdcf26bc481933a`) | `AGPL-3.0` (conservada íntegra, sin relicenciar) | Texto/skill local | Modificación local: se eliminó el directorio `grounding/` porque subía imágenes a Google Gemini API. **Alcance legal:** `AGPL-3.0` aplica únicamente a los archivos de la skill vendored, **NO** a los videos renderizados producidos con HyperFrames (`Apache-2.0`) + GSAP (Standard License). |
| **Audio toolchain (`nhilos-audio`)** | `~/.local/opt/nhilos-audio` (`ffmpeg` / `ffprobe` `7.0.2-static` + `uisfx` ~14 MB) | Según binarios / `uisfx` CC0 | `367 MB` | Se carga con `source ~/.local/opt/nhilos-audio/env.sh`. |
| **Biblioteca SFX (`assets/sfx/`)** | Activos locales + manifiesto `assets/sfx/licenses.json` (hashes SHA-256) | `CC0` / `PDM` | `2.8 MB` | Resuelta offline por `scripts/audio/mixer.py`; Openverse solo se consulta antes del render. |

### Herramientas descartadas explícitamente

| Herramienta | Motivo de descarte |
|---|---|
| **Video ShotCraft** (skill basada en Remotion) | Solapa con la configuración existente de `nhilos-video-showcase`; además Remotion exige **Company License** de pago para organizaciones de 4+ personas (`$25/mes` por asiento creador o `$0.01/render` con mínimo de `$100/mes`). |
| **Earshot** (~1.1 GB) | Descartado por restricciones de disco y memoria en WSL2. |
| **Real SFX** (~390 MB) | Descartado por restricciones de disco y memoria en WSL2; `uisfx` (~14 MB) + `assets/sfx` CC0 (`2.8 MB`) cubren las necesidades de UI y SFX. |

---

## 4. Contrato técnico de HyperFrames + GSAP en WSL2

Todo proyecto bajo `videos/<slug>/` que use HyperFrames + GSAP debe cumplir las cinco reglas siguientes:

1. **Entorno obligatorio antes de render o inspección:**
   Cargar siempre `source ~/.local/opt/nhilos-audio/env.sh` antes de ejecutar `hyperframes render` o `ffprobe` para garantizar `ffmpeg`/`ffprobe` `7.0.2-static` en el `PATH`.
2. **Flags obligatorias en WSL2:**
   Pasar siempre `--no-browser-gpu --workers 1` a `hyperframes render`. En WSL2 no existe `/dev/dri/renderD128`; omitir estos flags provoca bloqueos en el probe de GPU y picos de memoria.
3. **Contrato de determinismo (cero red en render):**
   - GSAP debe cargarse desde archivo local vendored (ej. `assets/vendor/gsap.min.js`), nunca desde CDN.
   - Tipografías declaradas con `@font-face` local (ej. `inter-latin-var.woff2`), sin peticiones a Google Fonts.
   - Toda animación se construye en un `gsap.timeline({ paused: true })`, se registra explícitamente en `window.__timelines["<id>"]` y se inicializa con `tl.seek(0)`.
   - Cero llamadas de red en tiempo de render.
4. **Cierre de audio obligatorio en `scripts/audio`:**
   - **NUNCA** usar `normalize-audio` de HyperFrames para la sonoridad final (divergencia conocida entre `ffmpeg 7.0.2` y `8.0.1`).
   - La mezcla final y normalización (`-14 LUFS / -1 dBTP / LRA <= 6`) cierran siempre en `scripts/audio` (`python3 -m scripts.audio.mixer` + `python3 -m scripts.audio.qa`).
5. **Política `.gitignore`:**
   - `.gitignore` ignora `videos/*/.hyperframes/` y `videos/*/renders/`.
   - El código fuente de las composiciones (`index.html`, `compositions/*.html`, CSS/JS) y los activos ligeros (GSAP vendored, fuentes locales, capturas base) se mantienen rastreables en git; cachés y renders pesados quedan fuera del repositorio.

---

## 5. Evidencia del piloto validado (`videos/nhilos-control-recetas/`, limpiado tras validación)

> **Estado:** Piloto validado de punta a punta y retirado del workspace tras confirmar el funcionamiento del stack (GSAP `3.15.0` quedó preservado en `assets/vendor/gsap.min.js` para futuras producciones).

### Oportunidad web y criterio de honestidad

- **Auditoría web realizada:** `www.nhilospos.com`, `/software-pos/` (nota: `/software-hub` y `/software-hub/` devuelven `404`; la ruta real es `/software-pos/`) y `/precios/`.
- **Oportunidad seleccionada:** sección `#control` en `/software-pos/` (`design/nhilos-web-foundation/06-software-pos.html`), donde el sitio en vivo mostraba una captura estática `dsh_16_recetas_bom.webp` (`1440x900`) con el rótulo `"Grabación real del panel de administración · datos de demostración"`, mientras el código fuente web local ya define el contenedor `<figure data-media-slot="recetas-descuento-dashboard">` para `dsh_bom_recetas.13330051.mp4`.
- **Enfoque honesto aplicado:** capa de movimiento `16:10` (`1440x900`) montada **sobre la captura real** (`dsh_16_recetas_bom.webp`), resaltando la receta BOM de **Capuchino Vainilla 12oz** (tarjeta de producto, barra lateral `"Costo por plato"`, costo de receta `C$27.20`, `3` ingredientes, precio `C$115.00`). No es una recreación falsa de la interfaz.
- **Regla de honestidad del rótulo:** si se publica en el sitio el clip anotado standalone, el pie de figura debe cambiarse a `"Captura real del panel con anotaciones · datos de demostración"`; la alternativa equivalente es componer el overlay transparente sobre la grabación real del dashboard (`dsh_bom_recetas.13330051.mp4`).

### Resultados verificados de QA y render

- **`hyperframes check` (sobre `index.html`):** **PASS**
  - `0` lint errors
  - `0` runtime errors
  - `0` layout issues across `9` samples
  - `0` motion errors
  - `14/14` WCAG AA contrast checks passed
  - `0` craft errors
  - `1` info (`audio_none`, esperado para un loop web silencioso)

| Entregable | Archivo | Códec / Perfil | Resolución / FPS | Frames / Duración | Peso / Bitrate | Tiempo de render | Verificación extra |
|---|---|---|---|---|---|---|---|
| **MP4 standalone** | `videos/nhilos-control-recetas/renders/nhilos-recetas-bom-1440x900.mp4` | `h264` (High), `yuv420p` | `1440x900`, `30 fps` | `330 frames` / `11.000 s` | `739,347 bytes` (~722 KB) / `538 kbps` | `9.4 s` | `ffprobe` OK |
| **Overlay transparente WebM** | `videos/nhilos-control-recetas/renders/nhilos-recetas-bom-1440x900-overlay.webm` (desde `compositions/overlay.html`) | `vp9` (Profile 0), `TAG:ALPHA_MODE=1` | `1440x900`, `30 fps` | `330 frames` / `11.000 s` | `1,050,602 bytes` (~1.0 MB) / `764 kbps` | `12.6 s` | Frame decodificado en `t=1.2s` vía `ffmpeg -c:v libvpx-vp9` verificado como `png` `1440x900` `pix_fmt=rgba` |

---

## 6. Comandos de referencia rápida

```bash
# 1. Cargar entorno de audio/ffmpeg antes de cualquier operación
source ~/.local/opt/nhilos-audio/env.sh

# 2. Diagnóstico del entorno HyperFrames
npx --yes hyperframes@0.9.70 doctor

# 3. Validación pre-render (lint, runtime, layout, motion, contraste WCAG AA)
npx --yes hyperframes@0.9.70 check videos/<slug>

# 4. Render MP4 standalone (flags obligatorias en WSL2)
npx --yes hyperframes@0.9.70 render videos/<slug> \
  -q delivery --no-browser-gpu --workers 1 \
  -o videos/<slug>/renders/output.mp4

# 5. Render WebM con canal alfa (overlay transparente)
npx --yes hyperframes@0.9.70 render videos/<slug> \
  -c compositions/overlay.html --format webm -q delivery \
  --no-browser-gpu --workers 1 \
  -o videos/<slug>/renders/output-overlay.webm

# 6. Inspección ffprobe (códec, dimensiones, fps, TAG:ALPHA_MODE)
ffprobe -v error -show_format -show_streams \
  videos/<slug>/renders/output-overlay.webm

# 7. Verificación de decodificación RGBA en t=1.2s (forzando libvpx-vp9 para preservar alfa)
ffmpeg -y -c:v libvpx-vp9 -ss 1.2 \
  -i videos/<slug>/renders/output-overlay.webm \
  -frames:v 1 /tmp/overlay-check-1.2s.png
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,pix_fmt \
  -of default=noprint_wrappers=1 /tmp/overlay-check-1.2s.png
```
