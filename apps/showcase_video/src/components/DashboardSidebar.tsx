import React from 'react';
import { staticFile, Img } from 'remotion';
import {
  LayoutDashboard,
  ShoppingCart,
  Wallet,
  ClipboardCheck,
  Package,
  FileText,
  Tag,
  Box,
  Gift,
  SlidersHorizontal,
  Award,
  FlaskConical,
  QrCode,
  Users,
  Smartphone,
  History,
  UserCircle,
  Settings,
} from 'lucide-react';

interface DashboardSidebarProps {
  activePath: string; // '/' | '/customers' | '/promotions' etc.
}

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({ activePath }) => {
  return (
    <aside className="w-[260px] bg-[#003757] text-white flex flex-col shrink-0 border-r border-white/10 select-none h-full">
      {/* Brand Header idéntico a sidebar.tsx */}
      <div className="h-16 flex items-center px-4 gap-3 border-b border-white/10 shrink-0">
        <div className="h-9 w-9 shrink-0 rounded-lg overflow-hidden flex items-center justify-center shadow-xs">
          <Img
            src={staticFile('logo.png')}
            alt="NHILOS POS"
            className="h-full w-full object-contain"
          />
        </div>
        <span className="text-base font-bold tracking-tight text-white leading-tight truncate">
          NHILOS POS
        </span>
      </div>

      {/* Navegación con TODAS las opciones oficiales */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-3 text-xs">
        {/* SECCIÓN PRINCIPAL */}
        <div className="space-y-0.5">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/50">
            Principal
          </p>
          <div
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md transition ${
              activePath === '/' ? 'bg-white/15 text-white font-semibold' : 'text-white/80'
            }`}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            <span>Dashboard</span>
          </div>
          <div
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md transition ${
              activePath === '/sales' ? 'bg-white/15 text-white font-semibold' : 'text-white/80'
            }`}
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            <span>Ventas</span>
          </div>
          <div
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md transition ${
              activePath === '/inventory' ? 'bg-white/15 text-white font-semibold' : 'text-white/80'
            }`}
          >
            <Package className="h-3.5 w-3.5" />
            <span>Inventario</span>
          </div>
          <div
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md transition ${
              activePath === '/fiscal' ? 'bg-white/15 text-white font-semibold' : 'text-white/80'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Fiscal</span>
          </div>
        </div>

        {/* SECCIÓN GESTIÓN */}
        <div className="space-y-0.5">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/50">
            Gestión
          </p>
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-white/80">
            <Wallet className="h-3.5 w-3.5" />
            <span>Sesiones de caja</span>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-white/80">
            <ClipboardCheck className="h-3.5 w-3.5" />
            <span>Correcciones kardex</span>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-white/80">
            <Tag className="h-3.5 w-3.5" />
            <span>Catálogo</span>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-white/80">
            <Box className="h-3.5 w-3.5" />
            <span>Productos</span>
          </div>
          <div
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md transition ${
              activePath === '/promotions'
                ? 'bg-white/15 text-white font-semibold shadow-xs'
                : 'text-white/80'
            }`}
          >
            <Gift className={`h-3.5 w-3.5 ${activePath === '/promotions' ? 'text-[#00BF81]' : ''}`} />
            <span>Promociones</span>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-white/80">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Modificadores</span>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-white/80">
            <Award className="h-3.5 w-3.5" />
            <span>Fidelización</span>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-white/80">
            <FlaskConical className="h-3.5 w-3.5" />
            <span>Recetas</span>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-white/80">
            <QrCode className="h-3.5 w-3.5" />
            <span>QR del menú</span>
          </div>
        </div>

        {/* SECCIÓN ADMINISTRACIÓN */}
        <div className="space-y-0.5">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/50">
            Administración
          </p>
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-white/80">
            <Users className="h-3.5 w-3.5" />
            <span>Usuarios</span>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-white/80">
            <Smartphone className="h-3.5 w-3.5" />
            <span>Dispositivos</span>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-white/80">
            <History className="h-3.5 w-3.5" />
            <span>Auditoría</span>
          </div>
          <div
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md transition ${
              activePath === '/customers'
                ? 'bg-white/15 text-white font-semibold shadow-xs'
                : 'text-white/80'
            }`}
          >
            <UserCircle className={`h-3.5 w-3.5 ${activePath === '/customers' ? 'text-[#00BF81]' : ''}`} />
            <span>Clientes</span>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-white/80">
            <Settings className="h-3.5 w-3.5" />
            <span>Configuración</span>
          </div>
        </div>
      </div>

      {/* Footer de Usuario */}
      <div className="border-t border-white/15 p-3 flex items-center gap-2.5 shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-xs font-bold text-white">
          O
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-white">Octavio Morales</p>
          <p className="text-[10px] text-white/50 capitalize">Owner</p>
        </div>
      </div>
    </aside>
  );
};
