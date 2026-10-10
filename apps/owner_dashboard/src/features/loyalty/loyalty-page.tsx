'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Search, Star, Trophy, Tag, Edit, ToggleLeft, ToggleRight, TrendingUp } from 'lucide-react';
import { RewardProfitAwareDialog } from './reward-profit-aware-dialog';
import {
  usePrograms,
  useRewards,
  useCreateProgram,
  useUpdateProgram,
  useActivateProgram,
  useDeactivateProgram,
  useCreateReward,
  useUpdateReward,
  useActivateReward,
  useDeactivateReward,
} from './use-loyalty';
import type {
  LoyaltyProgram,
  LoyaltyProgramStatus,
  CreateLoyaltyProgramInput,
  UpdateLoyaltyProgramInput,
  RewardDefinition,
  CreateRewardInput,
  UpdateRewardInput,
  ProgramFormValues,
  RewardFormValues,
} from './types';
import { LOYALTY_PROGRAM_TYPES, REWARD_TYPES, programFormSchema, rewardFormSchema } from './types';
import { EntitySearchSelect } from '@/components/ui/entity-search-select';
import {
  useProductSearch,
  useProductById,
} from '@/features/catalog/use-product-search';
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
import { toast } from '@/hooks/use-toast';
import { getApiErrorMessage } from '@/lib/api-error';

const STATUS_LABELS: Record<
  LoyaltyProgramStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" }
> = {
  DRAFT: { label: 'Borrador', variant: 'secondary' },
  ACTIVE: { label: 'Activo', variant: 'success' },
  INACTIVE: { label: 'Inactivo', variant: 'destructive' },
};

