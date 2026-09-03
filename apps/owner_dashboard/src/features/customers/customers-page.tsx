'use client';

import { useState } from 'react';
import { CustomerLoyaltyProfile } from '@/features/loyalty/customer-loyalty-profile';

type TabId = 'loyalty';

const TABS: { id: TabId; label: string }[] = [
  { id: 'loyalty', label: 'Perfil de Lealtad' },
];

export function CustomersPage() {
  const [activeTab, setActiveTab] = useState<TabId>('loyalty');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
        <p className="text-sm text-muted-foreground">Gestión de clientes y programas de fidelización</p>
      </div>

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

      <div>
        {activeTab === 'loyalty' && <CustomerLoyaltyProfile />}
      </div>
    </div>
  );
}
