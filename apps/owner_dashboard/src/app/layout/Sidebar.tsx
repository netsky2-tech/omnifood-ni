'use client';

import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FileText,
  Tag,
  Utensils,
  Users,
  Settings,
  Users2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Ventas', href: '/sales', icon: ShoppingCart },
  { name: 'Inventario', href: '/inventory', icon: Package },
  { name: 'Fiscal', href: '/fiscal', icon: FileText },
  { name: 'Catálogo', href: '/catalog', icon: Tag, badge: 'W5' },
  { name: 'Promociones', href: '/promotions', icon: Tag, badge: 'W6', current: true },
  { name: 'Recetas', href: '/recipes', icon: Utensils, badge: 'W7' },
  { name: 'Usuarios', href: '/users', icon: Users, badge: 'W8' },
  { name: 'Configuración', href: '/settings', icon: Settings, badge: 'W9' },
  { name: 'Clientes', href: '/customers', icon: Users2, badge: 'W10' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen bg-primary transition-all duration-200 border-r border-primary-100',
        collapsed ? 'w-18' : 'w-64'
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center justify-between px-4 border-b border-primary-100">
          {!collapsed && (
            <NavLink to="/" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
                <span className="text-secondary-foreground font-bold text-lg">O</span>
              </div>
              <span className="text-primary-foreground font-semibold text-lg">OmniCommerce</span>
            </NavLink>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              'p-2 rounded-md text-primary-foreground/70 hover:bg-primary-600 hover:text-primary-foreground transition-colors',
              collapsed && 'ml-auto'
            )}
            aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          >
            {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </button>
        </div>

<nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1" aria-label="Navegación principal">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive: active }) => cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-primary-600 text-primary-foreground'
                  : 'text-primary-foreground/70 hover:bg-primary-600/50 hover:text-primary-foreground',
                collapsed && 'justify-center'
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
              {!collapsed && (
                <>
                  <span className="truncate">{item.name}</span>
                  {item.badge && (
                    <span className="ml-auto px-1.5 py-0.5 text-xs font-medium rounded bg-primary-700 text-primary-foreground/80">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-primary-100">
          {!collapsed && (
            <div className="px-3">
              <p className="text-xs text-primary-foreground/50 uppercase tracking-wider">
                OmniFood NI
              </p>
              <p className="text-xs text-primary-foreground/40">
                v0.0.1 - Backoffice
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}