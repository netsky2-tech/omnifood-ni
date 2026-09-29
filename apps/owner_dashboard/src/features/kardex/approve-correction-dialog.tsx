import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api-error";
import { localize, kardexMovementTypeLabels } from "@/lib/labels";
import { useApproveCorrection } from "./use-kardex-queue";
import type { KardexPendingCorrection } from "./types";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
  }).format(amount);
}

interface ApproveCorrectionDialogProps {
  correction: KardexPendingCorrection | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * High-risk confirmation for a permanent kardex correction (NHILOS §23.1).
 * Before the explicit-verb action, the dialog states the four required
 * things: WHICH correction (object), WHAT IT CHANGES (kardex/cost impact,
 * AP-19), WHETHER it is reversible (it is not), and its SCOPE
 * (tenant-wide inventory for the insumo). §23.3: the confirm button uses
 * the explicit verb "Aprobar corrección" — never "Aceptar"/"OK".
 */
export function ApproveCorrectionDialog({
  correction,
  onOpenChange,
}: ApproveCorrectionDialogProps) {
  const approve = useApproveCorrection();

  if (!correction) return null;

  const handleApprove = async () => {
    try {
      await approve.mutateAsync({ queueId: correction.queueId });
      toast({
        variant: "success",
        title: "Corrección aprobada",
        description: `El kardex de ${
          correction.insumoName ?? "el insumo"
        } quedó actualizado con el costo corregido.`,
      });
      onOpenChange(false);
    } catch (err: unknown) {
      // §30.1: a recoverable failure keeps the dialog open with its context
      // intact and surfaces the specific server reason — never a fake
      // success and never a generic collapse.
      toast({
        variant: "destructive",
        title: "No pudimos aprobar la corrección",
        description: getApiErrorMessage(
          err,
          "La corrección sigue pendiente. Intentá de nuevo en unos minutos.",
        ),
      });
    }
  };

  const triggerLabel = correction.triggerMovementType
    ? localize(correction.triggerMovementType, kardexMovementTypeLabels)
    : null;
  const insumoName = correction.insumoName ?? "Insumo sin nombre";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Aprobar corrección de inventario</DialogTitle>
          <DialogDescription>
            Revisá el impacto antes de confirmar. Esta acción es definitiva.
          </DialogDescription>
        </DialogHeader>

        {/* §23.1 object: what is being corrected */}
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          <p className="font-semibold text-foreground">{insumoName}</p>
          <p className="mt-1 text-muted-foreground">
            Cantidad afectada:{" "}
            <span className="tabular-nums text-foreground">
              {correction.affectedQuantity !== null
                ? correction.affectedQuantity
                : "—"}
            </span>
            {triggerLabel ? ` — detectada por ${triggerLabel.toLowerCase()}` : ""}
          </p>
        </div>

        {/* §23.1 / AP-19 consequence: what changes in stock accounting */}
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            El costo unitario del insumo pasa de{" "}
            <span className="tabular-nums text-foreground">
              {correction.previousUnitCostNio !== null
                ? formatCurrency(correction.previousUnitCostNio)
                : "—"}
            </span>{" "}
            a{" "}
            <span className="tabular-nums font-medium text-foreground">
              {correction.recalculatedUnitCostNio !== null
                ? formatCurrency(correction.recalculatedUnitCostNio)
                : "—"}
            </span>
            .
          </li>
          <li>
            Impacto total en el costo del kardex:{" "}
            <span className="tabular-nums font-medium text-foreground">
              {correction.totalDeltaCostNio !== null
                ? formatCurrency(correction.totalDeltaCostNio)
                : "—"}
            </span>
            .
          </li>
          {/* §23.1 reversibility: the correction record is permanent */}
          <li>
            La corrección queda registrada de forma permanente en el kardex:
            no se puede deshacer desde el panel.
          </li>
          {/* §23.1 scope */}
          <li>
            El ajuste aplica al inventario de todo tu comercio para este
            insumo.
          </li>
        </ul>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={approve.isPending}
          >
            Cancelar
          </Button>
          {/* §23.3 explicit verb label */}
          <Button
            type="button"
            onClick={handleApprove}
            disabled={approve.isPending}
          >
            {approve.isPending ? "Aprobando…" : "Aprobar corrección"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
