import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { User, Printer, Sparkles, Building2, Search, X, QrCode } from 'lucide-react';
import { Cursor } from '../components/Cursor';

export const POSCheckoutScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const posProgress = spring({
    frame,
    fps,
    config: { damping: 17, mass: 0.9 },
  });

  const posScale = interpolate(posProgress, [0, 1], [0.94, 1]);
  const posOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  // Apertura del modal CustomerSelectDialog en POS:
  // Clic en ASIGNAR CLIENTE (frame 30-35) -> Se abre en frame 35 y se cierra en frame 115
  const isCustomerModalOpen = frame >= 35 && frame < 118;
  const isCustomerSelected = frame >= 118;

  // Animación del modal de cliente en POS
  const modalProgress = spring({
    frame: Math.max(0, frame - 35),
    fps,
    config: { damping: 18 },
  });
  const modalScale = interpolate(modalProgress, [0, 1], [0.9, 1]);
  const modalOpacity = interpolate(frame, [35, 45], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Tipeo en el buscador del modal en POS
  const query = 'Banco';
  const queryLen = Math.floor(
    interpolate(frame, [50, 75], [0, query.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  );
  const typedQuery = query.slice(0, queryLen);

  // Trayectoria precisa del cursor táctil en POS:
  // 1. Botón "ASIGNAR CLIENTE" (210, 83): llega en 25, reposa 25-30, clic 30-35.
  // 2. Fila "Banco Atlántico" en modal (210, 306): viaja 80-105, reposa 105-110, clic 110-115.
  // 3. Botón "Cobrar Factura Fiscal DGI" (210, 708): viaja 160-190, reposa 190-195, clic 195-200.
  const cursorX = interpolate(
    frame,
    [0, 25, 35, 80, 105, 115, 160, 190, 200],
    [210, 210, 210, 210, 210, 210, 210, 210, 210],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const cursorY = interpolate(
    frame,
    [0, 25, 35, 80, 105, 115, 160, 190, 200],
    [260, 83, 83, 83, 405, 405, 405, 708, 708],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const isCursorClicked =
    (frame >= 30 && frame <= 35) ||
    (frame >= 110 && frame <= 115) ||
    (frame >= 195 && frame <= 200);

  // Detección automática del descuento en carrito tras seleccionar cliente
  const discountProgress = spring({
    frame: Math.max(0, frame - 125),
    fps,
    config: { damping: 15 },
  });
  const discountScale = interpolate(discountProgress, [0, 1], [0.85, 1]);
  const discountOpacity = interpolate(frame, [125, 140], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div className="w-full h-full bg-[#001F33] flex items-center justify-center p-8 relative overflow-hidden font-sans">
      <div className="flex items-center gap-12 max-w-6xl w-full z-10">
        {/* Terminal POS Físico Sunmi V2s (Aspect Ratio 800x1280) */}
        <div
          className="relative rounded-[40px] bg-slate-900 p-4 shadow-2xl border-4 border-slate-700/80 overflow-hidden"
          style={{
            transform: `scale(${posScale})`,
            opacity: posOpacity,
            width: '420px',
            height: '760px',
          }}
        >
          {/* Cursor táctil dentro de la pantalla del POS */}
          <Cursor x={cursorX} y={cursorY} clicked={isCursorClicked} visible={frame < 230} />

          {/* Cámara superior */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-4 bg-slate-800 rounded-full flex items-center justify-center z-30">
            <div className="w-2 h-2 rounded-full bg-slate-950" />
          </div>

          {/* Pantalla del POS (Fiel a Flutter SaleView) */}
          <div className="w-full h-full bg-white rounded-[28px] overflow-hidden flex flex-col pt-3 text-slate-800 relative">
            {/* Barra superior de estado */}
            <div className="h-10 bg-[#003757] text-white px-4 flex items-center justify-between text-[11px] font-medium shrink-0">
              <span className="font-bold tracking-wider text-[#00BF81]">NHILOS POS</span>
              <span>Caja 01 · Sofía M.</span>
              <span className="flex items-center gap-1 text-[#00BF81]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00BF81]" />
                En Línea
              </span>
            </div>

            {/* Cabecera del Carrito con Selección de Cliente */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 shrink-0">
              {isCustomerSelected ? (
                <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-300 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                      <Building2 className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 leading-tight">
                        Banco Atlántico de Nicaragua
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        RUC: J0310000123456
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                    CONVENIO 15%
                  </span>
                </div>
              ) : (
                <button
                  className={`w-full py-2.5 px-3 border rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition ${
                    frame >= 28 && frame < 36
                      ? 'border-[#00BF81] bg-emerald-50 text-emerald-800 scale-95'
                      : 'border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  <span>ASIGNAR CLIENTE</span>
                </button>
              )}
            </div>

            {/* Ítems del Carrito */}
            <div className="flex-1 p-3 space-y-2 overflow-y-auto">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-900">2x Combo Almuerzo Ejecutivo</div>
                  <div className="text-[10px] text-slate-500">Plato fuerte + Refresco</div>
                </div>
                <div className="text-xs font-bold text-slate-900">C$ 500.00</div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-900">1x Café Americano 8oz</div>
                  <div className="text-[10px] text-slate-500">Tueste oscuro SOHO</div>
                </div>
                <div className="text-xs font-bold text-slate-900">C$ 60.00</div>
              </div>

              {/* Banner de Convenio Automático */}
              {isCustomerSelected && (
                <div
                  className="p-2.5 rounded-xl bg-[#00BF81] text-slate-950 shadow-sm flex items-center justify-between"
                  style={{
                    opacity: discountOpacity,
                    transform: `scale(${discountScale})`,
                  }}
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span className="text-[11px]">Convenio Banco Atlántico (-15%)</span>
                  </div>
                  <span className="text-xs font-extrabold">-C$ 75.00</span>
                </div>
              )}
            </div>

            {/* Resumen de Cobro y Totales */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-1.5 shrink-0">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Subtotal Menú:</span>
                <span>C$ 560.00</span>
              </div>

              {isCustomerSelected && (
                <div className="flex justify-between text-xs font-bold text-emerald-700">
                  <span>Descuento Convenio (15%):</span>
                  <span>-C$ 75.00</span>
                </div>
              )}

              <div className="flex justify-between text-base font-extrabold text-slate-900 pt-1 border-t border-slate-200">
                <span>Total a Cobrar:</span>
                <span className="text-emerald-700">
                  {isCustomerSelected ? 'C$ 485.00' : 'C$ 560.00'}
                </span>
              </div>

              <button
                className={`w-full mt-2 py-3 text-white rounded-xl font-bold text-xs shadow-md flex items-center justify-center gap-2 transition ${
                  frame >= 195 && frame < 205 ? 'bg-emerald-700 scale-98' : 'bg-[#003757]'
                }`}
              >
                <Printer className="w-4 h-4 text-[#00BF81]" />
                Cobrar Factura Fiscal DGI
              </button>
            </div>

            {/* ======================================================== */}
            {/* MODAL FIEL: CustomerSelectDialog (Flutter AlertDialog)   */}
            {/* ======================================================== */}
            {isCustomerModalOpen && (
              <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-40">
                <div
                  className="w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
                  style={{
                    transform: `scale(${modalScale})`,
                    opacity: modalOpacity,
                    maxHeight: '520px',
                  }}
                >
                  {/* Título del Dialog */}
                  <div className="p-4 pb-2 flex items-center justify-between border-b border-slate-100">
                    <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                      <User className="h-4 w-4 text-[#003757]" />
                      <span>Seleccionar Cliente</span>
                    </div>
                    <X className="h-4 w-4 text-slate-400" />
                  </div>

                  {/* Buscador de clientes */}
                  <div className="p-3 space-y-2">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          readOnly
                          value={typedQuery}
                          placeholder="Nombre, teléfono, cédula..."
                          className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none"
                        />
                      </div>
                      <button className="px-2.5 py-2 border border-slate-300 rounded-lg text-slate-600 bg-slate-50">
                        <QrCode className="h-4 w-4" />
                      </button>
                    </div>

                    <button className="w-full py-1.5 px-3 border border-slate-200 rounded-md text-[11px] font-medium text-slate-500 bg-slate-50">
                      Consumidor Final (Sin Cliente Asignado)
                    </button>
                  </div>

                  {/* Lista de clientes */}
                  <div className="flex-1 overflow-y-auto divide-y divide-slate-100 px-3 pb-3 text-xs">
                    {/* Opción 1: Banco Atlántico */}
                    <div
                      className={`p-2.5 rounded-lg flex items-center gap-3 transition ${
                        frame >= 105 ? 'bg-emerald-50 border border-emerald-300 scale-98' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-[#003757] text-white flex items-center justify-center font-bold text-xs shrink-0">
                        B
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900 text-xs">
                          Banco Atlántico de Nicaragua
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          RUC: J0310000123456 · Convenio
                        </div>
                      </div>
                    </div>

                    {/* Opción 2: Corporación Pellas */}
                    {typedQuery.length === 0 && (
                      <div className="p-2.5 rounded-lg flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                          C
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-900 text-xs">
                            Corporación Pellas S.A.
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            RUC: J0310000987654
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Lado Derecho: Explicación de Valor */}
        <div className="flex-1 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-[#00BF81] text-xs font-bold uppercase tracking-wider">
            Paso 3: Cobro en Caja
          </div>

          <h2 className="text-4xl font-extrabold text-white leading-tight">
            El descuento se activa solo al seleccionar al cliente.
          </h2>

          <div className="space-y-4 text-slate-300 text-sm leading-relaxed">
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-[#00BF81] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                1
              </div>
              <div>
                <strong className="text-white block font-semibold">Cero ambigüedad:</strong>
                El cajero no necesita memorizar códigos ni ingresar porcentajes manuales.
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-[#00BF81] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                2
              </div>
              <div>
                <strong className="text-white block font-semibold">Trazabilidad Fiscal:</strong>
                La factura se emite directamente con el RUC de la empresa y el desglose de promoción auditado.
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-[#00BF81] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                3
              </div>
              <div>
                <strong className="text-white block font-semibold">Control de Horarios y Días:</strong>
                La tarifa preferencial solo aplica dentro del rango configurado en Backoffice (Lun-Vie 11:30 - 15:00).
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
