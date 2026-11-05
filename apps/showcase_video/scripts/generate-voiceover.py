#!/usr/bin/env python3
"""
Genera la locución automatizada para el showcase de NHILOS POS usando Edge TTS.
Voz oficial seleccionada: es-NI-FedericoNeural (Nicaragua).
"""

import asyncio
import os
import sys
import edge_tts

VOICE = "es-NI-FedericoNeural"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "audio")

SCENES = [
    {
        "filename": "scene_1_intro.mp3",
        "text": "NHILOS POS. Directorio de clientes y convenios comerciales.",
    },
    {
        "filename": "scene_2_client.mp3",
        "text": "Desde el panel de control, registra a tus clientes corporativos con su información fiscal en segundos.",
    },
    {
        "filename": "scene_3_promotion.mp3",
        "text": "Crea convenios comerciales personalizados con descuentos automáticos, horarios y empresas específicas.",
    },
    {
        "filename": "scene_4_pos.mp3",
        "text": "En el punto de venta, selecciona a la empresa aliada y el descuento se aplica al instante, incluso sin internet.",
    },
    {
        "filename": "scene_5_outro.mp3",
        "text": "NHILOS POS. Conectamos los hilos de tu negocio.",
    },
    # --- Parte 2: Métricas de Convenios (MetricsShowcase) ---
    {
        "filename": "metrics_1_intro.mp3",
        "text": "NHILOS POS. Métricas de convenios: del descuento a la decisión.",
    },
    {
        "filename": "metrics_2_nav.mp3",
        "text": "Cada venta con un cliente corporativo ya quedó registrada. En Clientes, la pestaña Métricas convierte esas ventas en información.",
    },
    {
        "filename": "metrics_3_kpis.mp3",
        "text": "De un solo vistazo: facturación neta, descuentos otorgados y su tasa efectiva, tickets y ticket promedio del período.",
    },
    {
        "filename": "metrics_4_behavior.mp3",
        "text": "Descubre qué productos consumen, y en qué días y horas llegan, para ajustar tu operación y tus turnos.",
    },
    {
        "filename": "metrics_5_ranking.mp3",
        "text": "El ranking compara a cada empresa, y el detalle muestra su consumo real. Exporta el reporte en Excel o PDF para compartirlo.",
    },
    {
        "filename": "metrics_6_outro.mp3",
        "text": "NHILOS POS. Conectamos los hilos de tu negocio.",
    },
    # --- Parte 3: Velocidad y Ergonomía en Mostrador (SpeedReel 9:16) ---
    {
        "filename": "speed_1_hook.mp3",
        "text": "En un mostrador lleno, cada toque de más en la pantalla es un cliente esperando en la fila.",
        "rate": "+2%",
    },
    {
        "filename": "speed_2_terminal.mp3",
        "text": "Diseñamos la terminal de NHILOS con botones táctiles amplios, respuesta en menos de cincuenta milisegundos y teclado numérico sin distracciones.",
        "rate": "+2%",
    },
    {
        "filename": "speed_3_checkout.mp3",
        "text": "El cálculo de vuelto en córdobas y dólares es automático. Cero margen de error mental para el cajero bajo presión.",
        "rate": "+2%",
    },
    {
        "filename": "speed_4_outro.mp3",
        "text": "La velocidad en mostrador no es casualidad; es diseño de software. Comenta DEMO para ver el flujo en vivo.",
        "rate": "+2%",
    },
    # --- Parte 4: Certeza Contable y Cumplimiento DGI (FiscalReel 9:16) ---
    {
        "filename": "fiscal_1_intro.mp3",
        "text": "Para la administración tributaria, una factura desaparecida no es un error de sistema; es una anomalía fiscal.",
        "rate": "+8%",
    },
    {
        "filename": "fiscal_2_void.mp3",
        "text": "En NHILOS ningún registro fiscal se elimina. Las anulaciones exigen un motivo formal y conservan el folio y la secuencia inalterada.",
        "rate": "+12%",
    },
    {
        "filename": "fiscal_3_export.mp3",
        "text": "Tu contador recibe la información consolidada al final del mes, lista para declaración, sin necesidad de transcribir papeles ni cuadrar hojas de cálculo.",
        "rate": "+8%",
    },
    {
        "filename": "fiscal_4_outro.mp3",
        "text": "Control administrativo real. Comenta CONTROL para enviarte nuestro protocolo técnico de auditoría.",
        "rate": "+4%",
    },
    # --- Parte 5: Continuidad Real Offline (OfflineReel 9:16) ---
    {
        "filename": "offline_1_hook.mp3",
        "text": "¿Qué ocurre en tu local si el internet se corta en plena hora punta? La mayoría de sistemas en la nube simplemente se paralizan.",
        "rate": "+16%",
    },
    {
        "filename": "offline_2_sale.mp3",
        "text": "En NHILOS la terminal física es la fuente de verdad. El cobro se valida sobre una base de datos local embebida y el ticket térmico se emite al instante.",
        "rate": "+10%",
    },
    {
        "filename": "offline_3_sync.mp3",
        "text": "Al volver la señal, la cola transaccional se sincroniza automáticamente con la nube sin duplicar números ni bloquear la caja.",
        "rate": "+12%",
    },
    {
        "filename": "offline_4_outro.mp3",
        "text": "Operación continua garantizada. Conoce cómo blindar tu mostrador escribiendo a nuestro WhatsApp.",
        "rate": "+4%",
    },
    # --- Parte 6: Cierre de Turno y Arqueo Ciego (BlindAuditReel 9:16 - Clip Martes) ---
    {
        "filename": "blind_1_hook.mp3",
        "text": "Si tu cajero ve cuánto dinero debería haber antes de contar, el arqueo de caja deja de ser una auditoría y se convierte en un cuadre acomodado.",
        "voice": "es-MX-JorgeNeural",
        "rate": "-4%",
        "pitch": "+0Hz",
    },
    {
        "filename": "blind_2_count.mp3",
        "text": "En NHILOS POS el arqueo es cien por ciento ciego. El operador digita el conteo físico de gaveta sin saber la meta del sistema.",
        "voice": "es-MX-JorgeNeural",
        "rate": "-4%",
        "pitch": "+0Hz",
    },
    {
        "filename": "blind_3_ticket.mp3",
        "text": "El ticket de corte calcula automáticamente sobrantes y faltantes al centavo, enviando el registro inalterable a tu panel administrativo.",
        "voice": "es-MX-JorgeNeural",
        "rate": "-4%",
        "pitch": "+0Hz",
    },
    {
        "filename": "blind_4_outro.mp3",
        "text": "Protege el dinero de tu negocio. Comenta CONTROL abajo para enviarte el protocolo técnico de auditoría.",
        "voice": "es-MX-JorgeNeural",
        "rate": "-4%",
        "pitch": "+0Hz",
    },
    # --- Parte 7: Agilidad Operativa y Cuentas en Espera (HoldOrdersReel 9:16 - Clip Miércoles) ---
    {
        "filename": "hold_1_hook.mp3",
        "text": "Un cliente olvida su billetera o duda al pedir, y la fila entera se detiene. En NHILOS la caja nunca se frena.",
        "voice": "es-MX-JorgeNeural",
        "rate": "-4%",
        "pitch": "+0Hz",
    },
    {
        "filename": "hold_2_resume.mp3",
        "text": "Guarda la orden en proceso con un solo toque y atiende al siguiente. Recupera carritos simultáneos sin perder variantes ni extras.",
        "voice": "es-MX-JorgeNeural",
        "rate": "-4%",
        "pitch": "+0Hz",
    },
    {
        "filename": "hold_3_checkout.mp3",
        "text": "Despacho fluido en mostrador, control de comanda sin confusiones y cobro ágil en córdobas o dólares.",
        "voice": "es-MX-JorgeNeural",
        "rate": "-4%",
        "pitch": "+0Hz",
    },
    {
        "filename": "hold_4_outro.mp3",
        "text": "Agiliza la atención de tu negocio. Comenta DEMO abajo para enviarte el acceso directo.",
        "voice": "es-MX-JorgeNeural",
        "rate": "-4%",
        "pitch": "+0Hz",
    },
    # --- Parte 8: Visibilidad Gerencial y Navegación Contextual (OwnerDashboardReel 9:16 - Clip Jueves) ---
    {
        "filename": "owner_1_hook.mp3",
        "text": "Un panel gerencial no sirve para llenarte de gráficos decorativos, sirve para decirte qué pasó en tu negocio y qué requiere tu atención inmediata.",
        "voice": "es-MX-JorgeNeural",
        "rate": "-4%",
        "pitch": "+0Hz",
    },
    {
        "filename": "owner_2_context.mp3",
        "text": "En NHILOS el contexto viaja contigo. Al tocar una alerta de stock crítico o una anulación, el sistema te lleva directo al detalle ya filtrado.",
        "voice": "es-MX-JorgeNeural",
        "rate": "-4%",
        "pitch": "+0Hz",
    },
    {
        "filename": "owner_3_kpis.mp3",
        "text": "Sin volver a buscar productos ni repetir fechas. Ventas netas, márgenes reales y auditoría de caja desde cualquier navegador.",
        "voice": "es-MX-JorgeNeural",
        "rate": "-4%",
        "pitch": "+0Hz",
    },
    {
        "filename": "owner_4_outro.mp3",
        "text": "Entiende cómo está tu negocio en segundos. Comenta DEMO abajo para enviarte el acceso directo.",
        "voice": "es-MX-JorgeNeural",
        "rate": "-4%",
        "pitch": "+0Hz",
    },
]

