'use client';

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Edit,
  UserMinus,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Handshake,
  PlusCircle,
  FilterX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';
import { getApiErrorMessage } from '@/lib/api-error';
import {
  useCustomerList,
  useDeactivateCustomer,
  useReactivateCustomer,
  CUSTOMER_PAGE_SIZE,
} from './use-customers';
import { usePromotions } from '@/hooks/use-promotions';
import { CustomerDialog } from './customer-dialog';
import type { CustomerItem } from './customer-api';
import type { Promotion } from '@/types/promotions';

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  PERSONA: 'Persona Natural',
  EMPRESA: 'Empresa',
};

interface CustomersListProps {
  search: string;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}

export function CustomersList({ search, createOpen, onCreateOpenChange }: CustomersListProps) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [typeFilter, setTypeFilter] = useState<'all' | 'PERSONA' | 'EMPRESA'>('all');
  const [convenioFilter, setConvenioFilter] = useState<'all' | 'with_convenio' | 'without_convenio'>('all');
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null);

  // Load customers
  const { data, isLoading, error } = useCustomerList({
    search,
    page,
    pageSize: CUSTOMER_PAGE_SIZE,
    status: statusFilter,
    customerType: typeFilter === 'all' ? undefined : typeFilter,
  });

  // Load promotions to identify active convenios
  const { data: promotions } = usePromotions();

  const deactivateCustomer = useDeactivateCustomer();
  const reactivateCustomer = useReactivateCustomer();

  // Map customer_id -> active Convenio promotion
  const conveniosByCustomerId = useMemo(() => {
    const map = new Map<string, Promotion>();
    if (!promotions) return map;
    for (const promo of promotions) {
      if (promo.type === 'convenio' && promo.is_active && promo.target_customer_id) {
        map.set(promo.target_customer_id, promo);
      }
    }
    return map;
  }, [promotions]);

  // Apply in-memory filter for convenio if selected
  const customers = useMemo(() => {
    const list = data?.data ?? [];
    if (convenioFilter === 'with_convenio') {
      return list.filter((c) => conveniosByCustomerId.has(c.id));
    }
    if (convenioFilter === 'without_convenio') {
      return list.filter((c) => !conveniosByCustomerId.has(c.id));
    }
    return list;
  }, [data?.data, convenioFilter, conveniosByCustomerId]);

  const totalCount = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / CUSTOMER_PAGE_SIZE));

  const handleDeactivate = async (customer: CustomerItem) => {
    const confirmed = window.confirm(
      `¿Desactivar al cliente "${customer.name}"? Los convenios y compras quedarán pausados.`,
    );
    if (!confirmed) return;

    try {
      await deactivateCustomer.mutateAsync(customer.id);
      toast({
        variant: 'success',
        title: 'Cliente desactivado',
        description: `"${customer.name}" fue desactivado exitosamente.`,
      });
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Error al desactivar el cliente.');
      toast({
        variant: 'destructive',
        title: 'Error al desactivar',
        description: msg,
      });
    }
  };

  const handleReactivate = async (customer: CustomerItem) => {
    try {
      await reactivateCustomer.mutateAsync(customer.id);
      toast({
        variant: 'success',
        title: 'Cliente reactivado',
        description: `"${customer.name}" ha sido reactivado exitosamente.`,
      });
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Error al reactivar el cliente.');
      toast({
        variant: 'destructive',
        title: 'Error al reactivar',
        description: msg,
      });
    }
  };

  const handleCreateConvenio = (customer: CustomerItem) => {
    navigate(
      `/promotions?new=convenio&customerId=${customer.id}&customerName=${encodeURIComponent(
        customer.name,
      )}`,
    );
  };

  const handleViewConvenio = (promo: Promotion) => {
    navigate(`/promotions?search=${encodeURIComponent(promo.code || promo.name)}`);
  };

  const hasActiveFilters =
    statusFilter !== 'active' || typeFilter !== 'all' || convenioFilter !== 'all' || search.trim() !== '';

  const handleClearFilters = () => {
    setStatusFilter('active');
    setTypeFilter('all');
    setConvenioFilter('all');
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {getApiErrorMessage(error, 'Error al cargar el directorio de clientes.')}
          </AlertDescription>
        </Alert>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 bg-card p-3 rounded-md border border-border">
        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Estado:</span>
          <Select
            value={statusFilter}
            onValueChange={(val: 'all' | 'active' | 'inactive') => {
              setStatusFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Estado" className="h-8 w-[130px] text-xs">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Solo activos</SelectItem>
              <SelectItem value="inactive">Inactivos</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Type Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Tipo:</span>
          <Select
            value={typeFilter}
            onValueChange={(val: 'all' | 'PERSONA' | 'EMPRESA') => {
              setTypeFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Tipo" className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              <SelectItem value="PERSONA">Persona Natural</SelectItem>
              <SelectItem value="EMPRESA">Empresa</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Convenio Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Convenio:</span>
          <Select
            value={convenioFilter}
            onValueChange={(val: 'all' | 'with_convenio' | 'without_convenio') => {
              setConvenioFilter(val);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Convenio" className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Convenio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="with_convenio">Con Convenio</SelectItem>
              <SelectItem value="without_convenio">Sin Convenio</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground ml-auto"
          >
            <FilterX className="h-3.5 w-3.5 mr-1" />
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Nombre / Razón Social</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>RUC / Cédula</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Convenio Comercial</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      Cargando clientes...
                    </div>
                  </TableCell>
                </TableRow>
              ) : customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-44 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Users className="h-10 w-10 opacity-30" />
                      {hasActiveFilters ? (
                        <>
                          <p className="text-sm font-medium">No se encontraron clientes con los filtros aplicados</p>
                          <p className="text-xs">Probá cambiando el término de búsqueda o limpiando los filtros.</p>
                          <Button variant="outline" size="sm" onClick={handleClearFilters} className="mt-2 text-xs">
                            Limpiar filtros
                          </Button>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium">No hay clientes registrados en el directorio</p>
                          <p className="text-xs">Registrá tu primer cliente para emitir facturas y convenios comerciales.</p>
                          <Button size="sm" onClick={() => onCreateOpenChange(true)} className="mt-2 text-xs">
                            + Registrar primer cliente
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((c) => {
                  const activeConvenio = conveniosByCustomerId.get(c.id);

                  return (
                    <TableRow key={c.id}>
                      {/* Name */}
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{c.name}</span>
                          {c.address && <span className="text-xs text-muted-foreground truncate max-w-[200px]">{c.address}</span>}
                        </div>
                      </TableCell>

                      {/* Type */}
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-normal">
                          {c.customer_type ? (CUSTOMER_TYPE_LABELS[c.customer_type] ?? c.customer_type) : 'Persona Natural'}
                        </Badge>
                      </TableCell>

                      {/* Tax ID */}
                      <TableCell>
                        <span className="text-sm font-mono text-muted-foreground">{c.tax_id ?? '—'}</span>
                      </TableCell>

                      {/* Contact */}
                      <TableCell>
                        <div className="flex flex-col text-xs text-muted-foreground">
                          {c.phone && <span>{c.phone}</span>}
                          {c.email && <span className="truncate max-w-[180px]">{c.email}</span>}
                          {!c.phone && !c.email && <span>—</span>}
                        </div>
                      </TableCell>

                      {/* Convenio */}
                      <TableCell>
                        {activeConvenio ? (
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="default"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1"
                            >
                              <Handshake className="h-3 w-3" />
                              <span>
                                {activeConvenio.code || 'Convenio'}: {activeConvenio.discount_value}%
                              </span>
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => handleViewConvenio(activeConvenio)}
                              title="Ver detalles del convenio"
                            >
                              Ver
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">Sin convenio</span>
                            {c.is_active && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1.5 text-xs text-primary hover:text-primary/80 gap-1"
                                onClick={() => handleCreateConvenio(c)}
                                title="Crear un convenio comercial para este cliente"
                              >
                                <PlusCircle className="h-3 w-3" />
                                <span>Crear</span>
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Badge
                          variant={c.is_active ? 'success' : 'outline'}
                          className={`text-xs ${!c.is_active ? 'text-muted-foreground bg-muted' : ''}`}
                        >
                          {c.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingCustomer(c)}
                            title="Editar datos del cliente"
                            className="h-8 px-2"
                          >
                            <Edit className="h-3.5 w-3.5 mr-1" />
                            <span className="text-xs">Editar</span>
                          </Button>

                          {c.is_active ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void handleDeactivate(c)}
                              title="Desactivar cliente"
                              className="h-8 px-2 text-destructive hover:bg-destructive/10"
                              disabled={deactivateCustomer.isPending}
                            >
                              <UserMinus className="h-3.5 w-3.5 mr-1" />
                              <span className="text-xs">Desactivar</span>
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void handleReactivate(c)}
                              title="Reactivar cliente"
                              className="h-8 px-2 text-primary hover:bg-primary/10"
                              disabled={reactivateCustomer.isPending}
                            >
                              <UserCheck className="h-3.5 w-3.5 mr-1" />
                              <span className="text-xs">Reactivar</span>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination controls */}
        {totalCount > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border bg-card/50 text-xs text-muted-foreground">
            <div data-testid="pagination-summary">
              Mostrando {Math.min((page - 1) * CUSTOMER_PAGE_SIZE + 1, totalCount)} -{' '}
              {Math.min(page * CUSTOMER_PAGE_SIZE, totalCount)} de {totalCount} clientes
            </div>

            <div className="flex items-center gap-2">
              <span data-testid="pagination-page-info" className="text-xs">
                Página {page} de {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || isLoading}
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || isLoading}
                  aria-label="Página siguiente"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CustomerDialog open={createOpen} onOpenChange={onCreateOpenChange} />

      <CustomerDialog
        open={Boolean(editingCustomer)}
        onOpenChange={(open) => !open && setEditingCustomer(null)}
        customerToEdit={editingCustomer}
      />
    </div>
  );
}
