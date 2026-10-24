import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Handshake, Check, X } from 'lucide-react';

export const CustomerDialogScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animación del modal emergiendo
  const modalProgress = spring({
    frame,
    fps,
    config: { damping: 18, mass: 0.9 },
  });

  const modalScale = interpolate(modalProgress, [0, 1], [0.94, 1]);
  const modalOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  // Tipeo de datos en campos
  const name = 'Banco Atlántico de Nicaragua';
  const nameLength = Math.floor(
    interpolate(frame, [15, 55], [0, name.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  );
  const typedName = name.slice(0, nameLength);

  const ruc = 'J0310000123456';
  const rucLength = Math.floor(
    interpolate(frame, [45, 80], [0, ruc.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  );
  const typedRuc = ruc.slice(0, rucLength);

  // Clic en guardar (frame > 140) y toast (frame > 148)
  const isSaved = frame > 140;
  const toastOpacity = interpolate(frame, [145, 160], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const toastY = interpolate(frame, [145, 160], [15, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div className="w-full h-full bg-[#001F33]/90 flex items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* Backdrop desenfocado idéntico a Radix UI dialog */}
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs" />

      {/* Modal Dialog Card Fiel a CustomerDialog */}
      <div
        className="w-full max-w-[560px] bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden relative z-10 flex flex-col"
        style={{
          transform: `scale(${modalScale})`,
          opacity: modalOpacity,
        }}
      >
        {/* Header con botón cerrar */}
        <div className="p-6 pb-4 flex items-start justify-between border-b border-slate-100">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 leading-none">
              Editar Cliente
            </h3>
            <p className="text-xs text-slate-500 mt-2">
              Administrá los datos fiscales y el tipo de cliente para facturación y convenios.
            </p>
          </div>
          <button className="text-slate-400 hover:text-slate-600 p-1 rounded-md">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Formulario */}
        <div className="p-6 space-y-4 text-xs">
          {/* Nombre / Razón Social */}
          <div className="space-y-1.5">
            <label className="font-medium text-slate-700">
              Nombre / Razón Social <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              readOnly
              value={typedName}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm text-slate-900 shadow-xs focus:outline-none"
            />
          </div>

          {/* Tipo de Cliente (Select real) */}
          <div className="space-y-1.5">
            <label className="font-medium text-slate-700">
              Tipo de Cliente <span className="text-rose-500">*</span>
            </label>
            <div className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-900 flex items-center justify-between shadow-xs">
              <span className="font-medium">Empresa / Jurídica</span>
              <span className="text-slate-400 text-[10px]">▼</span>
            </div>
          </div>

          {/* Fila RUC y Teléfono */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="font-medium text-slate-700">
                RUC / Cédula
              </label>
              <input
                type="text"
                readOnly
                value={typedRuc}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono text-slate-900 shadow-xs focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-medium text-slate-700">
                Teléfono
              </label>
              <input
                type="text"
                readOnly
                value="+505 2278-0000"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-900 shadow-xs focus:outline-none"
              />
            </div>
          </div>

          {/* Correo Electrónico */}
          <div className="space-y-1.5">
            <label className="font-medium text-slate-700">
              Correo Electrónico
            </label>
            <input
              type="text"
              readOnly
              value="convenios@atlantico.ni"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-900 shadow-xs focus:outline-none"
            />
          </div>

          {/* Alerta de Convenio Activo Fiel a la UI */}
          <div className="flex items-center gap-2.5 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-800">
            <Handshake className="h-4 w-4 shrink-0 text-emerald-700" />
            <div>
              <span>Convenio comercial activo: </span>
              <strong className="font-semibold text-emerald-900">
                Convenio Corporativo 15% (Almuerzos Ejecutivos)
              </strong>
            </div>
          </div>
        </div>

        {/* Footer con botones reales */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 rounded-md text-xs font-medium text-slate-700">
            Cancelar
          </button>
          <button
            className={`px-4 py-2 rounded-md text-xs font-semibold text-white shadow-xs transition flex items-center gap-1.5 ${
              isSaved ? 'bg-emerald-700' : 'bg-[#003757] hover:bg-[#0A4D73]'
            }`}
          >
            {isSaved && <Check className="h-3.5 w-3.5" />}
            {isSaved ? 'Guardado' : 'Guardar cambios'}
          </button>
        </div>

        {/* Toast Notificación Fiel a shadcn/ui toast */}
        {frame > 145 && (
          <div
            className="absolute bottom-3 left-4 right-4 bg-slate-900 text-white p-3 rounded-lg shadow-xl border border-slate-800 flex items-center justify-between"
            style={{
              opacity: toastOpacity,
              transform: `translateY(${toastY}px)`,
            }}
          >
            <div>
              <div className="text-xs font-semibold text-emerald-400">Cliente actualizado</div>
              <div className="text-[11px] text-slate-300">
                "Banco Atlántico de Nicaragua" fue actualizado exitosamente.
              </div>
            </div>
            <span className="text-[10px] text-slate-500">Cerrar</span>
          </div>
        )}
      </div>
    </div>
  );
};
