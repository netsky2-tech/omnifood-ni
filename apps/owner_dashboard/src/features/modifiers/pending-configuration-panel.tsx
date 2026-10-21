import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  fetchPendingConfiguration,
  fetchPendingEffects,
  type PendingModifierConfiguration,
  type PendingModifierEffectLine,
} from "./modifiers-api";
import { useModifierGroups } from "./use-modifiers";
import { ModifierGroupForm } from "./modifier-group-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

/**
 * The options whose inventory effect cannot be applied as they stand.
 *
 * WHY THIS SCREEN EXISTS (owner's decision, 2026-10-20): the amount an
 * extra takes out of the stock is CONFIGURATION, and it lives in the
 * backoffice. The terminal never asks the cashier for a number. So the
 * missing configuration has to be visible HERE — with the product where it
 * bites and the reason, so the owner can fix the DATA instead of guessing
 * it at the till.
 *
 * It says nothing when there is nothing pending: a catalogue with every
 * quantity configured is a healthy catalogue, and a screen that always has
 * something in it is a screen nobody reads.
 */

/** The reason, in the owner's words — never the resolver's vocabulary. */
const REASON_COPY: Record<string, string> = {
  PRODUCT_WITHOUT_RECIPE:
    "El producto no tiene receta activa: el extra no se aplica al inventario.",
  COMPONENT_NOT_IN_RECIPE:
    "El producto no consume ese componente: no hay cantidad que heredar.",
  UNIT_MISMATCH:
    "Las unidades no coinciden: la cantidad de la receta no se puede usar.",
  INSUMSO_NOT_IN_CATALOG:
    "El insumo no está registrado en esta empresa: el efecto no se aplica.",
  NO_CONFIGURED_QUANTITY: "Falta definir la cantidad que aplica.",
};

const EFFECT_COPY: Record<string, string> = {
  ADD: "Aporta",
  REMOVE: "Quita",
  SWAP: "Cambia",
  SCALE: "Multiplica",
};

function reasonCopy(reason: string): string {
  return (
    REASON_COPY[reason] ??
    "La cantidad del efecto no se puede resolver con la configuración actual."
  );
}

export function PendingConfigurationPanel() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["modifier-groups", "pending-configuration"],
    queryFn: () => fetchPendingConfiguration(),
  });
  // ME-04: the sold lines whose effect never touched the stock — the half
  // of the reconciliation that only the cloud can answer.
  const { data: soldPending } = useQuery({
    queryKey: ["modifier-groups", "pending-effects"],
    queryFn: () => fetchPendingEffects(),
  });
  // The group whose option is being configured: the form edits the WHOLE
  // group, and the option's effect is one row of it.
  const [configuringGroupId, setConfiguringGroupId] = useState<string | null>(
    null,
  );
  const { data: groups } = useModifierGroups("active");
  const configuringGroup = (groups ?? []).find(
    (group) => group.id === configuringGroupId,
  );

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center h-64"
        role="status"
        aria-label="Cargando pendientes de configurar"
      >
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        <p>No se pudieron cargar los pendientes de configurar</p>
        <Button
          onClick={() => refetch()}
          className="ml-2 mt-2"
          variant="outline"
          size="sm"
        >
          Reintentar
        </Button>
      </div>
    );
  }

  const pending: PendingModifierConfiguration[] = data ?? [];
  const soldLines: PendingModifierEffectLine[] = soldPending?.lines ?? [];

  if (pending.length === 0 && soldLines.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center">
        <p className="font-medium">No hay pendientes de configurar</p>
        <p className="text-sm text-muted-foreground mt-1">
          Toda opción con efecto de inventario tiene su cantidad definida, o
          la hereda de la receta del producto.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {soldLines.length > 0 && (
        <section aria-label="Vendidas sin efecto de inventario" className="space-y-3">
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {soldLines.length === 1
                  ? "1 venta se cobró sin el efecto de inventario que anunciaba"
                  : `${soldLines.length} ventas se cobraron sin el efecto de inventario que anunciaban`}
              </p>
              <p className="text-sm text-muted-foreground">
                La venta ocurrió igual (el inventario nunca bloquea una venta),
                pero el stock no se movió comoSay la línea. Corrijá la
                configuración del extra y revisá el inventario de esos
                productos.
              </p>
            </div>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Factura</TableHead>
                  <TableHead>Cuándo</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Extra</TableHead>
                  <TableHead>Razón</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {soldLines.map((line) => (
                  <TableRow key={`${line.invoice_id}-${line.option_name}`}>
                    <TableCell className="font-medium">
                      {line.invoice_number ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(line.sold_at).toLocaleString("es-NI", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>{line.product_name}</TableCell>
                    <TableCell>{line.option_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {reasonCopy(line.reason)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {soldPending?.truncated && (
            <p className="text-xs text-muted-foreground">
              Se muestran las primeras {soldLines.length} ventas; reduzca el
              alcance para ver el resto.
            </p>
          )}
        </section>
      )}

      {pending.length > 0 && (
      <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3">
        <AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
        <p className="text-sm">
          Estas opciones tienen efecto sobre el inventario pero no hay una
          cantidad que aplicar. El POS las vende igual y su consumo de
          inventario queda pendiente hasta que se defina aquí.
        </p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Opción</TableHead>
              <TableHead>Grupo</TableHead>
              <TableHead>Efecto</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Razón</TableHead>
              <TableHead className="w-[120px] text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.map((entry) => (
              <TableRow key={entry.option_id}>
                <TableCell className="font-medium">
                  {entry.option_name}
                </TableCell>
                <TableCell>{entry.group_name}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {EFFECT_COPY[entry.inventory_effect] ??
                      entry.inventory_effect}
                  </Badge>
                </TableCell>
                <TableCell>
                  {entry.products.map((product) => product.product_name).join(
                    ", ",
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {[
                    ...new Set(
                      entry.products.map((product) =>
                        reasonCopy(product.reason),
                      ),
                    ),
                  ].join(" ")}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Configurar ${entry.option_name}`}
                    onClick={() => setConfiguringGroupId(entry.group_id)}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Configurar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      </div>
      )}

      <Dialog
        open={!!configuringGroup}
        onOpenChange={(open) => !open && setConfiguringGroupId(null)}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Configurar el efecto de «{configuringGroup?.name ?? ''}»
            </DialogTitle>
            <DialogDescription>
              Abra el efecto de inventario de la opción y defina la cantidad
              que aplica por unidad vendida. Con la cantidad definida, el
              terminal la aplica sola y no se la pregunta al cajero.
            </DialogDescription>
          </DialogHeader>
          {configuringGroup && (
            <ModifierGroupForm
              initialData={configuringGroup}
              onSuccess={() => {
                setConfiguringGroupId(null);
                refetch();
              }}
              onCancel={() => setConfiguringGroupId(null)}
            />
          )}
          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setConfiguringGroupId(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
