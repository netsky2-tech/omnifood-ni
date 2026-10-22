'use client';

import { useEffect, useState } from 'react';
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
import { EntitySearchSelect } from '@/components/ui/entity-search-select';
import {
  promotionFormSchema,
  dateInputValueToEpochMs,
  epochMsToDateInputValue,
  type PromotionFormData,
} from './schema';
import { type Promotion, PromotionType, PROMOTION_TYPE_LABELS } from '@/types/promotions';
import type {
  CreatePromotionDto,
  UpdatePromotionDto,
} from '@/types/promotions';
import { DAYS_OF_WEEK, cn } from '@/lib/utils';
import { useCreatePromotion, useUpdatePromotion } from '@/hooks/use-promotions';
import { useCatalogValues } from '@/features/catalog/use-catalog';
import {
  useProductSearch,
  useProductById,
} from '@/features/catalog/use-product-search';
import {
  useCustomerSearch,
  useCustomerById,
} from '@/features/customers/use-customer-search';
import { toast } from '@/hooks/use-toast';
import { DialogFooter } from '@/components/ui/dialog';
import { getApiErrorMessage } from '@/lib/api-error';

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

  // T0.5'd: the category target is picked from the synced catalog, never
  // typed. Inactive rows are included so a promotion whose stored target
  // was deactivated still renders its own value — with an active-only list
  // the select would silently fall back to '' (global) on save.
  const { data: catalogCategories } = useCatalogValues('SALES_PRODUCT_CATEGORY', true);

  // §17.6: the product target is a governed selector, never a free-text
  // identifier. The hook owns the ?search= contract; the form only holds
  // the operator's search text. Inactive products stay out of the list by
  // default (includeInactive: false) — a promotion aimed at a deactivated
  // product is a mistake the selector should not invite, and unlike the
  // category picker there is no silent ''-fallback here: the stored value
  // still renders via useProductById's label and travels unchanged.
  const [productSearch, setProductSearch] = useState('');
  const {
    data: productSearchData,
    isLoading: isProductSearchLoading,
    isError: isProductSearchError,
    refetch: refetchProducts,
  } = useProductSearch(productSearch);
  const storedProductId = initialData?.target_product_id || undefined;
  const { data: storedProduct } = useProductById(storedProductId);

  const [customerSearch, setCustomerSearch] = useState('');
  const {
    data: customerSearchData,
    isLoading: isCustomerSearchLoading,
    isError: isCustomerSearchError,
    refetch: refetchCustomers,
  } = useCustomerSearch(customerSearch);
  const storedCustomerId = initialData?.target_customer_id || undefined;
  const { data: storedCustomer } = useCustomerById(storedCustomerId);

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
      // Date inputs deliver 'YYYY-MM-DD' text; '' means no date bound.
      start_date: '',
      end_date: '',
      priority: 0,
      is_stackable: true,
      is_active: true,
      code: '',
      target_customer_id: '',
      restriction_type: 'global',
    },
    mode: 'onChange',
  });

  const watchedType = form.watch('type');
  const watchedDays = form.watch('days_of_week');
  const watchedCategoryId = form.watch('target_category_id');
  const watchedProductId = form.watch('target_product_id');
  const watchedCustomerId = form.watch('target_customer_id');
  const watchedRestrictionType = form.watch('restriction_type');

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
        // Entity stores epoch-ms numbers; the date input needs YYYY-MM-DD.
        start_date: epochMsToDateInputValue(initialData.start_date),
        end_date: epochMsToDateInputValue(initialData.end_date),
        priority: initialData.priority,
        is_stackable: initialData.is_stackable,
        is_active: initialData.is_active,
        code: initialData.code || '',
        target_customer_id: initialData.target_customer_id || '',
        restriction_type: initialData.restriction_type || 'global',
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
    // T0.5'd submit normalization: '' means "nothing selected".
    // - CREATE: omit the key entirely so the backend treats it as global
    //   (an empty string is rejected by the backend guard).
    // - UPDATE: send an explicit null so Object.assign clears the column
    //   (omitting the key would leave the old target untouched).
    // A selected uuid is always sent unchanged.
    const {
      target_category_id,
      target_product_id,
      target_customer_id,
      code,
      restriction_type,
      start_date,
      end_date,
      ...rest
    } = data;
    // Promo-fix: date inputs carry 'YYYY-MM-DD'; the backend's DTOs and
    // bigint columns expect epoch-ms numbers.
    // R3-001: a cleared date differs by mode — and S6 makes that difference
    // live in the TYPES too (no more `null as unknown as number` cast):
    // - UPDATE: the cleared date travels as an explicit null (the contract's
    //   "clear": UpdatePromotionDto.start_date/end_date are `number | null`;
    //   @IsOptional skips the null and the service's Object.assign clears
    //   the column). The key is ALWAYS present on update — omitting it
    //   would leave the stored date untouched in a partial patch.
    // - CREATE: the key is omitted entirely when cleared (absent = no date
    //   bound; CreatePromotionDto stays number-only). Omitting is what
    //   create means, so the create shape keeps its own narrower type.
    //
    // Bug fix (discount not applied): target_product_id = '' (no product
    // selected) must be treated the same as target_category_id = '' (global):
    // omit on CREATE, send null on UPDATE. If '' is stored in the DB as the
    // entity's target_product_id, the POS engine evaluates
    //   isGlobal = targetProductId == null && targetCategoryId == null
    // as false ('' != null), so the discount never applies to any item.
    try {
      if (isEditing) {
        // T0.5'd: '' -> explicit null (clear to global); a selected uuid is
        // sent unchanged. Same rule for the dates (R3-001/S6): always
        // present, null when cleared.
        const dto: UpdatePromotionDto = {
          ...rest,
          start_date: start_date ? dateInputValueToEpochMs(start_date) : null,
          end_date: end_date ? dateInputValueToEpochMs(end_date) : null,
          target_category_id: target_category_id ? target_category_id : null,
          target_product_id: target_product_id ? target_product_id : undefined,
          // §17.6: '' means "nothing selected" → explicit null clears the FK.
          target_customer_id: target_customer_id ? target_customer_id : null,
          code: code || null,
          restriction_type: restriction_type || 'global',
        };
        await updatePromotion.mutateAsync({ id: initialData!.id, dto });
        toast({ variant: 'success', title: 'Promoción actualizada' });
      } else {
        // Promo-fix: is_active is NOT in CreatePromotionDto's whitelist
        // (forbidNonWhitelisted rejects the whole request otherwise), and
        // every promotion is born active. The create view shows that fact
        // instead of an inactive-looking control; activation toggling is
        // the update path's job.
        const { is_active: _createIsActive, ...createRest } = rest;
        // R3-001/S6: the CREATE shape keeps its own narrower date type —
        // keys present only when set (epoch-ms numbers), omitted when
        // cleared. Omitting is what create means.
        const payload: CreatePromotionDto = {
          ...createRest,
          ...(start_date ? { start_date: dateInputValueToEpochMs(start_date) } : {}),
          ...(end_date ? { end_date: dateInputValueToEpochMs(end_date) } : {}),
          ...(target_category_id ? { target_category_id } : {}),
          ...(target_product_id ? { target_product_id } : {}),
          ...(target_customer_id ? { target_customer_id } : {}),
          ...(code ? { code } : {}),
          ...(restriction_type ? { restriction_type } : {}),
        };
        await createPromotion.mutateAsync(payload);
        toast({ variant: 'success', title: 'Promoción creada' });
      }
      onSuccess();
    } catch (error) {
      toast({
        title: 'Error al guardar promoción',
        description: getApiErrorMessage(error, 'No se pudo guardar la promoción'),
        variant: 'destructive',
      });
    }
  };

  const showBuyGetFields = watchedType === PromotionType.BUY_X_GET_Y_FREE;
  const showDiscountFields = watchedType === PromotionType.PERCENTAGE_DISCOUNT || watchedType === PromotionType.FIXED_DISCOUNT;

  return (
    // noValidate: the application's own zod validation (via the RHF
    // resolver) is the single source of operator feedback. Native HTML
    // constraint validation would otherwise block the submit event
    // before handleSubmit runs, replacing the design system's Spanish
    // inline errors with the browser's own validation bubble (browser
    // language and styling).
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
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
              onValueChange={(value) => {
                // Radix emits '' on its own when its hidden native <select>
                // has no <option> matching the current value — which is the
                // case while the dropdown is closed, because the items are
                // unmounted. Writing that '' into the form wiped the type
                // that form.reset() had just restored, so the picker fell
                // back to its placeholder and NO type-dependent field
                // rendered (device-reported).
                //
                // '' is never a legitimate type: the four PromotionType
                // values are the only valid ones, and the schema rejects
                // anything else. So an empty emission is Radix talking to
                // itself, never an operator action — ignore it instead of
                // letting it erase the real value.
                if (!value) return;
                form.setValue('type', value as PromotionType, { shouldValidate: true });
              }}
              value={watchedType}
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
            <EntitySearchSelect
              inputId="target-product-search"
              label="Producto Objetivo (opcional)"
              value={watchedProductId ?? ''}
              onChange={(id) =>
                form.setValue('target_product_id', id, { shouldValidate: true })
              }
              options={(productSearchData?.data ?? []).map((product) => ({
                id: product.id,
                label: product.name,
              }))}
              search={productSearch}
              onSearchChange={setProductSearch}
              isLoading={isProductSearchLoading}
              isError={isProductSearchError}
              onRetry={() => void refetchProducts()}
              emptyMessage="No hay productos todavía. Cree productos en el catálogo."
              selectedLabel={storedProduct?.name}
              total={productSearchData?.total}
              onVerTodos={() => setProductSearch('')}
              placeholder="Ej: Café, Pan"
            />
          </div>
          <div>
            <Label htmlFor="target_category_id">Categoría Objetivo (opcional)</Label>
            {/* Native select on purpose: Radix Select forbids empty-string
                option values, and '' is the explicit "Global" choice.
                Controlled (watch + setValue), like the type picker above. */}
            <select
              id="target_category_id"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={watchedCategoryId ?? ''}
              onChange={(e) =>
                form.setValue('target_category_id', e.target.value, { shouldValidate: true })
              }
            >
              <option value="">Global (sin categoría)</option>
              {(catalogCategories ?? []).map((value) => (
                <option key={value.id} value={value.id}>
                  {value.is_active ? value.name : `${value.name} (inactiva)`}
                </option>
              ))}
            </select>
            {form.formState.errors.target_category_id && (
              <p className="text-sm text-destructive mt-1">
                {form.formState.errors.target_category_id.message}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="code">Código del Convenio (opcional)</Label>
            <Input
              id="code"
              placeholder="Ej: CONV-A"
              {...form.register('code')}
            />
            <p className="text-xs text-muted-foreground">
              Código corto de referencia interna del convenio. Único por
              negocio.
            </p>
            {form.formState.errors.code && (
              <p className="text-sm text-destructive mt-1">
                {form.formState.errors.code.message}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="restriction_type">Alcance del Descuento</Label>
            <Select
              onValueChange={(value) => {
                if (!value) return;
                const restriction = value as 'global' | 'customer';
                form.setValue('restriction_type', restriction, { shouldValidate: true });
                // Al cambiar a global, limpiar el cliente seleccionado
                if (restriction === 'global') {
                  form.setValue('target_customer_id', '', { shouldValidate: true });
                }
              }}
              value={watchedRestrictionType ?? 'global'}
            >
              <SelectTrigger aria-label="Alcance del Descuento">
                <SelectValue placeholder="Seleccione alcance" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global (todos los clientes)</SelectItem>
                <SelectItem value="customer">Cliente / Empresa específica</SelectItem>
              </SelectContent>
            </Select>
            {form.formState.errors.restriction_type && (
              <p className="text-sm text-destructive mt-1">
                {form.formState.errors.restriction_type.message}
              </p>
            )}
          </div>
        </div>

        {watchedRestrictionType === 'customer' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <EntitySearchSelect
                inputId="target-customer-search"
                label="Cliente / Empresa del Convenio *"
                value={watchedCustomerId ?? ''}
                onChange={(id) =>
                  form.setValue('target_customer_id', id, { shouldValidate: true })
                }
                options={(customerSearchData?.data ?? []).map((customer) => ({
                  id: customer.id,
                  label: customer.name,
                  hint: customer.tax_id ? `NIT: ${customer.tax_id}` : undefined,
                }))}
                search={customerSearch}
                onSearchChange={setCustomerSearch}
                isLoading={isCustomerSearchLoading}
                isError={isCustomerSearchError}
                onRetry={() => void refetchCustomers()}
                emptyMessage="No hay clientes todavía. Cree clientes en el módulo de Clientes."
                selectedLabel={storedCustomer?.name}
                total={customerSearchData?.total}
                onVerTodos={() => setCustomerSearch('')}
                placeholder="Ej: nombre empresa, NIT"
              />
              {form.formState.errors.target_customer_id && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.target_customer_id.message}
                </p>
              )}
            </div>
          </div>
        )}

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
            <Label htmlFor="start_date">Fecha Inicio</Label>
            <Input
              id="start_date"
              type="date"
              {...form.register('start_date')}
            />
            <p className="text-xs text-muted-foreground">
              Opcional: deja vacío para que la promoción no tenga fecha de inicio
            </p>
          </div>
          <div>
            <Label htmlFor="end_date">Fecha Fin</Label>
            <Input
              id="end_date"
              type="date"
              {...form.register('end_date')}
            />
            <p className="text-xs text-muted-foreground">
              Opcional: deja vacío para que la promoción no venza
            </p>
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
            {isEditing ? (
              <Label className="flex items-center gap-2 cursor-pointer w-full">
                <Switch
                  checked={form.getValues('is_active')}
                  onCheckedChange={(checked) => form.setValue('is_active', checked, { shouldValidate: true })}
                />
                <span>Activa</span>
              </Label>
            ) : (
              // Promo-fix: on create the backend always starts the promotion
              // active (services/promotions.service.ts hard-codes is_active:
              // true) and is_active is not in the create whitelist. Showing
              // the toggle here would be a control that does nothing on
              // submit; stating the fact keeps the create lifecycle visible.
              <p className="text-sm text-muted-foreground">
                La promoción se crea activa
              </p>
            )}
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