function ProgramForm({
  initial,
  onSuccess,
  onCancel,
}: {
  initial?: LoyaltyProgram;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const isEditing = !!initial;

  const rule = initial?.earning_rule as Record<string, unknown> | undefined;

  // Unit C (form sweep): the app owns validation through the zod schema in
  // types.ts (single source of operator feedback). The native HTML
  // constraints this form used to rely on (name: required; the guided-rule
  // numeric inputs: type=number min=1 required; the eligible-ids text:
  // required; the optional minimum spend: min=0) only ran inside the
  // browser's constraint validation: the balloon replaced the app's Spanish
  // inline errors, and any submit not coming from the button (e.g. a
  // programmatic requestSubmit()) bypassed the guard entirely.
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ProgramFormValues>({
    resolver: zodResolver(programFormSchema),
    defaultValues: {
      name: initial?.name ?? '',
      programType: initial?.program_type ?? 'SPEND_POINTS',
      useCustomJson: false,
      spendBlockNio: Number(rule?.spendBlockNio ?? 10),
      pointsPerBlock: Number(rule?.pointsPerBlock ?? 1),
      eligibleProductIds: Array.isArray(rule?.eligibleProductIds)
        ? (rule.eligibleProductIds as string[]).join(', ')
        : 'prod-smash',
      unitsPerPurchasedUnit: Number(rule?.unitsPerPurchasedUnit ?? 1),
      unitsPerVisit: Number(rule?.unitsPerVisit ?? 1),
      minimumSpendNio:
        rule?.minimumSpendNio != null ? String(rule.minimumSpendNio) : '',
    },
  });
  const programType = watch('programType');
  const useCustomJson = watch('useCustomJson');

  // Specific field for VISIT_STAMPS (JSON advanced mode textarea)
  const [earningRule, setEarningRule] = useState(
    JSON.stringify(initial?.earning_rule ?? {}, null, 2),
  );
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateProgram();
  const updateMutation = useUpdateProgram();
  const isPending = createMutation.isPending || updateMutation.isPending;

  // Resolver-validated entry point: this only runs when the schema accepted
  // every field the ACTIVE branch renders, so the handler-level JSON parse
  // keeps its exact pre-sweep behavior and message.
  const onValid = async (values: ProgramFormValues) => {
    if (isPending) return;
    setError(null);

    let parsedRule: Record<string, unknown>;
    if (values.useCustomJson) {
      try {
        parsedRule = JSON.parse(earningRule);
      } catch {
        setError('earning_rule debe ser JSON válido');
        return;
      }
    } else {
      if (values.programType === 'SPEND_POINTS') {
        parsedRule = {
          spendBlockNio: Number(values.spendBlockNio),
          pointsPerBlock: Number(values.pointsPerBlock),
        };
      } else if (values.programType === 'PRODUCT_STAMPS') {
        const prodList = values.eligibleProductIds
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        parsedRule = {
          eligibleProductIds: prodList.length > 0 ? prodList : ['prod-smash'],
          unitsPerPurchasedUnit: Number(values.unitsPerPurchasedUnit),
        };
      } else {
        parsedRule = {
          unitsPerVisit: Number(values.unitsPerVisit),
          ...(values.minimumSpendNio.trim() ? { minimumSpendNio: Number(values.minimumSpendNio) } : {}),
        };
      }
    }

    try {
      if (isEditing) {
        const input: UpdateLoyaltyProgramInput = { name: values.name, earning_rule: parsedRule };
        await updateMutation.mutateAsync({ programId: initial.id, input });
        toast({
          variant: "success",
          title: "Programa actualizado",
          description: `El programa "${values.name}" fue actualizado exitosamente.`,
        });
      } else {
        const input: CreateLoyaltyProgramInput = {
          name: values.name,
          program_type: values.programType,
          earning_rule: parsedRule,
        };
        await createMutation.mutateAsync(input);
        toast({
          variant: "success",
          title: "Programa creado",
          description: `El programa "${values.name}" fue creado exitosamente.`,
        });
      }
      onSuccess();
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Error al guardar el programa');
      setError(msg);
      toast({
        variant: "destructive",
        title: "Error al guardar",
        description: msg,
      });
    }
  };

  return (
    // noValidate: the application's own zod validation (via the RHF
    // resolver) is the single source of operator feedback. Native HTML
    // constraint validation would otherwise block the submit event
    // before the resolver runs, replacing the design system's Spanish
    // inline errors with the browser's own validation bubble (browser
    // language and styling).
    <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
      <div>
        <label htmlFor="program-name" className="block text-sm font-medium mb-1">Nombre</label>
        <Input
          id="program-name"
          {...register('name')}
          placeholder="Ej: Smash Burger Club"
          aria-invalid={Boolean(errors.name)}
        />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>

      {!isEditing && (
        <div>
          <label htmlFor="program-type" className="block text-sm font-medium mb-1">Tipo de programa</label>
          <select
            id="program-type"
            {...register('programType')}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
          >
            {LOYALTY_PROGRAM_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Dynamic structured fields according to mechanics */}
      {!useCustomJson ? (
        <div className="space-y-3 p-3 bg-muted/40 rounded-md border border-border/60">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Regla de acumulación ({programType})
          </p>

          {programType === 'SPEND_POINTS' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="spend-block" className="block text-xs font-medium mb-1">
                  Monto bloque (C$)
                </label>
                <Input
                  id="spend-block"
                  type="number"
                  {...register('spendBlockNio', {
                    // Mirrors the old `Number(e.target.value)` state handling:
                    // an emptied input submits as 0, a typed value as its number.
                    setValueAs: (v) => (v === '' ? 0 : Number(v)),
                  })}
                  aria-invalid={Boolean(errors.spendBlockNio)}
                />
                {errors.spendBlockNio && (
                  <p className="text-xs text-destructive">{errors.spendBlockNio.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="points-per-block" className="block text-xs font-medium mb-1">
                  Puntos por bloque
                </label>
                <Input
                  id="points-per-block"
                  type="number"
                  {...register('pointsPerBlock', {
                    setValueAs: (v) => (v === '' ? 0 : Number(v)),
                  })}
                  aria-invalid={Boolean(errors.pointsPerBlock)}
                />
                {errors.pointsPerBlock && (
                  <p className="text-xs text-destructive">{errors.pointsPerBlock.message}</p>
                )}
              </div>
            </div>
          )}

          {programType === 'PRODUCT_STAMPS' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="eligible-products" className="block text-xs font-medium mb-1">
                  Productos elegibles (IDs)
                </label>
                <Input
                  id="eligible-products"
                  {...register('eligibleProductIds')}
                  placeholder="prod-smash, prod-burger"
                  aria-invalid={Boolean(errors.eligibleProductIds)}
                />
                {errors.eligibleProductIds && (
                  <p className="text-xs text-destructive">{errors.eligibleProductIds.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="units-per-unit" className="block text-xs font-medium mb-1">
                  Sellos por unidad
                </label>
                <Input
                  id="units-per-unit"
                  type="number"
                  {...register('unitsPerPurchasedUnit', {
                    setValueAs: (v) => (v === '' ? 0 : Number(v)),
                  })}
                  aria-invalid={Boolean(errors.unitsPerPurchasedUnit)}
                />
                {errors.unitsPerPurchasedUnit && (
                  <p className="text-xs text-destructive">{errors.unitsPerPurchasedUnit.message}</p>
                )}
              </div>
            </div>
          )}

          {programType === 'VISIT_STAMPS' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="units-per-visit" className="block text-xs font-medium mb-1">
                  Sellos por visita
                </label>
                <Input
                  id="units-per-visit"
                  type="number"
                  {...register('unitsPerVisit', {
                    setValueAs: (v) => (v === '' ? 0 : Number(v)),
                  })}
                  aria-invalid={Boolean(errors.unitsPerVisit)}
                />
                {errors.unitsPerVisit && (
                  <p className="text-xs text-destructive">{errors.unitsPerVisit.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="min-spend" className="block text-xs font-medium mb-1">
                  Gasto mínimo (C$, opcional)
                </label>
                <Input
                  id="min-spend"
                  type="number"
                  {...register('minimumSpendNio')}
                  placeholder="0"
                  aria-invalid={Boolean(errors.minimumSpendNio)}
                />
                {errors.minimumSpendNio && (
                  <p className="text-xs text-destructive">{errors.minimumSpendNio.message}</p>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <label htmlFor="earning-rule" className="block text-sm font-medium mb-1">Regla de acumulación (JSON)</label>
          <textarea
            id="earning-rule"
            value={earningRule}
            onChange={(e) => setEarningRule(e.target.value)}
            rows={4}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-sm placeholder:text-muted-foreground"
            placeholder='{"spendBlockNio": 10, "pointsPerBlock": 1}'
          />
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setValue('useCustomJson', !useCustomJson)}
          className="text-xs text-primary underline"
        >
          {useCustomJson ? 'Usar formulario guiado' : 'Modo JSON avanzado'}
        </button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
          {isEditing ? 'Guardar cambios' : 'Crear programa'}
        </Button>
      </div>
    </form>
  );
}

function RewardForm({
  programId,
  initial,
  onSuccess,
  onCancel,
}: {
  programId: string;
  initial?: any;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const isEditing = !!initial;

  const benefit = initial?.benefit_config as Record<string, unknown> | undefined;

  // Unit C (form sweep): same pattern as the program form — the app owns
  // validation through the zod schema in types.ts. The native HTML
  // constraints this form used to rely on (name: required; cost:
  // type=number min=1 required; the DISCOUNT_AMOUNT amount:
  // type=number min=1 required; the FREE_PRODUCT product ID: required) only
  // ran inside the browser's constraint validation: the balloon replaced the
  // app's Spanish inline errors, and any submit not coming from the button
  // bypassed the guard entirely.
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RewardFormValues>({
    resolver: zodResolver(rewardFormSchema),
    defaultValues: {
      name: initial?.name ?? '',
      description: initial?.description ?? '',
      rewardType: initial?.reward_type ?? 'DISCOUNT_AMOUNT',
      useCustomJson: false,
      costUnits: initial?.cost_units ?? 10,
      amountNio: Number(benefit?.amountNio ?? 50),
      // §17.6: no default selection — the operator picks the product from
      // the governed selector. The old fabricated default ('prod-smash')
      // is gone; an empty selection blocks submit with the schema's
      // Spanish message instead of inventing an identifier.
      productId: typeof benefit?.productId === 'string' ? benefit.productId : '',
    },
  });
  const rewardType = watch('rewardType');
  const useCustomJson = watch('useCustomJson');
  const watchedProductId = watch('productId');

  // §17.6 selector wiring: the search text goes to the query hook verbatim
  // (flexible matching lives in the hook/backend, exactly as promotions).
  // The stored row's human label comes from useProductById so an edit
  // dialog never shows the operator a raw identifier.
  const [productSearch, setProductSearch] = useState('');
  const {
    data: productSearchData,
    isLoading: isProductSearchLoading,
    isError: isProductSearchError,
    refetch: refetchProducts,
  } = useProductSearch(productSearch);
  const storedProductId =
    isEditing && rewardType === 'FREE_PRODUCT'
      ? watchedProductId || undefined
      : undefined;
  const { data: storedProduct } = useProductById(storedProductId);

  // Specific field for JSON advanced mode textarea
  const [benefitConfig, setBenefitConfig] = useState(
    JSON.stringify(initial?.benefit_config ?? {}, null, 2),
  );
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateReward();
  const updateMutation = useUpdateReward();
  const isPending = createMutation.isPending || updateMutation.isPending;

  // Resolver-validated entry point: this only runs when the schema accepted
  // every field the ACTIVE branch renders, so the handler-level JSON parse
  // keeps its exact pre-sweep behavior and message.
  const onValid = async (values: RewardFormValues) => {
    if (isPending) return;
    setError(null);

    let parsedConfig: Record<string, unknown>;
    if (values.useCustomJson) {
      try {
        parsedConfig = JSON.parse(benefitConfig);
      } catch {
        setError('benefit_config debe ser JSON válido');
        return;
      }
    } else {
      if (values.rewardType === 'DISCOUNT_AMOUNT') {
        parsedConfig = { amountNio: Number(values.amountNio) };
      } else {
        // §17.6: the resolver guarantees a picked uuid; the trim is
        // belt-and-braces only. The old `|| 'prod-smash'` fallback is
        // deliberately gone: it fired exactly when a whitespace-only
        // product id reached onValid (the only empty-ish value the old
        // schema's length<1 check let through) and fabricated an
        // identifier that could travel to the backend.
        parsedConfig = { productId: values.productId.trim() };
      }
    }

    try {
      if (isEditing) {
        const input: UpdateRewardInput = {
          name: values.name,
          description: values.description || undefined,
          cost_units: values.costUnits,
          benefit_config: parsedConfig,
        };
        await updateMutation.mutateAsync({ rewardId: initial.id, input });
        toast({
          variant: "success",
          title: "Recompensa actualizada",
          description: `"${values.name}" fue actualizada exitosamente.`,
        });
      } else {
        const input: CreateRewardInput = {
          name: values.name,
          description: values.description || undefined,
          reward_type: values.rewardType,
          cost_units: values.costUnits,
          benefit_config: parsedConfig,
        };
        await createMutation.mutateAsync({ programId, input });
        toast({
          variant: "success",
          title: "Recompensa creada",
          description: `"${values.name}" fue creada exitosamente.`,
        });
      }
      onSuccess();
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Error al guardar la recompensa');
      setError(msg);
      toast({
        variant: "destructive",
        title: "Error al guardar",
        description: msg,
      });
    }
  };

  return (
    // noValidate: the application's own zod validation (via the RHF
    // resolver) is the single source of operator feedback. Native HTML
    // constraint validation would otherwise block the submit event
    // before the resolver runs, replacing the design system's Spanish
    // inline errors with the browser's own validation bubble (browser
    // language and styling).
    <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
      <div>
        <label htmlFor="reward-name" className="block text-sm font-medium mb-1">Nombre</label>
        <Input
          id="reward-name"
          {...register('name')}
          placeholder="Ej: 1 Smash Burger gratis"
          aria-invalid={Boolean(errors.name)}
        />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="reward-desc" className="block text-sm font-medium mb-1">Descripción</label>
        <Input
          id="reward-desc"
          {...register('description')}
          placeholder="Opcional"
        />
      </div>

      {!isEditing && (
        <div>
          <label htmlFor="reward-type" className="block text-sm font-medium mb-1">Tipo de recompensa</label>
          <select
            id="reward-type"
            {...register('rewardType')}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
          >
            {REWARD_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="cost-units" className="block text-sm font-medium mb-1">Costo en unidades</label>
        <Input
          id="cost-units"
          type="number"
          {...register('costUnits', {
            // Mirrors the old `Number(e.target.value)` state handling:
            // an emptied input submits as 0, a typed value as its number.
            setValueAs: (v) => (v === '' ? 0 : Number(v)),
          })}
          aria-invalid={Boolean(errors.costUnits)}
        />
        {errors.costUnits && (
          <p className="text-xs text-destructive">{errors.costUnits.message}</p>
        )}
      </div>

      {/* Dynamic structured fields according to reward type */}
      {!useCustomJson ? (
        <div className="p-3 bg-muted/40 rounded-md border border-border/60">
          <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
            Beneficio ({rewardType})
          </p>
          {rewardType === 'DISCOUNT_AMOUNT' ? (
            <div>
              <label htmlFor="benefit-amount" className="block text-xs font-medium mb-1">
                Monto de descuento (C$)
              </label>
              <Input
                id="benefit-amount"
                type="number"
                {...register('amountNio', {
                  setValueAs: (v) => (v === '' ? 0 : Number(v)),
                })}
                aria-invalid={Boolean(errors.amountNio)}
              />
              {errors.amountNio && (
                <p className="text-xs text-destructive">{errors.amountNio.message}</p>
              )}
            </div>
          ) : (
            <div>
              <EntitySearchSelect
                inputId="benefit-product"
                label="Producto a entregar"
                value={watchedProductId ?? ''}
                onChange={(id) =>
                  setValue('productId', id, { shouldValidate: true })
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
                placeholder="Ej: Smash Burger, Café"
              />
              {errors.productId && (
                <p className="text-xs text-destructive">{errors.productId.message}</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div>
          <label htmlFor="benefit-config" className="block text-sm font-medium mb-1">Configuración de beneficio (JSON)</label>
          <textarea
            id="benefit-config"
            value={benefitConfig}
            onChange={(e) => setBenefitConfig(e.target.value)}
            rows={3}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-sm placeholder:text-muted-foreground"
            placeholder='{"amountNio": 50}'
          />
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setValue('useCustomJson', !useCustomJson)}
          className="text-xs text-primary underline"
        >
          {useCustomJson ? 'Usar formulario guiado' : 'Modo JSON avanzado'}
        </button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
          {isEditing ? 'Guardar' : 'Crear recompensa'}
        </Button>
      </div>
    </form>
  );
}

export function LoyaltyPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedProgram, setSelectedProgram] = useState<LoyaltyProgram | null>(null);
  const [showCreateProgram, setShowCreateProgram] = useState(false);
  const [editingProgram, setEditingProgram] = useState<LoyaltyProgram | null>(null);
  const [showCreateReward, setShowCreateReward] = useState(false);
  const [editingReward, setEditingReward] = useState<RewardDefinition | null>(null);
  const [profitAwareReward, setProfitAwareReward] = useState<RewardDefinition | null>(null);

  const { data: programs, isLoading, error } = usePrograms(
    statusFilter ? { status: statusFilter } : undefined,
  );
  const { data: rewards } = useRewards(selectedProgram?.id ?? '');

  const activateProgram = useActivateProgram();
  const deactivateProgram = useDeactivateProgram();
  const activateReward = useActivateReward();
  const deactivateReward = useDeactivateReward();

  const filtered = programs?.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()),
  ) ?? [];

  const handleToggleProgram = async (p: LoyaltyProgram) => {
    try {
      if (p.status === 'ACTIVE') {
        await deactivateProgram.mutateAsync(p.id);
        toast({
          variant: 'success',
          title: 'Programa desactivado',
          description: `El programa "${p.name}" fue desactivado.`,
        });
      } else if (p.status === 'DRAFT' || p.status === 'INACTIVE') {
        await activateProgram.mutateAsync(p.id);
        toast({
          variant: 'success',
          title: 'Programa activado',
          description: `El programa "${p.name}" está ahora activo.`,
        });
      }
    } catch (err) {
      toast({
        title: 'Error al cambiar estado',
        description: getApiErrorMessage(err, 'No se pudo cambiar el estado del programa'),
        variant: 'destructive',
      });
    }
  };

  const handleToggleReward = async (r: RewardDefinition) => {
    try {
      if (r.status === 'ACTIVE') {
        await deactivateReward.mutateAsync(r.id);
        toast({
          variant: 'success',
          title: 'Recompensa desactivada',
          description: `"${r.name}" fue desactivada.`,
        });
      } else {
        await activateReward.mutateAsync(r.id);
        toast({
          variant: 'success',
          title: 'Recompensa activada',
          description: `"${r.name}" está ahora activa.`,
        });
      }
    } catch (err) {
      toast({
        title: 'Error al cambiar estado',
        description: getApiErrorMessage(err, 'No se pudo cambiar el estado de la recompensa'),
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-label="Cargando programas de lealtad">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        <p>{getApiErrorMessage(error, "Error al cargar programas")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Fidelización</h1>
          <p className="text-sm text-muted-foreground">Gestione programas de lealtad y recompensas</p>
        </div>
        <Button onClick={() => setShowCreateProgram(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Nuevo programa
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <label htmlFor="loyalty-search" className="sr-only">Buscar programas</label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="loyalty-search"
            placeholder="Buscar por nombre..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
        >
          <option value="">Todos los estados</option>
          <option value="DRAFT">Borrador</option>
          <option value="ACTIVE">Activo</option>
          <option value="INACTIVE">Inactivo</option>
        </select>
      </div>

      {/* Programs list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Star className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">No hay programas de lealtad</p>
          <p className="text-sm">Cree un programa para empezar a fidelizar clientes</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((program) => {
            const statusInfo = STATUS_LABELS[program.status];
            return (
              <div
                key={program.id}
                className={`border rounded-lg p-4 transition-all cursor-pointer ${
                  selectedProgram?.id === program.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => setSelectedProgram(selectedProgram?.id === program.id ? null : program)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-foreground">{program.name}</h3>
                  </div>
                  <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                </div>

                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>Tipo: {LOYALTY_PROGRAM_TYPES.find((t) => t.id === program.program_type)?.label ?? "Desconocido"}</p>
                  <p>Versión: {program.config_version}</p>
                </div>

                <div className="flex gap-2 mt-3">
                  {(program.status === 'DRAFT' || program.status === 'INACTIVE') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); handleToggleProgram(program); }}
                      disabled={activateProgram.isPending}
                    >
                      <ToggleRight className="h-3 w-3 mr-1" />
                      Activar
                    </Button>
                  )}
                  {program.status === 'ACTIVE' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); handleToggleProgram(program); }}
                      disabled={deactivateProgram.isPending}
                    >
                      <ToggleLeft className="h-3 w-3 mr-1" />
                      Desactivar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); setEditingProgram(program); }}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>

                {/* Expanded rewards */}
                {selectedProgram?.id === program.id && (
                  <div className="mt-4 pt-3 border-t space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">Recompensas</h4>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); setShowCreateReward(true); }}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Agregar
                      </Button>
                    </div>
                    {rewards && rewards.length > 0 ? (
                      <div className="space-y-2">
                        {rewards.map((reward) => (
                          <div key={reward.id} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                            <div className="flex items-center gap-2">
                              <Tag className="h-3 w-3" />
                              <span>{reward.name}</span>
                              <Badge variant={reward.status === 'ACTIVE' ? 'success' : 'secondary'} className="text-xs">
                                {reward.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                              </Badge>
                            </div>
                            <div className="flex gap-1 items-center">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-1"
                                onClick={(e) => { e.stopPropagation(); handleToggleReward(reward); }}
                              >
                                {reward.status === 'ACTIVE' ? (
                                  <ToggleLeft className="h-3 w-3" />
                                ) : (
                                  <ToggleRight className="h-3 w-3" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-1"
                                onClick={(e) => { e.stopPropagation(); setEditingReward(reward); }}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                                title="Ver métricas económicas"
                                onClick={(e) => { e.stopPropagation(); setProfitAwareReward(reward); }}
                              >
                                <TrendingUp className="h-3 w-3 mr-1" />
                                Métricas
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sin recompensas definidas</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Program Dialog */}
      <Dialog open={showCreateProgram} onOpenChange={setShowCreateProgram}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo programa de lealtad</DialogTitle>
            <DialogDescription>Defina el nombre, tipo y regla de acumulación del programa</DialogDescription>
          </DialogHeader>
          <ProgramForm
            onSuccess={() => setShowCreateProgram(false)}
            onCancel={() => setShowCreateProgram(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Program Dialog */}
      <Dialog open={!!editingProgram} onOpenChange={() => setEditingProgram(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar programa</DialogTitle>
            <DialogDescription>Modifique la configuración del programa de lealtad</DialogDescription>
          </DialogHeader>
          {editingProgram && (
            <ProgramForm
              initial={editingProgram}
              onSuccess={() => setEditingProgram(null)}
              onCancel={() => setEditingProgram(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Create Reward Dialog */}
      <Dialog open={showCreateReward} onOpenChange={setShowCreateReward}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva recompensa</DialogTitle>
            <DialogDescription>Defina el nombre, tipo y costo de la recompensa</DialogDescription>
          </DialogHeader>
          {selectedProgram && (
            <RewardForm
              programId={selectedProgram.id}
              onSuccess={() => setShowCreateReward(false)}
              onCancel={() => setShowCreateReward(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Reward Dialog */}
      <Dialog open={!!editingReward} onOpenChange={() => setEditingReward(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar recompensa</DialogTitle>
            <DialogDescription>Modifique la configuración de la recompensa</DialogDescription>
          </DialogHeader>
          {editingReward && selectedProgram && (
            <RewardForm
              programId={selectedProgram.id}
              initial={editingReward}
              onSuccess={() => setEditingReward(null)}
              onCancel={() => setEditingReward(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Profit-aware Reward Dialog */}
      <RewardProfitAwareDialog
        reward={profitAwareReward}
        open={!!profitAwareReward}
        onOpenChange={(open) => !open && setProfitAwareReward(null)}
      />
    </div>
  );
}
