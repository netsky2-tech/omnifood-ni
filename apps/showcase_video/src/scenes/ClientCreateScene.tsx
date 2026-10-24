import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  UserPlus,
  Search,
  Store,
  X,
  Check,
  Edit,
  UserMinus,
  Building2,
  User,
} from 'lucide-react';
import { DashboardSidebar } from '../components/DashboardSidebar';
import { Cursor } from '../components/Cursor';

export const ClientCreateScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Activación de navegación: se activa tras el clic en Clientes (frame 26)
  const isClientesNavActive = frame >= 26;

  // Apertura del modal: se abre tras el clic en + Nuevo Cliente (frame 54)
  const isModalOpen = frame >= 54 && frame < 205;

  // Apertura y selección del dropdown "Tipo de Cliente":
  // Clic en el select en frame 100 -> se abre dropdown.
  // Clic en "Empresa / Jurídica" en frame 116 -> se cierra y queda seleccionado.
  const isTypeDropdownOpen = frame >= 100 && frame < 118;
  const isEmpresaSelected = frame >= 118;

  // Trayectoria precisa del cursor:
  // 1. Sidebar "Clientes" (120, 640): llega en 18, reposa 18-22, clic 22-26.
  // 2. Botón "+ Nuevo Cliente" (1620, 116): viaja 30-48, reposa 48-51, clic 51-55.
  // 3. Trigger "Tipo de Cliente" (860, 485): viaja 86-96, reposa 96-99, clic 99-103.
  // 4. Opción "Empresa / Jurídica" en dropdown (860, 530): desciende 105-114, reposa 114-116, clic 116-120.
  // 5. Botón "Guardar cliente" (1065, 688): viaja 150-174, reposa 174-177, clic 177-182.
  const cursorX = interpolate(
    frame,
    [0, 18, 26, 30, 48, 55, 86, 96, 103, 105, 114, 120, 150, 174, 182],
    [350, 120, 120, 120, 1620, 1620, 1620, 860, 860, 860, 860, 860, 860, 1065, 1065],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const cursorY = interpolate(
    frame,
    [0, 18, 26, 30, 48, 55, 86, 96, 103, 105, 114, 120, 150, 174, 182],
    [260, 640, 640, 640, 116, 116, 116, 485, 485, 485, 530, 530, 530, 688, 688],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Clics sincronizados con cada elemento
  const isCursorClicked =
    (frame >= 22 && frame <= 26) ||
    (frame >= 51 && frame <= 55) ||
    (frame >= 99 && frame <= 103) ||
    (frame >= 116 && frame <= 120) ||
    (frame >= 177 && frame <= 182);

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

  // Tipeo de datos en el modal
  const name = 'Banco Atlántico de Nicaragua';
  const nameLen = Math.floor(
    interpolate(frame, [65, 90], [0, name.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  );
  const typedName = name.slice(0, nameLen);

  const ruc = 'J0310000123456';
  const rucLen = Math.floor(
    interpolate(frame, [122, 145], [0, ruc.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  );
  const typedRuc = ruc.slice(0, rucLen);

  // Guardado y toast tras el clic del frame 180
  const isSaved = frame >= 180;
  const toastOpacity = interpolate(frame, [183, 195], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Fila visible en la tabla tras el guardado
  const showSavedInTable = frame >= 205;

  return (
    <div className="w-full h-full bg-[#001F33] flex items-center justify-center p-6 relative overflow-hidden font-sans">
      <div className="w-full max-w-[1720px] h-[920px] bg-slate-50 rounded-xl shadow-2xl overflow-hidden border border-slate-300 flex relative">
        <Cursor x={cursorX} y={cursorY} clicked={isCursorClicked} visible={frame < 225} />

        {/* SIDEBAR OFICIAL CON TODAS LAS OPCIONES */}
        <DashboardSidebar activePath={isClientesNavActive ? '/customers' : '/'} />

        {/* CONTENIDO PRINCIPAL */}
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
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Clientes</h1>
                <p className="text-sm text-slate-500">
                  Directorio de clientes, convenios comerciales y programas de fidelización.
                </p>
              </div>
              <button
                className={`inline-flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-md shadow-xs transition ${
                  frame >= 50 && frame < 58 ? 'bg-[#00BF81] scale-95' : 'bg-[#003757]'
                }`}
              >
                <UserPlus className="h-4 w-4" />
                <span>+ Nuevo Cliente</span>
              </button>
            </div>

            <div className="border-b border-slate-200">
              <nav className="-mb-px flex gap-6 text-sm font-medium">
                <span className="border-b-2 border-[#003757] pb-3 text-[#003757] font-semibold">
                  Directorio
                </span>
                <span className="border-b-2 border-transparent pb-3 text-slate-500">
                  Perfil de Lealtad
                </span>
                <span className="border-b-2 border-transparent pb-3 text-slate-500">
                  Programas y Recompensas
                </span>
              </nav>
            </div>

            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                readOnly
                placeholder="Buscar por nombre, RUC/cédula, teléfono o correo..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-md shadow-xs text-slate-900"
              />
            </div>

            <div className="rounded-md border border-slate-200 bg-white shadow-xs overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="py-3 px-4">Nombre / Razón Social</th>
                    <th className="py-3 px-3">Tipo</th>
                    <th className="py-3 px-3">RUC / Cédula</th>
                    <th className="py-3 px-4">Contacto</th>
                    <th className="py-3 px-3">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
                  {showSavedInTable && (
                    <tr className="bg-emerald-50/40">
                      <td className="py-3 px-4 font-semibold text-slate-900 text-sm">
                        Banco Atlántico de Nicaragua
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded border border-slate-200 text-slate-700 bg-slate-50 font-normal">
                          Empresa
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600">J0310000123456</td>
                      <td className="py-3 px-4 text-slate-600">
                        <div>+505 2278-0000</div>
                        <div className="text-slate-400">convenios@atlantico.ni</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 text-[11px] font-medium">
                          Activo
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2 text-slate-400">
                          <Edit className="h-4 w-4" />
                          <UserMinus className="h-4 w-4" />
                        </div>
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className="py-3 px-4 font-medium text-slate-900 text-sm">
                      Corporación Pellas S.A.
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded border border-slate-200 text-slate-700 bg-slate-50 font-normal">
                        Empresa
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600">J0310000987654</td>
                    <td className="py-3 px-4 text-slate-600">compras@pellas.com.ni</td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 text-[11px] font-medium">
                        Activo
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2 text-slate-400">
                        <Edit className="h-4 w-4" />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </main>
        </div>

        {/* MODAL FIEL: CustomerDialog con navegación del selector "Tipo de Cliente" */}
        {isModalOpen && (
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-6 z-50">
            <div
              className="w-full max-w-[560px] bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden flex flex-col relative"
              style={{
                transform: `scale(${modalScale})`,
                opacity: modalOpacity,
              }}
            >
              <div className="p-6 pb-4 flex items-start justify-between border-b border-slate-100">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 leading-none">
                    Nuevo Cliente
                  </h3>
                  <p className="text-xs text-slate-500 mt-2">
                    Administrá los datos fiscales y el tipo de cliente para facturación y convenios.
                  </p>
                </div>
                <X className="h-4 w-4 text-slate-400" />
              </div>

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
                    placeholder="Ej: Distribuidora Central S.A."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm text-slate-900 shadow-xs"
                  />
                </div>

                {/* Tipo de Cliente (Select interactivo con dropdown) */}
                <div className="space-y-1.5 relative">
                  <label className="font-medium text-slate-700">
                    Tipo de Cliente <span className="text-rose-500">*</span>
                  </label>
                  <div
                    className={`w-full px-3 py-2 rounded-md text-xs font-semibold flex items-center justify-between shadow-xs border transition ${
                      isEmpresaSelected
                        ? 'bg-emerald-50 border-[#00BF81] text-[#003757]'
                        : isTypeDropdownOpen
                        ? 'border-[#003757] ring-2 ring-[#003757]/20 bg-white text-slate-900'
                        : 'bg-white border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isEmpresaSelected ? (
                        <>
                          <Building2 className="h-4 w-4 text-[#00BF81]" />
                          <span>Empresa / Jurídica</span>
                        </>
                      ) : (
                        <>
                          <User className="h-4 w-4 text-slate-500" />
                          <span>Persona Natural</span>
                        </>
                      )}
                    </div>
                    <span className="text-slate-400 text-[10px]">▼</span>
                  </div>

                  {/* Dropdown flotante con las opciones de tipo de cliente */}
                  {isTypeDropdownOpen && (
                    <div className="absolute top-[62px] left-0 right-0 bg-white rounded-md border border-slate-200 shadow-xl z-50 p-1 space-y-1 animate-in fade-in-0 duration-100">
                      <div className="px-3 py-2 text-slate-700 text-xs flex items-center gap-2 rounded hover:bg-slate-100">
                        <User className="h-4 w-4 text-slate-500" />
                        <span>Persona Natural</span>
                      </div>
                      <div
                        className={`px-3 py-2 text-xs flex items-center gap-2 rounded transition ${
                          frame >= 110
                            ? 'bg-emerald-100 text-emerald-900 font-bold'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <Building2 className="h-4 w-4 text-[#00BF81]" />
                        <span>Empresa / Jurídica</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-medium text-slate-700">RUC / Cédula</label>
                    <input
                      type="text"
                      readOnly
                      value={typedRuc}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono text-slate-900 shadow-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-medium text-slate-700">Teléfono</label>
                    <input
                      type="text"
                      readOnly
                      value={frame > 135 ? '+505 2278-0000' : ''}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-900 shadow-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-medium text-slate-700">Correo Electrónico</label>
                  <input
                    type="text"
                    readOnly
                    value={frame > 145 ? 'convenios@atlantico.ni' : ''}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-900 shadow-xs"
                  />
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
                  {isSaved ? '¡Guardado!' : 'Guardar cliente'}
                </button>
              </div>

              {isSaved && (
                <div
                  className="absolute bottom-3 left-4 right-4 bg-slate-900 text-white p-3 rounded-lg shadow-xl border border-slate-800 flex items-center justify-between"
                  style={{ opacity: toastOpacity }}
                >
                  <div className="text-xs font-semibold text-emerald-400">
                    Cliente registrado exitosamente en el directorio.
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
