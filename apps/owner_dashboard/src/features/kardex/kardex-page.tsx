import { useState } from "react";
import { ClipboardCheck, RefreshCw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FreshnessBadge } from "@/components/freshness-badge";
import { getApiErrorMessage } from "@/lib/api-error";
import { localize, kardexQueueStatusLabels, kardexMovementTypeLabels } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import { useSyncFreshness } from "@/features/dashboard/use-sync-freshness";
import { useRbac } from "@/lib/rbac";
import { useKardexQueue } from "./use-kardex-queue";
import { ApproveCorrectionDialog } from "./approve-correction-dialog";
import type { KardexPendingCorrection, KardexQueueStatus } from "./types";

const STATUS_VARIANTS: Record<KardexQueueStatus, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "default",
  PROCESSING: "secondary",
  BLOCKED: "destructive",
  FAILED: "destructive",
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
  }).format(amount);
}

function Unavailable() {
  // §34: unknown/unavailable is "—", never 0.
  return <span className="tabular-nums text-muted-foreground">—</span>;
}

function StatusCell({ status }: { status: KardexQueueStatus }) {
  // §26/§27 canonical vocabulary via the shared label map; the badge text
  // carries the state so color is never the only signal (§46).
  return <Badge variant={STATUS_VARIANTS[status]}>{localize(status, kardexQueueStatusLabels)}</Badge>;
}

function CostImpactCell({ correction }: { correction: KardexPendingCorrection }) {
  if (correction.totalDeltaCostNio === null) return <Unavailable />;
  return (
    <span className="tabular-nums font-medium text-foreground">
      {formatCurrency(correction.totalDeltaCostNio)}
    </span>
  );
}

function DetectionCell({ correction }: { correction: KardexPendingCorrection }) {
  const typeLabel = correction.triggerMovementType
    ? localize(correction.triggerMovementType, kardexMovementTypeLabels)
    : null;
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground tabular-nums">
        {formatDateTime(correction.detectedAt)}
      </span>
      {typeLabel && (
        <span className="text-xs text-muted-foreground">por {typeLabel.toLowerCase()}</span>
      )}
    </div>
  );
}

interface CorrectionsTableProps {
  corrections: KardexPendingCorrection[];
  canApprove: boolean;
  onApprove: (correction: KardexPendingCorrection) => void;
}

function CorrectionsTable({ corrections, canApprove, onApprove }: CorrectionsTableProps) {
  return (
    <div className="rounded-md border border-border bg-card shadow-sm">
      <Table className="min-w-[860px]">
        <TableHeader>
          <TableRow>
            <TableHead>Insumo</TableHead>
            <TableHead className="text-right">Cantidad afectada</TableHead>
            <TableHead className="text-right">Costo unitario</TableHead>
            <TableHead className="text-right">Impacto total</TableHead>
            <TableHead>Detectada</TableHead>
            <TableHead>Estado</TableHead>
            {/* §33.1 omit-and-reflow: the action column only exists when the
            role can actually use it. */}
            {canApprove && (
              <TableHead className="text-right">
                <span className="sr-only">Acción</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {corrections.map((c) => (
            <TableRow key={c.queueId}>
              <TableCell className="font-medium text-foreground">
                {c.insumoName ?? "Insumo sin nombre"}
              </TableCell>
              <TableCell className="text-right tabular-nums text-foreground">
                {c.affectedQuantity !== null ? c.affectedQuantity : <Unavailable />}
              </TableCell>
              <TableCell className="text-right tabular-nums text-foreground">
                {c.previousUnitCostNio !== null && c.recalculatedUnitCostNio !== null ? (
                  <>
                    {formatCurrency(c.previousUnitCostNio)}{" "}
                    <span aria-hidden="true">→</span>{" "}
                    <span className="font-medium">{formatCurrency(c.recalculatedUnitCostNio)}</span>
                  </>
                ) : (
                  <Unavailable />
                )}
              </TableCell>
              <TableCell className="text-right">
                <CostImpactCell correction={c} />
              </TableCell>
              <TableCell>
                <DetectionCell correction={c} />
              </TableCell>
              <TableCell>
                <StatusCell status={c.status} />
              </TableCell>
              {canApprove && (
                <TableCell className="text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onApprove(c)}
                  >
                    Aprobar corrección
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function KardexPage() {
  const { data, isLoading, error, refetch, isRefetching } = useKardexQueue();
  const freshness = useSyncFreshness();
  const { canPerformAction } = useRbac();

  // §33: frontend gating is presentation only — the backend re-validates
  // role and threshold on every approval. Mirrors the backend
  // @Roles(OWNER, MANAGER) on POST /inventory/regularization/approve.
  const canApprove = canPerformAction("kardex.approve");

  const [pendingApproval, setPendingApproval] = useState<KardexPendingCorrection | null>(null);

  const corrections = data ?? [];

  return (
    <div className="space-y-6">
      {/* §7.1/§7.3: where am I + what am I looking at (scope + freshness) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Correcciones de Inventario
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Revisá y aprobá las correcciones de costo que el sistema detectó en
            el kardex. Cada aprobación recalcula el costo del insumo en tu
            inventario.
          </p>
        </div>
        {/* §35: kardex truth depends on POS sync — expose freshness, never
        imply certainty beyond the sync evidence. */}
        <FreshnessBadge
          freshness={freshness.data ?? null}
          isLoading={freshness.isLoading}
        />
      </div>

      {/* §30: error explains impact + meaningful retry */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>
              {getApiErrorMessage(
                error,
                "No pudimos cargar las correcciones pendientes. El inventario de tus terminales no se vio afectado.",
              )}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <LoadingState message="Cargando correcciones pendientes..." />
      ) : !error && corrections.length === 0 ? (
        /* §29 first-use/valid empty: what belongs here and why it matters,
        stated quietly — an empty queue is the healthy state. */
        <EmptyState
          icon={<ClipboardCheck className="h-6 w-6 stroke-[1.5]" aria-hidden="true" />}
          title="No hay correcciones pendientes"
          message="Cuando el sistema detecte una diferencia de costo entre el kardex y una compra, la corrección aparece acá para que la apruebes desde el panel, sin ir al local."
        />
      ) : (
        corrections.length > 0 && (
          <>
            {/* §28.3: refetch keeps valid data visible, no full-page reset */}
            {isRefetching && (
              <p className="text-xs text-muted-foreground" role="status">
                Actualizando…
              </p>
            )}
            <CorrectionsTable
              corrections={corrections}
              canApprove={canApprove}
              onApprove={setPendingApproval}
            />
            <p className="text-xs text-muted-foreground" aria-live="polite">
              Mostrando {corrections.length}{" "}
              {corrections.length === 1 ? "corrección" : "correcciones"}{" "}
              pendientes
            </p>
          </>
        )
      )}

      <ApproveCorrectionDialog
        correction={pendingApproval}
        onOpenChange={(open) => {
          if (!open) setPendingApproval(null);
        }}
      />
    </div>
  );
}
