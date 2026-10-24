'use client';

import { useState } from 'react';
import { UserPlus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CustomerLoyaltyProfile } from '@/features/loyalty/customer-loyalty-profile';
import { LoyaltyPage } from '@/features/loyalty/loyalty-page';
import { CustomersList } from './customers-list';

type TabId = 'directory' | 'loyalty' | 'programs';

const TABS: { id: TabId; label: string }[] = [
  { id: 'directory', label: 'Directorio' },
  { id: 'loyalty', label: 'Perfil de Lealtad' },
  { id: 'programs', label: 'Programas y Recompensas' },
];

export function CustomersPage() {
  const [activeTab, setActiveTab] = useState<TabId>('directory');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Directorio de clientes, convenios comerciales y programas de fidelización.
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
              onClick={() => setActiveTab(tab.id)}
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
        {activeTab === 'loyalty' && <CustomerLoyaltyProfile />}
        {activeTab === 'programs' && <LoyaltyPage />}
      </div>
    </div>
  );
}
