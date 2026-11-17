# Evaluación de skills de agente para producción de contenido

Versión 1.0 · 17 de noviembre de 2026 · Autor: equipo NHILOS

## Para qué sirve este documento

Trece repositorios de GitHub ofrecen skills para que un agente produzca video y
motion graphics. Este documento registra cuáles se evaluaron, con qué criterio, qué
se incorporó y por qué se rechazó el resto. Existe para que la próxima persona no
repita la investigación ni revierta una decisión sin saber qué la sustentaba.

## Criterios

Un repo entra solo si pasa los cuatro.

1. **Encaje con lo que ya tenemos.** El stack actual es Remotion (`apps/showcase_video`),
   artboards HTML (`design/nhilos-web-foundation/`), y un pipeline propio de captura
   real con ffmpeg y PIL. Un candidato que exige montar un segundo sistema de
   producción no entra por bueno que sea: dos sistemas cuestan más que uno.
2. **Licencia comercial.** NHILOS vende software. Una licencia no comercial sobre la
   herramienta de producción de su marketing es un problema legal, no un detalle.
3. **Riesgo de ejecución.** Una skill es código que el agente ejecuta. Se revisa qué
   corre, qué red usa y qué sale de la máquina antes de incorporarla.
4. **Valor marginal.** Si la capacidad ya está cubierta por una skill propia o por el
   stack, sumarla solo agrega ruido de contexto.

## Veredictos

| Repositorio | Qué es | Licencia | Veredicto |
|---|---|---|---|
| **OpenMontage** | Sistema de producción agéntico; su carpeta `.agents/skills` tiene ~100 skills portables | AGPL-3.0 | **Adoptado en parte**: 5 skills vendorizadas |
| **onetake** | Películas de producto con cortes que se encadenan y un "oráculo" que rechaza el efecto presentación | PolyForm Noncommercial | **Rechazado por licencia** |
| **hypit** | Clona un video viral, incluido intercambio de rostro | Apache-2.0 | **Rechazado**: sustituye personas y no prueba nada del producto |
| **openmotion** | Editor y runtime propio con MCP | Apache-2.0 | **Rechazado**: segundo sistema de producción |
| **OpenChatCut** | Editor conversacional local con timeline propio | GPL-3.0 | **Rechazado**: aplicación de escritorio, formato propio |
| **FireRed-OpenStoryline** | Agente de edición con FastAPI, interfaz web y modelos servidos | Apache-2.0 | **Rechazado**: hay que servir modelos para un beneficio marginal |
| **pireel** + **pireel-agent** | Editor más un MCP que lo maneja | Apache-2.0 | **Rechazado**: las skills apuntan a Pireel Studio como destino |
| **lemo-opuscar** | 99 estilos de película hechos en código | MIT | **Rechazado como sistema**: un catálogo de estilos compite con nuestro sistema de diseño; requiere su propio entorno Python |
| **reelmimic** | Imita el estilo de un video de referencia | MIT | **Rechazado**: derivativo por diseño y el video fuente tiene sus propios derechos |
| **bang-motion** | Motion graphics en HTML, CSS y GSAP, con doctrina anti presentación | MIT | **Rechazado por solapamiento**: cubierto por `motion-graphics` |
| **claude-code-video-toolkit** | Espacio de trabajo en Python con voiceover y clips de IA de pago | MIT | **Rechazado**: visuales sintéticos y duplica Remotion |
| **lottie** | No existe un repositorio con ese nombre | — | La capacidad entra por `lottie-bodymovin` |

### El caso de onetake

Es el que mejor entendía nuestro problema: sus notas describen por qué un corte se
lee como presentación y cómo hacer que cada beat crezca del anterior. Su licencia
PolyForm Noncommercial impide usarlo para producir marketing de una empresa que
vende software. Se leyó para aprender, no se incorporó. Si la licencia cambia, es el
primer candidato a reconsiderar.

## Qué se incorporó

Cinco skills de OpenMontage, en `.agents/skills/`, con su `PROVENANCE.md`:

| Skill | Para qué |
|---|---|
| `video-understand` | Extraer fotogramas y transcribir en local para juzgar un clip antes de publicarlo |
| `motion-graphics` | Doctrina y catálogo de motion para contenido social |
| `remotion-best-practices` | Reglas para las composiciones de `apps/showcase_video` |
| `lottie-bodymovin` | Animación vectorial liviana para superficies web |
| `ffmpeg` | Recetas de preparación de assets para Remotion |

**Precedencia.** Son doctrina de referencia, no política. Manda la regla de
autenticidad (media real del producto, nunca una interfaz reconstruida que se haga
pasar por el producto), la voz en español neutro, la lista de claims prohibidos y
`nhilos_web_media_capture_brief_v1.0.md`. Sus idiomas por defecto no son los nuestros.

### Cambios locales sobre el código vendorizado

Se documentan en el `PROVENANCE.md` de cada skill.

- `motion-graphics/grounding/` fue eliminado: sube fotogramas a la API de Gemini, es
  decir, saca datos de la máquina, y necesita una clave explícita. Nada más lo usa.
- `video-understand` recibió dos parches de compatibilidad con este host:
  - sin `ffprobe` instalado, la lectura de duración y resolución cae a la salida de
    `ffmpeg -i`;
  - las invocaciones de `ffmpeg` llevan `-threads 1 -filter_threads 1`, porque el host
    corta en 64 procesos y la creación de hilos devuelve `EAGAIN`, que ffmpeg reporta
    como `Error reinitializing filters`. Sin eso, la extracción devuelve cero frames.

## Verificación

`video-understand` se ejecutó sobre el clip de continuidad operativa
(`media/pos_offline_cola_sync_loop.mp4`, 9.7 s, 720x1544). Extrajo 8 fotogramas a
intervalos de 1.2 s. La hoja de contactos mostró lo que la sección no comunica:

- el carrito en C$75 y la pantalla de cobro bimoneda ocupan los primeros 2.4 s;
- "Venta procesada con éxito" aparece alrededor del segundo 3.6 y se va casi de
  inmediato;
- el badge del estado de red mide unos 17 px al tamaño que se muestra en la página;
- el salto temporal hacia el estado sincronizado no está señalado en el video.

Esa lectura es el insumo del rediseño de la sección, no una opinión.
