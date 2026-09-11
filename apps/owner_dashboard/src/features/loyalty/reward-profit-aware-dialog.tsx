'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Calendar, Info, TrendingUp } from 'lucide-react';
import { useRewardProfitAware } from './use-loyalty';
import type { ProfitAwareMetric, RewardDefinition } from './types';

interface RewardProfitAwareDialogProps {
  reward: RewardDefinition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatCurrency(val?: number): string {
  if (val === undefined || val === null) return '—';
  return `C$ ${val.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(val?: number): string {
  if (val === undefined || val === null) return '—';
  return `${val.toFixed(2)}%`;
}

function formatReason(reason?: string): string {
  if (!reason) return 'No disponible';
  switch (reason) {
    case 'NO_QUALIFIED_SALES':
      return 'Sin ventas que califiquen';
    case 'INCOMPLETE_REDEMPTION_COST_COVERAGE':
    case 'INCOMPLETE_COST_COVERAGE':
      return 'Costo incompleto en redenciones';
    case 'COST_NOT_RESOLVABLE':
      return 'Costo no disponible en inventario';
    case 'NO_CANONICAL_BASE_PRICE':
      return 'Sin precio base canónico';
    case 'ONLY_FOR_FREE_PRODUCT':
      return 'Solo para recompensas de producto';
    default:
      return reason;
  }
}

function MetricCard({
  title,
  metric,
  isPercent = false,
  description,
}: {
  title: string;
  metric?: ProfitAwareMetric<number>;
  isPercent?: boolean;
  description?: string;
}) {
  if (!metric) {
    return (
      <div className="p-3 bg-card border rounded-lg space-y-1">
        <p className="text-xs text-muted-foreground font-medium">{title}</p>
        <p className="text-lg font-semibold">—</p>
      </div>
    );
  }

  return (
    <div className="p-3 bg-card border rounded-lg space-y-1.5" data-testid={`metric-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-medium">{title}</p>
        {metric.status === 'STALE' && (
          <Badge variant="warning" className="text-[10px] px-1.5 py-0">
            Desactualizado
          </Badge>
        )}
      </div>

      <div>
        {metric.status === 'AVAILABLE' || metric.status === 'STALE' ? (
          <p className="text-xl font-bold tracking-tight">
            {isPercent ? formatPercent(metric.value) : formatCurrency(metric.value)}
          </p>
        ) : metric.status === 'NOT_APPLICABLE' ? (
          <p className="text-sm font-medium text-muted-foreground italic">No aplica</p>
        ) : (
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-destructive">No disponible</p>
            {metric.reason && (
              <p className="text-[11px] text-muted-foreground">{formatReason(metric.reason)}</p>
            )}
          </div>
        )}
      </div>

      {description && (
        <p className="text-[10px] text-muted-foreground leading-tight pt-1 border-t">
          {description}
        </p>
      )}
    </div>
  );
}

export function RewardProfitAwareDialog({
  reward,
  open,
  onOpenChange,
}: RewardProfitAwareDialogProps) {
  const queryResult = useRewardProfitAware(reward?.id ?? '');
  const { data: metrics, isLoading = false, error = null } = queryResult ?? {};

  if (!open || !reward) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <DialogTitle>Lectura económica de Recompensa</DialogTitle>
          </div>
          <DialogDescription>
            {reward?.name ?? 'Detalle económico'} &bull; {reward?.reward_type === 'FREE_PRODUCT' ? 'Producto gratis' : 'Descuento en dinero'}
          </DialogDescription>
        </DialogHeader>

        {/* Disclaimer / Normative copy */}
        <div className="flex items-start gap-2.5 p-3 bg-muted/70 rounded-lg text-xs text-muted-foreground border border-border/50">
          <Info className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">Métricas de diseño de incentivos</p>
            <p>
              Estas métricas son lecturas aproximadas para calibrar recompensas. No representan
              P&amp;L, margen contable, utilidad neta ni costo fiscal histórico del ticket.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4 py-4" data-testid="loading-skeleton">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="h-24 rounded-lg bg-muted animate-pulse" />
              <div className="h-24 rounded-lg bg-muted animate-pulse" />
              <div className="h-24 rounded-lg bg-muted animate-pulse" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="h-24 rounded-lg bg-muted animate-pulse" />
              <div className="h-24 rounded-lg bg-muted animate-pulse" />
              <div className="h-24 rounded-lg bg-muted animate-pulse" />
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 p-4 text-destructive bg-destructive/10 rounded-lg text-sm my-4">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Error al cargar las métricas profit-aware de la recompensa.</span>
          </div>
        ) : metrics ? (
          <div className="space-y-4 py-2">
            {/* Window banner */}
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Calendar className="h-3.5 w-3.5" />
                Ventana móvil: {metrics.window.label === 'LAST_30_DAYS' ? 'Últimos 30 días' : metrics.window.label}
              </span>
              <span>asOf: {new Date(metrics.asOfUtc).toLocaleDateString()}</span>
            </div>

            {/* Metrics Grid */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Costo y Precio Actual de Catálogo
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <MetricCard
                  title="Precio base actual"
                  metric={metrics.retailPriceNio}
                  description="Catálogo canónico vigente"
                />
                <MetricCard
                  title="CPP estimado"
                  metric={metrics.estimatedCppNio}
                  description="Costo Promedio Ponderado"
                />
                <MetricCard
                  title="Costo estimado recompensa"
                  metric={metrics.estimatedRewardCostNio}
                  description={reward?.reward_type === 'FREE_PRODUCT' ? 'CPP × Cantidad' : 'Monto nominal del beneficio'}
                />
              </div>

              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-2">
                Incidencia Comercial en la Ventana
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <MetricCard
                  title="Ventas que generaron Loyalty"
                  metric={metrics.qualifiedSalesNio}
                  description="Últimos 30 días acumulados"
                />
                <MetricCard
                  title="Costo estimado redenciones"
                  metric={metrics.estimatedIncentiveCostInWindowNio}
                  description="Redenciones en la ventana"
                />
                <MetricCard
                  title="Tasa efectiva estimada"
                  metric={metrics.effectiveIncentiveRatePct}
                  isPercent
                  description="Costo redenciones / Ventas Loyalty"
                />
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
