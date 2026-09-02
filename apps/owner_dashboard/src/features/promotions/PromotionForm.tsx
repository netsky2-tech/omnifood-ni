'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Package, Percent, MinusCircle, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { promotionFormSchema, type PromotionFormData } from './schema';
import { type Promotion, PromotionType, PROMOTION_TYPE_LABELS } from '@/types/promotions';
import { DAYS_OF_WEEK, cn } from '@/lib/utils';
import { useCreatePromotion, useUpdatePromotion } from '@/hooks/use-promotions';
import { toast } from '@/hooks/use-toast';
import { DialogFooter } from '@/components/ui/dialog';

interface PromotionFormProps {
  initialData?: Promotion | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function PromotionForm({ initialData, onSuccess, onCancel }: PromotionFormProps) {
  const isEditing = !!initialData;
  const createPromotion = useCreatePromotion();
  const updatePromotion = useUpdatePromotion();
  const isSubmitting = createPromotion.isPending || updatePromotion.isPending;

  const form = useForm<PromotionFormData>({
    resolver: zodResolver(promotionFormSchema),
    defaultValues: {
      name: '',
      type: PromotionType.BUY_X_GET_Y_FREE,
      target_product_id: '',
      target_category_id: '',
      buy_quantity: 1,
      get_quantity: 1,
      discount_value: 0,
      min_order_amount: 0,
      days_of_week: [],
      start_time: '',
      end_time: '',
      start_date: undefined,
      end_date: undefined,
      priority: 0,
      is_stackable: true,
      is_active: true,
    },
    mode: 'onChange',
  });

  const watchedType = form.watch('type');
  const watchedDays = form.watch('days_of_week');

  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name,
        type: initialData.type,
        target_product_id: initialData.target_product_id || '',
        target_category_id: initialData.target_category_id || '',
        buy_quantity: initialData.buy_quantity,
        get_quantity: initialData.get_quantity,
        discount_value: initialData.discount_value,
        min_order_amount: initialData.min_order_amount,
        days_of_week: initialData.days_of_week || [],
        start_time: initialData.start_time || '',
        end_time: initialData.end_time || '',
        start_date: initialData.start_date ?? undefined,
        end_date: initialData.end_date ?? undefined,
        priority: initialData.priority,
        is_stackable: initialData.is_stackable,
        is_active: initialData.is_active,
      });
    }
  }, [initialData, form]);

  const handleDayToggle = (day: string) => {
    const current = watchedDays || [];
    if (current.includes(day)) {
      form.setValue('days_of_week', current.filter((d) => d !== day), { shouldValidate: true });
    } else {
      form.setValue('days_of_week', [...current, day], { shouldValidate: true });
    }
  };

  const onSubmit = async (data: PromotionFormData) => {
    try {
      if (isEditing) {
        await updatePromotion.mutateAsync({ id: initialData!.id, dto: data });
        toast({ title: 'Promoción actualizada' });
      } else {
        await createPromotion.mutateAsync(data);
        toast({ title: 'Promoción creada' });
      }
      onSuccess();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo guardar la promoción',
        variant: 'destructive',
      });
    }
  };

  const showBuyGetFields = watchedType === PromotionType.BUY_X_GET_Y_FREE;
  const showDiscountFields = watchedType === PromotionType.PERCENTAGE_DISCOUNT || watchedType === PromotionType.FIXED_DISCOUNT;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="name">Nombre *</Label>
            <Input
              id="name"
              placeholder="Ej: Happy Hour 2x1"
              {...form.register('name')}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="type">Tipo de Promoción *</Label>
            <Select
              onValueChange={(value) => form.setValue('type', value as PromotionType, { shouldValidate: true })}
              defaultValue={form.getValues('type')}
            >
              <SelectTrigger aria-label="Tipo de Promoción">
                <SelectValue placeholder="Seleccione tipo" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PROMOTION_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value as PromotionType}>
                    <div className="flex items-center gap-2">
                      {value === PromotionType.BUY_X_GET_Y_FREE && <Package className="h-4 w-4" />}
                      {value === PromotionType.PERCENTAGE_DISCOUNT && <Percent className="h-4 w-4" />}
                      {value === PromotionType.FIXED_DISCOUNT && <MinusCircle className="h-4 w-4" />}
                      {value === PromotionType.COMBO_PACKAGE && <Tag className="h-4 w-4" />}
                      {label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="target_product_id">Producto Objetivo (opcional)</Label>
            <Input
              id="target_product_id"
              placeholder="ID del producto"
              {...form.register('target_product_id')}
            />
          </div>
          <div>
            <Label htmlFor="target_category_id">Categoría Objetivo (opcional)</Label>
            <Input
              id="target_category_id"
              placeholder="ID de la categoría"
              {...form.register('target_category_id')}
            />
          </div>
        </div>

        {showBuyGetFields && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="buy_quantity">Cantidad a Comprar *</Label>
              <Input
                id="buy_quantity"
                type="number"
                min="1"
                {...form.register('buy_quantity', { valueAsNumber: true })}
              />
            </div>
            <div>
              <Label htmlFor="get_quantity">Cantidad a Llevar *</Label>
              <Input
                id="get_quantity"
                type="number"
                min="1"
                {...form.register('get_quantity', { valueAsNumber: true })}
              />
            </div>
          </div>
        )}

        {showDiscountFields && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="discount_value">
                {watchedType === PromotionType.PERCENTAGE_DISCOUNT ? 'Porcentaje de Descuento *' : 'Descuento Fijo *'}
              </Label>
              <Input
                id="discount_value"
                type="number"
                step={watchedType === PromotionType.PERCENTAGE_DISCOUNT ? '0.01' : '0.01'}
                min="0.01"
                placeholder={watchedType === PromotionType.PERCENTAGE_DISCOUNT ? 'Ej: 15' : 'Ej: 50.00'}
                {...form.register('discount_value', { valueAsNumber: true })}
              />
            </div>
            <div>
              <Label htmlFor="min_order_amount">Monto Mínimo de Orden (opcional)</Label>
              <Input
                id="min_order_amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                {...form.register('min_order_amount', { valueAsNumber: true })}
              />
            </div>
          </div>
        )}

        <div className="space-y-4">
          <Label>Días de la Semana</Label>
          <div className="flex flex-wrap gap-2">
            {DAYS_OF_WEEK.map((day) => (
              <button
                key={day.value}
                type="button"
                onClick={() => handleDayToggle(day.value)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium transition-colors border',
                  watchedDays?.includes(day.value)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-input hover:bg-accent'
                )}
              >
                {day.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Deje vacío para aplicar todos los días
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="start_time">Hora Inicio</Label>
            <Input
              id="start_time"
              type="time"
              {...form.register('start_time')}
            />
          </div>
          <div>
            <Label htmlFor="end_time">Hora Fin</Label>
            <Input
              id="end_time"
              type="time"
              {...form.register('end_time')}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="start_date">Fecha Inicio (timestamp)</Label>
            <Input
              id="start_date"
              type="number"
              placeholder="Timestamp en milisegundos"
              {...form.register('start_date', { valueAsNumber: true })}
            />
            <p className="text-xs text-muted-foreground">Opcional: timestamp Unix en ms</p>
          </div>
          <div>
            <Label htmlFor="end_date">Fecha Fin (timestamp)</Label>
            <Input
              id="end_date"
              type="number"
              placeholder="Timestamp en milisegundos"
              {...form.register('end_date', { valueAsNumber: true })}
            />
            <p className="text-xs text-muted-foreground">Opcional: timestamp Unix en ms</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="priority">Prioridad</Label>
            <Input
              id="priority"
              type="number"
              min="0"
              {...form.register('priority', { valueAsNumber: true })}
            />
          </div>
          <div className="flex items-end">
            <Label className="flex items-center gap-2 cursor-pointer w-full">
              <Switch
                checked={form.getValues('is_stackable')}
                onCheckedChange={(checked) => form.setValue('is_stackable', checked, { shouldValidate: true })}
              />
              <span>Apilable con otras promociones</span>
            </Label>
          </div>
          <div className="flex items-end">
            <Label className="flex items-center gap-2 cursor-pointer w-full">
              <Switch
                checked={form.getValues('is_active')}
                onCheckedChange={(checked) => form.setValue('is_active', checked, { shouldValidate: true })}
              />
              <span>Activa</span>
            </Label>
          </div>
        </div>
      </div>

      <DialogFooter className="border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear'}
        </Button>
      </DialogFooter>
    </form>
  );
}