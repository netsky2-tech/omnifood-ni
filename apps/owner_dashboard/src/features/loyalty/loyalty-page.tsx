'use client';

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Search, Star, Trophy, Tag, Edit, ToggleLeft, ToggleRight, TrendingUp, Users } from 'lucide-react';
import { useAuthStore } from '@/features/auth/auth-store';
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

/**
 * §17.6 edit-mode label for a stored eligible-product id outside the current
 * search results (hooks per chip instance, never hooks in a loop). The
 * operator sees the human name; an unresolvable id degrades to the same
 * short-id display the promotions list uses — never the raw uuid.
 */
function EligibleProductChipLabel({ id }: { id: string }) {
  const { data: product } = useProductById(id);
  return <>{product?.name ?? `…${id.slice(-8)}`}</>;
}

const STATUS_LABELS: Record<
  LoyaltyProgramStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" }
> = {
  DRAFT: { label: 'Borrador', variant: 'secondary' },
  ACTIVE: { label: 'Activo', variant: 'success' },
  INACTIVE: { label: 'Inactivo', variant: 'outline' },
};

function formatEarningRuleSummary(program: LoyaltyProgram): string {
  const rule = program.earning_rule as Record<string, unknown> | undefined;
  if (!rule) return 'Regla no configurada';
  if (program.program_type === 'SPEND_POINTS') {
    const spend = rule.spendBlockNio ?? 10;
    const points = rule.pointsPerBlock ?? 1;
    return `C$ ${spend} = ${points} punto${Number(points) === 1 ? '' : 's'}`;
  }
  if (program.program_type === 'PRODUCT_STAMPS') {
    const units = rule.unitsPerPurchasedUnit ?? 1;
    const prods = Array.isArray(rule.eligibleProductIds) ? rule.eligibleProductIds.length : 0;
    return `${units} sello${Number(units) === 1 ? '' : 's'} por unidad (${prods} producto${prods === 1 ? '' : 's'})`;
  }
  if (program.program_type === 'VISIT_STAMPS') {
    const units = rule.unitsPerVisit ?? 1;
    const minSpend = rule.minimumSpendNio ? ` · mín. C$ ${rule.minimumSpendNio}` : '';
    return `${units} sello${Number(units) === 1 ? '' : 's'} por visita${minSpend}`;
  }
  return 'Regla configurada';
}

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
      startsAt: initial?.starts_at ? new Date(initial.starts_at).toISOString().slice(0, 10) : '',
      endsAt: initial?.ends_at ? new Date(initial.ends_at).toISOString().slice(0, 10) : '',
      spendBlockNio: Number(rule?.spendBlockNio ?? 10),
      pointsPerBlock: Number(rule?.pointsPerBlock ?? 1),
      eligibleProductIds: Array.isArray(rule?.eligibleProductIds)
        ? // §17.6: the stored uuids from the governed multi selector — no
          // fabricated default. An empty stored list stays empty and the
          // ACTIVE branch's schema decides whether that blocks submit.
          (rule.eligibleProductIds as string[])
        : [],
      unitsPerPurchasedUnit: Number(rule?.unitsPerPurchasedUnit ?? 1),
      unitsPerVisit: Number(rule?.unitsPerVisit ?? 1),
      minimumSpendNio:
        rule?.minimumSpendNio != null ? String(rule.minimumSpendNio) : '',
    },
  });
  const programType = watch('programType');
  const watchedEligibleProductIds = watch('eligibleProductIds');

  // §17.6 selector wiring (multi mode): the operator's search text goes to
  // the query hook verbatim; picking adds the row's uuid to the payload and
  // re-clicking (or a chip's Quitar) removes it. Same contract as the
  // single-select forms, for a plural datum.
  const [eligibleSearch, setEligibleSearch] = useState('');
  const {
    data: eligibleSearchData,
    isLoading: isEligibleSearchLoading,
    isError: isEligibleSearchError,
    refetch: refetchEligibleProducts,
  } = useProductSearch(eligibleSearch);

  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateProgram();
  const updateMutation = useUpdateProgram();
  const isPending = createMutation.isPending || updateMutation.isPending;

  // Resolver-validated entry point: this only runs when the schema accepted
  // every field the ACTIVE branch renders.
  const onValid = async (values: ProgramFormValues) => {
    if (isPending) return;
    setError(null);

    let parsedRule: Record<string, unknown>;
    if (values.programType === 'SPEND_POINTS') {
      parsedRule = {
        spendBlockNio: Number(values.spendBlockNio),
        pointsPerBlock: Number(values.pointsPerBlock),
      };
    } else if (values.programType === 'PRODUCT_STAMPS') {
      // §17.6: the resolver guarantees at least one picked uuid.
      parsedRule = {
        eligibleProductIds: values.eligibleProductIds,
        unitsPerPurchasedUnit: Number(values.unitsPerPurchasedUnit),
      };
    } else {
      parsedRule = {
        unitsPerVisit: Number(values.unitsPerVisit),
        ...(values.minimumSpendNio.trim() ? { minimumSpendNio: Number(values.minimumSpendNio) } : {}),
      };
    }

    const startsAtIso = values.startsAt?.trim() ? new Date(values.startsAt).toISOString() : null;
    const endsAtIso = values.endsAt?.trim() ? new Date(values.endsAt).toISOString() : null;

    try {
      if (isEditing) {
        const input: UpdateLoyaltyProgramInput = {
          name: values.name,
          earning_rule: parsedRule,
          eligibility_rule: (initial.eligibility_rule as Record<string, unknown>) ?? {},
          starts_at: startsAtIso,
          ends_at: endsAtIso,
        };
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
          eligibility_rule: {},
          starts_at: startsAtIso,
          ends_at: endsAtIso,
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

      {/* Vigencia */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="program-starts-at" className="block text-xs font-medium mb-1">
            Vigencia desde (opcional)
          </label>
          <Input
            id="program-starts-at"
            type="date"
            {...register('startsAt')}
            aria-invalid={Boolean(errors.startsAt)}
          />
          {errors.startsAt && (
            <p className="text-xs text-destructive">{errors.startsAt.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="program-ends-at" className="block text-xs font-medium mb-1">
            Vigencia hasta (opcional)
          </label>
          <Input
            id="program-ends-at"
            type="date"
            {...register('endsAt')}
            aria-invalid={Boolean(errors.endsAt)}
          />
          {errors.endsAt && (
            <p className="text-xs text-destructive">{errors.endsAt.message}</p>
          )}
        </div>
      </div>

      {/* Dynamic structured fields according to mechanics */}
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
                <EntitySearchSelect
                  inputId="eligible-products"
                  label="Productos elegibles"
                  multiple
                  value={watchedEligibleProductIds ?? []}
                  onToggle={(id) =>
                    setValue(
                      'eligibleProductIds',
                      (watchedEligibleProductIds ?? []).includes(id)
                        ? watchedEligibleProductIds.filter((x) => x !== id)
                        : [...(watchedEligibleProductIds ?? []), id],
                      { shouldValidate: true },
                    )
                  }
                  options={(eligibleSearchData?.data ?? []).map((product) => ({
                    id: product.id,
                    label: product.name,
                  }))}
                  search={eligibleSearch}
                  onSearchChange={setEligibleSearch}
                  isLoading={isEligibleSearchLoading}
                  isError={isEligibleSearchError}
                  onRetry={() => void refetchEligibleProducts()}
                  emptyMessage="No hay productos todavía. Cree productos en el catálogo."
                  renderSelectedLabel={(id) => <EligibleProductChipLabel id={id} />}
                  total={eligibleSearchData?.total}
                  onVerTodos={() => setEligibleSearch('')}
                  placeholder="Ej: Smash Burger, Café"
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
      costUnits: initial?.cost_units ?? 10,
      amountNio: Number(benefit?.amountNio ?? 50),
      // §17.6: no default selection — the operator picks the product from
      // the governed selector.
      productId: typeof benefit?.productId === 'string' ? benefit.productId : '',
    },
  });
  const rewardType = watch('rewardType');
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

  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateReward();
  const updateMutation = useUpdateReward();
  const isPending = createMutation.isPending || updateMutation.isPending;

  // Resolver-validated entry point: this only runs when the schema accepted
  // every field the ACTIVE branch renders.
  const onValid = async (values: RewardFormValues) => {
    if (isPending) return;
    setError(null);

    let parsedConfig: Record<string, unknown>;
    if (values.rewardType === 'DISCOUNT_AMOUNT') {
      parsedConfig = { amountNio: Number(values.amountNio) };
    } else {
      parsedConfig = { productId: values.productId.trim() };
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
      <div className="p-3 bg-muted/40 rounded-md border border-border/60">
        <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
          Beneficio: {rewardType === 'DISCOUNT_AMOUNT' ? 'Descuento en dinero (C$)' : 'Producto gratis'}
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
  const [confirmDeactivateProgram, setConfirmDeactivateProgram] = useState<LoyaltyProgram | null>(null);
  const [confirmDeactivateReward, setConfirmDeactivateReward] = useState<RewardDefinition | null>(null);

  const user = useAuthStore((s) => s.user);
  const canManage = !user || user.role === 'OWNER';

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
        <div className="flex items-center gap-2">
          <Link to="/customers?tab=loyalty">
            <Button variant="outline">
              <Users className="h-4 w-4 mr-1.5" />
              Saldos de clientes
            </Button>
          </Link>
          {canManage && (
            <Button onClick={() => setShowCreateProgram(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Nuevo programa
            </Button>
          )}
        </div>
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
                  <p><span className="font-medium text-foreground">Regla:</span> {formatEarningRuleSummary(program)}</p>
                  <p>Tipo: {LOYALTY_PROGRAM_TYPES.find((t) => t.id === program.program_type)?.label ?? "Desconocido"}</p>
                  <p>Versión: {program.config_version}</p>
                  <p className="text-xs">
                    Vigencia:{' '}
                    {program.starts_at || program.ends_at ? (
                      <>
                        {program.starts_at ? new Date(program.starts_at).toLocaleDateString('es-NI') : 'Inicio'}
                        {program.ends_at ? ` al ${new Date(program.ends_at).toLocaleDateString('es-NI')}` : ' en adelante'}
                      </>
                    ) : (
                      <span className="font-medium text-foreground">Permanente (Indefinida)</span>
                    )}
                  </p>
                </div>

                {canManage && (
                  <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border/40">
                    {(program.status === 'DRAFT' || program.status === 'INACTIVE') && (
                      <Button
                        size="sm"
                        className="bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 shadow-xs"
                        onClick={(e) => { e.stopPropagation(); handleToggleProgram(program); }}
                        disabled={activateProgram.isPending}
                      >
                        <ToggleRight className="h-3.5 w-3.5 mr-1.5" />
                        Activar
                      </Button>
                    )}
                    {program.status === 'ACTIVE' && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="shadow-xs"
                        onClick={(e) => { e.stopPropagation(); setConfirmDeactivateProgram(program); }}
                        disabled={deactivateProgram.isPending}
                      >
                        <ToggleLeft className="h-3.5 w-3.5 mr-1.5" />
                        Desactivar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); setEditingProgram(program); }}
                    >
                      <Edit className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                      Editar
                    </Button>
                  </div>
                )}

                {/* Expanded rewards */}
                {selectedProgram?.id === program.id && (
                  <div className="mt-4 pt-3 border-t space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">Recompensas</h4>
                      {canManage && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); setShowCreateReward(true); }}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Agregar
                        </Button>
                      )}
                    </div>
                    {rewards && rewards.length > 0 ? (
                      <div className="space-y-2.5">
                        {rewards.map((reward) => (
                          <div
                            key={reward.id}
                            className="p-3 bg-muted/60 rounded-lg text-sm border border-border/50 space-y-2"
                          >
                            {/* Header row: Icon, Name and Badge */}
                            <div className="flex items-start justify-between gap-2">
                              <Tag className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                              <span
                                className="font-semibold text-foreground break-words flex-1 min-w-0"
                                title={reward.name}
                              >
                                {reward.name}
                              </span>
                              <Badge
                                variant={reward.status === 'ACTIVE' ? 'success' : 'outline'}
                                className="text-xs shrink-0"
                              >
                                {reward.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                              </Badge>
                            </div>

                            {/* Description if present */}
                            {reward.description && (
                              <p className="text-xs text-muted-foreground leading-relaxed break-words pl-6">
                                {reward.description}
                              </p>
                            )}

                            {/* Benefit summary */}
                            <div className="text-xs text-muted-foreground flex items-center justify-between pt-1 border-t border-border/30 pl-6">
                              <span>
                                {reward.reward_type === 'FREE_PRODUCT' ? 'Producto gratis' : 'Descuento en dinero'}
                              </span>
                              <span className="font-medium text-foreground">
                                Costo: {reward.cost_units} {reward.cost_units === 1 ? 'unidad' : 'unidades'}
                              </span>
                            </div>

                            {/* Action buttons with semantic background colors */}
                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
                              <div className="flex items-center gap-1.5">
                                {canManage && (
                                  <>
                                    {reward.status === 'ACTIVE' ? (
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        className="h-7 px-2.5 text-xs shadow-xs"
                                        title="Desactivar recompensa"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setConfirmDeactivateReward(reward);
                                        }}
                                      >
                                        <ToggleLeft className="h-3.5 w-3.5 mr-1" />
                                        <span>Desactivar</span>
                                      </Button>
                                    ) : (
                                      <Button
                                        size="sm"
                                        className="h-7 px-2.5 text-xs bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 shadow-xs"
                                        title="Activar recompensa"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleToggleReward(reward);
                                        }}
                                      >
                                        <ToggleRight className="h-3.5 w-3.5 mr-1" />
                                        <span>Activar</span>
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-xs"
                                      title="Editar recompensa"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingReward(reward);
                                      }}
                                    >
                                      <Edit className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                                      <span>Editar</span>
                                    </Button>
                                  </>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                title="Ver métricas económicas"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setProfitAwareReward(reward);
                                }}
                              >
                                <TrendingUp className="h-3.5 w-3.5 mr-1 text-primary" />
                                <span>Métricas</span>
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

      {/* Confirm Deactivate Program Dialog */}
      <Dialog
        open={!!confirmDeactivateProgram}
        onOpenChange={(open) => !open && setConfirmDeactivateProgram(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>¿Desactivar programa?</DialogTitle>
            <DialogDescription>
              Al desactivar &quot;{confirmDeactivateProgram?.name}&quot;, los clientes dejarán de acumular puntos o sellos en las terminales de venta. Las recompensas activas no podrán ser canjeadas.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmDeactivateProgram(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (confirmDeactivateProgram) {
                  const p = confirmDeactivateProgram;
                  setConfirmDeactivateProgram(null);
                  await handleToggleProgram(p);
                }
              }}
            >
              Desactivar programa
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Deactivate Reward Dialog */}
      <Dialog
        open={!!confirmDeactivateReward}
        onOpenChange={(open) => !open && setConfirmDeactivateReward(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>¿Desactivar recompensa?</DialogTitle>
            <DialogDescription>
              Al desactivar &quot;{confirmDeactivateReward?.name}&quot;, los clientes ya no podrán canjearla en el punto de venta.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmDeactivateReward(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (confirmDeactivateReward) {
                  const r = confirmDeactivateReward;
                  setConfirmDeactivateReward(null);
                  await handleToggleReward(r);
                }
              }}
            >
              Desactivar recompensa
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
