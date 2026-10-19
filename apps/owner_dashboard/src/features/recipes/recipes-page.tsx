'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, ChefHat, Package, Edit } from 'lucide-react';
import { useProducts } from '@/features/catalog/use-product';
import { useActiveRecipe, useActiveRecipes, useInsumos } from './use-recipes';
import type { ActiveRecipeSummary } from './types';
import { fetchPendingSuggestions, suggestionsQueryKey } from './recipes-api';
import { SuggestionReview } from './suggestion-review';
import { useTenantId } from '@/lib/tenant';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { RecipeForm } from './RecipeForm';
import { formatNumber } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-error';

type RecipesTabId = 'recetas' | 'sugerencias';

const RECIPES_TABS: { id: RecipesTabId; label: string }[] = [
  { id: 'recetas', label: 'Recetas' },
  { id: 'sugerencias', label: 'Sugerencias' },
];

/**
 * Page-level pending-suggestions count for the tab badge (mounted on both
 * tabs). Declared here instead of calling usePendingSuggestions() because the
 * w7 suite fully mocks the use-recipes hook module; the key is built through
 * the shared suggestionsQueryKey() builder from recipes-api, so this observer
 * and the canonical hook always hit one cache entry.
 */
function usePendingSuggestionCount() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: suggestionsQueryKey(tenantId),
    queryFn: ({ signal }) => fetchPendingSuggestions({ signal }),
    staleTime: 5 * 60 * 1000,
  });
}

