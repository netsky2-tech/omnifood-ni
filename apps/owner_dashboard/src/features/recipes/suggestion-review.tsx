'use client';

import { useState } from 'react';
import { usePendingSuggestions, useRecipeSnapshot, usePublishRecipeVersion } from './use-recipes';
import { INGREDIENT_TYPES, type RecipeSuggestionListItem } from './types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { getApiErrorMessage } from '@/lib/api-error';
import { formatNumber } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

const PUBLISH_ERROR_FALLBACK = 'No se pudo publicar la receta.';

function ingredientTypeLabel(ingredientType: string): string {
  return INGREDIENT_TYPES.find((t) => t.id === ingredientType)?.label ?? ingredientType;
}

interface SuggestionDetailProps {
  suggestion: RecipeSuggestionListItem;
  publishPending: boolean;
  onPublish: (suggestion: RecipeSuggestionListItem) => void;
}

/**
 * Bill of materials for one suggestion. Mounted only while its row is opened,
 * so the snapshot request is lazy (never fired for unopened rows).
 *
 * The publish action lives here deliberately: it is only reachable from a row
 * whose snapshot has loaded, so the operator sees exactly which insumos and
 * quantities the template invented before making the recipe live
 * (#523 review-before-trust, contract decision 2).
 */
function SuggestionDetail({ suggestion, publishPending, onPublish }: SuggestionDetailProps) {
  const { data: snapshot, isLoading, isError, refetch } = useRecipeSnapshot(suggestion.recipeVersionId);

  const publishLabel = suggestion.hasActivePublishedVersion
    ? 'Reemplazar versión publicada'
    : 'Publicar receta';

  return (
    <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3">
      {isLoading && <LoadingState message="Cargando detalle de la receta..." />}

      {isError && (
        <div className="text-center py-4 text-destructive">
          <p>Error al cargar el detalle</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
            Reintentar
          </Button>
        </div>
      )}

      {snapshot && (
        <>
          <div className="overflow-hidden rounded border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60">
                  <th className="px-4 py-2 text-left font-semibold uppercase text-xs text-muted-foreground">
                    Ingrediente
                  </th>
                  <th className="px-4 py-2 text-left font-semibold uppercase text-xs text-muted-foreground">
                    Tipo
                  </th>
                  <th className="px-4 py-2 text-left font-semibold uppercase text-xs text-muted-foreground">
                    Cantidad
                  </th>
                  <th className="px-4 py-2 text-left font-semibold uppercase text-xs text-muted-foreground">
                    Merma técnica
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshot.components.map((component) => (
                  <tr key={component.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium text-foreground">
                      {component.ingredient_name ?? component.insumo_id}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={component.ingredient_type === 'SUB_RECIPE' ? 'info' : 'secondary'}>
                        {ingredientTypeLabel(component.ingredient_type)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 tabular-nums text-foreground">
                      {formatNumber(component.gross_quantity)} {component.component_uom ?? ''}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      {formatNumber(component.technical_shrink_pct)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {snapshot.components.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Esta sugerencia no propone componentes. Revísela antes de publicar.
            </p>
          )}
        </>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {suggestion.hasActivePublishedVersion
            ? 'Este producto ya tiene una versión publicada. Al publicar, la receta activa se reemplaza y el costo base cambia para las ventas futuras.'
            : 'La receta quedará activa para este producto.'}
        </p>
        <Button
          size="sm"
          loading={publishPending}
          disabled={!snapshot || publishPending}
          onClick={() => onPublish(suggestion)}
        >
          {publishLabel}
        </Button>
      </div>
    </div>
  );
}

interface SuggestionRowProps {
  suggestion: RecipeSuggestionListItem;
  isOpen: boolean;
  error?: string;
  publishPending: boolean;
  onToggle: (recipeVersionId: string) => void;
  onPublish: (suggestion: RecipeSuggestionListItem) => void;
}

function SuggestionRow({
  suggestion,
  isOpen,
  error,
  publishPending,
  onToggle,
  onPublish,
}: SuggestionRowProps) {
  return (
    <>
      <tr className="border-b border-border hover:bg-muted/40 transition-colors">
        <td className="px-4 py-3 font-medium text-foreground">{suggestion.productName}</td>
        <td className="px-4 py-3 text-foreground">v{suggestion.versionNumber}</td>
        <td className="px-4 py-3 text-right tabular-nums text-foreground">
          {suggestion.componentCount}
        </td>
        <td className="px-4 py-3 text-center">
          {suggestion.hasActivePublishedVersion ? (
            <Badge variant="warning">Reemplazo</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">Primera publicación</span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Ver detalle de ${suggestion.productName}`}
            onClick={() => onToggle(suggestion.recipeVersionId)}
          >
            {isOpen ? 'Ocultar detalle' : 'Ver detalle'}
          </Button>
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={5} className="px-4 pb-3">
            {/* The guard's 400 message stays on the row after the toast is gone
                so the operator keeps the remediation (contract decision 4). */}
            <div
              role="alert"
              className="rounded-md border border-destructive/20 bg-destructive-50 p-3 text-xs font-medium text-destructive"
            >
              {error}
            </div>
          </td>
        </tr>
      )}
      {isOpen && (
        <tr>
          <td colSpan={5} className="px-4 pb-4">
            <SuggestionDetail
              suggestion={suggestion}
              publishPending={publishPending}
              onPublish={onPublish}
            />
          </td>
        </tr>
      )}
    </>
  );
}

export function SuggestionReview() {
  const { data: suggestions, isLoading, error, refetch } = usePendingSuggestions();
  const publishMutation = usePublishRecipeVersion();
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const opened = suggestions?.find((s) => s.recipeVersionId === openedId) ?? null;

  const handleToggle = (recipeVersionId: string) => {
    setOpenedId((prev) => (prev === recipeVersionId ? null : recipeVersionId));
  };

  const handlePublish = async (suggestion: RecipeSuggestionListItem) => {
    const { recipeVersionId } = suggestion;
    setRowErrors((prev) => {
      if (!(recipeVersionId in prev)) return prev;
      const next = { ...prev };
      delete next[recipeVersionId];
      return next;
    });

    try {
      await publishMutation.mutateAsync({
        recipeVersionId: suggestion.recipeVersionId,
        productId: suggestion.productId,
      });
      toast({
        variant: 'success',
        title: 'Receta publicada',
        description: `La versión ${suggestion.versionNumber} de "${suggestion.productName}" quedó activa.`,
      });
    } catch (err) {
      // Pass the backend's operator-facing Spanish message through unchanged;
      // do not wrap or rewrite it (#612 guard already words the remediation).
      const message = getApiErrorMessage(err, PUBLISH_ERROR_FALLBACK);
      setRowErrors((prev) => ({ ...prev, [recipeVersionId]: message }));
      toast({
        variant: 'destructive',
        title: 'Error al publicar',
        description: message,
      });
    }
  };

  if (isLoading) {
    return <LoadingState message="Cargando sugerencias..." />;
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        <p>{getApiErrorMessage(error, 'Error al cargar las sugerencias')}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (!suggestions || suggestions.length === 0) {
    return (
      <EmptyState
        title="No hay sugerencias pendientes"
        description="Las recetas propuestas por plantillas de industria aparecerán aquí para su revisión antes de publicarse."
      />
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
      <div className="overflow-x-auto w-full">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-border bg-muted/60">
              <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                Producto
              </th>
              <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                Versión
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                Componentes
              </th>
              <th className="px-4 py-3 text-center font-semibold uppercase text-xs text-muted-foreground">
                Señal
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {suggestions.map((suggestion) => (
              <SuggestionRow
                key={suggestion.recipeVersionId}
                suggestion={suggestion}
                isOpen={opened?.recipeVersionId === suggestion.recipeVersionId}
                error={rowErrors[suggestion.recipeVersionId]}
                publishPending={publishMutation.isPending}
                onToggle={handleToggle}
                onPublish={handlePublish}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
