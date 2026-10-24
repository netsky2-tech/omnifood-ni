import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig, staticFile, Img } from 'remotion';
import {
  LayoutDashboard,
  ShoppingCart,
  Wallet,
  Package,
  FileText,
  Tag,
  Gift,
  Award,
  Users,
  Smartphone,
  History,
  UserCircle,
  Settings,
  UserPlus,
  Search,
  Handshake,
  PlusCircle,
  Edit,
  UserMinus,
  Store,
} from 'lucide-react';

export const DirectoryScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enterProgress = spring({
    frame,
    fps,
    config: { damping: 18, mass: 0.9 },
  });

  const windowScale = interpolate(enterProgress, [0, 1], [0.95, 1]);
  const windowOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  // Tipeo en búsqueda
  const query = 'Banco Atlántico';
  const typeIndex = Math.min(
    query.length,
    Math.floor(interpolate(frame, [25, 60], [0, query.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
  );
  const typedSearch = query.slice(0, typeIndex);

  // Activación de filtros
  const filterConvenioActive = frame > 75;

  return (
    <div className="w-full h-full bg-[#001F33] flex items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* Ventana completa y fiel del Owner Dashboard */}
      <div
        className="w-full max-w-[1720px] h-[920px] bg-slate-50 rounded-xl shadow-2xl overflow-hidden border border-slate-300 flex"
        style={{
          transform: `scale(${windowScale})`,
          opacity: windowOpacity,
        }}
      >
        {/* ======================================================== */}
        {/* SIDEBAR REAL DEL OWNER DASHBOARD (bg-primary-700 / #003757) */}
        {/* ======================================================== */}
        <aside className="w-[260px] bg-[#003757] text-white flex flex-col shrink-0 border-r border-white/10 select-none">
          {/* Header con el logo oficial del proyecto */}
          <div className="h-16 flex items-center px-4 gap-3 border-b border-white/10">
            <div className="h-9 w-9 shrink-0 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center shadow-xs">
              <Img
                src={staticFile('logo.png')}
                alt="NHILOS POS"
                className="h-full w-full object-contain"
              />
            </div>
            <span className="text-base font-bold tracking-tight text-white leading-tight">
              NHILOS POS
            </span>
          </div>

          {/* Navegación lateral idéntica a sidebar.tsx */}
          <div className="flex-1 overflow-y-auto px-2 py-4 space-y-4 text-xs">
            {/* Sección Principal */}
            <div className="space-y-1">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                Principal
              </p>
              <div className="flex items-center gap-3 px-3 py-2 rounded-md text-white/80 hover:bg-white/10">
                <LayoutDashboard className="h-4 w-4" />
                <span>Dashboard</span>
              </div>
              <div className="flex items-center gap-3 px-3 py-2 rounded-md text-white/80 hover:bg-white/10">
                <ShoppingCart className="h-4 w-4" />
                <span>Ventas</span>
              </div>
              <div className="flex items-center gap-3 px-3 py-2 rounded-md text-white/80 hover:bg-white/10">
                <Package className="h-4 w-4" />
                <span>Inventario</span>
              </div>
              <div className="flex items-center gap-3 px-3 py-2 rounded-md text-white/80 hover:bg-white/10">
                <FileText className="h-4 w-4" />
                <span>Fiscal</span>
              </div>
            </div>

            {/* Sección Gestión */}
            <div className="space-y-1">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                Gestión
              </p>
              <div className="flex items-center gap-3 px-3 py-2 rounded-md text-white/80 hover:bg-white/10">
                <Tag className="h-4 w-4" />
                <span>Catálogo</span>
              </div>
              <div className="flex items-center gap-3 px-3 py-2 rounded-md text-white/80 hover:bg-white/10">
                <Gift className="h-4 w-4" />
                <span>Promociones</span>
              </div>
              <div className="flex items-center gap-3 px-3 py-2 rounded-md text-white/80 hover:bg-white/10">
                <Award className="h-4 w-4" />
                <span>Fidelización</span>
              </div>
            </div>

            {/* Sección Administración con CLIENTES activo */}
            <div className="space-y-1">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                Administración
              </p>
              <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-white/15 text-white font-semibold shadow-xs">
                <UserCircle className="h-4 w-4 text-[#00BF81]" />
                <span>Clientes</span>
              </div>
              <div className="flex items-center gap-3 px-3 py-2 rounded-md text-white/80 hover:bg-white/10">
                <Users className="h-4 w-4" />
                <span>Usuarios</span>
              </div>
              <div className="flex items-center gap-3 px-3 py-2 rounded-md text-white/80 hover:bg-white/10">
                <Smartphone className="h-4 w-4" />
                <span>Dispositivos</span>
              </div>
              <div className="flex items-center gap-3 px-3 py-2 rounded-md text-white/80 hover:bg-white/10">
                <History className="h-4 w-4" />
                <span>Auditoría</span>
              </div>
              <div className="flex items-center gap-3 px-3 py-2 rounded-md text-white/80 hover:bg-white/10">
                <Settings className="h-4 w-4" />
                <span>Configuración</span>
              </div>
            </div>
          </div>

          {/* Footer de usuario en Sidebar */}
          <div className="border-t border-white/15 p-3 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-xs font-bold text-white">
              O
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">Octavio Morales</p>
              <p className="text-[10px] text-white/50 capitalize">Owner</p>
            </div>
          </div>
        </aside>

        {/* ======================================================== */}
        {/* CONTENIDO PRINCIPAL FIEL (Header + CustomersPage real)    */}
        {/* ======================================================== */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">
          {/* Header Superior del Dashboard */}
          <header className="h-16 shrink-0 border-b border-slate-200 bg-white px-8 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5 text-[#003757]" />
              <div className="flex flex-col">
                <h2 className="text-base font-semibold text-slate-900 leading-tight">
                  SOHO Café
                </h2>
                <span className="text-[11px] text-slate-500">
                  RUC: J0310000000000
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-[#00BF81]" />
                En Línea
              </span>
            </div>
          </header>

          {/* Vista CustomersPage real */}
          <main className="flex-1 p-8 space-y-6 overflow-y-auto">
            {/* Cabecera del Módulo */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  Clientes
                </h1>
                <p className="text-sm text-slate-500">
                  Directorio de clientes, convenios comerciales y programas de fidelización.
                </p>
              </div>

              <button className="inline-flex items-center gap-2 px-4 py-2 bg-[#003757] hover:bg-[#0A4D73] text-white text-sm font-medium rounded-md shadow-xs transition">
                <UserPlus className="h-4 w-4" />
                <span>+ Nuevo Cliente</span>
              </button>
            </div>

            {/* Pestañas idénticas a customers-page.tsx */}
            <div className="border-b border-slate-200">
              <nav className="-mb-px flex gap-6 text-sm font-medium">
                <span className="border-b-2 border-[#003757] pb-3 text-[#003757] font-semibold cursor-pointer">
                  Directorio
                </span>
                <span className="border-b-2 border-transparent pb-3 text-slate-500 hover:text-slate-800 cursor-pointer">
                  Perfil de Lealtad
                </span>
                <span className="border-b-2 border-transparent pb-3 text-slate-500 hover:text-slate-800 cursor-pointer">
                  Programas y Recompensas
                </span>
              </nav>
            </div>

            {/* Buscador de clientes */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  readOnly
                  value={typedSearch}
                  placeholder="Buscar por nombre, RUC/cédula, teléfono o correo..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-md shadow-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Barra de Filtros idéntica a customers-list.tsx */}
            <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-md border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Estado:</span>
                <div className="h-8 px-3 rounded-md border border-slate-300 bg-white text-xs flex items-center justify-between text-slate-800 font-medium w-[120px]">
                  <span>Solo activos</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Tipo:</span>
                <div className="h-8 px-3 rounded-md border border-slate-300 bg-white text-xs flex items-center justify-between text-slate-800 font-medium w-[140px]">
                  <span>Todos los tipos</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Convenio:</span>
                <div
                  className={`h-8 px-3 rounded-md border text-xs flex items-center justify-between font-semibold transition ${
                    filterConvenioActive
                      ? 'border-[#00BF81] bg-emerald-50 text-emerald-800'
                      : 'border-slate-300 bg-white text-slate-800'
                  } w-[150px]`}
                >
                  <span>{filterConvenioActive ? 'Con Convenio' : 'Todos'}</span>
                </div>
              </div>
            </div>

            {/* Tabla de Clientes idéntica a customers-list.tsx */}
            <div className="rounded-md border border-slate-200 bg-white shadow-xs overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="py-3 px-4">Nombre / Razón Social</th>
                    <th className="py-3 px-3">Tipo</th>
                    <th className="py-3 px-3">RUC / Cédula</th>
                    <th className="py-3 px-4">Contacto</th>
                    <th className="py-3 px-4">Convenio Comercial</th>
                    <th className="py-3 px-3">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
                  {/* Fila 1: Banco Atlántico */}
                  <tr className="bg-emerald-50/30">
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-900 text-sm">
                          Banco Atlántico de Nicaragua
                        </span>
                        <span className="text-slate-500 text-[11px]">
                          Edificio Corporativo km 4.5 Masaya
                        </span>
                      </div>
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
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#00BF81] text-slate-950 font-bold text-xs shadow-xs">
                        <Handshake className="h-3.5 w-3.5" />
                        Convenio Corporativo 15%
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 text-[11px] font-medium">
                        Activo
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2 text-slate-400">
                        <Edit className="h-4 w-4 hover:text-slate-700 cursor-pointer" />
                        <UserMinus className="h-4 w-4 hover:text-rose-600 cursor-pointer" />
                      </div>
                    </td>
                  </tr>

                  {/* Fila 2: Corporación Pellas */}
                  <tr>
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-900 text-sm">
                          Corporación Pellas S.A.
                        </span>
                        <span className="text-slate-500 text-[11px]">Plaza Pellas Piso 6</span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded border border-slate-200 text-slate-700 bg-slate-50 font-normal">
                        Empresa
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600">J0310000987654</td>
                    <td className="py-3 px-4 text-slate-600">
                      <div>compras@pellas.com.ni</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#00BF81] text-slate-950 font-bold text-xs shadow-xs">
                        <Handshake className="h-3.5 w-3.5" />
                        Convenio Corporativo 10%
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 text-[11px] font-medium">
                        Activo
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2 text-slate-400">
                        <Edit className="h-4 w-4 hover:text-slate-700 cursor-pointer" />
                        <UserMinus className="h-4 w-4 hover:text-rose-600 cursor-pointer" />
                      </div>
                    </td>
                  </tr>

                  {/* Fila 3: Carlos Mendoza */}
                  <tr>
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-900 text-sm">
                          Carlos Mendoza Rivas
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded border border-slate-200 text-slate-700 bg-slate-50 font-normal">
                        Persona Natural
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600">001-120590-0004W</td>
                    <td className="py-3 px-4 text-slate-600">
                      <div>carlos.mendoza@gmail.com</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-slate-50 text-slate-600 text-xs">
                        <PlusCircle className="h-3 w-3 text-slate-400" />
                        Asignar convenio
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 text-[11px] font-medium">
                        Activo
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2 text-slate-400">
                        <Edit className="h-4 w-4 hover:text-slate-700 cursor-pointer" />
                        <UserMinus className="h-4 w-4 hover:text-rose-600 cursor-pointer" />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};