async def generate_all(only: str = ""):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    selected = [scene for scene in SCENES if not only or scene["filename"].startswith(only)]
    if not selected:
        print(f"No hay escenas que coincidan con el prefijo '{only}'.")
        return
    print(f"🎙️ Generando locución ({len(selected)} archivos)...")
    for idx, scene in enumerate(selected, 1):
        target_path = os.path.join(OUTPUT_DIR, scene["filename"])
        scene_voice = scene.get("voice", VOICE)
        scene_rate = scene.get("rate", "+8%")
        scene_pitch = scene.get("pitch", "+0Hz")
        print(f"  -> [{idx}/{len(selected)}] Generando {scene['filename']} (voice={scene_voice}, rate={scene_rate}, pitch={scene_pitch})...")
        communicate = edge_tts.Communicate(text=scene["text"], voice=scene_voice, rate=scene_rate, pitch=scene_pitch)
        await communicate.save(target_path)
        size_kb = os.path.getsize(target_path) / 1024
        print(f"     Listo ({size_kb:.1f} KB) -> {target_path}")
        await asyncio.sleep(0.4)

    print("\n✅ Todos los audios generados con éxito en public/audio/")

if __name__ == "__main__":
    prefix = ""
    if "--only" in sys.argv:
        index = sys.argv.index("--only")
        if index + 1 < len(sys.argv):
            prefix = sys.argv[index + 1]
    asyncio.run(generate_all(prefix))
