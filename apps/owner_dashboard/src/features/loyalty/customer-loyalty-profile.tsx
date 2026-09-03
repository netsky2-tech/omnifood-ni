'use client';

import { useState } from 'react';
import { Search, User, ArrowUpRight, ArrowDownRight, Star, RefreshCw } from 'lucide-react';
import {
  useCustomers,
  useCustomerLoyaltyAccounts,
  useCustomerTransactions,
  usePrograms,
  useAdjustPoints,
} from './use-loyalty';
import type { Customer, CustomerPointTransaction, AdjustPointsInput } from './types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

function AdjustDialog({
  customer,
  onSuccess,
  onCancel,
}: {
  customer: Customer;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [delta, setDelta] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const adjustMutation = useAdjustPoints();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (delta === 0) {
      setError('El monto debe ser diferente de cero');
      return;
    }

    if (!reason.trim()) {
      setError('La razón es obligatoria');
      return;
    }

    try {
      const input: AdjustPointsInput = { points_delta: delta, reason: reason.trim() };
      await adjustMutation.mutateAsync({ customerId: customer.id, input });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al ajustar puntos');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-3 bg-muted rounded-lg text-sm">
        <p className="font-medium">{customer.name}</p>
        <p className="text-muted-foreground">Saldo actual: {customer.points_balance} pts</p>
      </div>

      <div>
        <label htmlFor="adjust-delta" className="block text-sm font-medium mb-1">
          Cantidad de puntos
        </label>
        <Input
          id="adjust-delta"
          type="number"
          value={delta}
          onChange={(e) => setDelta(Number(e.target.value))}
          placeholder="+100 para agregar, -50 para deducir"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Positivo = agregar puntos, Negativo = deducir puntos
        </p>
      </div>

      <div>
        <label htmlFor="adjust-reason" className="block text-sm font-medium mb-1">Razón</label>
        <Input
          id="adjust-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ej: Corrección manual, Promoción especial..."
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={adjustMutation.isPending}>
          {adjustMutation.isPending ? 'Procesando...' : 'Aplicar ajuste'}
        </Button>
      </div>
    </form>
  );
}

function TransactionRow({
  tx,
  programName,
}: {
  tx: CustomerPointTransaction;
  programName?: string;
}) {
  const isPositive = tx.points > 0;
  const date = tx.occurred_at ? new Date(tx.occurred_at) : tx.created_at ? new Date(tx.created_at) : null;

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 px-3 text-sm">
        {date ? (
          <div>
            <p>{date.toLocaleDateString('es-NI')}</p>
            <p className="text-xs text-muted-foreground">
              {date.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-2 px-3 text-sm">
        <div className="flex items-center gap-1.5">
          {isPositive ? (
            <ArrowUpRight className="h-3.5 w-3.5 text-green-600" />
          ) : (
            <ArrowDownRight className="h-3.5 w-3.5 text-red-600" />
          )}
          <span className={isPositive ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
            {isPositive ? '+' : ''}{tx.points}
          </span>
        </div>
      </td>
      <td className="py-2 px-3 text-sm tabular-nums">{tx.balance_after}</td>
      <td className="py-2 px-3 text-sm">{tx.type}</td>
      <td className="py-2 px-3 text-sm">{programName ?? tx.loyalty_program_id ?? '—'}</td>
      <td className="py-2 px-3 text-sm text-muted-foreground max-w-[200px] truncate">
        {tx.reason ?? '—'}
      </td>
    </tr>
  );
}

export function CustomerLoyaltyProfile() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showAdjust, setShowAdjust] = useState(false);

  const { data: customers, isLoading: customersLoading } = useCustomers(searchQuery || undefined);
  const { data: accounts, isLoading: accountsLoading } = useCustomerLoyaltyAccounts(
    selectedCustomer?.id ?? '',
  );
  const { data: transactions, isLoading: txLoading } = useCustomerTransactions(
    selectedCustomer?.id ?? '',
  );
  const { data: programs } = usePrograms();

  const programMap = new Map(programs?.map((p) => [p.id, p.name]) ?? []);

  const filteredCustomers = customers?.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone?.includes(searchQuery) ||
    c.email?.toLowerCase().includes(searchQuery.toLowerCase()),
  ) ?? [];

  return (
    <div className="space-y-6">
      {/* Customer Selector */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <label htmlFor="customer-search" className="sr-only">Buscar cliente</label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="customer-search"
            placeholder="Buscar por nombre, teléfono o email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Customer List */}
        <div className="border rounded-lg bg-card max-h-[600px] overflow-y-auto">
          {customersLoading ? (
            <div className="flex items-center justify-center h-32" role="status" aria-label="Cargando clientes">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No se encontraron clientes</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredCustomers.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => setSelectedCustomer(customer)}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    selectedCustomer?.id === customer.id
                      ? 'bg-primary/5 border-l-3 border-l-primary'
                      : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{customer.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {customer.phone ?? customer.email ?? customer.id.slice(0, 8)}
                      </p>
                    </div>
                    <Badge variant={customer.is_active ? 'success' : 'destructive'} className="text-xs">
                      {customer.points_balance} pts
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Profile Details */}
        {selectedCustomer ? (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">{selectedCustomer.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {[selectedCustomer.phone, selectedCustomer.email].filter(Boolean).join(' · ') || selectedCustomer.id}
                </p>
              </div>
              <Button onClick={() => setShowAdjust(true)}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Ajustar puntos
              </Button>
            </div>

            {/* Loyalty Accounts */}
            <div className="rounded-lg border bg-card p-4">
              <h4 className="text-sm font-semibold uppercase text-muted-foreground mb-3">
                Cuentas de Lealtad
              </h4>
              {accountsLoading ? (
                <div className="flex items-center justify-center h-16">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                </div>
              ) : accounts && accounts.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {accounts.map((account) => (
                    <div key={`${account.customer_id}-${account.loyalty_program_id}`} className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Star className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">
                          {programMap.get(account.loyalty_program_id) ?? 'Programa'}
                        </span>
                      </div>
                      <p className="text-2xl font-bold tabular-nums">{account.balance_units}</p>
                      <p className="text-xs text-muted-foreground">unidades disponibles</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sin cuentas de lealtad activas</p>
              )}
            </div>

            {/* Transaction History */}
            <div className="rounded-lg border bg-card">
              <div className="p-4 border-b">
                <h4 className="text-sm font-semibold uppercase text-muted-foreground">
                  Historial de Transacciones
                </h4>
              </div>
              {txLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                </div>
              ) : transactions && transactions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="py-2 px-3 text-left font-medium">Fecha</th>
                        <th className="py-2 px-3 text-left font-medium">Puntos</th>
                        <th className="py-2 px-3 text-left font-medium">Balance</th>
                        <th className="py-2 px-3 text-left font-medium">Tipo</th>
                        <th className="py-2 px-3 text-left font-medium">Programa</th>
                        <th className="py-2 px-3 text-left font-medium">Razón</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx) => (
                        <TransactionRow
                          key={tx.id}
                          tx={tx}
                          programName={programMap.get(tx.loyalty_program_id ?? '')}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">Sin transacciones registradas</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <div className="text-center">
              <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Seleccione un cliente para ver su perfil de lealtad</p>
            </div>
          </div>
        )}
      </div>

      {/* Adjust Dialog */}
      <Dialog open={showAdjust} onOpenChange={setShowAdjust}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar puntos</DialogTitle>
            <DialogDescription>
              Agregue o deduzca puntos manualmente para este cliente
            </DialogDescription>
          </DialogHeader>
          {selectedCustomer && (
            <AdjustDialog
              customer={selectedCustomer}
              onSuccess={() => setShowAdjust(false)}
              onCancel={() => setShowAdjust(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
