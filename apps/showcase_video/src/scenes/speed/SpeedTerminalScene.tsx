import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Coffee, ShoppingCart, Check, Plus, Wifi, User, Clock, ChevronRight } from 'lucide-react';

export const SpeedTerminalScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrada de la terminal
  const enterSpring = spring({
    frame,
    fps,
    config: { damping: 16, mass: 0.9 },
  });

  // Tiempos de interacción táctil:
  // 1. Toque en producto "Cappuccino Artesanal": frames 25-30
  // 2. Apertura del modal de modificadores/extras: frame 32 a 120
  // 3. Toque en modificador "Leche de Almendras": frames 70-75
  // 4. Toque en "AGREGAR AL PEDIDO": frames 110-115
  // 5. Cierre modal y actualización carrito: frame 120+
  // 6. Toque en botón grande "COBRAR": frames 185-195

  const isModalOpen = frame >= 32 && frame < 122;
  const isExtraSelected = frame >= 75;
  const isItemInCart = frame >= 122;
  const isCobrarClicked = frame >= 190 && frame <= 200;

  // Animación del modal de extras
  const modalSpring = spring({
    frame: Math.max(0, frame - 32),
    fps,
    config: { damping: 18 },
  });

  // Coordenadas del puntero táctil (relativas a la pantalla del terminal 480x780)
  // Posiciones clave:
  // - Tarjeta Cappuccino: X=120, Y=260
  // - Opción Leche Almendras en modal: X=240, Y=385
  // - Botón AGREGAR AL PEDIDO: X=240, Y=565
  // - Botón COBRAR: X=360, Y=730
  const touchX = interpolate(
    frame,
    [0, 22, 32, 60, 72, 85, 105, 115, 140, 180, 195],
    [120, 120, 120, 240, 240, 240, 240, 240, 360, 360, 360],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const touchY = interpolate(
    frame,
    [0, 22, 32, 60, 72, 85, 105, 115, 140, 180, 195],
    [260, 175, 175, 435, 435, 435, 595, 595, 760, 760, 760],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const isTouched =
    (frame >= 25 && frame <= 30) ||
    (frame >= 72 && frame <= 77) ||
    (frame >= 112 && frame <= 117) ||
    (frame >= 190 && frame <= 198);

  // Subtítulos cinéticos
  const sub1Opacity = interpolate(frame, [10, 25, 130, 140], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const sub2Opacity = interpolate(frame, [140, 155, 265, 275], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div className="w-full h-full bg-[#001F33] flex flex-col items-center justify-between p-8 relative overflow-hidden font-sans">
      {/* Luz ambiental */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-[#003757]/60 rounded-full blur-[140px] pointer-events-none" />

      {/* Header Superior del Reel (Alineado exactamente con Escena 1: margen superior >= 128px para zona segura de Reels/Amigos) */}
      <div className="w-full pt-24 flex flex-col items-center z-10 text-center">
        <span className="text-sm font-bold text-[#00BF81] tracking-widest uppercase bg-[#00BF81]/15 px-6 py-2 rounded-full border border-[#00BF81]/40 mb-3 shadow-sm">
          Punto de Venta Ágil
        </span>
        <h2
          className="text-4xl font-extrabold text-white tracking-wide"
          style={{ fontFamily: 'Renogare, Poppins, sans-serif' }}
        >
          Marcación & Extras en Segundos
        </h2>
      </div>

      {/* Mockup Físico de Terminal MIRAY Q80 Centrado en flex-1 */}
      <div className="w-full flex-1 flex items-center justify-center z-20">
        <div
          className="relative rounded-[48px] bg-slate-900 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.6)] border-4 border-slate-700/80 overflow-hidden origin-center"
          style={{
            width: '540px',
            height: '860px',
            transform: `scale(${interpolate(enterSpring, [0, 1], [0.95, 1.25])})`,
          }}
        >
        {/* Ranura Superior Impresora Térmica 58mm */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-48 h-3.5 bg-slate-800 rounded-full flex items-center justify-center z-30 border border-slate-700">
          <div className="w-32 h-1 bg-black/70 rounded-full" />
        </div>

        {/* Pantalla Táctil del POS */}
        <div className="w-full h-full bg-[#F8FAFC] rounded-[32px] overflow-hidden flex flex-col pt-3 text-slate-800 relative">
          {/* Barra Superior de Estado (SaleView real) */}
          <div className="h-10 bg-[#003757] text-white px-3 flex items-center justify-between text-[11px] font-medium shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-wide">Café San Juan</span>
              <span className="text-white/40">|</span>
              <span className="text-white/80 flex items-center gap-1">
                <User className="w-3 h-3" /> Carlos Cajero
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-[#00BF81]/25 text-[#00BF81] border border-[#00BF81]/40 px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1">
                <Wifi className="w-3 h-3" /> En Línea
              </span>
              <span className="text-white/70">12:45 PM</span>
            </div>
          </div>

          {/* Barra de Filtro de Categorías (CategoryFilterBar real) */}
          <div className="h-11 bg-white border-b border-slate-200 px-3 flex items-center gap-2 shrink-0 overflow-hidden">
            <span className="px-3 py-1 rounded-full text-[11px] font-medium text-slate-600 bg-slate-100">
              Todos
            </span>
            <span className="px-3 py-1 rounded-full text-[11px] font-bold text-white bg-[#003757] shadow-sm">
              Bebidas Calientes
            </span>
            <span className="px-3 py-1 rounded-full text-[11px] font-medium text-slate-600 bg-slate-100">
              Bebidas Frías
            </span>
            <span className="px-3 py-1 rounded-full text-[11px] font-medium text-slate-600 bg-slate-100">
              Postres
            </span>
          </div>

          {/* Cuadrícula de Productos (ProductCard - Q80 3 columnas) */}
          <div className="flex-1 p-3 overflow-hidden">
            <div className="grid grid-cols-3 gap-2.5">
              {/* Producto 1: Cappuccino Artesanal (Objetivo de marcación) */}
              <div
                className={`bg-white rounded-xl p-2.5 border-2 shadow-sm flex flex-col justify-between h-[135px] transition-all relative ${
                  frame >= 25 && frame <= 35
                    ? 'border-[#00BF81] bg-emerald-50/50 scale-[0.98]'
                    : 'border-slate-200'
                }`}
              >
                <div className="w-full h-14 bg-amber-50 rounded-lg flex items-center justify-center text-amber-800">
                  <Coffee className="w-7 h-7" />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-800 leading-tight line-clamp-1">
                    Cappuccino Artesanal
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">BOH / Barra</div>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                  <span className="text-[11px] font-extrabold text-[#003757]">C$ 85.00</span>
                  <span className="w-5 h-5 rounded-full bg-[#003757] text-white flex items-center justify-center text-[10px]">
                    <Plus className="w-3 h-3" />
                  </span>
                </div>
              </div>

              {/* Producto 2: Café Americano */}
              <div className="bg-white rounded-xl p-2.5 border border-slate-200 shadow-sm flex flex-col justify-between h-[135px]">
                <div className="w-full h-14 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600">
                  <Coffee className="w-7 h-7" />
                </div>
                <div className="text-[11px] font-bold text-slate-800 leading-tight">Café Americano</div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                  <span className="text-[11px] font-extrabold text-[#003757]">C$ 60.00</span>
                  <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px]">
                    <Plus className="w-3 h-3" />
                  </span>
                </div>
              </div>

              {/* Producto 3: Latte Vainilla (Bebida Caliente) */}
              <div className="bg-white rounded-xl p-2.5 border border-slate-200 shadow-sm flex flex-col justify-between h-[135px]">
                <div className="w-full h-14 bg-amber-50/70 rounded-lg flex items-center justify-center text-amber-900">
                  <Coffee className="w-7 h-7" />
                </div>
                <div className="text-[11px] font-bold text-slate-800 leading-tight">Latte Vainilla</div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                  <span className="text-[11px] font-extrabold text-[#003757]">C$ 90.00</span>
                  <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px]">
                    <Plus className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </div>

            {/* Fila 2 de productos (Todos de Bebidas Calientes) */}
            <div className="grid grid-cols-3 gap-2.5 mt-2.5 opacity-60">
              <div className="bg-white rounded-xl p-2.5 border border-slate-200 h-[100px] flex flex-col justify-between">
                <div className="text-[10px] font-bold text-slate-800">Espresso Doble</div>
                <div className="text-[10px] font-bold text-[#003757]">C$ 55.00</div>
              </div>
              <div className="bg-white rounded-xl p-2.5 border border-slate-200 h-[100px] flex flex-col justify-between">
                <div className="text-[10px] font-bold text-slate-800">Mocha Caliente</div>
                <div className="text-[10px] font-bold text-[#003757]">C$ 95.00</div>
              </div>
              <div className="bg-white rounded-xl p-2.5 border border-slate-200 h-[100px] flex flex-col justify-between">
                <div className="text-[10px] font-bold text-slate-800">Chocolate Caliente</div>
                <div className="text-[10px] font-bold text-[#003757]">C$ 70.00</div>
              </div>
            </div>
          </div>

          {/* Panel Inferior: Resumen de Carrito y Botón COBRAR (>56 dp) */}
          <div className="bg-white border-t-2 border-slate-200 p-3.5 shadow-lg shrink-0">
            {isItemInCart ? (
              <div className="mb-2 bg-emerald-50/70 border border-[#00BF81]/40 rounded-xl p-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded bg-[#003757] text-white flex items-center justify-center text-[9px]">
                      1
                    </span>
                    Cappuccino Artesanal
                  </span>
                  <span className="text-[#003757]">C$ 105.00</span>
                </div>
                <div className="text-[10px] text-emerald-700 font-semibold pl-5 mt-0.5 flex items-center gap-1">
                  <Check className="w-2.5 h-2.5" /> + Leche de Almendras (+C$ 20.00)
                </div>
              </div>
            ) : (
              <div className="mb-2 h-10 border border-dashed border-slate-300 rounded-xl flex items-center justify-center text-xs text-slate-400">
                Seleccione un producto para iniciar
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Total a Cobrar
                </span>
                <span
                  className="text-2xl font-black text-[#003757]"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {isItemInCart ? 'C$ 105.00' : 'C$ 0.00'}
                </span>
              </div>

              {/* Botón COBRAR con target generoso >56 dp de alto */}
              <button
                className={`flex-1 h-14 rounded-xl font-black text-sm tracking-wider uppercase flex items-center justify-center gap-2 transition-transform shadow-md ${
                  isItemInCart
                    ? isCobrarClicked
                      ? 'bg-[#009665] text-white scale-[0.97]'
                      : 'bg-[#00BF81] text-slate-900 hover:bg-[#2FE0A4]'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
                style={{ minHeight: '56px' }}
              >
                <span>Cobrar</span>
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Diálogo Modal de Modificadores / Extras (_showOptionsDialog real) */}
          {isModalOpen && (
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4 z-40">
              <div
                className="w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-w-sm"
                style={{
                  transform: `scale(${interpolate(modalSpring, [0, 1], [0.9, 1])})`,
                }}
              >
                {/* Header del Diálogo */}
                <div className="bg-[#003757] text-white p-3.5 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold leading-tight">Cappuccino Artesanal</h3>
                    <p className="text-[11px] text-white/70">Personalización de Extras</p>
                  </div>
                  <span className="text-sm font-extrabold text-[#2FE0A4]">C$ 85.00</span>
                </div>

                {/* Contenido de Modificadores */}
                <div className="p-3.5 space-y-3">
                  <div>
                    <div className="text-xs font-bold text-slate-800 mb-0.5">Tipo de Leche</div>
                    <div className="text-[10px] text-slate-500 mb-2">Elija una opción (Opcional)</div>

                    {/* Opción 1: Leche Entera */}
                    <div className="flex items-center justify-between p-2 rounded-lg border border-slate-200 mb-1.5 bg-slate-50">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border border-slate-400 flex items-center justify-center" />
                        <span className="text-xs text-slate-700 font-medium">Leche Entera</span>
                      </div>
                      <span className="text-xs text-slate-500 font-bold">+C$ 0.00</span>
                    </div>

                    {/* Opción 2: Leche de Almendras (Seleccionada) */}
                    <div
                      className={`flex items-center justify-between p-2 rounded-lg border-2 transition-all ${
                        isExtraSelected
                          ? 'border-[#00BF81] bg-emerald-50 text-emerald-950'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isExtraSelected
                              ? 'border-[#00BF81] bg-[#00BF81] text-white'
                              : 'border-slate-400'
                          }`}
                        >
                          {isExtraSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className="text-xs font-bold">Leche de Almendras</span>
                      </div>
                      <span className="text-xs font-extrabold text-[#003757]">+C$ 20.00</span>
                    </div>
                  </div>

                  {/* Sección Otros Adicionales */}
                  <div className="border-t border-slate-100 pt-2 opacity-60">
                    <div className="text-[11px] font-bold text-slate-700 mb-1">Adicionales</div>
                    <div className="flex items-center justify-between text-xs text-slate-600 py-1">
                      <span>Extra Shot Espresso</span>
                      <span className="font-semibold">+C$ 15.00</span>
                    </div>
                  </div>
                </div>

                {/* Footer Modal: Botón AGREGAR AL PEDIDO */}
                <div className="p-3 bg-slate-50 border-t border-slate-200 flex gap-2">
                  <button className="px-3 py-2 text-xs font-bold text-slate-500 rounded-lg">
                    Cancelar
                  </button>
                  <button className="flex-1 h-11 bg-[#003757] text-white rounded-lg text-xs font-bold tracking-wide uppercase shadow hover:bg-[#0A4D73] flex items-center justify-center gap-1.5">
                    <Check className="w-4 h-4 text-[#00BF81]" />
                    <span>Agregar al Pedido</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Indicador Táctil (Toque en Pantalla) */}
          <div
            className="absolute pointer-events-none z-50 transition-transform duration-75"
            style={{
              left: `${touchX}px`,
              top: `${touchY}px`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {/* Círculo indicador de toque */}
            <div className="w-10 h-10 rounded-full bg-white/70 border-2 border-[#00BF81] shadow-xl flex items-center justify-center">
              <div className="w-3.5 h-3.5 rounded-full bg-[#00BF81]" />
            </div>

            {/* Onda expansiva de pulsación (<50 ms feedback) */}
            {isTouched && (
              <span className="absolute -inset-2 rounded-full bg-[#00BF81]/50 animate-ping pointer-events-none" />
            )}
          </div>
        </div>
      </div>
      </div>

      {/* Subtítulos Cinéticos (En flujo normal con altura reservada para zona segura de Reels: bottom >= 280px) */}
      <div className="w-full h-[320px] flex flex-col items-center justify-start pt-6 z-30 text-center">
        {frame < 140 && (
          <div
            className="text-5xl font-black text-white tracking-[2px] drop-shadow-lg"
            style={{
              fontFamily: 'Renogare, Poppins, sans-serif',
              opacity: sub1Opacity,
            }}
          >
            Respuesta táctil: &lt;50 ms
          </div>
        )}

        {frame >= 140 && (
          <div
            className="text-5xl font-black text-[#00BF81] tracking-[2px] drop-shadow-[0_0_20px_rgba(0,191,129,0.4)]"
            style={{
              fontFamily: 'Renogare, Poppins, sans-serif',
              opacity: sub2Opacity,
            }}
          >
            Teclado limpio y seguro.
          </div>
        )}
      </div>
    </div>
  );
};
