import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Boxes, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  useCreateModifierGroup,
  useUpdateModifierGroup,
  useCreateModifierOption,
  useUpdateModifierOption,
  useDeactivateModifierOption,
  useReactivateModifierOption,
} from "./use-modifiers";
import { modifierGroupFormSchema, type ModifierGroupFormData } from "./schema";
import { describeModifierError } from "./modifiers-api";
import { ModifierEffectDialog } from "./modifier-effect-dialog";
import {
  effectBadgeLabel,
  EMPTY_EFFECT,
  MODIFIER_EFFECT,
  type ModifierEffectSpec,
} from "./effect";
import { toFiniteNumber } from "@/lib/numeric";
import { type ModifierGroup, type ModifierOption } from "./types";

interface ModifierGroupFormProps {
  initialData?: ModifierGroup | null;
  onSuccess: () => void;
  onCancel: () => void;
}

interface OptionRowState {
  key: string;
  id?: string;
  name: string;
  price_delta: number;
  is_default: boolean;
  sort_order: number;
  /** False only for options loaded from an inactive/all group listing. */
  is_active?: boolean;
  /**
   * R28 — the option's optional inventory effect. Absent means the default
   * (NONE: price only), which is what every option that predates R28 is.
   */
  effect?: ModifierEffectSpec;
}

// Backend option payloads carry `is_active` (soft-delete state); the shared
// ModifierOption type omits it, so it is read through this local widening
// instead of changing the shared type for one screen.
type OptionWithActiveState = ModifierOption & { is_active?: boolean };

let optionRowCounter = 0;
const nextOptionRowKey = () => `option-row-${++optionRowCounter}`;

/**
 * Create/edit dialog content for a modifier group. In edit mode it also
 * carries the options editor. The single-default rule is enforced in the
 * form state itself — marking one option as default immediately clears
 * the others, so a submission can never carry two defaults (the backend
 * enforces the same invariant server-side).
 */
