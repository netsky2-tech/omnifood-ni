'use client';

import { useState } from 'react';
import { Plus, Trash2, Package, AlertCircle, Info } from 'lucide-react';
import { useCreateRecipeVersion } from './use-recipes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { type Insumo, type RecipeComponent, type IngredientType, INGREDIENT_TYPES } from './types';
import { type Product } from '@/features/catalog/product-types';
import { formatNumber } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

interface RecipeFormProps {
  productId: string;
  productName: string;
  insumos: Insumo[];
  compoundProducts: Product[];
  existingRecipe: { recipeVersion: any; components: any[] } | null;
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormComponent extends RecipeComponent {
  tempId: string;
}

export function RecipeForm({
  productId,
  productName,
  insumos,
  compoundProducts,
  existingRecipe,
  onSuccess,
  onCancel,
}: RecipeFormProps) {
  const createRecipeVersion = useCreateRecipeVersion();

  const [versionNumber, setVersionNumber] = useState(existingRecipe ? existingRecipe.recipeVersion.version_number + 1 : 1);
  const [yieldQuantity, setYieldQuantity] = useState(existingRecipe ? Number(existingRecipe.recipeVersion.yield_quantity) : 1);
  const [technicalShrinkPct, setTechnicalShrinkPct] = useState(existingRecipe ? Number(existingRecipe.recipeVersion.technical_shrink_pct) : 0);
  const [versionNote, setVersionNote] = useState(existingRecipe ? existingRecipe.recipeVersion.version_note ?? '' : '');
  const [effectiveAt, setEffectiveAt] = useState(new Date().toISOString().slice(0, 16));
  const [components, setComponents] = useState<FormComponent[]>(() => {
    if (existingRecipe && existingRecipe.components.length > 0) {
      return existingRecipe.components.map((c, index) => ({
        tempId: `existing-${index}`,
        ingredientId: c.insumo_id,
        ingredientName: c.ingredient_name ?? '',
        ingredientType: c.ingredient_type as IngredientType,
        grossQuantity: Number(c.gross_quantity),
        technicalShrinkPct: Number(c.technical_shrink_pct),
        referenceVersionId: c.reference_version_id ?? null,
        componentUom: c.component_uom ?? null,
      }));
    }
    return [];
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isBusy = createRecipeVersion.isPending || isSubmitting;

  const addComponent = () => {
    const newComponent: FormComponent = {
      tempId: `new-${Date.now()}`,
      ingredientId: '',
      ingredientName: '',
      ingredientType: 'INSUMO',
      grossQuantity: 0,
      technicalShrinkPct: 0,
      referenceVersionId: null,
      componentUom: null,
    };
    setComponents([...components, newComponent]);
  };

  const removeComponent = (tempId: string) => {
    setComponents(components.filter((c) => c.tempId !== tempId));
  };

  const updateComponent = (tempId: string, field: keyof FormComponent, value: any) => {
    setComponents(components.map((c) =>
      c.tempId === tempId ? { ...c, [field]: value } : c
    ));
    // Clear error for this field
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[`${tempId}-${field}`];
      return newErrors;
    });
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!yieldQuantity || yieldQuantity <= 0) {
      newErrors.yieldQuantity = 'El rendimiento debe ser mayor a 0';
    }

    if (technicalShrinkPct < 0 || technicalShrinkPct >= 100) {
      newErrors.technicalShrinkPct = 'La merma técnica debe ser entre 0 y 99.99%';
    }

    if (components.length === 0) {
      newErrors.components = 'Debe agregar al menos un ingrediente';
    }

    components.forEach((c, index) => {
      if (!c.ingredientId) {
        newErrors[`${c.tempId}-ingredientId`] = `Seleccione un ingrediente para la fila ${index + 1}`;
      }
      if (!c.grossQuantity || c.grossQuantity <= 0) {
        newErrors[`${c.tempId}-grossQuantity`] = `La cantidad bruta debe ser mayor a 0`;
      }
      if (c.technicalShrinkPct < 0 || c.technicalShrinkPct >= 100) {
        newErrors[`${c.tempId}-technicalShrinkPct`] = `La merma debe ser entre 0 y 99.99%`;
      }
      if (c.ingredientType === 'INSUMO' && !c.componentUom) {
        newErrors[`${c.tempId}-componentUom`] = `Seleccione la unidad de medida`;
      }
    });

    // Check for duplicate ingredients
    const ingredientIds = components.map(c => c.ingredientId).filter(Boolean);
    const uniqueIds = new Set(ingredientIds);
    if (ingredientIds.length !== uniqueIds.size) {
      newErrors.duplicate = 'No puede haber ingredientes duplicados';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast({ title: 'Error de validación', description: 'Revise los campos marcados', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);

    try {
      await createRecipeVersion.mutateAsync({
        productId,
        input: {
          productId,
          productName,
          versionNumber,
          yieldQuantity,
          technicalShrinkPct,
          versionNote: versionNote || null,
          effectiveAt: effectiveAt || null,
          components: components.map(c => ({
            ingredientId: c.ingredientId,
            ingredientName: c.ingredientName,
            ingredientType: c.ingredientType,
            grossQuantity: c.grossQuantity,
            technicalShrinkPct: c.technicalShrinkPct,
            referenceVersionId: c.referenceVersionId,
            componentUom: c.componentUom,
          })),
        },
      });

      toast({ title: 'Éxito', description: 'Receta creada correctamente' });
      onSuccess();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'No se pudo crear la receta', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getIngredientOptions = () => {
    const options: { value: string; label: string; type: IngredientType }[] = [];

    insumos.filter(i => i.is_active).forEach(i => {
      options.push({ value: i.id, label: `${i.name} (${i.consumption_uom})`, type: 'INSUMO' });
    });

    compoundProducts.filter(p => p.is_active).forEach(p => {
      options.push({ value: p.id, label: `${p.name} (Sub-receta)`, type: 'SUB_RECIPE' });
    });

    return options;
  };

  const getComponentUom = (ingredientId: string): string | null => {
    const insumo = insumos.find(i => i.id === ingredientId);
    return insumo?.consumption_uom ?? null;
  };

  const handleIngredientTypeChange = (tempId: string, type: IngredientType) => {
    updateComponent(tempId, 'ingredientType', type);
    // Reset ingredient when type changes
    updateComponent(tempId, 'ingredientId', '');
    updateComponent(tempId, 'ingredientName', '');
    updateComponent(tempId, 'componentUom', null);
    updateComponent(tempId, 'referenceVersionId', null);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Las recetas definen los ingredientes y cantidades necesarios para producir una unidad del producto.
          La merma técnica reduce la cantidad utilizable. El rendimiento indica cuántas unidades se producen por lote.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Información de la Versión</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="versionNumber">Número de Versión *</Label>
              <Input
                id="versionNumber"
                type="number"
                value={versionNumber}
                onChange={(e) => setVersionNumber(Number(e.target.value))}
                min={1}
                disabled={!!existingRecipe}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="yieldQuantity">Rendimiento (unidades por lote) *</Label>
              <Input
                id="yieldQuantity"
                type="number"
                value={yieldQuantity}
                onChange={(e) => setYieldQuantity(Number(e.target.value))}
                min={0.01}
                step={0.01}
                className="mt-1"
                aria-invalid={!!errors.yieldQuantity}
                aria-describedby={errors.yieldQuantity ? 'yieldQuantity-error' : undefined}
              />
              {errors.yieldQuantity && (
                <p id="yieldQuantity-error" className="text-sm text-destructive mt-1">{errors.yieldQuantity}</p>
              )}
            </div>
            <div>
              <Label htmlFor="technicalShrinkPct">Merma Técnica de Versión (%) *</Label>
              <Input
                id="technicalShrinkPct"
                type="number"
                value={technicalShrinkPct}
                onChange={(e) => setTechnicalShrinkPct(Number(e.target.value))}
                min={0}
                max={99.99}
                step={0.01}
                className="mt-1"
                aria-invalid={!!errors.technicalShrinkPct}
                aria-describedby={errors.technicalShrinkPct ? 'technicalShrinkPct-error' : undefined}
              />
              {errors.technicalShrinkPct && (
                <p id="technicalShrinkPct-error" className="text-sm text-destructive mt-1">{errors.technicalShrinkPct}</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="effectiveAt">Fecha de Vigencia *</Label>
              <Input
                id="effectiveAt"
                type="datetime-local"
                value={effectiveAt}
                onChange={(e) => setEffectiveAt(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="versionNote">Notas de Versión</Label>
              <Input
                id="versionNote"
                value={versionNote}
                onChange={(e) => setVersionNote(e.target.value)}
                placeholder="Ej: Ajuste de proporciones, nueva presentación..."
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Ingredientes</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addComponent} disabled={isBusy}>
            <Plus className="h-4 w-4 mr-1" />
            Agregar Ingrediente
          </Button>
        </CardHeader>
        <CardContent>
          {errors.components && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errors.components}</AlertDescription>
            </Alert>
          )}

          {errors.duplicate && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errors.duplicate}</AlertDescription>
            </Alert>
          )}

          {components.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay ingredientes agregados</p>
              <p className="text-sm">Haga clic en "Agregar Ingrediente" para comenzar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {components.map((component, index) => (
                <div key={component.tempId} className="border rounded-lg p-4 space-y-4 bg-card">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground">#{index + 1}</span>
                      <Badge variant="outline">{component.ingredientType}</Badge>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeComponent(component.tempId)}
                      disabled={isBusy}
                      aria-label="Eliminar ingrediente"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="md:col-span-2">
                      <Label htmlFor={`ingredient-${component.tempId}`}>Ingrediente *</Label>
                      <Select
                        value={component.ingredientId}
                        onValueChange={(value) => {
                          updateComponent(component.tempId, 'ingredientId', value);
                          const option = getIngredientOptions().find(o => o.value === value);
                          if (option) {
                            updateComponent(component.tempId, 'ingredientName', option.label.split(' (')[0]);
                            if (option.type === 'INSUMO') {
                              updateComponent(component.tempId, 'componentUom', getComponentUom(value));
                            }
                          }
                        }}
                      >
                        <SelectTrigger id={`ingredient-${component.tempId}`} aria-invalid={!!errors[`${component.tempId}-ingredientId`]}>
                          <SelectValue placeholder="Seleccione un ingrediente..." />
                        </SelectTrigger>
                        <SelectContent>
                          {INGREDIENT_TYPES.map((type) => (
                            <SelectItem key={type.id} value={type.id} disabled>
                              {type.label}s
                            </SelectItem>
                          ))}
                          {getIngredientOptions().filter(o => o.type === 'INSUMO').map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                          <SelectItem value="" disabled>──────────────</SelectItem>
                          {getIngredientOptions().filter(o => o.type === 'SUB_RECIPE').map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors[`${component.tempId}-ingredientId`] && (
                        <p className="text-sm text-destructive mt-1">{errors[`${component.tempId}-ingredientId`]}</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor={`ingredientType-${component.tempId}`}>Tipo</Label>
                      <Select
                        value={component.ingredientType}
                        onValueChange={(value) => handleIngredientTypeChange(component.tempId, value as IngredientType)}
                      >
                        <SelectTrigger id={`ingredientType-${component.tempId}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INGREDIENT_TYPES.map((type) => (
                            <SelectItem key={type.id} value={type.id}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor={`componentUom-${component.tempId}`}>Unidad de Medida</Label>
                      <Select
                        value={component.componentUom ?? ''}
                        onValueChange={(value) => updateComponent(component.tempId, 'componentUom', value || null)}
                        disabled={component.ingredientType !== 'INSUMO' || !component.ingredientId}
                      >
                        <SelectTrigger id={`componentUom-${component.tempId}`} aria-invalid={!!errors[`${component.tempId}-componentUom`]}>
                          <SelectValue placeholder="UOM" />
                        </SelectTrigger>
                        <SelectContent>
                          {component.ingredientId && component.ingredientType === 'INSUMO' ? (
                            <>
                              <SelectItem value={getComponentUom(component.ingredientId) ?? ''}>
                                {getComponentUom(component.ingredientId) ?? 'Base'}
                              </SelectItem>
                            </>
                          ) : (
                            <SelectItem value="" disabled>Seleccione ingrediente primero</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      {errors[`${component.tempId}-componentUom`] && (
                        <p className="text-sm text-destructive mt-1">{errors[`${component.tempId}-componentUom`]}</p>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <Label htmlFor={`grossQuantity-${component.tempId}`}>Cantidad Bruta *</Label>
                      <Input
                        id={`grossQuantity-${component.tempId}`}
                        type="number"
                        value={component.grossQuantity}
                        onChange={(e) => updateComponent(component.tempId, 'grossQuantity', Number(e.target.value))}
                        min={0.0001}
                        step={0.0001}
                        className="mt-1"
                        aria-invalid={!!errors[`${component.tempId}-grossQuantity`]}
                        aria-describedby={errors[`${component.tempId}-grossQuantity`] ? `${component.tempId}-grossQuantity-error` : undefined}
                      />
                      {errors[`${component.tempId}-grossQuantity`] && (
                        <p id={`${component.tempId}-grossQuantity-error`} className="text-sm text-destructive mt-1">{errors[`${component.tempId}-grossQuantity`]}</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor={`technicalShrinkPct-${component.tempId}`}>Merma Técnica (%) *</Label>
                      <Input
                        id={`technicalShrinkPct-${component.tempId}`}
                        type="number"
                        value={component.technicalShrinkPct}
                        onChange={(e) => updateComponent(component.tempId, 'technicalShrinkPct', Number(e.target.value))}
                        min={0}
                        max={99.99}
                        step={0.01}
                        className="mt-1"
                        aria-invalid={!!errors[`${component.tempId}-technicalShrinkPct`]}
                        aria-describedby={errors[`${component.tempId}-technicalShrinkPct`] ? `${component.tempId}-technicalShrinkPct-error` : undefined}
                      />
                      {errors[`${component.tempId}-technicalShrinkPct`] && (
                        <p id={`${component.tempId}-technicalShrinkPct-error`} className="text-sm text-destructive mt-1">{errors[`${component.tempId}-technicalShrinkPct`]}</p>
                      )}
                    </div>

                    {component.ingredientType === 'SUB_RECIPE' && component.ingredientId && (
                      <div>
                        <Label htmlFor={`referenceVersionId-${component.tempId}`}>Versión de Referencia</Label>
                        <Input
                          id={`referenceVersionId-${component.tempId}`}
                          type="text"
                          value={component.referenceVersionId ?? ''}
                          onChange={(e) => updateComponent(component.tempId, 'referenceVersionId', e.target.value || null)}
                          placeholder="UUID de versión (opcional)"
                          className="mt-1"
                        />
                      </div>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground pt-2 border-t">
                    <strong>Cantidad neta por unidad:</strong>{' '}
                    {formatNumber(
                      component.grossQuantity * (1 - component.technicalShrinkPct / 100) / yieldQuantity
                    )}
                    {' '}{component.componentUom || 'un'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isBusy}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isBusy}>
          {isBusy ? 'Guardando...' : existingRecipe ? 'Actualizar Receta' : 'Crear Receta'}
        </Button>
      </div>
    </form>
  );
}