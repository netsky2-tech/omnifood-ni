import { useMemo, useRef, useState } from "react";
import { Boxes, ShieldCheck, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EntitySearchSelect } from "@/components/ui/entity-search-select";
import { useInsumos } from "@/features/recipes/use-recipes";
import {
  EMPTY_EFFECT,
  filterInsumos,
  MODIFIER_EFFECT,
  MODIFIER_EFFECT_OPTIONS,
  validateModifierEffect,
  type ModifierEffect,
  type ModifierEffectSpec,
} from "./effect";

interface ModifierEffectDialogProps {
  open: boolean;
  /** The option the effect belongs to; shown in the title. */
  optionName: string;
  /** The effect as it is now (or as the row holds it). */
  value: ModifierEffectSpec;
  onOpenChange: (open: boolean) => void;
  /** Called with the edited effect when the operator confirms. */
  onSave: (effect: ModifierEffectSpec) => void;
}

/**
 * The editor of a modifier option's INVENTORY effect (R28).
 *
 * The governed insumo references are SELECTORS with a flexible textual
 * search (§17.5, §17.6): the insumo is a foreign key, so it is never a
 * free-text field and the operator never transcribes an identifier.
 *
 * The quantity is the CONFIGURATION of the extra (owner decision, 2026-10-20:
 * "the backoffice owns the quantity, the waiter marks the option"): the
 * field says what it means in business terms — how much stock the extra
 * takes per sold unit — and leaving it undefined is a legitimate choice
 * (the recipe's quantity is then used), so the dialog SAYS what happens
 * instead of hiding it (§39.3: enunciar la consecuencia).
 */
