'use client';

import { useState } from 'react';
import { Plus, Search, Eye, Edit, Trash2 } from 'lucide-react';
import { usePromotions, useTogglePromotion, useDeletePromotion } from '@/hooks/use-promotions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { PromotionForm } from './PromotionForm';
import { type Promotion, PromotionType, PROMOTION_TYPE_LABELS } from '@/types/promotions';
import { formatCurrency, formatDate, DAYS_OF_WEEK } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

export function PromotionsList() {
  const { data: promotions, isLoading, error, refetch } = usePromotions();
  const togglePromotion = useTogglePromotion();
  const deletePromotion = useDeletePromotion();

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [viewingPromotion, setViewingPromotion] = useState<Promotion | null>(null);

  const filteredPromotions = promotions?.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || p.type === typeFilter;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && p.is_active) ||
      (statusFilter === 'inactive' && !p.is_active);
    return matchesSearch && matchesType && matchesStatus;
  }) ?? [];

  const handleToggle = async (promotion: Promotion) => {
    try {
      await togglePromotion.mutateAsync({ id: promotion.id, isActive: !promotion.is_active });
      toast({ title: promotion.is_active ? 'Promoción desactivada' : 'Promoción activada' });
    } catch (err) {
      toast({ title: 'Error', description: 'No se pudo cambiar el estado', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar esta promoción?')) return;
    try {
      await deletePromotion.mutateAsync(id);
      toast({ title: 'Promoción eliminada' });
    } catch (err) {
      toast({ title: 'Error', description: 'No se pudo eliminar la promoción', variant: 'destructive' });
    }
  };

  const handleEdit = (promotion: Promotion) => {
    setEditingPromotion(promotion);
    setIsFormOpen(true);
  };

  const handleView = (promotion: Promotion) => {
    setViewingPromotion(promotion);
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingPromotion(null);
    refetch();
  };

  const handleFormSuccess = () => {
    handleFormClose();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-label="Cargando promociones">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        <p>Error al cargar promociones: {(error as Error).message}</p>
        <Button onClick={() => refetch()} className="ml-2 mt-2" variant="outline" size="sm">
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Promociones</h1>
          <p className="text-sm text-muted-foreground">Gestione promociones, descuentos y ofertas programadas</p>
        </div>
        <Button onClick={() => { setEditingPromotion(null); setIsFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Promoción
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <label htmlFor="promotion-search" className="sr-only">Buscar promociones</label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="promotion-search"
            placeholder="Buscar por nombre o ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]" aria-label="Filtrar por tipo">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(PROMOTION_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]" aria-label="Filtrar por estado">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Activas</SelectItem>
              <SelectItem value="inactive">Inactivas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Objetivo</TableHead>
              <TableHead>Programación</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Prioridad</TableHead>
              <TableHead className="w-[80px]">Estado</TableHead>
              <TableHead className="w-[100px] text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPromotions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  No se encontraron promociones
                </TableCell>
              </TableRow>
            ) : (
              filteredPromotions.map((promotion) => (
                <TableRow key={promotion.id}>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleView(promotion)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                  <TableCell className="font-medium">{promotion.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{PROMOTION_TYPE_LABELS[promotion.type]}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {promotion.target_product_id ? `Producto: ${promotion.target_product_id}` : ''}
                    {promotion.target_category_id ? `Categoría: ${promotion.target_category_id}` : ''}
                    {!promotion.target_product_id && !promotion.target_category_id ? 'Global' : ''}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex flex-wrap gap-1">
                      {promotion.days_of_week?.length ? (
                        <>
                          {promotion.days_of_week.map((d) => (
                            <Badge key={d} variant="outline" className="text-xs">
                              {DAYS_OF_WEEK.find((day) => day.value === d)?.label.slice(0, 3)}
                            </Badge>
                          ))}
                        </>
                      ) : (
                        <span className="text-muted-foreground">Todos los días</span>
                      )}
                      {promotion.start_time && promotion.end_time && (
                        <span className="text-muted-foreground">
                          {promotion.start_time} - {promotion.end_time}
                        </span>
                      )}
                      {promotion.start_date && (
                        <span className="text-muted-foreground">
                          Desde: {formatDate(promotion.start_date)}
                        </span>
                      )}
                      {promotion.end_date && (
                        <span className="text-muted-foreground">
                          Hasta: {formatDate(promotion.end_date)}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {promotion.type === PromotionType.PERCENTAGE_DISCOUNT && (
                      <span>{promotion.discount_value}%</span>
                    )}
                    {promotion.type === PromotionType.FIXED_DISCOUNT && (
                      <span>{formatCurrency(promotion.discount_value)}</span>
                    )}
                    {promotion.type === PromotionType.BUY_X_GET_Y_FREE && (
                      <span>Compra {promotion.buy_quantity} Lleva {promotion.get_quantity}</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{promotion.priority}</TableCell>
                  <TableCell>
                    <Switch
                      checked={promotion.is_active}
                      onCheckedChange={() => handleToggle(promotion)}
                      disabled={togglePromotion.isPending}
                      aria-label={promotion.is_active ? 'Desactivar' : 'Activar'}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(promotion)}
                        disabled={togglePromotion.isPending || deletePromotion.isPending}
                        aria-label="Editar promoción"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(promotion.id)}
                        disabled={togglePromotion.isPending || deletePromotion.isPending}
                        className="text-destructive hover:text-destructive"
                        aria-label="Eliminar promoción"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPromotion ? 'Editar Promoción' : 'Nueva Promoción'}</DialogTitle>
            <DialogDescription>
              {editingPromotion
                ? 'Modifique los detalles de la promoción existente'
                : 'Cree una nueva promoción para sus productos'}
            </DialogDescription>
          </DialogHeader>
          <PromotionForm
            initialData={editingPromotion}
            onSuccess={handleFormSuccess}
            onCancel={handleFormClose}
          />
        </DialogContent>
      </Dialog>

      {viewingPromotion && (
        <Dialog open={!!viewingPromotion} onOpenChange={(open) => !open && setViewingPromotion(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Detalle de Promoción</DialogTitle>
              <DialogDescription>{viewingPromotion.name}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground">Tipo</p>
                  <p className="font-medium">{PROMOTION_TYPE_LABELS[viewingPromotion.type]}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Estado</p>
                  <Badge variant={viewingPromotion.is_active ? 'success' : 'destructive'}>
                    {viewingPromotion.is_active ? 'Activa' : 'Inactiva'}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Prioridad</p>
                  <p className="font-medium tabular-nums">{viewingPromotion.priority}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Apilable</p>
                  <p className="font-medium">{viewingPromotion.is_stackable ? 'Sí' : 'No'}</p>
                </div>
                {viewingPromotion.target_product_id && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Producto objetivo</p>
                    <p className="font-medium">{viewingPromotion.target_product_id}</p>
                  </div>
                )}
                {viewingPromotion.target_category_id && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Categoría objetivo</p>
                    <p className="font-medium">{viewingPromotion.target_category_id}</p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-muted-foreground">Programación</p>
                <div className="space-y-1">
                  {viewingPromotion.days_of_week?.length ? (
                    <p>Días: {viewingPromotion.days_of_week.map((d) => DAYS_OF_WEEK.find((day) => day.value === d)?.label).join(', ')}</p>
                  ) : (
                    <p>Todos los días</p>
                  )}
                  {viewingPromotion.start_time && viewingPromotion.end_time && (
                    <p>Horario: {viewingPromotion.start_time} - {viewingPromotion.end_time}</p>
                  )}
                  {viewingPromotion.start_date && <p>Desde: {formatDate(viewingPromotion.start_date)}</p>}
                  {viewingPromotion.end_date && <p>Hasta: {formatDate(viewingPromotion.end_date)}</p>}
                </div>
              </div>
              <div>
                <p className="text-muted-foreground">Valor</p>
                <p className="font-medium">
                  {viewingPromotion.type === PromotionType.PERCENTAGE_DISCOUNT && `${viewingPromotion.discount_value}%`}
                  {viewingPromotion.type === PromotionType.FIXED_DISCOUNT && formatCurrency(viewingPromotion.discount_value)}
                  {viewingPromotion.type === PromotionType.BUY_X_GET_Y_FREE && `Compra ${viewingPromotion.buy_quantity} Lleva ${viewingPromotion.get_quantity}`}
                </p>
              </div>
              {viewingPromotion.min_order_amount > 0 && (
                <div>
                  <p className="text-muted-foreground">Monto mínimo</p>
                  <p className="font-medium">{formatCurrency(viewingPromotion.min_order_amount)}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground">Creado</p>
                <p className="font-medium">{formatDate(viewingPromotion.created_at)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Actualizado</p>
                <p className="font-medium">{formatDate(viewingPromotion.updated_at)}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewingPromotion(null)}>Cerrar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}