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
  activePath: string;
  compact?: boolean;
  userName?: string;
  userRole?: string;
}

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Principal',
    items: [
      { label: 'Dashboard', path: '/', icon: LayoutDashboard },
      { label: 'Ventas', path: '/sales', icon: ShoppingCart },
      { label: 'Inventario', path: '/inventory', icon: Package },
      { label: 'Fiscal', path: '/fiscal', icon: FileText },
    ],
  },
  {
    title: 'Gestión',
    items: [
      { label: 'Sesiones de caja', path: '/cash', icon: Wallet },
      { label: 'Correcciones de inventario', path: '/kardex', icon: ClipboardCheck },
      { label: 'Catálogo', path: '/catalog', icon: Tag },
      { label: 'Productos', path: '/products', icon: Box },
      { label: 'Promociones', path: '/promotions', icon: Gift },
      { label: 'Modificadores', path: '/modifiers', icon: SlidersHorizontal },
      { label: 'Fidelización', path: '/loyalty', icon: Award },
      { label: 'Recetas', path: '/recipes', icon: FlaskConical },
      { label: 'QR del menú', path: '/menu-qr', icon: QrCode },
    ],
  },
  {
    title: 'Administración',
    items: [
      { label: 'Usuarios', path: '/users', icon: Users },
      { label: 'Dispositivos', path: '/devices', icon: Smartphone },
      { label: 'Auditoría', path: '/audit', icon: History },
      { label: 'Clientes', path: '/customers', icon: UserCircle },
      { label: 'Configuración', path: '/settings', icon: Settings },
    ],
  },
];

const isActivePath = (activePath: string, path: string): boolean =>
  path === '/' ? activePath === '/' : activePath.startsWith(path);

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  activePath,
  compact = false,
  userName = 'Octavio Morales',
  userRole = 'Owner',
}) => {
  const itemClass = compact ? 'px-3 py-[5px] text-[11.5px]' : 'px-3 py-1.5 text-xs';
  const iconClass = compact ? 'h-3 w-3' : 'h-3.5 w-3.5';
  const sectionClass = compact ? 'px-3 pb-0.5 text-[9.5px]' : 'px-3 pb-1 text-[10px]';

  return (
    <aside className="w-[260px] bg-[#003757] text-white flex flex-col shrink-0 border-r border-white/10 select-none h-full">
      {/* Brand Header idéntico a sidebar.tsx */}
      <div
        className={`${
          compact ? 'h-14' : 'h-16'
        } flex items-center px-4 gap-3 border-b border-white/10 shrink-0`}
      >
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

      {/* Navegación con TODAS las opciones oficiales de sidebar.tsx */}
      <div
        className={`flex-1 overflow-hidden px-2 ${
          compact ? 'py-2 space-y-2' : 'py-3 space-y-3'
        } text-xs`}
      >
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-0.5">
            <p
              className={`${sectionClass} font-semibold uppercase tracking-wider text-white/50`}
            >
              {section.title}
            </p>
            {section.items.map((item) => {
              const active = isActivePath(activePath, item.path);
              const Icon = item.icon;
              return (
                <div
                  key={item.path}
                  className={`relative flex items-center gap-2.5 rounded-md transition ${itemClass} ${
                    active
                      ? 'bg-white/15 text-white font-semibold shadow-xs'
                      : 'text-white/80'
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-1 rounded-r-full bg-[#00BF81]" />
                  )}
                  <Icon
                    className={`${iconClass} ${active ? 'text-[#00BF81]' : ''}`}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer de Usuario */}
      <div
        className={`border-t border-white/15 flex items-center gap-2.5 shrink-0 ${
          compact ? 'p-2.5' : 'p-3'
        }`}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-xs font-bold text-white">
          {userName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-white">{userName}</p>
          <p className="text-[10px] text-white/50 capitalize">{userRole}</p>
        </div>
      </div>
    </aside>
  );
};
