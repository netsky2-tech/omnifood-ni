'use client';

import { useState } from 'react';
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
  LoyaltyProgramType,
  LoyaltyProgramStatus,
  CreateLoyaltyProgramInput,
  UpdateLoyaltyProgramInput,
  RewardType,
  CreateRewardInput,
  UpdateRewardInput,
} from './types';
import { LOYALTY_PROGRAM_TYPES, REWARD_TYPES } from './types';
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

const STATUS_LABELS: Record<LoyaltyProgramStatus, { label: string; variant: string }> = {
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
  const [name, setName] = useState(initial?.name ?? '');
  const [programType, setProgramType] = useState<LoyaltyProgramType>(initial?.program_type ?? 'SPEND_POINTS');

  // Specific fields for SPEND_POINTS
  const [spendBlockNio, setSpendBlockNio] = useState<number>(
    Number((initial?.earning_rule as any)?.spendBlockNio ?? 10)
  );
  const [pointsPerBlock, setPointsPerBlock] = useState<number>(
    Number((initial?.earning_rule as any)?.pointsPerBlock ?? 1)
  );

  // Specific fields for PRODUCT_STAMPS
  const [eligibleProductIds, setEligibleProductIds] = useState<string>(
    Array.isArray((initial?.earning_rule as any)?.eligibleProductIds)
      ? (initial?.earning_rule as any).eligibleProductIds.join(', ')
      : 'prod-smash'
  );
  const [unitsPerPurchasedUnit, setUnitsPerPurchasedUnit] = useState<number>(
    Number((initial?.earning_rule as any)?.unitsPerPurchasedUnit ?? 1)
  );

  // Specific fields for VISIT_STAMPS
  const [unitsPerVisit, setUnitsPerVisit] = useState<number>(
    Number((initial?.earning_rule as any)?.unitsPerVisit ?? 1)
  );
  const [minimumSpendNio, setMinimumSpendNio] = useState<string>(
    (initial?.earning_rule as any)?.minimumSpendNio != null
      ? String((initial?.earning_rule as any).minimumSpendNio)
      : ''
  );

  const [useCustomJson, setUseCustomJson] = useState(false);
  const [earningRule, setEarningRule] = useState(
    JSON.stringify(initial?.earning_rule ?? {}, null, 2),
  );
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateProgram();
  const updateMutation = useUpdateProgram();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let parsedRule: Record<string, unknown>;
    if (useCustomJson) {
      try {
        parsedRule = JSON.parse(earningRule);
      } catch {
        setError('earning_rule debe ser JSON válido');
        return;
      }
    } else {
      if (programType === 'SPEND_POINTS') {
        parsedRule = {
          spendBlockNio: Number(spendBlockNio),
          pointsPerBlock: Number(pointsPerBlock),
        };
      } else if (programType === 'PRODUCT_STAMPS') {
        const prodList = eligibleProductIds
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        parsedRule = {
          eligibleProductIds: prodList.length > 0 ? prodList : ['prod-smash'],
          unitsPerPurchasedUnit: Number(unitsPerPurchasedUnit),
        };
      } else {
        parsedRule = {
          unitsPerVisit: Number(unitsPerVisit),
          ...(minimumSpendNio.trim() ? { minimumSpendNio: Number(minimumSpendNio) } : {}),
        };
      }
    }

    try {
      if (isEditing) {
        const input: UpdateLoyaltyProgramInput = { name, earning_rule: parsedRule };
        await updateMutation.mutateAsync({ programId: initial.id, input });
      } else {
        const input: CreateLoyaltyProgramInput = {
          name,
          program_type: programType,
          earning_rule: parsedRule,
        };
        await createMutation.mutateAsync(input);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="program-name" className="block text-sm font-medium mb-1">Nombre</label>
        <Input
          id="program-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Smash Burger Club"
          required
        />
      </div>

      {!isEditing && (
        <div>
          <label htmlFor="program-type" className="block text-sm font-medium mb-1">Tipo de programa</label>
          <select
            id="program-type"
            value={programType}
            onChange={(e) => setProgramType(e.target.value as any)}
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
                  min={1}
                  value={spendBlockNio}
                  onChange={(e) => setSpendBlockNio(Number(e.target.value))}
                  required
                />
              </div>
              <div>
                <label htmlFor="points-per-block" className="block text-xs font-medium mb-1">
                  Puntos por bloque
                </label>
                <Input
                  id="points-per-block"
                  type="number"
                  min={1}
                  value={pointsPerBlock}
                  onChange={(e) => setPointsPerBlock(Number(e.target.value))}
                  required
                />
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
                  value={eligibleProductIds}
                  onChange={(e) => setEligibleProductIds(e.target.value)}
                  placeholder="prod-smash, prod-burger"
                  required
                />
              </div>
              <div>
                <label htmlFor="units-per-unit" className="block text-xs font-medium mb-1">
                  Sellos por unidad
                </label>
                <Input
                  id="units-per-unit"
                  type="number"
                  min={1}
                  value={unitsPerPurchasedUnit}
                  onChange={(e) => setUnitsPerPurchasedUnit(Number(e.target.value))}
                  required
                />
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
                  min={1}
                  value={unitsPerVisit}
                  onChange={(e) => setUnitsPerVisit(Number(e.target.value))}
                  required
                />
              </div>
              <div>
                <label htmlFor="min-spend" className="block text-xs font-medium mb-1">
                  Gasto mínimo (C$, opcional)
                </label>
                <Input
                  id="min-spend"
                  type="number"
                  min={0}
                  value={minimumSpendNio}
                  onChange={(e) => setMinimumSpendNio(e.target.value)}
                  placeholder="0"
                />
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
          onClick={() => setUseCustomJson(!useCustomJson)}
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
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [rewardType, setRewardType] = useState<RewardType>(initial?.reward_type ?? 'DISCOUNT_AMOUNT');
  const [costUnits, setCostUnits] = useState(initial?.cost_units ?? 10);

  // Specific field for DISCOUNT_AMOUNT
  const [amountNio, setAmountNio] = useState<number>(
    Number((initial?.benefit_config as any)?.amountNio ?? 50)
  );

  // Specific field for FREE_PRODUCT
  const [productId, setProductId] = useState<string>(
    (initial?.benefit_config as any)?.productId ?? 'prod-smash'
  );

  const [useCustomJson, setUseCustomJson] = useState(false);
  const [benefitConfig, setBenefitConfig] = useState(
    JSON.stringify(initial?.benefit_config ?? {}, null, 2),
  );
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateReward();
  const updateMutation = useUpdateReward();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let parsedConfig: Record<string, unknown>;
    if (useCustomJson) {
      try {
        parsedConfig = JSON.parse(benefitConfig);
      } catch {
        setError('benefit_config debe ser JSON válido');
        return;
      }
    } else {
      if (rewardType === 'DISCOUNT_AMOUNT') {
        parsedConfig = { amountNio: Number(amountNio) };
      } else {
        parsedConfig = { productId: productId.trim() || 'prod-smash' };
      }
    }

    try {
      if (isEditing) {
        const input: UpdateRewardInput = {
          name,
          description: description || undefined,
          cost_units: costUnits,
          benefit_config: parsedConfig,
        };
        await updateMutation.mutateAsync({ rewardId: initial.id, input });
      } else {
        const input: CreateRewardInput = {
          name,
          description: description || undefined,
          reward_type: rewardType,
          cost_units: costUnits,
          benefit_config: parsedConfig,
        };
        await createMutation.mutateAsync({ programId, input });
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="reward-name" className="block text-sm font-medium mb-1">Nombre</label>
        <Input
          id="reward-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: 1 Smash Burger gratis"
          required
        />
      </div>

      <div>
        <label htmlFor="reward-desc" className="block text-sm font-medium mb-1">Descripción</label>
        <Input
          id="reward-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Opcional"
        />
      </div>

      {!isEditing && (
        <div>
          <label htmlFor="reward-type" className="block text-sm font-medium mb-1">Tipo de recompensa</label>
          <select
            id="reward-type"
            value={rewardType}
            onChange={(e) => setRewardType(e.target.value as any)}
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
          min={1}
          value={costUnits}
          onChange={(e) => setCostUnits(Number(e.target.value))}
          required
        />
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
                min={1}
                value={amountNio}
                onChange={(e) => setAmountNio(Number(e.target.value))}
                required
              />
            </div>
          ) : (
            <div>
              <label htmlFor="benefit-product" className="block text-xs font-medium mb-1">
                ID de producto a entregar
              </label>
              <Input
                id="benefit-product"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                placeholder="prod-smash"
                required
              />
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
          onClick={() => setUseCustomJson(!useCustomJson)}
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
  const [editingReward, setEditingReward] = useState<any>(null);
  const [profitAwareReward, setProfitAwareReward] = useState<any>(null);

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
    if (p.status === 'ACTIVE') {
      await deactivateProgram.mutateAsync(p.id);
    } else if (p.status === 'DRAFT' || p.status === 'INACTIVE') {
      await activateProgram.mutateAsync(p.id);
    }
  };

  const handleToggleReward = async (r: any) => {
    if (r.status === 'ACTIVE') {
      await deactivateReward.mutateAsync(r.id);
    } else {
      await activateReward.mutateAsync(r.id);
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
        <p>Error al cargar programas: {(error as Error).message}</p>
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
                  <Badge variant={statusInfo.variant as any}>{statusInfo.label}</Badge>
                </div>

                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>Tipo: {LOYALTY_PROGRAM_TYPES.find((t) => t.id === program.program_type)?.label ?? program.program_type}</p>
                  <p>Versión config: {program.config_version}</p>
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