function RecipesOverview() {
  const { data: products, isLoading: productsLoading, error: productsError, refetch: refetchProducts } = useProducts('COMPOUND');
  const { data: insumos } = useInsumos();
  // Every product with an active published recipe, with the recipe's own
  // figures. The grid needs the recipe data for ALL its cards, not only for
  // the selected one.
  const { data: activeRecipes } = useActiveRecipes();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<{ productId: string; productName: string } | null>(null);

  const {
    data: activeRecipe,
    isLoading: activeRecipeLoading,
    refetch: refetchRecipe,
  } = useActiveRecipe(selectedProductId || '', !!selectedProductId);

  const recipeByProductId = useMemo(() => {
    const map = new Map<string, ActiveRecipeSummary>();
    for (const summary of activeRecipes ?? []) {
      map.set(summary.productId, summary);
    }
    return map;
  }, [activeRecipes]);

  const filteredProducts = products?.filter((p: { name: string; id: string }) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.id.toLowerCase().includes(searchQuery.toLowerCase())
  ) ?? [];

  const handleOpenForm = (productId: string, productName: string) => {
    // Selecting the product loads its active recipe snapshot, so "Editar
    // Receta" opens the EXISTING recipe instead of an empty form (which
    // would silently replace it on save).
    setSelectedProductId(productId);
    setEditingRecipe({ productId, productName });
    setIsFormOpen(true);
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingRecipe(null);
    if (selectedProductId) refetchRecipe();
  };

  const handleFormSuccess = () => {
    handleFormClose();
  };

  if (productsLoading) {
    return (
      <LoadingState message="Cargando productos..." className="h-64" />
    );
  }

  if (productsError) {
    return (
      <div className="text-center py-8 text-destructive">
        <p>{getApiErrorMessage(productsError, "Error al cargar productos")}</p>
        <Button onClick={() => refetchProducts()} className="ml-2 mt-2" variant="outline" size="sm">
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <label htmlFor="recipe-search" className="sr-only">Buscar productos compuestos</label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="recipe-search"
            placeholder="Buscar por nombre o ID..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredProducts.length === 0 ? (
          <EmptyState
            icon={Package}
            title={
              searchQuery.trim()
                ? "No se encontraron productos compuestos para esta búsqueda"
                : "No se encontraron productos compuestos"
            }
            description={
              searchQuery.trim()
                ? `No se encontraron productos que coincidan con "${searchQuery.trim()}". Intente con otro término.`
                : 'Cree un producto de tipo "Compuesto" en el catálogo para gestionar su receta'
            }
            className="col-span-full py-12"
          />
        ) : (
          filteredProducts.map((product) => {
            const summary = recipeByProductId.get(product.id);
            return (
            <div
              key={product.id}
              className={`relative border rounded-lg p-4 transition-all ${selectedProductId === product.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
              onClick={() => setSelectedProductId(product.id)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ChefHat className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">{product.name}</h3>
                </div>
                <Badge variant={product.is_active ? 'success' : 'destructive'}>
                  {product.is_active ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>

              <div className="space-y-2 text-sm">
                {summary ? (
                  // The RECIPE's own figures: the cost of the recipe, the
                  // units a batch yields and the unit of measure. The card
                  // used to render the PRODUCT's catalog columns (sell
                  // price, stock), which for a compound product nobody has
                  // produced yet are 0 NIO / 0 g — a recipe card that never
                  // changed no matter what the operator entered.
                  <>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Costo receta:</span>
                      <span className="font-medium tabular-nums">
                        {summary.estimatedCostNio != null
                          ? `${formatNumber(summary.estimatedCostNio)} NIO`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Rendimiento:</span>
                      <span className="font-medium tabular-nums">
                        {formatNumber(summary.yieldQuantity)} {summary.productUom ?? product.uom}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>UOM:</span>
                      <span className="font-medium">{summary.productUom ?? product.uom}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Precio:</span>
                      <span className="font-medium tabular-nums">{formatNumber(product.sellPrice)} NIO</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Receta:</span>
                      <span className="font-medium">Sin receta vigente</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Stock:</span>
                      <span className="font-medium tabular-nums">{formatNumber(product.stock)} {product.uom}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>UOM:</span>
                      <span className="font-medium">{product.uom}</span>
                    </div>
                  </>
                )}
              </div>

              {summary && (
                <div className="mt-3 p-2 bg-muted rounded text-xs space-y-1 border-l-2 border-primary">
                  <div className="flex items-center gap-1 text-primary font-medium">
                    <ChefHat className="h-3 w-3" />
                    <span>Receta v{summary.versionNumber} activa</span>
                  </div>
                  <div className="text-muted-foreground">
                    {summary.componentCount} ingrediente{summary.componentCount !== 1 ? 's' : ''}
                  </div>
                  <div className="text-muted-foreground">
                    Costo de receta: {summary.estimatedCostNio != null ? `${formatNumber(summary.estimatedCostNio)} NIO` : 'no disponible'}
                  </div>
                  {summary.estimatedCostNio == null && summary.costUnavailableReason && (
                    <div className="text-muted-foreground">
                      Costo no disponible: {summary.costUnavailableReason}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={(e) => { e.stopPropagation(); handleOpenForm(product.id, product.name); }}
                  >
                    <Edit className="h-3 w-3 mr-1" />
                    Editar Receta
                  </Button>
                </div>
              )}

              {!summary && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3"
                  onClick={(e) => { e.stopPropagation(); handleOpenForm(product.id, product.name); }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Crear Receta
                </Button>
              )}
            </div>
            );
          })
        )}
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRecipe ? `Editar Receta: ${editingRecipe.productName}` : 'Crear Nueva Receta'}
            </DialogTitle>
            <DialogDescription>
              {editingRecipe
                ? 'Modifique los ingredientes, cantidades y rendimiento de la receta'
                : 'Defina los ingredientes, cantidades, merma técnica y rendimiento del producto compuesto'}
            </DialogDescription>
          </DialogHeader>
          {editingRecipe && (
            // The form opens with the EXISTING recipe. While the snapshot is
            // still in flight the form must not render: an empty form shown
            // for a product that HAS a recipe is a silent data loss when the
            // operator saves it.
            activeRecipeLoading ? (
              <LoadingState message="Cargando la receta vigente..." className="h-40" />
            ) : (
              <RecipeForm
                productId={editingRecipe.productId}
                productName={editingRecipe.productName}
                insumos={insumos ?? []}
                compoundProducts={products?.filter(p => p.id !== editingRecipe?.productId) ?? []}
                existingRecipe={activeRecipe && activeRecipe.recipeVersion.product_id === editingRecipe.productId ? activeRecipe : null}
                onSuccess={handleFormSuccess}
                onCancel={handleFormClose}
              />
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function RecipesPage() {
  const [activeTab, setActiveTab] = useState<RecipesTabId>('recetas');
  const { data: suggestions } = usePendingSuggestionCount();
  const pendingCount = suggestions?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Recetas y BOM</h1>
          <p className="text-sm text-muted-foreground">Gestione recetas de productos compuestos (ingredientes, rendimientos, versiones)</p>
        </div>
      </div>

      <div className="border-b border-border">
        <nav
          className="-mb-px flex gap-4 sm:gap-6 overflow-x-auto pb-1 sm:pb-0"
          aria-label="Secciones de recetas"
        >
          {RECIPES_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-1 py-3 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              {tab.id === 'sugerencias' && pendingCount > 0 && (
                <Badge variant="secondary" className="ml-2">{pendingCount}</Badge>
              )}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'sugerencias' ? <SuggestionReview /> : <RecipesOverview />}
    </div>
  );
}