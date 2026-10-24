'use client';

import { useState } from 'react';
import { UserPlus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSafeSearchParams } from '@/lib/safe-search-params';
import { CustomerLoyaltyProfile } from '@/features/loyalty/customer-loyalty-profile';
import { CustomersList } from './customers-list';
import { CorporateMetricsTab } from './corporate-metrics-tab';

type TabId = 'directory' | 'metrics' | 'loyalty';

const TABS: { id: TabId; label: string }[] = [
  { id: 'directory', label: 'Directorio' },
  { id: 'metrics', label: 'Métricas' },
  { id: 'loyalty', label: 'Perfil de Lealtad' },
];

export function CustomersPage() {
  const [searchParams, setSearchParams] = useSafeSearchParams();
  const tabParam = searchParams.get('tab') as string | null;
  const initialTab: TabId =
    tabParam === 'metrics' || tabParam === 'corporate-metrics'
      ? 'metrics'
      : tabParam === 'loyalty'
        ? 'loyalty'
        : 'directory';
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tab === 'directory') {
          next.delete('tab');
        } else {
          next.set('tab', tab);
        }
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Directorio de clientes, convenios comerciales y perfil de lealtad.
          </p>
        </div>

        {activeTab === 'directory' && (
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <UserPlus className="h-4 w-4" />
            <span>+ Nuevo Cliente</span>
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Search bar — for directory tab */}
      {activeTab === 'directory' && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, RUC/cédula, teléfono o correo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Buscar clientes"
            />
          </div>
        </div>
      )}

      {/* Tab content */}
      <div>
        {activeTab === 'directory' && (
          <CustomersList
            search={search}
            createOpen={createOpen}
            onCreateOpenChange={setCreateOpen}
          />
        )}
        {activeTab === 'metrics' && <CorporateMetricsTab />}
        {activeTab === 'loyalty' && <CustomerLoyaltyProfile />}
      </div>
    </div>
  );
}
