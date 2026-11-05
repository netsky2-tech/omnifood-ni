import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  Store,
  FileText,
  FileCheck,
  ShieldCheck,
  AlertTriangle,
  Lock,
  UserCheck,
  CheckCircle2,
  Download,
  Table,
  Check,
  History,
  Clock,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { DashboardSidebar } from '../../components/DashboardSidebar';

export const TARGETS_FISCAL = {
  sidebarFiscal: { x: 150, y: 470 },
  sidebarAudit: { x: 150, y: 810 },
  tabSequence: { x: 580, y: 450 },
  tabExports: { x: 710, y: 450 },
  row104: { x: 500, y: 670 },
  row105: { x: 500, y: 730 },
  row106: { x: 500, y: 790 },
  btnVoid105: { x: 915, y: 730 },
  modalRadioError: { x: 370, y: 660 },
  modalPinBox: { x: 440, y: 880 },
  modalBtnConfirm: { x: 740, y: 1030 },
  btnExportExcel: { x: 840, y: 530 },
  auditTabLedger: { x: 480, y: 455 },
} as const;

export const FiscalWindow: React.FC<{
  activePath?: string;
  activeTab?: 'summary' | 'voided' | 'sequence' | 'exports';
  pageTitle?: string;
  pageSubtitle?: string;
  children: React.ReactNode;
  overlay?: React.ReactNode;
  animateEnter?: boolean;
}> = ({
  activePath = '/fiscal',
  activeTab = 'sequence',
  pageTitle = 'Fiscal',
  pageSubtitle = 'Reportes fiscales, retenciones y cumplimiento con normativa DGI.',
  children,
  overlay,
  animateEnter = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = animateEnter
    ? spring({ frame, fps, config: { damping: 18, mass: 0.9 } })
    : 1;
  const scale = animateEnter ? interpolate(enter, [0, 1], [0.95, 1]) : 1;
  const opacity = animateEnter
    ? interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' })
    : 1;

  const tabs = [
    { id: 'summary', label: 'Resumen Mensual' },
    { id: 'voided', label: 'Anulaciones' },
    { id: 'sequence', label: 'Auditoría Secuencia' },
    { id: 'exports', label: 'Exportaciones' },
  ] as const;

  return (
    <div
      className="w-full max-w-[1020px] h-[1220px] bg-slate-50 rounded-2xl shadow-2xl overflow-hidden border border-slate-300 flex relative text-slate-800"
      style={{ transform: `scale(${scale})`, opacity }}
    >
      {/* 1. SIDEBAR OFICIAL NHILOS */}
      <DashboardSidebar activePath={activePath} />

      {/* 2. CONTENIDO PRINCIPAL */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">
        {/* Header superior oficial (tienda activa + conectividad) */}
        <header className="h-16 shrink-0 border-b border-slate-200 bg-white px-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Store className="h-5 w-5 text-[#003757]" />
            <div className="flex flex-col">
              <h2 className="text-sm font-bold text-slate-900 leading-tight">SOHO Café</h2>
              <span className="text-[11px] text-slate-500 font-mono">RUC: J0310000000000</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-[#00BF81]" />
              En Línea
            </span>
          </div>
        </header>

        {/* Cuerpo Principal del Módulo */}
        <main className="flex-1 p-6 space-y-5 overflow-hidden">
          {/* Título de Página */}
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{pageTitle}</h1>
            <p className="text-xs text-slate-500 mt-0.5">{pageSubtitle}</p>
          </div>

          {/* Pestañas Oficiales (Solo en módulo Fiscal) */}
          {activePath === '/fiscal' && (
            <div className="border-b border-slate-200">
              <nav className="-mb-px flex gap-6 text-xs font-medium">
                {tabs.map((tab) => {
                  const isActive = tab.id === activeTab;
                  return (
                    <span
                      key={tab.id}
                      className={`cursor-pointer border-b-2 pb-3 transition-colors ${
                        isActive
                          ? 'border-[#003757] font-bold text-[#003757]'
                          : 'border-transparent text-slate-500'
                      }`}
                    >
                      {tab.label}
                    </span>
                  );
                })}
              </nav>
            </div>
          )}

          {/* Contenido Inyectado */}
          {children}
        </main>
      </div>

      {/* Capa de overlay para cursor y modales */}
      {overlay}
    </div>
  );
};

// ---------------------------------------------------------------- CONTENIDO DE SECUENCIA

export const SequenceContent: React.FC<{
  highlightRow?: number; // 104, 105, 106
  isVoidBtnPressed?: boolean;
}> = ({ highlightRow, isVoidBtnPressed = false }) => {
  return (
    <div className="space-y-5">
      {/* 3 StatCards Oficiales (StatCard.tsx) */}
      <div className="grid grid-cols-3 gap-3.5">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">
            Secuencia Esperada
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 font-mono">106</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">
            Secuencia Real
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 font-mono">106</p>
        </div>

        <div className="rounded-lg border border-emerald-300 bg-emerald-50/60 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800 truncate">
              Secuencias Faltantes
            </p>
            <span className="px-2 py-0.5 rounded-full bg-[#00BF81] text-slate-950 font-black text-[10px]">
              OK
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-900 font-mono">
            0 (CERO GAPS)
          </p>
        </div>
      </div>

      {/* Tabla Oficial de Facturación y Correlatividad */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4">Serie / Folio</th>
              <th className="py-3 px-3">Fecha</th>
              <th className="py-3 px-3">Cajero</th>
              <th className="py-3 px-3 text-right">Total (NIO)</th>
              <th className="py-3 px-3 text-center">Estado DGI</th>
              <th className="py-3 px-4 text-center">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {/* Fila #00104 */}
            <tr className={`transition-colors ${highlightRow === 104 ? 'bg-slate-100/90' : ''}`}>
              <td className="py-3.5 px-4 font-mono font-bold text-slate-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>SERIE-001 #00104</span>
              </td>
              <td className="py-3.5 px-3 text-slate-600">28/04 12:35 PM</td>
              <td className="py-3.5 px-3 text-slate-700">Carlos Cajero</td>
              <td className="py-3.5 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                C$ 340.00
              </td>
              <td className="py-3.5 px-3 text-center">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  <Check className="w-3 h-3" /> EMITIDA
                </span>
              </td>
              <td className="py-3.5 px-4 text-center">
                <span className="text-slate-400 text-[11px]">—</span>
              </td>
            </tr>

            {/* Fila #00105 (Objetivo interactivo) */}
            <tr
              className={`transition-all duration-150 ${
                highlightRow === 105
                  ? 'bg-amber-50/90 border-y border-amber-300'
                  : ''
              }`}
            >
              <td className="py-3.5 px-4 font-mono font-black text-amber-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span>SERIE-001 #00105</span>
              </td>
              <td className="py-3.5 px-3 text-slate-700 font-medium">28/04 12:42 PM</td>
              <td className="py-3.5 px-3 text-slate-700">Carlos Cajero</td>
              <td className="py-3.5 px-3 text-right font-mono font-black text-amber-950 tabular-nums">
                C$ 850.00
              </td>
              <td className="py-3.5 px-3 text-center">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-300">
                  POR REVISAR
                </span>
              </td>
              <td className="py-3.5 px-4 text-center">
                <button
                  type="button"
                  className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all shadow-xs ${
                    isVoidBtnPressed
                      ? 'bg-red-700 text-white scale-95 shadow-inner'
                      : 'bg-red-50 text-red-700 border border-red-300 hover:bg-red-100'
                  }`}
                >
                  Anular
                </button>
              </td>
            </tr>

            {/* Fila #00106 */}
            <tr className={`transition-colors ${highlightRow === 106 ? 'bg-slate-100/90' : ''}`}>
              <td className="py-3.5 px-4 font-mono font-bold text-slate-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>SERIE-001 #00106</span>
              </td>
              <td className="py-3.5 px-3 text-slate-600">28/04 12:48 PM</td>
              <td className="py-3.5 px-3 text-slate-700">Carlos Cajero</td>
              <td className="py-3.5 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                C$ 195.00
              </td>
              <td className="py-3.5 px-3 text-center">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  <Check className="w-3 h-3" /> EMITIDA
                </span>
              </td>
              <td className="py-3.5 px-4 text-center">
                <span className="text-slate-400 text-[11px]">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Sello de Integridad Correlativa */}
      <div className="bg-white rounded-lg p-3.5 border border-slate-200 flex items-center justify-between text-xs text-slate-700 shadow-xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#00BF81]" />
          <span>
            Verificación Correlativa DGI:{' '}
            <span className="font-mono font-bold text-[#003757]">
              #00104 ➔ #00105 ➔ #00106
            </span>
          </span>
        </div>
        <span className="text-emerald-800 font-bold bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[10px]">
          100% Continua
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- DIÁLOGO MODAL DE ANULACIÓN

export const VoidModal: React.FC<{
  radioSelected?: boolean;
  pinDigits?: number; // 0 a 4
  isConfirmPressed?: boolean;
  isConfirmed?: boolean;
}> = ({
  radioSelected = false,
  pinDigits = 0,
  isConfirmPressed = false,
  isConfirmed = false,
}) => {
  return (
    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-6 z-50">
      <div className="w-[660px] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800 animate-scaleIn">
        {/* Header del Diálogo */}
        <div className="bg-[#003757] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold leading-tight flex items-center gap-2">
                <span>Anular Factura Fiscal</span>
                <span className="font-mono text-amber-300">#00105</span>
              </h3>
              <p className="text-[11px] text-white/70">
                Monto: C$ 850.00 · Serie: SERIE-001 · Cajero: Carlos Cajero
              </p>
            </div>
          </div>
          <span className="text-[10px] bg-white/10 px-2.5 py-1 rounded-md text-[#2FE0A4] font-semibold">
            DGI 09-2007
          </span>
        </div>

        {/* Cuerpo del Diálogo */}
        <div className="p-6 space-y-5">
          {/* Alerta de Inmutabilidad */}
          <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
            <CheckCircle2 className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Factura Inmutable:</span> El registro no se borra. Queda formalmente archivado con motivo y firma digital, preservando el consecutivo fiscal inalterado.
            </div>
          </div>

          {/* Motivos DGI Formales (VoidReasonCodes) */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              1. Motivo Formal DGI Obligatorio *
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {/* Opción 1: Error de Captura */}
              <div
                className={`p-3 rounded-xl border-2 transition-all flex items-center gap-3 cursor-pointer ${
                  radioSelected
                    ? 'border-[#00BF81] bg-emerald-50/60 shadow-xs'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    radioSelected ? 'border-[#00BF81] bg-[#00BF81]' : 'border-slate-400'
                  }`}
                >
                  {radioSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Error de captura / digitación</div>
                  <div className="text-[10px] text-slate-500 font-mono">ERROR_DE_CAPTURA</div>
                </div>
              </div>

              {/* Opción 2: Cliente Desiste */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center gap-3 opacity-60">
                <div className="w-4 h-4 rounded-full border border-slate-300" />
                <div>
                  <div className="text-xs font-medium text-slate-700">Cliente desiste</div>
                  <div className="text-[10px] text-slate-400 font-mono">CLIENTE_DESISTE</div>
                </div>
              </div>

              {/* Opción 3: Ticket Duplicado */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center gap-3 opacity-60">
                <div className="w-4 h-4 rounded-full border border-slate-300" />
                <div>
                  <div className="text-xs font-medium text-slate-700">Ticket duplicado</div>
                  <div className="text-[10px] text-slate-400 font-mono">TICKET_DUPLICADO</div>
                </div>
              </div>

              {/* Opción 4: Otro motivo formal */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center gap-3 opacity-60">
                <div className="w-4 h-4 rounded-full border border-slate-300" />
                <div>
                  <div className="text-xs font-medium text-slate-700">Otro motivo formal</div>
                  <div className="text-[10px] text-slate-400 font-mono">OTRO</div>
                </div>
              </div>
            </div>
          </div>

          {/* Autorización de Supervisor (PIN) */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
              <span>2. Autorización de Supervisor *</span>
              <span className="text-[11px] text-slate-500 font-normal">PIN de 4 dígitos</span>
            </label>

            <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2">
                {[0, 1, 2, 3].map((idx) => {
                  const filled = pinDigits > idx;
                  return (
                    <div
                      key={idx}
                      className={`w-11 h-11 rounded-lg border-2 flex items-center justify-center font-mono text-xl font-black transition-all ${
                        filled
                          ? 'border-[#00BF81] bg-emerald-50 text-emerald-800'
                          : 'border-slate-300 bg-white text-slate-400'
                      }`}
                    >
                      {filled ? '•' : ''}
                    </div>
                  );
                })}
              </div>

              <div className="flex-1 pl-3 border-l border-slate-200">
                {pinDigits === 4 ? (
                  <div className="flex items-center gap-1.5 text-emerald-700 text-xs font-bold">
                    <UserCheck className="w-4 h-4 text-[#00BF81]" />
                    <span>PIN Validado: Gerencia</span>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 font-medium">
                    Ingrese el PIN numérico para registrar la anulación.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer del Diálogo */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            className="px-4 py-2 text-xs font-bold text-slate-600 rounded-lg"
          >
            Cancelar
          </button>

          {isConfirmed ? (
            <div className="px-5 py-2.5 rounded-lg bg-emerald-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm">
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Anulación Registrada · Secuencia Preservada</span>
            </div>
          ) : (
            <button
              type="button"
              className={`px-5 py-2.5 rounded-lg font-bold text-xs transition-all shadow-sm flex items-center gap-2 ${
                radioSelected && pinDigits === 4
                  ? isConfirmPressed
                    ? 'bg-red-800 text-white scale-95'
                    : 'bg-red-600 text-white hover:bg-red-700 shadow-md'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <FileCheck className="w-4 h-4" />
              <span>Confirmar Anulación Fiscal</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- CONTENIDO DE EXPORTACIONES

export const ExportsContent: React.FC<{
  isExcelPressed?: boolean;
  isExportSuccess?: boolean;
}> = ({ isExcelPressed = false, isExportSuccess = false }) => {
  return (
    <div className="space-y-5">
      {/* Tarjeta de Libro de Ventas (fiscal-page.tsx: ExportsTab) */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#003757]">
              Libro de Ventas Fiscal (Ley 822)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Período: Abril 2025 · 106 facturas correlativas auditadas
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className={`px-4 py-2 rounded-md font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs ${
                isExcelPressed
                  ? 'bg-emerald-700 text-white scale-95'
                  : isExportSuccess
                  ? 'bg-[#00BF81] text-slate-950 font-black shadow-md'
                  : 'bg-[#003757] text-white hover:bg-[#0A4D73]'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar Excel (.xlsx)</span>
            </button>

            <button
              type="button"
              className="px-3 py-2 rounded-md font-bold text-xs bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1 opacity-70"
            >
              <Table className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        {/* Toast de Descarga Exitosa */}
        {isExportSuccess && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center justify-between text-xs text-emerald-800 animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#00BF81]" />
              <span>
                Archivo generado:{' '}
                <span className="font-mono font-bold">libro_ventas_abril_2025.xlsx</span>
              </span>
            </div>
            <span className="font-bold text-emerald-900 text-[10px] uppercase">
              Listo para Declarar
            </span>
          </div>
        )}

        {/* Desglose Fiscal Oficial */}
        <div className="space-y-2.5 text-xs">
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span className="text-slate-600 font-medium">Total Registros Auditados</span>
            <span className="font-mono font-bold text-slate-900">106 documentos</span>
          </div>

          <div className="flex justify-between py-1 border-b border-slate-100">
            <span className="text-slate-600 font-medium">Ventas Brutas Facturadas</span>
            <span className="font-mono font-bold text-slate-900">C$ 145,280.00</span>
          </div>

          <div className="flex justify-between py-1 border-b border-slate-100">
            <span className="text-slate-600 font-medium flex items-center gap-1.5">
              <span>Base Imponible Gravable (15% IVA)</span>
              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                Art. 150
              </span>
            </span>
            <span className="font-mono font-bold text-emerald-700">C$ 126,330.43</span>
          </div>

          <div className="flex justify-between py-1 border-b border-slate-100">
            <span className="text-slate-600 font-medium">IVA Débito Fiscal Recaudado</span>
            <span className="font-mono font-bold text-[#003757]">C$ 18,949.57</span>
          </div>

          <div className="flex justify-between py-1 border-b border-slate-100">
            <span className="text-slate-600 font-medium">Facturas Anuladas con Motivo Formal</span>
            <span className="font-mono font-bold text-amber-700">2 facturas (C$ 850.00)</span>
          </div>

          <div className="flex justify-between py-1">
            <span className="text-slate-600 font-medium">Retención en la Fuente Alcaldía (1%)</span>
            <span className="font-mono font-medium text-slate-700">C$ 1,263.30</span>
          </div>
        </div>
      </div>

      {/* Sello de Cuadre Automático */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 flex items-center justify-between text-xs text-emerald-900">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-[#00BF81]" />
          <div>
            <div className="font-bold">Cuadre Automático al 100% con Cierres Z</div>
            <div className="text-[11px] text-emerald-700">
              Cero diferencias · Sin necesidad de transcribir papeles ni cuadrar hojas de cálculo
            </div>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded bg-[#00BF81] text-slate-950 font-black text-[10px]">
          CUADRADO
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- CONTENIDO DE AUDITORÍA FORENSE

export const AuditContent: React.FC = () => {
  return (
    <div className="space-y-4">
      {/* Filtro de Fuente Oficial (audit-page.tsx) */}
      <div className="flex items-center gap-2">
        <span className="px-3 py-1 rounded-full text-xs font-medium text-slate-500 bg-slate-100">
          Registro de la plataforma
        </span>
        <span className="px-3 py-1 rounded-full text-xs font-bold text-white bg-[#003757] shadow-xs flex items-center gap-1.5">
          <History className="w-3.5 h-3.5" />
          <span>Bitácora del mostrador (POS)</span>
        </span>
      </div>

      {/* 3 Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
          <span className="text-[10px] font-semibold uppercase text-slate-500">Eventos Críticos</span>
          <p className="text-xl font-bold text-slate-900 font-mono">0</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 shadow-xs">
          <span className="text-[10px] font-semibold uppercase text-amber-800">Advertencias</span>
          <p className="text-xl font-bold text-amber-900 font-mono">2</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
          <span className="text-[10px] font-semibold uppercase text-slate-500">Informativos</span>
          <p className="text-xl font-bold text-slate-900 font-mono">104</p>
        </div>
      </div>

      {/* Tabla Forense */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
            <tr>
              <th className="py-2.5 px-3">Hora</th>
              <th className="py-2.5 px-3">Operación / Evento</th>
              <th className="py-2.5 px-3">Cajero / Dispositivo</th>
              <th className="py-2.5 px-3">Autorización</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            <tr className="bg-amber-50/70">
              <td className="py-3 px-3 font-mono font-bold text-slate-900">12:42 PM</td>
              <td className="py-3 px-3">
                <div className="font-bold text-amber-900">ANULACIÓN FACTURA #00105</div>
                <div className="text-[10px] text-slate-500">Motivo: ERROR_DE_CAPTURA</div>
              </td>
              <td className="py-3 px-3 text-slate-700">Carlos Cajero (Caja 1)</td>
              <td className="py-3 px-3">
                <span className="inline-flex items-center gap-1 text-emerald-800 font-bold text-[10px]">
                  <UserCheck className="w-3.5 h-3.5 text-[#00BF81]" />
                  PIN Supervisor
                </span>
              </td>
            </tr>
            <tr>
              <td className="py-2.5 px-3 font-mono text-slate-600">12:35 PM</td>
              <td className="py-2.5 px-3 font-semibold text-slate-800">
                VENTA EMITIDA FACTURA #00104 (C$ 340.00)
              </td>
              <td className="py-2.5 px-3 text-slate-600">Carlos Cajero (Caja 1)</td>
              <td className="py-2.5 px-3 text-slate-400">—</td>
            </tr>
            <tr>
              <td className="py-2.5 px-3 font-mono text-slate-600">12:30 PM</td>
              <td className="py-2.5 px-3 font-semibold text-slate-800">
                APERTURA DE CAJA / ARQUEO INICIAL
              </td>
              <td className="py-2.5 px-3 text-slate-600">Carlos Cajero (Caja 1)</td>
              <td className="py-2.5 px-3 text-slate-400">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