export function ModifierEffectDialog({
  open,
  optionName,
  value,
  onOpenChange,
  onSave,
}: ModifierEffectDialogProps) {
  const { data: insumos, isLoading: insumosLoading } = useInsumos();
  // The draft starts from the value the row holds. The dialog is mounted
  // fresh for every option (the parent keys it), so there is no effect
  // resetting the state: a stale draft would be a silent data loss.
  const [draft, setDraft] = useState<ModifierEffectSpec>(value);
  const [insumoSearch, setInsumoSearch] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  // §20: the draft is work the operator typed. Leaving the dialog with
  // changes in it must ASK, not silently drop it.
  const [discardOpen, setDiscardOpen] = useState(false);
  const allowCloseRef = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const insumoList = useMemo(() => insumos ?? [], [insumos]);

  const insumoOptions = useMemo(
    () =>
      filterInsumos(insumoList, insumoSearch).map((insumo) => ({
        id: insumo.id,
        label: insumo.name,
        hint: [insumo.purchaseUom, insumo.consumptionUom]
          .filter(Boolean)
          .join(" → "),
      })),
    [insumoList, insumoSearch],
  );

  const targetOptions = useMemo(
    () =>
      filterInsumos(insumoList, targetSearch).map((insumo) => ({
        id: insumo.id,
        label: insumo.name,
        hint: [insumo.purchaseUom, insumo.consumptionUom]
          .filter(Boolean)
          .join(" → "),
      })),
    [insumoList, targetSearch],
  );

  const insumoName = (id: string | null): string | undefined =>
    id ? insumoList.find((i) => i.id === id)?.name : undefined;

  const targetName = (id: string | null): string | undefined =>
    id ? insumoList.find((i) => i.id === id)?.name : undefined;

  /**
   * The consumption unit of the insumo the effect acts on: the quantity the
   * operator marks is expressed in THAT unit, so the copy has to name it
   * (§17.4: the helper text prevents a likely mistake).
   */
  const affectedUnit = useMemo(() => {
    const id = draft.effect_insumo_id ?? draft.effect_target_insumo_id;
    if (!id) return null;
    return insumoList.find((i) => i.id === id)?.consumptionUom ?? null;
  }, [draft.effect_insumo_id, draft.effect_target_insumo_id, insumoList]);

  const update = (patch: Partial<ModifierEffectSpec>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setError(null);
  };

  const changeEffect = (effect: ModifierEffect) => {
    // Switching the effect clears the fields that belong to the previous
    // one: a NONE never carries an insumo, a REMOVE never carries a
    // quantity, and so on.
    setDraft({
      effect,
      effect_insumo_id: null,
      effect_target_insumo_id: null,
      effect_quantity: null,
      effect_factor: null,
    });
    setError(null);
  };

  const isDirty =
    JSON.stringify(draft) !== JSON.stringify({
      effect: value.effect,
      effect_insumo_id: value.effect_insumo_id,
      effect_target_insumo_id: value.effect_target_insumo_id,
      effect_quantity: value.effect_quantity,
      effect_factor: value.effect_factor,
    });

  /**
   * §20 — a close with unsaved changes asks first. Escape, the overlay and
   * the Cancel button all land here, so none of them can silently discard
   * what the operator typed.
   */
  const requestClose = () => {
    if (isDirty && !allowCloseRef.current) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  };

  const handleSave = () => {
    const message = validateModifierEffect(draft);
    if (message) {
      setError(message);
      // §18.3: the actionable error takes the focus, so a keyboard or
      // screen-reader user lands on the explanation.
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    onSave(draft);
  };

  const needsInsumo =
    draft.effect === MODIFIER_EFFECT.ADD || draft.effect === MODIFIER_EFFECT.SWAP;
  const needsTarget =
    draft.effect === MODIFIER_EFFECT.REMOVE ||
    draft.effect === MODIFIER_EFFECT.SWAP ||
    draft.effect === MODIFIER_EFFECT.SCALE;
  const needsQuantity =
    draft.effect === MODIFIER_EFFECT.ADD || draft.effect === MODIFIER_EFFECT.SWAP;
  const needsFactor = draft.effect === MODIFIER_EFFECT.SCALE;

  const description = MODIFIER_EFFECT_OPTIONS.find(
    (o) => o.value === draft.effect,
  )?.description;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : requestClose())}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-primary" />
            Efecto de inventario — {optionName}
          </DialogTitle>
          <DialogDescription>
            Declare qué hace esta opción con el inventario. Sin efecto, la
            opción solo cambia el precio de la venta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="modifier-effect-select">Efecto sobre el inventario *</Label>
            <Select
              value={draft.effect}
              onValueChange={(value) => changeEffect(value as ModifierEffect)}
            >
              <SelectTrigger id="modifier-effect-select" data-testid="modifier-effect-select">
                <SelectValue placeholder="Seleccione el efecto" />
              </SelectTrigger>
              <SelectContent>
                {MODIFIER_EFFECT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>

          {needsTarget && (
            <EntitySearchSelect
              inputId="modifier-effect-target"
              label={
                draft.effect === MODIFIER_EFFECT.REMOVE
                  ? "Componente de la receta que quita *"
                  : draft.effect === MODIFIER_EFFECT.SWAP
                    ? "Componente de la receta que reemplaza *"
                    : "Componente de la receta que multiplica *"
              }
              options={targetOptions}
              search={targetSearch}
              onSearchChange={setTargetSearch}
              isLoading={insumosLoading}
              value={draft.effect_target_insumo_id ?? ""}
              onChange={(id) => update({ effect_target_insumo_id: id })}
              selectedLabel={targetName(draft.effect_target_insumo_id)}
              placeholder="Busque por nombre o unidad…"
              emptyMessage="Esta empresa todavía no tiene insumos registrados. Regístrelos en Inventario → Insumos para poder asignar un efecto."
            />
          )}

          {needsInsumo && (
            <EntitySearchSelect
              inputId="modifier-effect-insumo"
              label={
                draft.effect === MODIFIER_EFFECT.ADD
                  ? "Insumo que aporta *"
                  : "Insumo que entra en su lugar *"
              }
              options={insumoOptions}
              search={insumoSearch}
              onSearchChange={setInsumoSearch}
              isLoading={insumosLoading}
              value={draft.effect_insumo_id ?? ""}
              onChange={(id) => update({ effect_insumo_id: id })}
              selectedLabel={insumoName(draft.effect_insumo_id)}
              placeholder="Busque por nombre o unidad…"
              emptyMessage="Esta empresa todavía no tiene insumos registrados. Regístrelos en Inventario → Insumos para poder asignar un efecto."
            />
          )}

          {needsQuantity && (
            <div className="space-y-1.5">
              <Label htmlFor="modifier-effect-quantity">
                Cantidad que descuenta este extra
              </Label>
              <Input
                id="modifier-effect-quantity"
                data-testid="modifier-effect-quantity"
                type="number"
                step="any"
                min="0"
                placeholder="Sin definir"
                value={draft.effect_quantity ?? ""}
                onChange={(e) =>
                  update({
                    effect_quantity:
                      e.target.value === "" ? null : e.target.valueAsNumber,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Es la cantidad de inventario que este extra saca por cada
                unidad vendida
                {affectedUnit ? `, expresada en ${affectedUnit}` : ""}. Si la
                deja sin definir, se usará la que la receta del producto ya
                declara para ese componente.
              </p>
            </div>
          )}

          {needsFactor && (
            <div className="space-y-1.5">
              <Label htmlFor="modifier-effect-factor">Factor *</Label>
              <Input
                id="modifier-effect-factor"
                data-testid="modifier-effect-factor"
                type="number"
                step="any"
                min="0"
                placeholder="Ej: 2"
                value={draft.effect_factor ?? ""}
                onChange={(e) =>
                  update({
                    effect_factor:
                      e.target.value === "" ? null : e.target.valueAsNumber,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Por cuántas veces se multiplica el consumo del componente (2 =
                el doble).
              </p>
            </div>
          )}

          {needsQuantity && draft.effect_quantity === null && (
            <Alert
              variant="warning"
              className="py-2.5 px-3 text-xs"
              data-testid="modifier-effect-quantity-pending"
            >
              <TriangleAlert className="h-4 w-4" />
              <AlertDescription>
                Sin cantidad definida, este extra no descuenta inventario por
                su cuenta: el terminal sólo lo hará si el producto tiene una
                receta que aporte la cantidad. La venta nunca se detiene por
                esto.
              </AlertDescription>
            </Alert>
          )}

          {draft.effect !== MODIFIER_EFFECT.NONE && (
            <Alert variant="info" className="py-2.5 px-3 text-xs">
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                Si el insumo no está registrado en esta empresa, el efecto no
                se aplica: la venta se registra igual y el inventario no se
                ve afectado.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <p
              ref={errorRef}
              tabIndex={-1}
              className="text-sm text-destructive"
              role="alert"
              data-testid="modifier-effect-error"
            >
              {error}
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          El efecto se aplica a la opción del grupo. Se guarda al actualizar el
          grupo.
        </p>

        <DialogFooter className="border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={requestClose}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            data-testid="modifier-effect-save"
          >
            Aplicar al grupo
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* §20: the operator is told what is being discarded and may stay. */}
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Descartar los cambios del efecto?</DialogTitle>
            <DialogDescription>
              La opción {optionName} conserva el efecto que tenía. Si sale
              ahora, lo que editó aquí se pierde.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDiscardOpen(false)}
            >
              Seguir editando
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="modifier-effect-discard-confirm"
              onClick={() => {
                allowCloseRef.current = true;
                setDiscardOpen(false);
                onOpenChange(false);
              }}
            >
              Descartar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

export { EMPTY_EFFECT };