export function ModifierGroupForm({
  initialData,
  onSuccess,
  onCancel,
}: ModifierGroupFormProps) {
  const isEditing = !!initialData;
  const createGroup = useCreateModifierGroup();
  const updateGroup = useUpdateModifierGroup();
  const createOption = useCreateModifierOption();
  const updateOption = useUpdateModifierOption();
  const deactivateOption = useDeactivateModifierOption();
  const reactivateOption = useReactivateModifierOption();
  const isSubmitting =
    createGroup.isPending ||
    updateGroup.isPending ||
    createOption.isPending ||
    updateOption.isPending ||
    deactivateOption.isPending;

  const form = useForm<ModifierGroupFormData>({
    resolver: zodResolver(modifierGroupFormSchema),
    defaultValues: {
      name: "",
      min_selected: 0,
      max_selected: 1,
      allow_quantities: false,
      sort_order: 0,
    },
    mode: "onChange",
  });

  const watchedAllowQuantities = form.watch("allow_quantities");

  // Options are edited as plain component rows: each row maps to its own
  // backend call (create / update / deactivate), so a nested form model
  // would only add noise. Rows keep a stable local key for React lists.
  const [optionRows, setOptionRows] = useState<OptionRowState[]>([]);
  // Existing options removed in this edit session; deactivated on save.
  const [removedOptionIds, setRemovedOptionIds] = useState<string[]>([]);
  // R28 — the option whose inventory effect is being edited. The effect is
  // edited in its own dialog: the option row is a compact grid, and the
  // effect needs room for a governed insumo selector and its explanation.
  const [effectRowKey, setEffectRowKey] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name,
        min_selected: initialData.min_selected,
        max_selected: initialData.max_selected,
        allow_quantities: initialData.allow_quantities,
        sort_order: initialData.sort_order,
      });
      const rows = [...initialData.options]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((option) => ({
          key: nextOptionRowKey(),
          id: option.id,
          name: option.name,
          // Defense at the component boundary: a Postgres decimal that
          // reaches this form as a string must never sit in row state, or
          // the save echoes the string back and the backend @IsNumber
          // rejects it (the client-reported defect). Primary normalization
          // lives in modifiers-api.ts; this guards any payload that
          // bypasses that layer (cache, fixture, future call site).
          price_delta: toFiniteNumber(option.price_delta),
          is_default: option.is_default,
          sort_order: option.sort_order,
          is_active: (option as OptionWithActiveState).is_active,
          effect: {
            effect: (option.inventory_effect ??
              MODIFIER_EFFECT.NONE) as ModifierEffectSpec["effect"],
            effect_insumo_id: option.effect_insumo_id ?? null,
            effect_target_insumo_id: option.effect_target_insumo_id ?? null,
            effect_quantity: option.effect_quantity ?? null,
            effect_factor: option.effect_factor ?? null,
          },
        }));
      setOptionRows(rows);
      setRemovedOptionIds([]);
    }
  }, [initialData, form]);

  // Single-default behavior in form state: choosing a default clears every
  // other row, mirroring the backend invariant.
  const handleSetDefault = (key: string) => {
    setOptionRows((rows) =>
      rows.map((row) => ({ ...row, is_default: row.key === key })),
    );
  };

  const handleAddOption = () => {
    setOptionRows((rows) => [
      ...rows,
      {
        key: nextOptionRowKey(),
        name: "",
        price_delta: 0,
        is_default: rows.length === 0,
        sort_order: rows.length,
        effect: { ...EMPTY_EFFECT },
      },
    ]);
  };

  const handleRemoveOption = (key: string) => {
    setOptionRows((rows) => {
      const removed = rows.find((row) => row.key === key);
      if (removed?.id) {
        setRemovedOptionIds((ids) => [...ids, removed.id!]);
      }
      return rows.filter((row) => row.key !== key);
    });
  };

  // Reactivating a soft-deleted option is its own PATCH, deliberately kept
  // OUT of the save flow: the submit path never bulk-restores options, so
  // an accidental save cannot silently reactivate deactivated rows.
  const handleActivateOption = async (key: string) => {
    const row = optionRows.find((r) => r.key === key);
    if (!row?.id || !initialData) return;
    try {
      await reactivateOption.mutateAsync({
        groupId: initialData.id,
        optionId: row.id,
      });
      setOptionRows((rows) =>
        rows.map((r) => (r.key === key ? { ...r, is_active: true } : r)),
      );
      toast({ variant: "success", title: "Opción activada" });
    } catch (error) {
      toast({
        title: "Error al activar",
        description: describeModifierError(
          error,
          "No se pudo activar la opción",
        ),
        variant: "destructive",
      });
    }
  };

  const optionLabelSuffix = (row: OptionRowState, index: number) =>
    row.name.trim() || `${index + 1}`;

  const onSubmit = async (data: ModifierGroupFormData) => {
    // Partial saves are reconciled CLIENT-SIDE: the backend offers no
    // transaction across the group and option calls, so every completed
    // step is written back into the form state and a retry only re-attempts
    // what is still pending — created rows adopt their server id (next
    // submit PATCHes instead of POSTing a duplicate), completed removals
    // leave the pending list, and a removal that already landed but answers
    // 404 on retry counts as success.
    const groupInput = {
      name: data.name,
      min_selected: data.min_selected,
      max_selected: data.max_selected,
      allow_quantities: data.allow_quantities,
      sort_order: data.sort_order,
    };
    try {
      let groupId: string;
      if (isEditing) {
        groupId = initialData!.id;
        await updateGroup.mutateAsync({ id: groupId, input: groupInput });
      } else {
        const created = await createGroup.mutateAsync(groupInput);
        groupId = created.id;
      }

      // Options only apply to an existing group: on edit they sync against
      // the loaded rows; on create the group was just created.
      const isAlreadyDeactivated = (error: unknown): boolean => {
        const status =
          (error as { status?: number } | null)?.status ??
          (error as { statusCode?: number } | null)?.statusCode;
        return status === 404;
      };
      for (const removedId of removedOptionIds) {
        try {
          await deactivateOption.mutateAsync({ groupId, optionId: removedId });
        } catch (error) {
          if (!isAlreadyDeactivated(error)) {
            throw error;
          }
        }
        // Completed removal: drop it from the pending list so a retry
        // never re-attempts it.
        setRemovedOptionIds((ids) => ids.filter((id) => id !== removedId));
      }
      for (const row of optionRows) {
        const optionInput = {
          name: row.name,
          price_delta: row.price_delta,
          is_default: row.is_default,
          sort_order: row.sort_order,
          // R28 — the inventory effect travels with the option. An option
          // without one is NONE (price only), exactly as before.
          inventory_effect: (row.effect ?? EMPTY_EFFECT).effect,
          effect_insumo_id: (row.effect ?? EMPTY_EFFECT).effect_insumo_id,
          effect_target_insumo_id: (row.effect ?? EMPTY_EFFECT)
            .effect_target_insumo_id,
          effect_quantity: (row.effect ?? EMPTY_EFFECT).effect_quantity,
          effect_factor: (row.effect ?? EMPTY_EFFECT).effect_factor,
        };
        if (row.id) {
          await updateOption.mutateAsync({
            groupId,
            optionId: row.id,
            input: optionInput,
          });
        } else if (row.name.trim()) {
          const created = await createOption.mutateAsync({
            groupId,
            input: optionInput,
          });
          // Completed create: adopt the server id so a retry PATCHes this
          // row instead of POSTing a duplicate.
          setOptionRows((rows) =>
            rows.map((r) => (r.key === row.key ? { ...r, id: created.id } : r)),
          );
        }
      }

      toast({
        variant: "success",
        title: isEditing ? "Grupo actualizado" : "Grupo creado",
      });
      onSuccess();
    } catch (error) {
      toast({
        title: "Error al guardar",
        description: describeModifierError(
          error,
          "No se pudo guardar el grupo",
        ),
        variant: "destructive",
      });
    }
  };

  return (
    // noValidate: the application's own zod validation (via the RHF
    // resolver) is the single source of operator feedback. Native HTML
    // constraint validation would otherwise block the submit event
    // before handleSubmit runs, replacing the design system's Spanish
    // inline errors with the browser's own validation bubble (browser
    // language and styling).
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label htmlFor="modifier-group-name">Nombre *</Label>
          <Input
            id="modifier-group-name"
            placeholder="Ej: Leche, Extras"
            {...form.register("name")}
          />
          {form.formState.errors.name && (
            <p className="text-sm text-destructive mt-1">
              {form.formState.errors.name.message}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="modifier-group-min">Mínimo de selección</Label>
            <Input
              id="modifier-group-min"
              type="number"
              min="0"
              {...form.register("min_selected", { valueAsNumber: true })}
            />
            {form.formState.errors.min_selected && (
              <p className="text-sm text-destructive mt-1">
                {form.formState.errors.min_selected.message}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="modifier-group-max">Máximo de selección</Label>
            <Input
              id="modifier-group-max"
              type="number"
              min="1"
              {...form.register("max_selected", { valueAsNumber: true })}
            />
            {form.formState.errors.max_selected && (
              <p className="text-sm text-destructive mt-1">
                {form.formState.errors.max_selected.message}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="modifier-group-sort">Orden de mostrado</Label>
            <Input
              id="modifier-group-sort"
              type="number"
              {...form.register("sort_order", { valueAsNumber: true })}
            />
          </div>
        </div>

        <div>
          <Label
            htmlFor="modifier-group-quantities"
            className="flex items-center gap-2 cursor-pointer w-fit"
          >
            <Switch
              id="modifier-group-quantities"
              checked={watchedAllowQuantities}
              onCheckedChange={(checked) =>
                form.setValue("allow_quantities", checked, {
                  shouldValidate: true,
                })
              }
            />
            <span>Permitir cantidades</span>
          </Label>
          <p className="text-sm text-muted-foreground mt-1">
            Permite elegir cuántas veces se agrega cada opción (ej: doble
            porción de queso).
          </p>
        </div>

        {isEditing && (
          <div className="space-y-3 rounded-md border p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium">Opciones del grupo</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddOption}
              >
                <Plus className="h-4 w-4 mr-1" />
                Agregar opción
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Marque «Predeterminado» en la opción que aparece preseleccionada
              al ordenar. Solo una opción puede ser predeterminada.
            </p>
            {optionRows.length > 0 && (
              <div className="space-y-3">
                {optionRows.map((row, index) => (
                  <div
                    key={row.key}
                    className="grid grid-cols-12 items-end gap-2 rounded-md border p-3"
                  >
                    <div className="col-span-12 sm:col-span-4">
                      <Label
                        htmlFor={`option-name-${row.key}`}
                        className="text-xs text-muted-foreground"
                      >
                        Nombre
                      </Label>
                      <Input
                        id={`option-name-${row.key}`}
                        aria-label={`Nombre de la opción ${optionLabelSuffix(row, index)}`}
                        value={row.name}
                        onChange={(e) =>
                          setOptionRows((rows) =>
                            rows.map((r) =>
                              r.key === row.key
                                ? { ...r, name: e.target.value }
                                : r,
                            ),
                          )
                        }
                      />
                      {row.id && row.is_active === false && (
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline">Desactivada</Badge>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleActivateOption(row.key)}
                            disabled={reactivateOption.isPending}
                            aria-label={`Activar opción ${optionLabelSuffix(row, index)}`}
                          >
                            Activar
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="col-span-4 sm:col-span-3">
                      <Label
                        htmlFor={`option-price-${row.key}`}
                        className="text-xs text-muted-foreground"
                      >
                        Precio adicional
                      </Label>
                      <Input
                        id={`option-price-${row.key}`}
                        aria-label={`Precio adicional de la opción ${optionLabelSuffix(row, index)}`}
                        type="number"
                        step="0.01"
                        value={row.price_delta}
                        onChange={(e) =>
                          setOptionRows((rows) =>
                            rows.map((r) =>
                              r.key === row.key
                                ? {
                                    ...r,
                                    price_delta: e.target.valueAsNumber,
                                  }
                                : r,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <Label
                        htmlFor={`option-sort-${row.key}`}
                        className="text-xs text-muted-foreground"
                      >
                        Orden
                      </Label>
                      <Input
                        id={`option-sort-${row.key}`}
                        aria-label={`Orden de la opción ${optionLabelSuffix(row, index)}`}
                        type="number"
                        value={row.sort_order}
                        onChange={(e) =>
                          setOptionRows((rows) =>
                            rows.map((r) =>
                              r.key === row.key
                                ? { ...r, sort_order: e.target.valueAsNumber }
                                : r,
                            ),
                          )
                        }
                      />
                    </div>
                    <label className="col-span-3 sm:col-span-2 flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="modifier-group-default-option"
                        className="h-4 w-4"
                        checked={row.is_default}
                        onChange={() => handleSetDefault(row.key)}
                        aria-label={`Predeterminado: ${optionLabelSuffix(row, index)}`}
                      />
                      <span>Predeterminado</span>
                    </label>
                    {/* The effect lives on its own line: the row's twelve
                        columns are already exactly filled by the fields
                        above, and the effect needs a badge AND a button. */}
                    <div className="col-span-12 flex items-center gap-2 border-t border-border pt-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        Efecto sobre el inventario:
                      </span>
                      <Badge
                        variant={row.effect?.effect === "NONE" ? "outline" : "info"}
                        className="text-[10px]"
                        data-testid={`option-effect-badge-${row.key}`}
                      >
                        {effectBadgeLabel(row.effect?.effect ?? MODIFIER_EFFECT.NONE)}
                      </Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        data-testid={`option-effect-edit-${row.key}`}
                        aria-label={`Configurar el efecto de inventario de la opción ${optionLabelSuffix(row, index)}`}
                        onClick={() => setEffectRowKey(row.key)}
                      >
                        <Boxes className="h-3.5 w-3.5" />
                        Configurar
                      </Button>
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveOption(row.key)}
                        aria-label={`Quitar opción ${optionLabelSuffix(row, index)}`}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {effectRowKey && (
        <ModifierEffectDialog
          key={effectRowKey}
          open
          optionName={
            optionRows.find((r) => r.key === effectRowKey)?.name.trim() ||
            "opción"
          }
          value={
            optionRows.find((r) => r.key === effectRowKey)?.effect ??
            EMPTY_EFFECT
          }
          onOpenChange={(open) => {
            if (!open) setEffectRowKey(null);
          }}
          onSave={(effect) => {
            setOptionRows((rows) =>
              rows.map((r) => (r.key === effectRowKey ? { ...r, effect } : r)),
            );
            setEffectRowKey(null);
          }}
        />
      )}

      <DialogFooter className="border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : isEditing ? "Actualizar" : "Crear"}
        </Button>
      </DialogFooter>
    </form>
  );
}
