import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
} from "./use-modifiers";
import { modifierGroupFormSchema, type ModifierGroupFormData } from "./schema";
import { describeModifierError } from "./modifiers-api";
import { type ModifierGroup } from "./types";

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
}

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
          price_delta: option.price_delta,
          is_default: option.is_default,
          sort_order: option.sort_order,
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

  const optionLabelSuffix = (row: OptionRowState, index: number) =>
    row.name.trim() || `${index + 1}`;

  const onSubmit = async (data: ModifierGroupFormData) => {
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
      for (const removedId of removedOptionIds) {
        await deactivateOption.mutateAsync({ groupId, optionId: removedId });
      }
      for (const row of optionRows) {
        const optionInput = {
          name: row.name,
          price_delta: row.price_delta,
          is_default: row.is_default,
          sort_order: row.sort_order,
        };
        if (row.id) {
          await updateOption.mutateAsync({
            groupId,
            optionId: row.id,
            input: optionInput,
          });
        } else if (row.name.trim()) {
          await createOption.mutateAsync({ groupId, input: optionInput });
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
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
