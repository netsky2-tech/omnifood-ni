import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  Plus,
  Store,
  X,
  Check,
  Percent,
  Handshake,
  MinusCircle,
  Building2,
  Globe,
  Package,
  Tag,
} from 'lucide-react';
import { DashboardSidebar } from '../components/DashboardSidebar';
import { Cursor } from '../components/Cursor';

export const PromotionCreateScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Navegación en sidebar a Promociones
  const isPromocionesNavActive = frame >= 26;

  // Apertura del modal
  const isModalOpen = frame >= 54 && frame < 275;

  // 1. Selector Tipo de Promoción
  const isTypeDropdownOpen = frame >= 92 && frame < 114;
  const isConvenioSelected = frame >= 114;

  // 2. Selector Alcance del Descuento
  const isAlcanceDropdownOpen = frame >= 138 && frame < 156;
  const isCustomerScopeSelected = frame >= 156;

  // 3. Selector de Cliente / Empresa
  const isCustomerSearchOpen = frame >= 178 && frame < 198;
  const isCustomerTargetSelected = frame >= 198;

  // Trayectoria precisa del cursor:
  // 1. Sidebar Promociones: (120, 391) -> clic 22-26
  // 2. Botón + Nueva Promoción: (1610, 116) -> clic 48-52
  // 3. Trigger Tipo de Promoción: (690, 415) -> clic 88-92
  // 4. Opción Convenio con Cliente: (690, 565) -> clic 110-114
  // 5. Trigger Alcance del Descuento: (1030, 415) -> clic 134-138
  // 6. Opción Cliente / Empresa específica: (1030, 510) -> clic 152-156
  // 7. Input Cliente / Empresa: (860, 485) -> clic 174-178
  // 8. Opción Banco Atlántico en lista: (860, 510) -> clic 194-198
  // 9. Botón Guardar Promoción: (1105, 755) -> clic 254-258
  const cursorX = interpolate(
    frame,
    [0, 18, 26, 32, 48, 52, 70, 88, 92, 98, 110, 114, 122, 134, 138, 142, 152, 156, 164, 174, 178, 184, 194, 198, 235, 252, 258],
    [120, 120, 120, 120, 1610, 1610, 1610, 690, 690, 690, 690, 690, 1030, 1030, 1030, 1030, 1030, 1030, 860, 860, 860, 860, 860, 860, 1105, 1105, 1105],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const cursorY = interpolate(
    frame,
    [0, 18, 26, 32, 48, 52, 70, 88, 92, 98, 110, 114, 122, 134, 138, 142, 152, 156, 164, 174, 178, 184, 194, 198, 235, 252, 258],
    [640, 391, 391, 391, 116, 116, 116, 415, 415, 415, 565, 565, 415, 415, 415, 510, 510, 510, 485, 485, 485, 510, 510, 510, 755, 755, 755],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const isCursorClicked =
    (frame >= 22 && frame <= 26) ||
    (frame >= 48 && frame <= 52) ||
    (frame >= 88 && frame <= 92) ||
    (frame >= 110 && frame <= 114) ||
    (frame >= 134 && frame <= 138) ||
    (frame >= 152 && frame <= 156) ||
    (frame >= 174 && frame <= 178) ||
    (frame >= 194 && frame <= 198) ||
    (frame >= 254 && frame <= 258);

  const modalProgress = spring({
    frame: Math.max(0, frame - 54),
    fps,
    config: { damping: 18, mass: 0.9 },
  });
  const modalScale = interpolate(modalProgress, [0, 1], [0.94, 1]);
  const modalOpacity = interpolate(frame, [54, 64], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Tipeo de nombre
  const promoName = 'Convenio Banco Atlántico';
  const nameLen = Math.floor(
    interpolate(frame, [60, 80], [0, promoName.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  );
  const typedPromoName = promoName.slice(0, nameLen);

  // Guardado y toast tras el clic en frame 255
  const isSaved = frame >= 255;
  const toastOpacity = interpolate(frame, [258, 270], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Fila visible en la tabla de promociones tras guardar
  const showSavedInTable = frame >= 275;

  return (
    <div className="w-full h-full bg-[#001F33] flex items-center justify-center p-6 relative overflow-hidden font-sans">
      <div className="w-full max-w-[1720px] h-[920px] bg-slate-50 rounded-xl shadow-2xl overflow-hidden border border-slate-300 flex relative">
        <Cursor x={cursorX} y={cursorY} clicked={isCursorClicked} visible={frame < 290} />

        {/* SIDEBAR OFICIAL CON TODAS LAS OPCIONES */}
        <DashboardSidebar activePath={isPromocionesNavActive ? '/promotions' : '/customers'} />

        {/* CONTENIDO PRINCIPAL: PromotionsList */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">
          <header className="h-16 shrink-0 border-b border-slate-200 bg-white px-8 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5 text-[#003757]" />
              <div className="flex flex-col">
                <h2 className="text-base font-semibold text-slate-900 leading-tight">SOHO Café</h2>
                <span className="text-[11px] text-slate-500">RUC: J0310000000000</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-[#00BF81]" />
                En Línea
              </span>
            </div>
          </header>

          <main className="flex-1 p-8 space-y-6 overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Promociones</h1>
                <p className="text-sm text-slate-500">
                  Configure descuentos, combos y convenios comerciales para sus clientes.
                </p>
              </div>
              <button
                className={`inline-flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-md shadow-xs transition ${
                  frame >= 46 && frame < 54 ? 'bg-[#00BF81] scale-95' : 'bg-[#003757]'
                }`}
              >
                <Plus className="h-4 w-4" />
                <span>+ Nueva Promoción</span>
              </button>
            </div>

            <div className="rounded-md border border-slate-200 bg-white shadow-xs overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="py-3 px-4">Nombre</th>
                    <th className="py-3 px-3">Tipo</th>
                    <th className="py-3 px-4">Objetivo / Cliente</th>
                    <th className="py-3 px-4">Reglas Horarias</th>
                    <th className="py-3 px-3 text-right">Descuento</th>
                    <th className="py-3 px-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
                  {showSavedInTable && (
                    <tr className="bg-emerald-50/40 font-medium">
                      <td className="py-3 px-4 font-bold text-slate-900 text-sm flex items-center gap-2">
                        <Handshake className="h-4 w-4 text-[#00BF81]" />
                        Convenio Banco Atlántico
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 text-[11px] font-semibold">
                          Convenio con Cliente
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-900 font-semibold">
                        Cliente: Banco Atlántico de Nicaragua
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        Lun, Mar, Mié, Jue, Vie · 11:30 - 15:00
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-emerald-700 text-sm">
                        15%
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[11px] font-semibold">
                          Activa
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className="py-3 px-4 font-medium text-slate-900 text-sm">
                      2x1 en Cerveza Toña
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded border border-slate-200 text-slate-700 bg-slate-50 text-[11px]">
                        Compra X Llévate Y
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500">Producto: Cerveza Toña 12oz</td>
                    <td className="py-3 px-4 text-slate-500">Viernes, Sábado · 17:00 - 21:00</td>
                    <td className="py-3 px-3 text-right font-medium">Compra 1 Lleva 1</td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px]">
                        Activa
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </main>
        </div>

        {/* MODAL FIEL: PromotionForm con navegación interactiva de opciones */}
        {isModalOpen && (
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-6 z-50">
            <div
              className="w-full max-w-[680px] bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col relative"
              style={{
                transform: `scale(${modalScale})`,
                opacity: modalOpacity,
              }}
            >
              <div className="p-6 pb-4 flex items-start justify-between border-b border-slate-100">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 leading-none">
                    Nueva Promoción
                  </h3>
                  <p className="text-xs text-slate-500 mt-1.5">
                    Configure las reglas, alcance y horarios para este convenio comercial.
                  </p>
                </div>
                <X className="h-4 w-4 text-slate-400" />
              </div>

              <div className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
                {/* Nombre de la Promoción */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-700">
                    Nombre de la Promoción <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={typedPromoName}
                    placeholder="Ej: Convenio Almuerzo Ejecutivo"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm text-slate-900 shadow-xs"
                  />
                </div>

                {/* Fila: Tipo de Promoción y Alcance del Descuento */}
                <div className="grid grid-cols-2 gap-4 relative">
                  {/* Campo 1: Tipo de Promoción */}
                  <div className="space-y-1.5 relative">
                    <label className="font-semibold text-slate-700">Tipo de Promoción *</label>
                    <div
                      className={`w-full px-3 py-2 rounded-md text-xs font-semibold flex items-center justify-between shadow-xs border transition ${
                        isConvenioSelected
                          ? 'bg-emerald-50 border-[#00BF81] text-emerald-900'
                          : isTypeDropdownOpen
                          ? 'border-[#003757] ring-2 ring-[#003757]/20 bg-white text-slate-900'
                          : 'bg-white border-slate-300 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {isConvenioSelected ? (
                          <>
                            <Handshake className="h-4 w-4 text-[#00BF81]" />
                            <span>Convenio con Cliente</span>
                          </>
                        ) : (
                          <>
                            <Percent className="h-4 w-4 text-slate-400" />
                            <span>Descuento Porcentaje</span>
                          </>
                        )}
                      </div>
                      <span className="text-slate-400 text-[10px]">▼</span>
                    </div>

                    {/* Menú desplegable Tipo de Promoción */}
                    {isTypeDropdownOpen && (
                      <div className="absolute top-[62px] left-0 right-0 bg-white rounded-md border border-slate-200 shadow-xl z-50 p-1 space-y-0.5 animate-in fade-in-0 duration-100">
                        <div className="px-2.5 py-1.5 text-slate-700 text-xs flex items-center gap-2 rounded hover:bg-slate-100">
                          <Package className="h-3.5 w-3.5 text-slate-500" />
                          <span>Compra X Llévate Y</span>
                        </div>
                        <div className="px-2.5 py-1.5 text-slate-700 text-xs flex items-center gap-2 rounded hover:bg-slate-100">
                          <Percent className="h-3.5 w-3.5 text-slate-500" />
                          <span>Descuento Porcentaje</span>
                        </div>
                        <div className="px-2.5 py-1.5 text-slate-700 text-xs flex items-center gap-2 rounded hover:bg-slate-100">
                          <MinusCircle className="h-3.5 w-3.5 text-slate-500" />
                          <span>Descuento Fijo</span>
                        </div>
                        <div className="px-2.5 py-1.5 text-slate-700 text-xs flex items-center gap-2 rounded hover:bg-slate-100">
                          <Tag className="h-3.5 w-3.5 text-slate-500" />
                          <span>Combo</span>
                        </div>
                        <div
                          className={`px-2.5 py-1.5 text-xs flex items-center gap-2 rounded transition ${
                            frame >= 108
                              ? 'bg-emerald-100 text-emerald-900 font-bold'
                              : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <Handshake className="h-3.5 w-3.5 text-[#00BF81]" />
                          <span>Convenio con Cliente</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Campo 2: Alcance del Descuento */}
                  <div className="space-y-1.5 relative">
                    <label className="font-semibold text-slate-700">Alcance del Descuento</label>
                    <div
                      className={`w-full px-3 py-2 rounded-md text-xs font-semibold flex items-center justify-between shadow-xs border transition ${
                        isCustomerScopeSelected
                          ? 'bg-emerald-50 border-[#00BF81] text-emerald-900'
                          : isAlcanceDropdownOpen
                          ? 'border-[#003757] ring-2 ring-[#003757]/20 bg-white text-slate-900'
                          : 'bg-white border-slate-300 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {isCustomerScopeSelected ? (
                          <>
                            <Building2 className="h-4 w-4 text-[#00BF81]" />
                            <span>Cliente / Empresa específica</span>
                          </>
                        ) : (
                          <>
                            <Globe className="h-4 w-4 text-slate-400" />
                            <span>Global (todos los clientes)</span>
                          </>
                        )}
                      </div>
                      <span className="text-slate-400 text-[10px]">▼</span>
                    </div>

                    {/* Menú desplegable Alcance del Descuento */}
                    {isAlcanceDropdownOpen && (
                      <div className="absolute top-[62px] left-0 right-0 bg-white rounded-md border border-slate-200 shadow-xl z-50 p-1 space-y-0.5 animate-in fade-in-0 duration-100">
                        <div className="px-2.5 py-2 text-slate-700 text-xs flex items-center gap-2 rounded hover:bg-slate-100">
                          <Globe className="h-3.5 w-3.5 text-slate-500" />
                          <span>Global (todos los clientes)</span>
                        </div>
                        <div
                          className={`px-2.5 py-2 text-xs flex items-center gap-2 rounded transition ${
                            frame >= 148
                              ? 'bg-emerald-100 text-emerald-900 font-bold'
                              : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <Building2 className="h-3.5 w-3.5 text-[#00BF81]" />
                          <span>Cliente / Empresa específica</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cliente / Empresa del Convenio (EntitySearchSelect) */}
                {isCustomerScopeSelected && (
                  <div className="space-y-1.5 relative animate-in fade-in-0 duration-150">
                    <label className="font-semibold text-slate-700">
                      Cliente / Empresa del Convenio <span className="text-rose-500">*</span>
                    </label>
                    <div
                      className={`w-full px-3 py-2.5 rounded-md text-xs flex items-center justify-between shadow-xs border transition ${
                        isCustomerTargetSelected
                          ? 'bg-white border-[#00BF81]'
                          : isCustomerSearchOpen
                          ? 'border-[#003757] ring-2 ring-[#003757]/20 bg-white'
                          : 'bg-white border-slate-300'
                      }`}
                    >
                      {isCustomerTargetSelected ? (
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-[#00BF81]" />
                          <span className="font-bold text-slate-900">
                            Banco Atlántico de Nicaragua
                          </span>
                          <span className="text-slate-400 font-mono text-[11px]">
                            (NIT: J0310000123456)
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">
                          {frame >= 180 ? 'Banco Atlántico...' : 'Buscar cliente o empresa por nombre/NIT...'}
                        </span>
                      )}
                      {isCustomerTargetSelected ? (
                        <Check className="h-4 w-4 text-[#00BF81]" />
                      ) : (
                        <span className="text-slate-400 text-[10px]">▼</span>
                      )}
                    </div>

                    {/* Menú desplegable de resultados de clientes */}
                    {isCustomerSearchOpen && (
                      <div className="absolute top-[66px] left-0 right-0 bg-white rounded-md border border-slate-200 shadow-xl z-50 p-1 space-y-1 animate-in fade-in-0 duration-100">
                        <div
                          className={`px-3 py-2 rounded text-xs flex items-center justify-between transition ${
                            frame >= 190
                              ? 'bg-emerald-100 text-emerald-900 font-bold'
                              : 'bg-slate-50 text-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-[#00BF81]" />
                            <span>Banco Atlántico de Nicaragua</span>
                          </div>
                          <span className="text-slate-500 font-mono text-[11px]">
                            NIT: J0310000123456
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Descuento y Categoría */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-slate-700">Porcentaje de Descuento *</label>
                    <div className="relative">
                      <input
                        type="text"
                        readOnly
                        value={frame > 200 ? '15' : ''}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-bold text-emerald-700 shadow-xs"
                      />
                      <Percent className="h-4 w-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-slate-700">Categoría Objetivo</label>
                    <div className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-700 flex items-center justify-between shadow-xs">
                      <span>Global (sin categoría)</span>
                      <span className="text-slate-400 text-[10px]">▼</span>
                    </div>
                  </div>
                </div>

                {/* Días de la Semana */}
                <div className="space-y-2">
                  <label className="font-semibold text-slate-700">Días de la Semana</label>
                  <div className="flex flex-wrap gap-1.5">
                    {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'].map((day) => (
                      <span
                        key={day}
                        className="px-3 py-1 rounded-full text-xs font-semibold bg-[#003757] text-white"
                      >
                        {day}
                      </span>
                    ))}
                    {['Sábado', 'Domingo'].map((day) => (
                      <span
                        key={day}
                        className="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-400 border border-slate-200"
                      >
                        {day}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Horario */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-slate-700">Hora Inicio</label>
                    <input
                      type="text"
                      readOnly
                      value={frame > 215 ? '11:30' : ''}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono text-slate-900 shadow-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-slate-700">Hora Fin</label>
                    <input
                      type="text"
                      readOnly
                      value={frame > 225 ? '15:00' : ''}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono text-slate-900 shadow-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
                <button className="px-4 py-2 border border-slate-300 bg-white rounded-md text-xs font-medium text-slate-700">
                  Cancelar
                </button>
                <button
                  className={`px-4 py-2 rounded-md text-xs font-semibold text-white shadow-xs transition flex items-center gap-1.5 ${
                    isSaved ? 'bg-emerald-700' : 'bg-[#003757]'
                  }`}
                >
                  {isSaved && <Check className="h-3.5 w-3.5" />}
                  {isSaved ? '¡Promoción Guardada!' : 'Guardar Promoción'}
                </button>
              </div>

              {isSaved && (
                <div
                  className="absolute bottom-3 left-4 right-4 bg-slate-900 text-white p-3 rounded-lg shadow-xl border border-slate-800 flex items-center justify-between"
                  style={{ opacity: toastOpacity }}
                >
                  <div className="text-xs font-semibold text-emerald-400">
                    Convenio comercial creado y sincronizado con terminales POS.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
