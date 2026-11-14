import React from 'react';
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
  Img,
} from 'remotion';
import {
  Calendar,
  Lock,
  ShieldCheck,
  Store,
} from 'lucide-react';
import { DashboardSidebar } from '../../components/DashboardSidebar';
import { WebCursor, LocalWaypoint } from '../fiscal/FiscalWebChrome';

/**
 * Escena 4 (f390..f630 — 240 frames / 8.0s @ 30fps):
 * Corte limpio al Owner Dashboard (`Ferretería & Comercial Las Colinas`, `RUC: J0310000289104`)
 * mostrando:
 * 1. El bloque oficial `Atención Requerida` (`attention-band.tsx`) con la señal:
 *    `▲ Anulaciones` · `1 anulaciones · C$1,250.00` · chip `Período` · acción `Ver anulaciones →`
 * 2. La tabla de auditoría en tiempo real (`fiscal-page.tsx` VoidedTab + `audit-page.tsx` / `supervision-review-panel.tsx`)
 *    mostrando hora exacta (`10/11/2026 10:24`), factura (`001-001-01-00000418`), cajero (`Luis Operador`),
 *    quién autorizó (`Roberto Morales · PIN`), motivo (`Error de captura`) y monto (`C$ 1,250.00`).
 */
export const VoidAuditDashboardScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const zoomSpring = spring({
    frame: Math.max(0, frame - 20),
    fps,
    config: { damping: 18, stiffness: 110, mass: 0.85 },
  });

  const windowScale = interpolate(zoomSpring, [0, 1], [1.0, 1.04]);

  const isAttentionLinkHovered = frame >= 24 && frame < 95;
  const isAuditRowHighlighted = frame >= 95;

  const waypoints: LocalWaypoint[] = [
    { frame: 0, x: 640, y: 210 },
    { frame: 24, x: 895, y: 242 },
    { frame: 55, x: 895, y: 242, click: true },
    { frame: 85, x: 895, y: 242 },
    { frame: 115, x: 620, y: 505 },
    { frame: 230, x: 620, y: 505 },
  ];

  return (
    <div className="w-full h-full bg-[#001F33] flex flex-col items-center justify-between p-8 relative overflow-hidden font-sans select-none">
      {/* Iluminación institucional */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[850px] h-[850px] bg-[#003757]/80 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute -bottom-20 right-10 w-[600px] h-[600px] bg-[#00BF81]/15 rounded-full blur-[180px] pointer-events-none" />

      {/* ===================================================================
          TOP SAFE ZONE (pt-[104px] + p-8 => 136px >= 130px)
         =================================================================== */}
      <div className="w-full pt-[104px] flex flex-col items-center z-30 text-center">
        <div className="flex items-center gap-2.5 bg-[#003757]/95 border border-white/15 px-4 py-1.5 rounded-full mb-2.5 shadow-lg">
          <Img
            src={staticFile('logo.png')}
            alt="NHILOS POS"
            className="w-6 h-6 object-contain"
          />
          <span
            className="text-xs font-black text-white tracking-[3px] uppercase"
            style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
          >
            NHILOS POS
          </span>
          <span className="text-white/30 text-xs">•</span>
          <span className="text-[11px] text-[#CCCCCC] font-medium">
            Conectamos los hilos de tu negocio.
          </span>
          <span className="ml-1 text-[10px] font-extrabold text-[#003757] bg-[#00BF81] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
            Owner Dashboard
          </span>
        </div>

        <h2
          className="text-4xl font-extrabold text-white tracking-wide"
          style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
        >
          Trazabilidad de Caja al Instante
        </h2>
      </div>

      {/* ===================================================================
          CENTER STAGE: Ventana de Owner Dashboard (1000x780)
         =================================================================== */}
      <div className="w-full flex-1 flex items-center justify-center z-20">
        <div
          className="w-[1000px] h-[780px] bg-slate-50 rounded-2xl shadow-[0_30px_80px_rgba(0,0,0,0.68)] overflow-hidden border border-slate-300 flex relative text-slate-800 origin-center"
          style={{ transform: `scale(${windowScale})` }}
        >
          {/* 1. Sidebar Oficial Completa (`DashboardSidebar`) */}
          <DashboardSidebar
            activePath="/"
            compact
            userName="Roberto Morales"
            userRole="Owner"
          />

          {/* 2. Contenido Principal del Owner Dashboard */}
          <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden text-left">
            {/* Header superior oficial (`header.tsx`) */}
            <header className="h-14 shrink-0 border-b border-slate-200 bg-white px-6 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Store className="h-4 w-4 text-[#003757]" />
                <div className="flex flex-col">
                  <h2 className="text-xs font-bold text-slate-900 leading-tight">
                    Ferretería &amp; Comercial Las Colinas
                  </h2>
                  <span className="text-[10px] text-slate-500 font-mono">
                    RUC: J0310000289104
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00BF81]" />
                  En Línea
                </span>
                <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                  <div className="w-7 h-7 rounded-full bg-[#003757] text-white text-xs font-bold flex items-center justify-center">
                    R
                  </div>
                  <div className="text-left">
                    <div className="text-[11px] font-bold text-slate-900 leading-none">
                      Roberto Morales
                    </div>
                    <div className="text-[10px] text-slate-500">owner</div>
                  </div>
                </div>
              </div>
            </header>

            <main className="flex-1 p-6 space-y-4 overflow-hidden flex flex-col">
              {/* Título de página + Frescura + Rango de fecha */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-slate-900">
                    Dashboard
                  </h1>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Métricas clave de facturación y excepciones auditadas en tiempo real
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#00BF81]" />
                    Datos completos hasta 10:24 · sync 10:24
                  </span>
                  <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-xs">
                    <Calendar className="h-3.5 w-3.5 text-slate-500" />
                    <span className="tabular-nums">10/11/2026 — 10/11/2026</span>
                  </div>
                </div>
              </div>

              {/* =============================================================
                  BLOQUE 1: `Atención Requerida` (`attention-band.tsx` real)
                 ============================================================= */}
              <section
                aria-label="Atención requerida"
                className="rounded-xl border-2 border-amber-300 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900">
                    Atención Requerida
                  </h2>
                  <span className="rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-[10px] font-bold text-amber-900">
                    Excepción Fiscal Detectada
                  </span>
                </div>

                <ul className="mt-3 space-y-2">
                  <li className="flex items-center justify-between gap-3 rounded-lg bg-amber-50/80 border border-amber-200 p-3 text-sm">
                    <span className="flex items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        className="shrink-0 font-bold text-amber-700 text-base leading-none mt-0.5"
                      >
                        ▲
                      </span>
                      <span>
                        <span className="font-bold text-amber-800 text-sm">
                          Anulaciones · 1
                        </span>
                        <span className="block text-xs font-semibold text-slate-700 mt-0.5 tabular-nums">
                          1 anulación registrada · C$ 1,250.00 · Autorizado por: Roberto Morales (PIN)
                        </span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                        Período
                      </span>
                      <span
                        className={`rounded px-2 py-1 text-xs font-bold text-[#003757] ${
                          isAttentionLinkHovered
                            ? 'bg-[#003757]/10 underline'
                            : ''
                        }`}
                      >
                        Ver anulaciones →
                      </span>
                    </span>
                  </li>
                </ul>
              </section>

              {/* =============================================================
                  BLOQUE 2: Detalle Auditado (`VoidedTab` + `SupervisionReviewPanel`)
                 ============================================================= */}
              <section className="flex-1 flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-xs overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#003757]" />
                      <h3 className="text-sm font-bold text-slate-900">
                        Bitácora del Mostrador (POS) · Revisión de Supervisiones
                      </h3>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Registro inalterable de anulaciones: factura, hora exacta, monto, motivo DGI y quién firmó.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-right">
                      <div className="text-[9px] font-bold uppercase text-slate-500">
                        Total Anuladas
                      </div>
                      <div className="text-sm font-black text-slate-900 tabular-nums">
                        1
                      </div>
                    </div>
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-right">
                      <div className="text-[9px] font-bold uppercase text-rose-700">
                        Monto Total Anulado
                      </div>
                      <div className="text-sm font-black text-rose-700 tabular-nums">
                        C$ 1,250.00
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tabla de Auditoría (`VoidedTab` + `SupervisionReviewPanel` columns) */}
                <div className="mt-3 rounded-lg border border-slate-200 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">Cuándo</th>
                        <th className="py-2.5 px-3">Factura</th>
                        <th className="py-2.5 px-3">Quién operó</th>
                        <th className="py-2.5 px-3">Quién firmó</th>
                        <th className="py-2.5 px-3">Motivo DGI</th>
                        <th className="py-2.5 px-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr
                        className={`transition-colors ${
                          isAuditRowHighlighted
                            ? 'bg-emerald-50/80 ring-2 ring-inset ring-[#00BF81]'
                            : 'bg-rose-50/40'
                        }`}
                      >
                        <td className="py-3.5 px-3 font-mono text-[11px] font-semibold text-slate-700 tabular-nums">
                          10/11/2026 10:24
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="font-mono font-bold text-slate-900">
                            001-001-01-00000418
                          </div>
                          <span className="inline-flex mt-0.5 rounded bg-rose-100 border border-rose-200 px-1.5 py-px text-[9px] font-black text-rose-800">
                            ANULADA · FOLIO CONSERVADO
                          </span>
                        </td>
                        <td className="py-3.5 px-3 font-medium text-slate-800">
                          <div>Luis Operador</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            TERM-01 · Caja 1
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="font-bold text-slate-900 flex items-center gap-1">
                            <Lock className="w-3 h-3 text-[#003757]" />
                            <span>Roberto Morales</span>
                          </div>
                          <span className="inline-flex mt-0.5 rounded bg-[#003757]/10 px-1.5 py-px text-[9px] font-bold text-[#003757]">
                            Credencial: PIN (4 dígitos)
                          </span>
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="font-bold text-slate-800">
                            Error de captura
                          </span>
                          <span className="block text-[10px] text-slate-500">
                            Excluida del arqueo de efectivo
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-right font-black text-sm text-rose-700 tabular-nums">
                          C$ 1,250.00
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Pie de integridad de cadena del mostrador (`IntegritySection` de `audit-page.tsx`) */}
                <div className="mt-auto pt-3 flex items-center justify-between text-[11px] text-slate-600">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#00BF81]" />
                    <span className="font-medium">
                      Integridad del registro del mostrador (POS): <strong>0 huecos en la secuencia #00417 – #00419</strong>
                    </span>
                  </div>
                  <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    Solo lectura · Cadena Hash verificada
                  </span>
                </div>
              </section>
            </main>
          </div>

          {/* Cursor Web Calibrado */}
          <WebCursor waypoints={waypoints} />
        </div>
      </div>

      {/* ===================================================================
          BOTTOM SAFE ZONE (h-[320px] pt-5 => bottom >= 280px free)
         =================================================================== */}
      <div className="w-full h-[320px] flex flex-col items-center justify-start pt-5 z-30 text-center">
        <div className="space-y-1.5">
          <div
            className="text-5xl font-black text-white tracking-[1.5px] drop-shadow-lg"
            style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
          >
            Auditoría en tiempo real.
          </div>
          <div className="text-3xl font-extrabold text-[#00BF81] tracking-wide">
            Sabes quién, cuándo y por qué.
          </div>
        </div>
      </div>
    </div>
  );
};
